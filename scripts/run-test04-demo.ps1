param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaywrightArgs
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host 'Ejecutando Caso 04 en modo demo (headed recomendado)...'
& npx playwright test --grep '04-RECONSIDERAR CON SANCIONES' @PlaywrightArgs
$testExitCode = $LASTEXITCODE

Write-Host 'Generando y abriendo reportes...'
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'post-test01-reportes.ps1')

exit $testExitCode
