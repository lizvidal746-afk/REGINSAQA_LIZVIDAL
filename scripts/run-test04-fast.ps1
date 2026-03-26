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
$argsList = @($PlaywrightArgs)
$hasHeaded = $argsList -contains '--headed'
$hasHeadless = $argsList -contains '--headless'

if ($hasHeadless) {
  Write-Host 'Aviso: --headless no es necesario en Playwright actual; se ejecuta headless por defecto.' -ForegroundColor Yellow
  $argsList = @($argsList | Where-Object { $_ -ne '--headless' })
  $hasHeadless = $false
}

if ($hasHeaded) {
  Write-Host 'Aviso: detectado --headed; la ejecucion fast abrira navegador visible.' -ForegroundColor Yellow
}

# En Playwright moderno, modo headless es el comportamiento por defecto.

$workersValue = 1
$repeatEachValue = 1
for ($i = 0; $i -lt $argsList.Count; $i++) {
  $arg = [string]$argsList[$i]
  if ($arg -like '--workers=*') {
    [int]::TryParse(($arg -replace '^--workers=', ''), [ref]$workersValue) | Out-Null
    continue
  }
  if ($arg -eq '--workers' -and $i + 1 -lt $argsList.Count) {
    [int]::TryParse([string]$argsList[$i + 1], [ref]$workersValue) | Out-Null
    continue
  }
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

if ($workersValue -gt 1 -and [string]::IsNullOrWhiteSpace($env:REGINSA_FORCE_LOGIN)) {
  $env:REGINSA_FORCE_LOGIN = '1'
  Write-Host 'Paralelo detectado: REGINSA_FORCE_LOGIN=1 para evitar sesión residual entre workers.' -ForegroundColor Yellow
}

& npx playwright test tests/casos-prueba/04-reconsiderar-con-sanciones.spec.ts @argsList
$testExitCode = $LASTEXITCODE

Write-Host 'Generando y abriendo reportes...'
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'post-test01-reportes.ps1')

exit $testExitCode
