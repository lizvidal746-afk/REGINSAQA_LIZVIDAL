param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaywrightArgs
)

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:SKIP_SCREENSHOTS = '1'
if (-not $env:REGINSA_FUNC_RUN_ID) {
  $env:REGINSA_FUNC_RUN_ID = [guid]::NewGuid().ToString()
}
$isListMode = $PlaywrightArgs -contains '--list'

# Evita mezclar evidencia previa (p.ej. Caso 02) en reportes de Caso 01.
$reportDirs = @('allure-results', 'allure-report', 'playwright-report', 'test-results')
foreach ($dir in $reportDirs) {
  $fullPath = Join-Path $root $dir
  if (Test-Path $fullPath) {
    Remove-Item -Path $fullPath -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host 'Ejecutando Caso 01 en modo fast...'
& npx playwright test tests/casos-prueba/01-agregar-administrado.spec.ts @PlaywrightArgs
$testExitCode = $LASTEXITCODE

if ($isListMode) {
  Write-Host 'Modo --list detectado: se omite generación/apertura de reportes para evitar resultados históricos.'
} else {
  Write-Host 'Generando y abriendo reportes...'
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'post-test01-reportes.ps1')
}

exit $testExitCode
