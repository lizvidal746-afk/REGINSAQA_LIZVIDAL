# Ejecuta Nikto via Docker — escaneo web server (headers, configs, versiones)
# Norma: OWASP Top 10 A05 (Misconfiguration), A06 (Outdated), NIST SP 800-115
param(
  [string]$Target    = $env:REGINSA_URL,
  [string]$OutputDir = "reportes/security/nikto"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$commonFunctions = Join-Path (Split-Path -Parent $PSScriptRoot) 'common/functions.ps1'
if (Test-Path $commonFunctions) { . $commonFunctions }

if ([string]::IsNullOrWhiteSpace($Target)) {
  throw "Define REGINSA_URL o pasa -Target para ejecutar Nikto."
}

$workspacePath = [System.IO.Path]::GetFullPath((Get-CurrentWorkspacePath))
$outputPath    = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($workspacePath, $OutputDir))

New-DirectoryIfMissing -Path $outputPath
Assert-DockerAvailable

function ConvertTo-DockerPath {
  param([string]$WinPath)
  $p = $WinPath -replace '\\', '/'
  if ($p -match '^([A-Za-z]):(.*)') { return '/' + $Matches[1].ToLower() + $Matches[2] }
  return $p
}

$dOutput = ConvertTo-DockerPath $outputPath

Write-Host "=== Nikto Web Server Scan ==="
Write-Host "Target : $Target"
Write-Host "Salida : $outputPath"

Write-Host "`n--- Generando reporte HTML ---"
docker run --rm `
  --volume "${dOutput}:/output" `
  sullo/nikto:latest `
  -h $Target `
  -Format htm `
  -output /output/nikto-report.html `
  -nointeractive

Write-Host "`n--- Generando reporte CSV ---"
docker run --rm `
  --volume "${dOutput}:/output" `
  sullo/nikto:latest `
  -h $Target `
  -Format csv `
  -output /output/nikto-report.csv `
  -nointeractive

Write-Host "`nReportes Nikto generados en: $outputPath"
