param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaywrightArgs
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:REGINSA_EXECUTION_MODE = 'demo'
$env:REGINSA_SCALE_MODE = '0'
if (-not $env:TEST_RUN_ID) {
  $env:TEST_RUN_ID = "reginsa-caso02-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
}

Write-Host "RunId Caso 02: $($env:TEST_RUN_ID)" -ForegroundColor Cyan

Write-Host 'Ejecutando Caso 02 en modo demo (headed recomendado)...'
& npx playwright test --grep '02-REGISTRAR SANCI.N' @PlaywrightArgs
$testExitCode = $LASTEXITCODE

Write-Host 'Generando y abriendo reportes...'
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'post-test01-reportes.ps1')

exit $testExitCode
