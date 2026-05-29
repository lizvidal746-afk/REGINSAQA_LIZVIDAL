# Ejecuta Retire.js para detectar librerias JS con CVEs conocidos
# Cubre: package.json, archivos JS bundled/minificados
# Norma: OWASP Top 10 A06 (Vulnerable Components), CVSSv3.1
param(
  [string]$ProjectDir = ".",
  [string]$OutputDir  = "reportes/security/retirejs"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$workspacePath = [System.IO.Path]::GetFullPath($PWD.Path)
$outputPath    = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($workspacePath, $OutputDir))
$projectPath   = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($workspacePath, $ProjectDir))

if (-not (Test-Path $outputPath)) {
  New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
}

$jsonFile = Join-Path $outputPath 'retire-results.json'

Write-Host "=== Retire.js JS Vulnerability Scan ==="
Write-Host "Proyecto: $projectPath"
Write-Host "Salida  : $jsonFile"

# Verificar retire disponible
$retireCmd = Get-Command retire -ErrorAction SilentlyContinue
if ($null -eq $retireCmd) {
  Write-Host "Instalando retire globalmente..."
  npm install -g retire
}

Set-Location $projectPath
retire `
  --path . `
  --outputformat json `
  --outputpath $jsonFile `
  --ignore node_modules/.cache `
  2>&1 | Out-Null

if (Test-Path $jsonFile) {
  Write-Host "Reporte Retire.js generado: $jsonFile"
} else {
  Write-Warning "No se genero archivo JSON. Revisar salida de Retire.js."
}
