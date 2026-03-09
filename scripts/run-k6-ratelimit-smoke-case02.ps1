param(
  [string]$BaseApi = "https://reginsaapiqa.sunedu.gob.pe/api",
  [string]$Endpoint = "/CabeceraInfraccionSancion/Crear",
  [int]$LowRpm = 3,
  [int]$AtLimitRpm = 15,
  [int]$StageSeconds = 60,
  [double]$Max429Low = 0.05,
  [double]$Max429AtLimit = 0.25,
  [string]$Token1 = $env:TOKEN1,
  [string]$Token2 = $env:TOKEN2,
  [string]$Token = $env:TOKEN,
  [int]$IdEntidad = 3
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path 'reportes')) { New-Item -ItemType Directory -Path 'reportes' | Out-Null }

k6 run tests/performance/k6/templates/k6_rate_limit_smoke_case02.js `
  --env "BASE_API=$BaseApi" `
  --env "RL_ENDPOINT=$Endpoint" `
  --env "SMOKE_LOW_RPM=$LowRpm" `
  --env "SMOKE_AT_LIMIT_RPM=$AtLimitRpm" `
  --env "SMOKE_STAGE_SECONDS=$StageSeconds" `
  --env "SMOKE_MAX_429_LOW=$Max429Low" `
  --env "SMOKE_MAX_429_AT_LIMIT=$Max429AtLimit" `
  --env "TOKEN1=$Token1" `
  --env "TOKEN2=$Token2" `
  --env "TOKEN=$Token" `
  --env "K6_ID_ENTIDAD=$IdEntidad" `
  --summary-export reportes/k6-rate-limit-smoke-summary-raw.json
