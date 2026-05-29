# Ejecuta wapiti via Docker — DAST activo (SQLi, XSS, XXE, SSRF, etc.)
# Norma: OWASP Top 10 A01-A03, A06, NIST SP 800-115
param(
  [string]$Target    = $env:REGINSA_URL,
  [string]$OutputDir = "reportes/security/wapiti",
  [string]$Modules   = "sql,xss,xxe,ssrf,shellshock,blindsql,crlf,redirect,nikto,permanentxss",
  [int]$MaxDepth     = 3,
  [int]$MaxLinks     = 50
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$commonFunctions = Join-Path (Split-Path -Parent $PSScriptRoot) 'common/functions.ps1'
if (Test-Path $commonFunctions) { . $commonFunctions }

if ([string]::IsNullOrWhiteSpace($Target)) {
  throw "Define REGINSA_URL o pasa -Target para ejecutar wapiti."
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

# Imagen mantenida por la comunidad (la oficial wapiti3/wapiti fue retirada de Docker Hub).
# Override con: $env:WAPITI_IMAGE='otra/imagen'
$wapitiImage = if (-not [string]::IsNullOrWhiteSpace($env:WAPITI_IMAGE)) { $env:WAPITI_IMAGE } else { 'cyberwatch/wapiti' }

Write-Host "=== wapiti DAST Scan ==="
Write-Host "Target  : $Target"
Write-Host "Imagen  : $wapitiImage"
Write-Host "Modulos : $Modules"
Write-Host "Salida  : $outputPath"

Write-Host "`n--- Pull imagen Wapiti (si no existe localmente) ---"
docker pull $wapitiImage 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo descargar la imagen Wapiti '$wapitiImage'. Verifica conexion o define `$env:WAPITI_IMAGE."
}

docker run --rm `
  --volume "${dOutput}:/output" `
  $wapitiImage `
  -u $Target `
  -o /output/wapiti-report.html `
  -f html `
  --scope page `
  -m $Modules `
  --max-links-per-page $MaxLinks `
  --max-depth $MaxDepth `
  --timeout 10

Write-Host "Reporte wapiti generado en: $outputPath"
