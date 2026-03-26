param(
  [string]$BaseApi = "https://reginsaapiqa.sunedu.gob.pe/api",
  [string]$Endpoint = "/CabeceraInfraccionSancion/Crear",
  [int]$LowRpm = 10,
  [int]$MidRpm = 20,
  [int]$HighRpm = 40,
  [int]$PeakRpm = 60,
  [int]$StageSeconds = 90,
  [double]$Min429High = 0.05,
  [double]$Min429Peak = 0.10,
  [string]$Token1 = $env:TOKEN1,
  [string]$Token2 = $env:TOKEN2,
  [string]$Token = $env:TOKEN,
  [int]$IdEntidad = 3
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path 'reportes')) { New-Item -ItemType Directory -Path 'reportes' | Out-Null }

k6 run tests/performance/k6-grafana/templates/k6_rate_limit_stress_case02.js `
  --env "BASE_API=$BaseApi" `
  --env "RL_ENDPOINT=$Endpoint" `
  --env "STRESS_LOW_RPM=$LowRpm" `
  --env "STRESS_MID_RPM=$MidRpm" `
  --env "STRESS_HIGH_RPM=$HighRpm" `
  --env "STRESS_PEAK_RPM=$PeakRpm" `
  --env "STRESS_STAGE_SECONDS=$StageSeconds" `
  --env "STRESS_MIN_429_HIGH=$Min429High" `
  --env "STRESS_MIN_429_PEAK=$Min429Peak" `
  --env "TOKEN1=$Token1" `
  --env "TOKEN2=$Token2" `
  --env "TOKEN=$Token" `
  --env "K6_ID_ENTIDAD=$IdEntidad" `
  --summary-export reportes/k6-rate-limit-stress-summary-raw.json
