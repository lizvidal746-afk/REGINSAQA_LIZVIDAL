param(
  [ValidateSet('all','funcional','k6')]
  [string]$Mode = 'all',

  [ValidateSet('fast','scale')]
  [string]$FunctionalMode = 'fast',

  [int]$Workers = 3,
  [int]$RepeatEach = 9,
  [int]$PoolTarget = 300,

  [ValidateSet('local','cloud')]
  [string]$K6Output = 'local',

  [int]$K6TotalRegistros = 27,
  [int]$K6FixedIterations = 27,
  [int]$K6FixedVUs = 3,
  [string]$PerfDuration = '10m',

  [string]$BaseUrl = '',
  [string]$ApiAuthHeader = '',

  [switch]$SkipClean,
  [switch]$SkipPrewarm,
  [switch]$SkipDataset
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Resolve-NonEmpty([string]$primary, [string]$fallback) {
  if (-not [string]::IsNullOrWhiteSpace($primary)) { return $primary }
  return $fallback
}

$invokeOrFail = {
  param([string]$command, [string]$label)
  Write-Host "`n▶ $label" -ForegroundColor Cyan
  Write-Host "   $command" -ForegroundColor DarkGray
  Invoke-Expression $command
  if ($LASTEXITCODE -ne 0) {
    throw "Falló: $label (exit=$LASTEXITCODE)"
  }
}

$baseUrlFinal = Resolve-NonEmpty $BaseUrl $env:REGINSA_API_BASE
if ([string]::IsNullOrWhiteSpace($baseUrlFinal)) {
  $baseUrlFinal = 'https://reginsaapiqa.sunedu.gob.pe/api'
}

$apiAuthHeaderFinal = Resolve-NonEmpty $ApiAuthHeader $env:REGINSA_API_AUTH_HEADER
$cloudToken = $env:K6_CLOUD_TOKEN
$cloudProjectId = $env:K6_CLOUD_PROJECT_ID

$env:REGINSA_POOL_TARGET = [string]$PoolTarget
$env:BASE_URL = $baseUrlFinal
$env:K6_TOTAL_REGISTROS = [string]$K6TotalRegistros
$env:K6_PROFILE = 'fijo'
$env:K6_FIXED_ITERATIONS = [string]$K6FixedIterations
$env:K6_FIXED_VUS = [string]$K6FixedVUs
$env:PERF_DURATION = $PerfDuration

if (-not [string]::IsNullOrWhiteSpace($apiAuthHeaderFinal)) {
  $env:K6_AUTH_HEADER = $apiAuthHeaderFinal
}

Write-Host "=== RUN CASO 01 LOCAL ===" -ForegroundColor Green
Write-Host "Mode=$Mode | FunctionalMode=$FunctionalMode | Workers=$Workers | RepeatEach=$RepeatEach" -ForegroundColor Green
Write-Host "PoolTarget=$PoolTarget | K6Output=$K6Output | K6TotalRegistros=$K6TotalRegistros" -ForegroundColor Green

if ($Mode -in @('all','funcional')) {
  if (-not $SkipClean) {
    & $invokeOrFail 'npm run clean:run' 'Limpieza rápida de ejecución'
  }

  if (-not $SkipPrewarm) {
    & $invokeOrFail 'npm run pool:prewarm' 'Prewarm de pool'
  }

  if ($FunctionalMode -eq 'scale') {
    & $invokeOrFail "npm run test:01:scale -- --workers=$Workers --repeat-each=$RepeatEach --project=chromium" 'Caso 01 funcional scale'
  } else {
    & $invokeOrFail "npm run test:01:fast -- --workers=$Workers --repeat-each=$RepeatEach --project=chromium" 'Caso 01 funcional fast'
  }
}

if ($Mode -in @('all','k6')) {
  if (-not $SkipPrewarm) {
    & $invokeOrFail 'npm run pool:prewarm' 'Prewarm de pool para k6'
  }

  if (-not $SkipDataset) {
    & $invokeOrFail "node scripts/generar-k6-caso01-dataset.js --size=$K6TotalRegistros" 'Generación dataset k6 caso 01'
  }

  $k6Cmd = "k6 run tests/performance/k6/k6_caso_01_agregar_administrado.js --env BASE_URL=$baseUrlFinal --env K6_FIXED_ITERATIONS=$K6FixedIterations --env K6_FIXED_VUS=$K6FixedVUs --env K6_TOTAL_REGISTROS=$K6TotalRegistros --env PERF_DURATION=$PerfDuration --summary-export reportes/k6-caso01-summary-local.json"

  if (-not [string]::IsNullOrWhiteSpace($apiAuthHeaderFinal)) {
    $k6Cmd += " --env K6_AUTH_HEADER='$apiAuthHeaderFinal'"
  }

  if ($K6Output -eq 'cloud') {
    if ([string]::IsNullOrWhiteSpace($cloudToken) -or [string]::IsNullOrWhiteSpace($cloudProjectId)) {
      throw 'K6Output=cloud requiere K6_CLOUD_TOKEN y K6_CLOUD_PROJECT_ID en variables de entorno.'
    }
    $k6Cmd = "k6 run -o cloud tests/performance/k6/k6_caso_01_agregar_administrado.js --env BASE_URL=$baseUrlFinal --env K6_FIXED_ITERATIONS=$K6FixedIterations --env K6_FIXED_VUS=$K6FixedVUs --env K6_TOTAL_REGISTROS=$K6TotalRegistros --env PERF_DURATION=$PerfDuration --env K6_CLOUD_TOKEN=$cloudToken --env K6_CLOUD_PROJECT_ID=$cloudProjectId"
    if (-not [string]::IsNullOrWhiteSpace($apiAuthHeaderFinal)) {
      $k6Cmd += " --env K6_AUTH_HEADER='$apiAuthHeaderFinal'"
    }
  }

  & $invokeOrFail $k6Cmd 'Ejecución k6 caso 01'
  & $invokeOrFail 'node scripts/verificar-k6-caso01-persistencia.js' 'Auditoría de persistencia caso 01'
}

Write-Host "`n✅ Proceso completado." -ForegroundColor Green
