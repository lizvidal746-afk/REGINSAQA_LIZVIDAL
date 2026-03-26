param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaywrightArgs
)

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$reportesDir = Join-Path $root 'reportes'
$reservasFile = Join-Path $reportesDir 'reconsideracion-candidate-reservations.json'

$env:SKIP_SCREENSHOTS = '1'
$env:REGINSA_EXECUTION_MODE = 'fast'
$env:REGINSA_SCALE_MODE = '0'
if ([string]::IsNullOrWhiteSpace($env:REGINSA_FIXED_RUN_ID)) {
  $env:TEST_RUN_ID = "reginsa-caso03-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
}
if (-not $env:REGINSA_STRICT_VERIFY) {
  $env:REGINSA_STRICT_VERIFY = '0'
}

if (Test-Path $reservasFile) {
  Remove-Item -Path $reservasFile -Force -ErrorAction SilentlyContinue
  Write-Host 'Limpieza inicial: reservas de candidatos eliminadas.' -ForegroundColor Yellow
}

Write-Host 'Ejecutando Caso 03 en modo fast...'
$hasWorkers = $false
$hasRepeatEach = $false

foreach ($arg in $PlaywrightArgs) {
  if ($arg -match '^(--workers=|--workers$)') { $hasWorkers = $true }
  if ($arg -match '^(--repeat-each=|--repeat-each$)') { $hasRepeatEach = $true }
}

$defaultWorkers = if ($env:REGINSA_WORKERS) { $env:REGINSA_WORKERS } else { '' }
if (-not $hasWorkers -and -not [string]::IsNullOrWhiteSpace($defaultWorkers)) {
  $PlaywrightArgs += "--workers=$defaultWorkers"
}

if (-not $hasRepeatEach -and $env:REGINSA_REPEAT_EACH) {
  $PlaywrightArgs += "--repeat-each=$($env:REGINSA_REPEAT_EACH)"
}

$workersValue = 1
for ($i = 0; $i -lt $PlaywrightArgs.Count; $i++) {
  $arg = [string]$PlaywrightArgs[$i]
  if ($arg -like '--workers=*') {
    [int]::TryParse(($arg -replace '^--workers=', ''), [ref]$workersValue) | Out-Null
    break
  }
  if ($arg -eq '--workers' -and $i + 1 -lt $PlaywrightArgs.Count) {
    [int]::TryParse([string]$PlaywrightArgs[$i + 1], [ref]$workersValue) | Out-Null
    break
  }
}

if ($workersValue -gt 1 -and [string]::IsNullOrWhiteSpace($env:REGINSA_FORCE_LOGIN)) {
  $env:REGINSA_FORCE_LOGIN = '1'
  Write-Host 'Paralelo detectado: REGINSA_FORCE_LOGIN=1 para reducir rebotes de sesión entre workers.' -ForegroundColor Yellow
}

# Modo funcional liviano para paralelo (workers=3): evita forzar configuración pesada.
if ($workersValue -gt 1) {
  if ([string]::IsNullOrWhiteSpace($env:REGINSA_CASO03_LOGIN_RETRIES)) {
    $env:REGINSA_CASO03_LOGIN_RETRIES = '2'
  }
  if ([string]::IsNullOrWhiteSpace($env:REGINSA_CASO03_LOGIN_STAGGER_MS)) {
    $env:REGINSA_CASO03_LOGIN_STAGGER_MS = '1200'
  }
  if ([string]::IsNullOrWhiteSpace($env:REGINSA_CASO03_LOGIN_RETRY_WAIT_MS)) {
    $env:REGINSA_CASO03_LOGIN_RETRY_WAIT_MS = '1800'
  }
  if ([string]::IsNullOrWhiteSpace($env:REGINSA_CASO03_MAX_PAGINAS)) {
    $env:REGINSA_CASO03_MAX_PAGINAS = '30'
  }
  Write-Host "Modo liviano Caso03: retries=$($env:REGINSA_CASO03_LOGIN_RETRIES), staggerMs=$($env:REGINSA_CASO03_LOGIN_STAGGER_MS), retryWaitMs=$($env:REGINSA_CASO03_LOGIN_RETRY_WAIT_MS), maxPaginas=$($env:REGINSA_CASO03_MAX_PAGINAS)" -ForegroundColor Yellow
}

& npx playwright test tests/casos-prueba/03-reconsiderar-sin-sanciones.spec.ts @PlaywrightArgs
$testExitCode = $LASTEXITCODE

if (Test-Path $reservasFile) {
  Remove-Item -Path $reservasFile -Force -ErrorAction SilentlyContinue
  Write-Host 'Limpieza final: reservas de candidatos eliminadas.' -ForegroundColor Yellow
}

Write-Host 'Generando y abriendo reportes...'
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'post-test01-reportes.ps1')

exit $testExitCode
