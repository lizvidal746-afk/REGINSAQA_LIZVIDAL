param(
  [string]$BaseApi = "https://reginsaapiqa.sunedu.gob.pe/api",
  [string]$Endpoint = "/CabeceraInfraccionSancion/Crear",
  [int]$LowRpm = 3,
  [int]$MidRpm = 15,
  [int]$HighRpm = 30,
  [int]$StageSeconds = 90,
  [double]$Expect429Min = 0.02,
  [double]$Expect429MaxLow = 0.05,
  [string]$Token1 = $env:TOKEN1,
  [string]$Token2 = $env:TOKEN2,
  [string]$Token = $env:TOKEN,
  [int]$IdEntidad = 3
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path 'reportes')) {
  New-Item -ItemType Directory -Path 'reportes' | Out-Null
}

if ([string]::IsNullOrWhiteSpace($Token1) -and [string]::IsNullOrWhiteSpace($Token2) -and [string]::IsNullOrWhiteSpace($Token)) {
  Write-Warning "No se detectó TOKEN1/TOKEN2/TOKEN. Si la API requiere auth, la prueba fallará con 401/403."
}

$summaryPath = "reportes/k6-rate-limit-case02-summary.json"

Write-Host "Probando rate limit (429) caso 02..." -ForegroundColor Cyan
Write-Host "  Endpoint: $BaseApi$Endpoint" -ForegroundColor Gray
Write-Host "  Low/Mid/High rpm: $LowRpm/$MidRpm/$HighRpm" -ForegroundColor Gray
Write-Host "  StageSeconds: $StageSeconds" -ForegroundColor Gray

k6 run tests/performance/k6-grafana/templates/k6_rate_limit_case02_template.js `
  --env "BASE_API=$BaseApi" `
  --env "RL_ENDPOINT=$Endpoint" `
  --env "RL_LOW_RPM=$LowRpm" `
  --env "RL_MID_RPM=$MidRpm" `
  --env "RL_HIGH_RPM=$HighRpm" `
  --env "RL_STAGE_SECONDS=$StageSeconds" `
  --env "RL_EXPECT_429_MIN=$Expect429Min" `
  --env "RL_EXPECT_429_MAX_LOW=$Expect429MaxLow" `
  --env "TOKEN1=$Token1" `
  --env "TOKEN2=$Token2" `
  --env "TOKEN=$Token" `
  --env "K6_ID_ENTIDAD=$IdEntidad" `
  --summary-export $summaryPath
