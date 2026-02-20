param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaywrightArgs
)

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:SKIP_SCREENSHOTS = '1'
$env:REGINSA_SCALE_MODE = '1'
$env:REGINSA_STRICT_VERIFY = '1'
$env:REGINSA_VERIFY_API = '1'
$env:REGINSA_VERIFY_UI = '0'
$env:REGINSA_FAST_VERIFY_ON_API = '1'
$env:REGINSA_VERIFY_RETRIES = '1'
$env:REGINSA_VERIFY_WAIT_MS = '250'
$env:REGINSA_MAX_REINTENTOS = '1'
$env:REGINSA_DATA_RETRIES = '0'
$env:REGINSA_REGISTRO_TIMEOUT_MS = '45000'
$env:REGINSA_CONFIRMAR_API_RETRIES = '2'
$env:REGINSA_CONFIRMAR_API_WAIT_MS = '500'
$env:REGINSA_ALLOW_UI_EVENTUAL = '1'
$env:REGINSA_SKIP_LIST_VERIFY = '1'
$env:REGINSA_REQUIRE_API_CREATE = '1'
$env:REGINSA_TRACE = 'off'
$env:REGINSA_VIDEO = 'off'
$env:REGINSA_SCREENSHOT = 'off'
if (-not $env:REGINSA_POOL_TARGET) {
  $env:REGINSA_POOL_TARGET = '1200'
}

Write-Host "Precalentando pool (objetivo: $($env:REGINSA_POOL_TARGET))..."
& node (Join-Path $PSScriptRoot 'prewarm-pool.js')

Write-Host 'Ejecutando Caso 01 en modo demo rápido...'
& npx playwright test --grep=01-AGREGAR @PlaywrightArgs
$testExitCode = $LASTEXITCODE

Write-Host 'Modo demo: no se abren reportes automáticamente para priorizar tiempo.'
Write-Host 'Si necesitas reportes manuales: npm run posttest:01'

exit $testExitCode
