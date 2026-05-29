# Ejecuta Bearer SAST via Docker — analisis de flujo de datos, PII y secretos
# Norma: OWASP ASVS V2.10, ISO/IEC 27001 A.9.4.1
param(
  [string]$ProjectDir = ".",
  [string]$OutputDir  = "reportes/security/bearer",
  [string]$Severity   = "critical,high,medium"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$commonFunctions = Join-Path (Split-Path -Parent $PSScriptRoot) 'common/functions.ps1'
if (Test-Path $commonFunctions) { . $commonFunctions }

$workspacePath = [System.IO.Path]::GetFullPath((Get-CurrentWorkspacePath))
$outputPath    = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($workspacePath, $OutputDir))
$projectPath   = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($workspacePath, $ProjectDir))

New-DirectoryIfMissing -Path $outputPath
Assert-DockerAvailable

$sarifFile = Join-Path $outputPath 'bearer-results.sarif'

function ConvertTo-DockerPath {
  param([string]$WinPath)
  $p = $WinPath -replace '\\', '/'
  if ($p -match '^([A-Za-z]):(.*)') { return '/' + $Matches[1].ToLower() + $Matches[2] }
  return $p
}

$dProject = ConvertTo-DockerPath $projectPath
$dOutput  = ConvertTo-DockerPath $outputPath

Write-Host "=== Bearer SAST ==="
Write-Host "Proyecto   : $projectPath"
Write-Host "Severidades: $Severity"
Write-Host "Salida     : $sarifFile"

docker run --rm `
  --volume "${dProject}:/app:ro" `
  --volume "${dOutput}:/output" `
  --env SSL_CERT_DIR="" `
  --env BEARER_DISABLE_VERSION_CHECK=true `
  ghcr.io/bearer/bearer:latest `
  scan /app `
  --format sarif `
  --output /output/bearer-results.sarif `
  --scanner=secrets,sast `
  "--severity=$Severity" `
  --exit-code 0

if (Test-Path $sarifFile) {
  Write-Host "Reporte SARIF generado: $sarifFile"
} else {
  Write-Warning "No se genero archivo SARIF -- revisar salida de Bearer."
}
