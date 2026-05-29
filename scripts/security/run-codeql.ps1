# ══════════════════════════════════════════════════════════════════════════════
# CodeQL SAST -- ejecucion via CLI nativa (sin Docker)
# Requiere: codeql.exe en PATH (D:\tools\CodeQL recomendado)
# Lenguajes soportados: csharp, javascript (Angular/TypeScript), python, java
# Genera SARIF v2.1.0 compatible con GitHub Code Scanning y nuestro extractor
# ══════════════════════════════════════════════════════════════════════════════
param(
  [string]$ProjectDir = ".",
  [string]$OutputDir  = "reportes/security/sast/codeql",
  [ValidateSet('csharp','javascript','python','java','go','ruby','cpp')]
  [string]$Language   = "javascript",
  [string]$QuerySuite = ""   # vacio => security-extended.qls del lenguaje
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$commonFunctions = Join-Path (Split-Path -Parent $PSScriptRoot) 'common/functions.ps1'
if (Test-Path $commonFunctions) { . $commonFunctions }

function Resolve-WorkspaceChildPath {
  param([string]$BasePath, [string]$CandidatePath)
  if ([System.IO.Path]::IsPathRooted($CandidatePath)) {
    return [System.IO.Path]::GetFullPath($CandidatePath)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $BasePath $CandidatePath))
}

# ─── Prerrequisitos ───────────────────────────────────────────────────────────
$codeqlCmd = Get-Command codeql -ErrorAction SilentlyContinue
if (-not $codeqlCmd) {
  # Fallback: ruta canonica de instalacion
  $fallback = 'D:\tools\CodeQL\codeql.exe'
  if (Test-Path $fallback) {
    $codeqlExe = $fallback
    Write-Host "-- CodeQL no esta en PATH; usando $fallback" -ForegroundColor Yellow
  } else {
    throw "CodeQL CLI no encontrado. Instala desde https://github.com/github/codeql-cli-binaries/releases y agrega al PATH (o coloca en D:\tools\CodeQL\)."
  }
} else {
  $codeqlExe = $codeqlCmd.Source
}

$workspacePath = [System.IO.Path]::GetFullPath((Get-CurrentWorkspacePath))
$projectPath   = Resolve-WorkspaceChildPath -BasePath $workspacePath -CandidatePath $ProjectDir
$outputPath    = Resolve-WorkspaceChildPath -BasePath $workspacePath -CandidatePath $OutputDir

Test-PathExistence -Path $projectPath -Message "El directorio de proyecto '$ProjectDir' no existe."
New-DirectoryIfMissing -Path $outputPath

# Suite por defecto (oficial GitHub, gratuita): security-extended.qls
if ([string]::IsNullOrWhiteSpace($QuerySuite)) {
  $QuerySuite = "codeql/${Language}-queries:codeql-suites/${Language}-security-extended.qls"
}

$sarifFile = Join-Path $outputPath "codeql-${Language}.sarif"
$dbPath    = Join-Path $env:TEMP ("codeql-db-{0}-{1}" -f $Language, ([guid]::NewGuid().ToString('N').Substring(0,8)))

Write-Host ""
Write-Host "CodeQL CLI : $codeqlExe" -ForegroundColor DarkGray
Write-Host "Proyecto   : $projectPath"
Write-Host "Lenguaje   : $Language"
Write-Host "Suite      : $QuerySuite"
Write-Host "DB temp    : $dbPath"
Write-Host "Salida     : $sarifFile"

# ─── 0. Asegurar pack de queries descargado (idempotente, ~30s primera vez) ──
$packName = "codeql/${Language}-queries"
Write-Host "`n--- [0/2] Verificando pack '$packName' ---" -ForegroundColor Cyan
& $codeqlExe pack download $packName 2>&1 | Out-String | Write-Host
if ($LASTEXITCODE -ne 0) {
  Write-Host "  WARN: No se pudo descargar/actualizar el pack (¿proxy?). Se intentara con cache local." -ForegroundColor Yellow
}

# ─── 1. Crear base de datos CodeQL ───────────────────────────────────────────
Write-Host "`n--- [1/2] Creando base de datos CodeQL ($Language) ---" -ForegroundColor Cyan

# Para csharp/java sin compilacion: build-mode=none (no requiere msbuild ni dotnet)
$dbCreateArgs = @(
  'database', 'create', $dbPath,
  "--language=$Language",
  "--source-root=$projectPath",
  '--overwrite'
)
if ($Language -in @('csharp','java','cpp','go')) {
  $dbCreateArgs += '--build-mode=none'
}

& $codeqlExe @dbCreateArgs
if ($LASTEXITCODE -ne 0) {
  throw "Fallo creacion de DB CodeQL ($Language). Codigo: $LASTEXITCODE"
}

# ─── 2. Analizar base de datos ───────────────────────────────────────────────
Write-Host "`n--- [2/2] Analizando con suite $QuerySuite ---" -ForegroundColor Cyan

& $codeqlExe database analyze $dbPath $QuerySuite `
  --format=sarifv2.1.0 `
  --output=$sarifFile `
  --download

if ($LASTEXITCODE -ne 0) {
  # Limpieza antes de error
  if (Test-Path $dbPath) { Remove-Item -Recurse -Force $dbPath -ErrorAction SilentlyContinue }
  throw "Fallo analisis CodeQL ($Language). Codigo: $LASTEXITCODE"
}

# Limpieza DB temporal (puede ocupar varios GB)
if (Test-Path $dbPath) {
  Remove-Item -Recurse -Force $dbPath -ErrorAction SilentlyContinue
  Write-Host "-- DB temporal eliminada: $dbPath" -ForegroundColor DarkGray
}

if (-not (Test-Path $sarifFile)) {
  throw "CodeQL finalizo sin generar SARIF en $sarifFile"
}

# ─── Resumen ──────────────────────────────────────────────────────────────────
$sarifContent = Get-Content $sarifFile -Raw | ConvertFrom-Json
$totalResults = ($sarifContent.runs | ForEach-Object { $_.results } | Measure-Object).Count

$bySeverity = @{ error = 0; warning = 0; note = 0 }
$sarifContent.runs | ForEach-Object { $_.results } | ForEach-Object {
  $level = if ($_.level) { $_.level } else { 'warning' }
  if ($bySeverity.ContainsKey($level)) { $bySeverity[$level]++ }
}

Write-Host ""
Write-Host "Reporte SARIF  : $sarifFile" -ForegroundColor Cyan
Write-Host "Total hallazgos: $totalResults"
if ($totalResults -gt 0) {
  Write-Host "  error   : $($bySeverity['error'])"   -ForegroundColor Red
  Write-Host "  warning : $($bySeverity['warning'])" -ForegroundColor Yellow
  Write-Host "  note    : $($bySeverity['note'])"    -ForegroundColor DarkGray
} else {
  Write-Host "Sin hallazgos en la suite configurada." -ForegroundColor Green
}
