param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaywrightArgs
)

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:SKIP_SCREENSHOTS = '1'
$env:REGINSA_SCALE_MODE = '1'
if (-not $env:REGINSA_STRICT_VERIFY) {
  $env:REGINSA_STRICT_VERIFY = '1'
}
if (-not $env:REGINSA_VERIFY_API) {
  $env:REGINSA_VERIFY_API = '1'
}
if (-not $env:REGINSA_VERIFY_UI) {
  $env:REGINSA_VERIFY_UI = '0'
}
if (-not $env:REGINSA_FAST_VERIFY_ON_API) {
  $env:REGINSA_FAST_VERIFY_ON_API = '1'
}
if (-not $env:REGINSA_VERIFY_RETRIES) {
  $env:REGINSA_VERIFY_RETRIES = '2'
}
if (-not $env:REGINSA_VERIFY_WAIT_MS) {
  $env:REGINSA_VERIFY_WAIT_MS = '800'
}
if (-not $env:REGINSA_CONFIRMAR_API_RETRIES) {
  $env:REGINSA_CONFIRMAR_API_RETRIES = '8'
}
if (-not $env:REGINSA_CONFIRMAR_API_WAIT_MS) {
  $env:REGINSA_CONFIRMAR_API_WAIT_MS = '1500'
}
if (-not $env:REGINSA_CONFIRMAR_API_RETRIES_EXT) {
  $env:REGINSA_CONFIRMAR_API_RETRIES_EXT = '20'
}
if (-not $env:REGINSA_CONFIRMAR_API_WAIT_MS_EXT) {
  $env:REGINSA_CONFIRMAR_API_WAIT_MS_EXT = '2000'
}
if (-not $env:REGINSA_CONFIRMAR_API_RETRIES_FINAL) {
  $env:REGINSA_CONFIRMAR_API_RETRIES_FINAL = '20'
}
if (-not $env:REGINSA_CONFIRMAR_API_WAIT_MS_FINAL) {
  $env:REGINSA_CONFIRMAR_API_WAIT_MS_FINAL = '2000'
}
if (-not $env:REGINSA_MAX_REINTENTOS) {
  $env:REGINSA_MAX_REINTENTOS = '2'
}
try {
  $reintentos = [int]$env:REGINSA_MAX_REINTENTOS
  if ($reintentos -lt 2) {
    $env:REGINSA_MAX_REINTENTOS = '2'
  }
} catch {
  $env:REGINSA_MAX_REINTENTOS = '2'
}
if (-not $env:REGINSA_DATA_RETRIES) {
  $env:REGINSA_DATA_RETRIES = '0'
}
if (-not $env:REGINSA_ALLOW_UI_EVENTUAL) {
  $env:REGINSA_ALLOW_UI_EVENTUAL = '1'
}
if (-not $env:REGINSA_SKIP_LIST_VERIFY) {
  $env:REGINSA_SKIP_LIST_VERIFY = '1'
}
if (-not $env:REGINSA_REQUIRE_API_CREATE) {
  $env:REGINSA_REQUIRE_API_CREATE = '1'
}
if (-not $env:REGINSA_REGISTRO_TIMEOUT_MS) {
  $env:REGINSA_REGISTRO_TIMEOUT_MS = '60000'
}
if (-not $env:REGINSA_POOL_TARGET) {
  $env:REGINSA_POOL_TARGET = '600'
}

Write-Host "Precalentando pool (objetivo: $($env:REGINSA_POOL_TARGET))..."
& node (Join-Path $PSScriptRoot 'prewarm-pool.js')

Write-Host 'Ejecutando Caso 01 en modo scale...'
& npx playwright test --grep=01-AGREGAR --retries=1 @PlaywrightArgs
$testExitCode = $LASTEXITCODE

Write-Host 'Generando y abriendo reportes...'
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'post-test01-reportes.ps1')

exit $testExitCode
