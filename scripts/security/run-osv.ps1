# Ejecuta OSV-Scanner (Google) para analisis de dependencias contra OSV database
# Complementa OWASP Dependency-Check: OSV se actualiza mas rapido que NVD
# Norma: CVSSv3.1, CWE/NVD, NTP-ISO/IEC 12207
param(
  [string]$ProjectDir = ".",
  [string]$OutputDir  = "reportes/security/osv"
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

function ConvertTo-DockerPath {
  param([string]$WinPath)
  $p = $WinPath -replace '\\', '/'
  if ($p -match '^([A-Za-z]):(.*)') { return '/' + $Matches[1].ToLower() + $Matches[2] }
  return $p
}

$dProject = ConvertTo-DockerPath $projectPath
$dOutput  = ConvertTo-DockerPath $outputPath
$jsonFile = Join-Path $outputPath 'osv-results.json'

Write-Host "=== OSV-Scanner (Google) ==="
Write-Host "Proyecto: $projectPath"
Write-Host "Salida  : $jsonFile"

docker run --rm `
  --volume "${dProject}:/project:ro" `
  --volume "${dOutput}:/output" `
  ghcr.io/google/osv-scanner:latest `
  --output=/output/osv-results.json `
  --format=json `
  /project

if (Test-Path $jsonFile) {
  Write-Host "Reporte OSV-Scanner generado: $jsonFile"
} else {
  Write-Warning "No se genero archivo JSON. Revisar salida."
}
