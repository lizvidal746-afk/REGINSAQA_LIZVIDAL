param(
  [string]$BaseApi = "https://reginsaapiqa.sunedu.gob.pe/api",
  [int]$TotalRegistros = 100,
  [int]$Vus = 20,
  [string]$Duration = "120s",
  [string]$Token1 = $env:TOKEN1,
  [string]$Token2 = $env:TOKEN2,
  [string]$Token = $env:TOKEN,
  [string]$CloudToken = $env:K6_CLOUD_TOKEN,
  [string]$CloudProjectId = $env:K6_CLOUD_PROJECT_ID
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($CloudToken)) {
  throw "Falta K6_CLOUD_TOKEN. Define la variable o pásala por parámetro -CloudToken."
}
if ([string]::IsNullOrWhiteSpace($CloudProjectId)) {
  throw "Falta K6_CLOUD_PROJECT_ID. Define la variable o pásala por parámetro -CloudProjectId."
}
if ([string]::IsNullOrWhiteSpace($Token1) -and [string]::IsNullOrWhiteSpace($Token2) -and [string]::IsNullOrWhiteSpace($Token)) {
  throw "Falta token API (TOKEN1/TOKEN2/TOKEN). Define al menos uno para Authorization."
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path 'reportes')) {
  New-Item -ItemType Directory -Path 'reportes' | Out-Null
}

$summary = "reportes/k6-caso02-cloud-summary-$TotalRegistros.json"

$env:K6_CLOUD_TOKEN = $CloudToken
$env:K6_CLOUD_PROJECT_ID = $CloudProjectId

Write-Host "Ejecutando k6 caso02 en Grafana Cloud..." -ForegroundColor Cyan
Write-Host "  BaseApi=$BaseApi" -ForegroundColor Gray
Write-Host "  TotalRegistros=$TotalRegistros | VUs=$Vus | Duration=$Duration" -ForegroundColor Gray
Write-Host "  Summary=$summary" -ForegroundColor Gray

k6 run -o cloud tests/performance/k6/k6_caso_02_registrar_sancion.js `
  --env "BASE_API=$BaseApi" `
  --env "K6_TOTAL_REGISTROS=$TotalRegistros" `
  --env "TOKEN1=$Token1" `
  --env "TOKEN2=$Token2" `
  --env "TOKEN=$Token" `
  --vus "$Vus" `
  --duration "$Duration" `
  --threshold "http_req_failed<0.05" `
  --threshold "checks>0.95" `
  --threshold "http_req_duration{expected_response:true}<2500" `
  --summary-export $summary
