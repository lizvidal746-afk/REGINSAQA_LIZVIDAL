param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaywrightArgs
)

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:SKIP_SCREENSHOTS = '1'
if (-not $env:NODE_OPTIONS) {
  $env:NODE_OPTIONS = '--max-old-space-size=4096'
}
if (-not $env:TEST_RUN_ID) {
  $env:TEST_RUN_ID = "reginsa-caso04-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
}

Write-Host 'Ejecutando Caso 04 en modo fast...'
& npx playwright test --grep '04-RECONSIDERAR CON SANCIONES' @PlaywrightArgs
$testExitCode = $LASTEXITCODE

Write-Host 'Generando y abriendo reportes...'
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'post-test01-reportes.ps1')

exit $testExitCode
