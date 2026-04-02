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
# En PowerShell la variable de entorno puede persistir entre corridas en la misma sesión.
# Por defecto se genera un RunId nuevo para evitar heredar reservas/ordinales previos.
if ($env:REGINSA_PRESERVE_TEST_RUN_ID -eq '1' -and -not [string]::IsNullOrWhiteSpace($env:TEST_RUN_ID)) {
  Write-Host "RunId Caso 04 (preservado): $($env:TEST_RUN_ID)" -ForegroundColor Yellow
} else {
  $env:TEST_RUN_ID = "reginsa-caso04-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
  Write-Host "RunId Caso 04 (nuevo): $($env:TEST_RUN_ID)" -ForegroundColor Cyan
}

Write-Host 'Ejecutando Caso 04 en modo fast...'
$argsList = @($PlaywrightArgs)
$hasHeaded = $argsList -contains '--headed'
$hasHeadless = $argsList -contains '--headless'

function Get-ReporterArgIndex {
  param([string[]]$Args)
  for ($j = 0; $j -lt $Args.Count; $j++) {
    $item = [string]$Args[$j]
    if ($item -eq '--reporter' -or $item -like '--reporter=*') {
      return $j
    }
  }
  return -1
}

function Expand-ReporterList {
  param([string]$ReporterCsv)
  $items = @($ReporterCsv -split ',' | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if ($items.Count -eq 0) {
    return 'line,html,allure-playwright'
  }
  if (-not ($items -contains 'html')) {
    $items += 'html'
  }
  if (-not ($items -contains 'allure-playwright')) {
    $items += 'allure-playwright'
  }
  return ($items -join ',')
}

if ($hasHeadless) {
  Write-Host 'Aviso: --headless no es necesario en Playwright actual; se ejecuta headless por defecto.' -ForegroundColor Yellow
  $argsList = @($argsList | Where-Object { $_ -ne '--headless' })
  $hasHeadless = $false
}

if ($hasHeaded) {
  Write-Host 'Aviso: detectado --headed; la ejecucion fast abrira navegador visible.' -ForegroundColor Yellow
}

$reporterIdx = Get-ReporterArgIndex -Args $argsList
if ($reporterIdx -ge 0) {
  $reporterItem = [string]$argsList[$reporterIdx]
  if ($reporterItem -like '--reporter=*') {
    $rawReporter = $reporterItem.Substring('--reporter='.Length)
    $expandedReporter = Expand-ReporterList -ReporterCsv $rawReporter
    $argsList[$reporterIdx] = "--reporter=$expandedReporter"
    if ($expandedReporter -ne $rawReporter) {
      Write-Host "Ajuste de reporter aplicado: --reporter=$expandedReporter" -ForegroundColor Yellow
    }
  } elseif ($reporterItem -eq '--reporter' -and $reporterIdx + 1 -lt $argsList.Count) {
    $rawReporter = [string]$argsList[$reporterIdx + 1]
    $expandedReporter = Expand-ReporterList -ReporterCsv $rawReporter
    $argsList[$reporterIdx + 1] = $expandedReporter
    if ($expandedReporter -ne $rawReporter) {
      Write-Host "Ajuste de reporter aplicado: --reporter $expandedReporter" -ForegroundColor Yellow
    }
  }
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
