# Ejecuta Syft (SBOM) + Grype (CVE) via Docker
# Syft genera Software Bill of Materials en formato CycloneDX JSON
# Grype escanea el SBOM generado en busca de CVEs
# Norma: NTP-ISO/IEC 12207, NTIA SBOM, CVSSv3.1
param(
  [string]$ProjectDir = ".",
  [string]$OutputDir  = "reportes/security/sbom",
  [string]$Severity   = "high,critical"
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
$sbomFile = Join-Path $outputPath 'sbom-cyclonedx.json'
$grypeFile= Join-Path $outputPath 'grype-results.json'

Write-Host "=== Syft: Generando SBOM ==="
Write-Host "Proyecto: $projectPath"
Write-Host "SBOM   : $sbomFile"

docker run --rm `
  --volume "${dProject}:/project:ro" `
  --volume "${dOutput}:/output" `
  anchore/syft:latest `
  /project `
  --output cyclonedx-json=/output/sbom-cyclonedx.json

if (-not (Test-Path $sbomFile)) {
  throw "Syft no genero el SBOM: $sbomFile"
}

Write-Host "`n=== Grype: Escaneando SBOM en busca de CVEs ==="
Write-Host "SBOM input : $sbomFile"
Write-Host "Severidad  : $Severity"
Write-Host "Resultado  : $grypeFile"

docker run --rm `
  --volume "${dOutput}:/output" `
  anchore/grype:latest `
  sbom:/output/sbom-cyclonedx.json `
  --output json `
  --file /output/grype-results.json `
  --fail-on high `
  | Out-Null

Write-Host "`nReportes SBOM + Grype generados en: $outputPath"
