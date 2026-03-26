param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaywrightArgs
)

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:SKIP_SCREENSHOTS = '1'
$env:REGINSA_EXECUTION_MODE = 'fast'
$env:REGINSA_SCALE_MODE = '0'
if (-not $env:TEST_RUN_ID) {
  $env:TEST_RUN_ID = "reginsa-caso02-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
}

# Patrón estable para caso 02 en modo fast:
# - repeats 0 y 1: 8 sanciones (cobertura completa)
# - repeats >=2: 2 sanciones (carga ligera)
if (-not $env:REGINSA_CASO02_FULL_REPEATS) { $env:REGINSA_CASO02_FULL_REPEATS = '2' }
if (-not $env:REGINSA_CASO02_FULL_COUNT)   { $env:REGINSA_CASO02_FULL_COUNT   = '8' }
if (-not $env:REGINSA_CASO02_LIGHT_COUNT)  { $env:REGINSA_CASO02_LIGHT_COUNT  = '2' }

$argsList = @($PlaywrightArgs)
$repeatEachValue = 1
for ($i = 0; $i -lt $argsList.Count; $i++) {
  $arg = [string]$argsList[$i]
  if ($arg -like '--repeat-each=*') {
    [int]::TryParse(($arg -replace '^--repeat-each=', ''), [ref]$repeatEachValue) | Out-Null
    continue
  }
  if ($arg -eq '--repeat-each' -and $i + 1 -lt $argsList.Count) {
    [int]::TryParse([string]$argsList[$i + 1], [ref]$repeatEachValue) | Out-Null
    continue
  }
}

$env:REGINSA_REPEAT_EACH = [string]([Math]::Max(1, $repeatEachValue))

Write-Host "RunId Caso 02: $($env:TEST_RUN_ID) | RepeatEach: $($env:REGINSA_REPEAT_EACH)" -ForegroundColor Cyan

Write-Host 'Ejecutando Caso 02 en modo fast...'
& npx playwright test --grep '02-REGISTRAR SANCI.N' @argsList
$testExitCode = $LASTEXITCODE

Write-Host 'Generando y abriendo reportes...'
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'post-test01-reportes.ps1')

exit $testExitCode
