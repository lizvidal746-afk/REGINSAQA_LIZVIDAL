# Ejecuta Nmap con script NSE Vulners — discovery de servicios + correlacion CVE
# Equivalente gratuito a Tenable Nessus basico (discovery fase)
# IMPORTANTE: Solo ejecutar con autorizacion previa sobre targets institucionales
# Norma: NIST SP 800-115 (Discovery Phase), CVSSv3.1, CWE/NVD
param(
  [Parameter(Mandatory = $true)]
  [string]$Target,
  [string]$Ports     = "80,443,8080,8443,22,21,3306,5432,3389",
  [string]$OutputDir = "reportes/security/nmap"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$commonFunctions = Join-Path (Split-Path -Parent $PSScriptRoot) 'common/functions.ps1'
if (Test-Path $commonFunctions) { . $commonFunctions }

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

Write-Host "=== Nmap + Vulners NSE CVE Discovery ==="
Write-Host "Target : $Target"
Write-Host "Puertos: $Ports"
Write-Host "Salida : $outputPath"
Write-Host ""
Write-Host "[AVISO] Ejecutar solo con autorizacion previa. Este scan realiza"
Write-Host "        deteccion activa de servicios y correlacion con CVEs."
Write-Host ""

docker run --rm `
  --volume "${dOutput}:/output" `
  instrumentisto/nmap:latest `
  -sV `
  --script vulners `
  -p $Ports `
  -oN /output/nmap-report.txt `
  -oX /output/nmap-report.xml `
  $Target

Write-Host "`nReportes Nmap generados en: $outputPath"
Write-Host "  - nmap-report.txt (legible)"
Write-Host "  - nmap-report.xml (procesable)"
