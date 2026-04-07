# Ejecuta CodeQL SAST via Docker (sin instalacion local de CodeQL CLI)
# Imagen construida desde docker/codeql/Dockerfile
# Lenguajes: javascript-typescript
# Genera reporte SARIF compatible con GitHub Code Scanning
param(
  [string]$ProjectDir = ".",
  [string]$OutputDir  = "reportes/security/codeql",
  [string]$Language   = "javascript-typescript",
  [string]$QuerySuite = "javascript-security-extended.qls",
  [string]$ImageTag   = "reginsa-codeql"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$commonFunctions = Join-Path (Split-Path -Parent $PSScriptRoot) 'common/functions.ps1'
if (Test-Path $commonFunctions) {
  . $commonFunctions
}

function Resolve-WorkspaceChildPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BasePath,
    [Parameter(Mandatory = $true)]
    [string]$CandidatePath
  )
  if ([System.IO.Path]::IsPathRooted($CandidatePath)) {
    return [System.IO.Path]::GetFullPath($CandidatePath)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $BasePath $CandidatePath))
}

# Convierte ruta Windows a formato Docker bind-mount: C:\foo -> /c/foo
function ConvertTo-DockerPath {
  param([string]$WinPath)
  $p = $WinPath -replace '\\', '/'
  if ($p -match '^([A-Za-z]):(.*)') {
    return '/' + $Matches[1].ToLower() + $Matches[2]
  }
  return $p
}

# ─── Prerrequisitos ───────────────────────────────────────────────────────────
Assert-DockerAvailable

$workspacePath = [System.IO.Path]::GetFullPath((Get-CurrentWorkspacePath))
$projectPath   = Resolve-WorkspaceChildPath -BasePath $workspacePath -CandidatePath $ProjectDir
$outputPath    = Resolve-WorkspaceChildPath -BasePath $workspacePath -CandidatePath $OutputDir

Test-PathExistence -Path $projectPath -Message "El directorio de proyecto '$ProjectDir' no existe."
New-DirectoryIfMissing -Path $outputPath

# Directorio de cache de packs CodeQL (evita redescargar en cada ejecucion)
$codeqlCache = Join-Path $workspacePath '.codeql-cache'
New-DirectoryIfMissing -Path $codeqlCache

$sarifFile = Join-Path $outputPath 'codeql-report.sarif'
$dbPath    = Join-Path $outputPath 'codeql-db'

# ─── 0. Construir imagen si no existe ────────────────────────────────────────
$imageExists = docker image inspect $ImageTag 2>&1 | Select-String '"Id"'
if (-not $imageExists) {
  Write-Host "-- Construyendo imagen Docker '$ImageTag' (una sola vez)..." -ForegroundColor Cyan
  $dockerfileDir = Join-Path $workspacePath 'docker/codeql'
  & docker build -t $ImageTag $dockerfileDir
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo la construccion de la imagen Docker '$ImageTag'. Codigo de salida: $LASTEXITCODE"
  }
} else {
  Write-Host "-- Imagen '$ImageTag' disponible en cache local." -ForegroundColor Green
}

# Paths Docker (bind mounts)
$dProject = ConvertTo-DockerPath $projectPath
$dOutput  = ConvertTo-DockerPath $outputPath
$dCache   = ConvertTo-DockerPath $codeqlCache

Write-Host ""
Write-Host "Proyecto : $projectPath"
Write-Host "Lenguaje : $Language"
Write-Host "Queries  : $QuerySuite"
Write-Host "Salida   : $sarifFile"

# ─── 1. Crear base de datos CodeQL ───────────────────────────────────────────
Write-Host "`n--- [1/2] Creando base de datos CodeQL ---" -ForegroundColor Cyan

# Eliminar DB previa dentro del output (Docker la crea desde cero)
if (Test-Path $dbPath) {
  Remove-Item -Recurse -Force $dbPath
}

& docker run --rm `
  --volume "${dProject}:/workspace:ro" `
  --volume "${dOutput}:/output" `
  --volume "${dCache}:/root/.codeql" `
  $ImageTag `
  database create /output/codeql-db `
  "--language=$Language" `
  --source-root=/workspace `
  --overwrite

if ($LASTEXITCODE -ne 0) {
  throw "Fallo la creacion de la base de datos CodeQL. Codigo de salida: $LASTEXITCODE"
}

# ─── 2. Analizar base de datos ───────────────────────────────────────────────
Write-Host "`n--- [2/2] Ejecutando analisis CodeQL ---" -ForegroundColor Cyan

& docker run --rm `
  --volume "${dOutput}:/output" `
  --volume "${dCache}:/root/.codeql" `
  $ImageTag `
  database analyze /output/codeql-db `
  $QuerySuite `
  --format=sarifv2.1.0 `
  --output=/output/codeql-report.sarif `
  --download

if ($LASTEXITCODE -ne 0) {
  throw "Fallo el analisis CodeQL. Codigo de salida: $LASTEXITCODE"
}

# Limpiar base de datos temporal (ocupa varios GB)
if (Test-Path $dbPath) {
  Remove-Item -Recurse -Force $dbPath
  Write-Host "-- Base de datos temporal eliminada." -ForegroundColor DarkGray
}

if (-not (Test-Path $sarifFile)) {
  throw "CodeQL finalizo sin generar el SARIF esperado en $sarifFile"
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
  Write-Host "Revisa el reporte SARIF para ver el detalle." -ForegroundColor Yellow
} else {
  Write-Host "No se encontraron hallazgos con las reglas configuradas." -ForegroundColor Green
}
