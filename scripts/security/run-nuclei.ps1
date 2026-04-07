# Ejecuta Nuclei via Docker contra un target web
# Genera reporte JSONL y SARIF con resumen por severidad
param(
  [string]$Target      = $env:REGINSA_URL,
  [string]$OutputDir   = "reportes/security/nuclei",
  [string]$Severity    = "critical,high,medium",
  [string]$AuthToken   = $env:NUCLEI_AUTH_TOKEN,
  [int]$RateLimit      = 10,
  [int]$Timeout        = 30,
  [switch]$UpdateTemplates
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

# Validar Target
if ([string]::IsNullOrWhiteSpace($Target)) {
  throw "Define REGINSA_URL o pasa -Target para ejecutar Nuclei."
}

# Prerrequisitos
Assert-DockerAvailable

$workspacePath = [System.IO.Path]::GetFullPath((Get-CurrentWorkspacePath))
$outputPath    = Resolve-WorkspaceChildPath -BasePath $workspacePath -CandidatePath $OutputDir
New-DirectoryIfMissing -Path $outputPath

# Cache de templates (persistente entre ejecuciones)
$templatesCache = Join-Path $workspacePath '.nuclei-templates'
New-DirectoryIfMissing -Path $templatesCache

$jsonlFile = Join-Path $outputPath 'nuclei-report.jsonl'
$sarifFile = Join-Path $outputPath 'nuclei-report.sarif'

$dOutput    = ConvertTo-DockerPath $outputPath
$dTemplates = ConvertTo-DockerPath $templatesCache

Write-Host "Target           : $Target"
Write-Host "Severidades      : $Severity"
Write-Host "Rate limit       : $RateLimit req/s"
Write-Host "Timeout por req  : ${Timeout}s"
Write-Host "Cache templates  : $templatesCache"
Write-Host "Salida JSONL     : $jsonlFile"
Write-Host "Salida SARIF     : $sarifFile"
if (-not [string]::IsNullOrWhiteSpace($AuthToken)) {
  Write-Host "Auth token       : [configurado]"
}

# ─── Construir argumentos Docker ─────────────────────────────────────────────
$dockerArgs = @(
  'run', '--rm',
  '--volume', "${dOutput}:/output",
  '--volume', "${dTemplates}:/root/nuclei-templates",
  'projectdiscovery/nuclei:latest',
  '-u', $Target,
  '-severity', $Severity,
  '-exclude-tags', 'dos',
  '-rate-limit', "$RateLimit",
  '-timeout', "$Timeout",
  '-jsonl', '-output', '/output/nuclei-report.jsonl',
  '-sarif-export', '/output/nuclei-report.sarif',
  '-stats'
)

# Actualizar templates si se solicita o si el cache esta vacio
$cacheIsEmpty = (Get-ChildItem $templatesCache -ErrorAction SilentlyContinue | Measure-Object).Count -eq 0
if ($UpdateTemplates -or $cacheIsEmpty) {
  Write-Host "`n-- Actualizando templates Nuclei..." -ForegroundColor Cyan
  $updateArgs = @(
    'run', '--rm',
    '--volume', "${dTemplates}:/root/nuclei-templates",
    'projectdiscovery/nuclei:latest',
    '-update-templates'
  )
  & docker @updateArgs
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Advertencia: No se pudo actualizar templates. Se usara cache existente." -ForegroundColor Yellow
  }
}

# Agregar token de autenticacion si esta disponible
if (-not [string]::IsNullOrWhiteSpace($AuthToken)) {
  $dockerArgs += @('-H', "Authorization: Bearer $AuthToken")
}

# ─── Ejecutar Nuclei ─────────────────────────────────────────────────────────
Write-Host "`n--- Ejecutando Nuclei ---" -ForegroundColor Cyan

& docker @dockerArgs

$exitCode = $LASTEXITCODE
# Nuclei retorna 1 cuando encuentra hallazgos — no es error de ejecucion
if ($exitCode -ne 0 -and $exitCode -ne 1) {
  throw "Fallo la ejecucion de Nuclei. Codigo de salida: $exitCode"
}

# ─── Resumen por severidad ───────────────────────────────────────────────────
if (-not (Test-Path $jsonlFile)) {
  Write-Host "No se genero reporte JSONL (sin hallazgos o error en ejecucion)." -ForegroundColor Yellow
  return
}

$lines = Get-Content $jsonlFile -ErrorAction SilentlyContinue
if ($null -eq $lines -or ($lines | Measure-Object).Count -eq 0) {
  Write-Host "`nHallazgos: 0 — No se encontraron vulnerabilidades." -ForegroundColor Green
  return
}

$counts = @{ critical = 0; high = 0; medium = 0; low = 0; info = 0; unknown = 0 }
$lines | ForEach-Object {
  try {
    $entry = $_ | ConvertFrom-Json
    $sev   = if ($entry.info.severity) { $entry.info.severity.ToLower() } else { 'unknown' }
    if ($counts.ContainsKey($sev)) { $counts[$sev]++ } else { $counts['unknown']++ }
  } catch {
    # Ignorar lineas malformadas
  }
}

$total = ($lines | Measure-Object).Count

Write-Host ""
Write-Host "Resumen de hallazgos Nuclei:" -ForegroundColor Cyan
Write-Host "  Total    : $total"
Write-Host "  Critical : $($counts['critical'])" -ForegroundColor $(if ($counts['critical'] -gt 0) { 'Red' } else { 'DarkGray' })
Write-Host "  High     : $($counts['high'])"     -ForegroundColor $(if ($counts['high']     -gt 0) { 'Red' } else { 'DarkGray' })
Write-Host "  Medium   : $($counts['medium'])"   -ForegroundColor $(if ($counts['medium']   -gt 0) { 'Yellow' } else { 'DarkGray' })
Write-Host "  Low      : $($counts['low'])"      -ForegroundColor DarkGray
Write-Host "  Info     : $($counts['info'])"     -ForegroundColor DarkGray
Write-Host ""
Write-Host "Reporte JSONL : $jsonlFile"
if (Test-Path $sarifFile) {
  Write-Host "Reporte SARIF : $sarifFile"
}

if ($counts['critical'] -gt 0 -or $counts['high'] -gt 0) {
  Write-Host "`n[ATENCION] Se encontraron hallazgos criticos o altos. Revisa el reporte." -ForegroundColor Red
}
