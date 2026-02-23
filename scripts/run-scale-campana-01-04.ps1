param(
  [int]$Workers = 8,
  [int]$RepeatEach = 10,
  [string]$Project = 'chromium',
  [switch]$SkipReset,
  [switch]$SkipPrewarm,
  [switch]$NoOpenReports,
  [switch]$ContinueOnFailure,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExtraPlaywrightArgs
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$cpuCount = [Environment]::ProcessorCount
$autoMaxWorkers = [Math]::Max(2, [Math]::Min(6, $cpuCount - 2))
$envMaxWorkers = [Environment]::GetEnvironmentVariable('REGINSA_MAX_WORKERS_LOCAL')
$maxWorkersLocal = $autoMaxWorkers
if (-not [string]::IsNullOrWhiteSpace($envMaxWorkers)) {
  try {
    $parsedMax = [int]$envMaxWorkers
    if ($parsedMax -gt 0) {
      $maxWorkersLocal = $parsedMax
    }
  } catch {
    $maxWorkersLocal = $autoMaxWorkers
  }
}

$allowOvercommit = [Environment]::GetEnvironmentVariable('REGINSA_ALLOW_OVERCOMMIT') -eq '1'
$isCi = [Environment]::GetEnvironmentVariable('CI') -eq 'true'
if (-not $isCi -and -not $allowOvercommit -and $Workers -gt $maxWorkersLocal) {
  Write-Host "⚠️ Sobrecarga detectada: workers solicitados=$Workers, max local recomendado=$maxWorkersLocal (CPU lógicos=$cpuCount)." -ForegroundColor Yellow
  Write-Host '   Ajustando workers automáticamente para mayor estabilidad.' -ForegroundColor Yellow
  Write-Host '   Use REGINSA_ALLOW_OVERCOMMIT=1 para forzar el valor solicitado.' -ForegroundColor Yellow
  $Workers = $maxWorkersLocal
}

if (-not $env:REGINSA_POOL_TARGET) { $env:REGINSA_POOL_TARGET = '1200' }
if (-not $env:REGINSA_STRICT_VERIFY) { $env:REGINSA_STRICT_VERIFY = '1' }
$env:REGINSA_SKIP_POST_REPORTS = '1'
$env:REGINSA_SKIP_PREWARM = '1'

$runId = (Get-Date).ToString('yyyyMMdd-HHmmss')
$outDir = Join-Path $root "reportes/campanas/$runId"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Get-PlaywrightSummary {
  param([string]$FilePath)

  if (-not (Test-Path $FilePath)) {
    return [pscustomobject]@{ passed = 0; flaky = 0; failed = 0; skipped = 0 }
  }

  try {
    $json = Get-Content $FilePath -Raw | ConvertFrom-Json
    if ($null -ne $json.stats) {
      return [pscustomobject]@{
        passed  = [int]($json.stats.expected | ForEach-Object { if ($_ -eq $null) { 0 } else { $_ } })
        flaky   = [int]($json.stats.flaky | ForEach-Object { if ($_ -eq $null) { 0 } else { $_ } })
        failed  = [int]($json.stats.unexpected | ForEach-Object { if ($_ -eq $null) { 0 } else { $_ } })
        skipped = [int]($json.stats.skipped | ForEach-Object { if ($_ -eq $null) { 0 } else { $_ } })
      }
    }
  } catch {
    Write-Host "⚠️ No se pudo parsear resumen de $FilePath" -ForegroundColor Yellow
  }

  return [pscustomobject]@{ passed = 0; flaky = 0; failed = 0; skipped = 0 }
}

if (-not $SkipReset) {
  Write-Host '🧹 Reiniciando iteración...' -ForegroundColor Cyan
  npm run iteracion:reiniciar
  if ($LASTEXITCODE -ne 0) {
    Write-Host '❌ Falló iteracion:reiniciar. Se detiene campaña.' -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

if (-not $SkipPrewarm) {
  Write-Host "🔥 Prewarm único del pool (objetivo: $($env:REGINSA_POOL_TARGET))..." -ForegroundColor Cyan
  npm run pool:prewarm
  if ($LASTEXITCODE -ne 0) {
    Write-Host '❌ Falló pool:prewarm. Se detiene campaña.' -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

$cases = @(
  @{ id = '01'; script = 'test:01:scale' },
  @{ id = '02'; script = 'test:02:scale' },
  @{ id = '03'; script = 'test:03:scale' },
  @{ id = '04'; script = 'test:04:scale' }
)

$summaryRows = @()
$campaignFailed = $false

foreach ($case in $cases) {
  $scriptName = $case.script
  $caseId = $case.id

  Write-Host "`n▶ Ejecutando Caso $caseId ($scriptName) con workers=$Workers repeat-each=$RepeatEach project=$Project" -ForegroundColor Cyan

  npm run $scriptName -- --workers=$Workers --repeat-each=$RepeatEach --project=$Project @ExtraPlaywrightArgs
  $exitCode = $LASTEXITCODE

  $resultsPath = Join-Path $root 'test-results/results.json'
  $caseResultsPath = Join-Path $outDir "case$caseId-results.json"
  if (Test-Path $resultsPath) {
    Copy-Item -Force $resultsPath $caseResultsPath
  }

  $summary = Get-PlaywrightSummary -FilePath $resultsPath
  $row = [pscustomobject]@{
    case     = $caseId
    script   = $scriptName
    passed   = $summary.passed
    flaky    = $summary.flaky
    failed   = $summary.failed
    skipped  = $summary.skipped
    exitCode = $exitCode
  }
  $summaryRows += $row

  if ($exitCode -ne 0 -or $summary.failed -gt 0) {
    $campaignFailed = $true
    Write-Host "⚠️ Caso $caseId terminó con fallos (exit=$exitCode, failed=$($summary.failed), flaky=$($summary.flaky))." -ForegroundColor Yellow
    if (-not $ContinueOnFailure) {
      Write-Host '⏹️ Campaña detenida por falla (use -ContinueOnFailure para seguir).' -ForegroundColor Yellow
      break
    }
  } else {
    Write-Host "✅ Caso $caseId OK (passed=$($summary.passed), flaky=$($summary.flaky), failed=0)." -ForegroundColor Green
  }
}

$summaryPath = Join-Path $outDir 'summary.json'
$summaryRows | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 $summaryPath

Write-Host "`n================ RESUMEN CAMPAÑA ================" -ForegroundColor Magenta
$summaryRows | Format-Table case, passed, flaky, failed, skipped, exitCode -AutoSize
Write-Host "Resumen guardado en: $summaryPath" -ForegroundColor Gray

if (-not $NoOpenReports) {
  Write-Host '`n📊 Generando reportes finales...' -ForegroundColor Cyan
  powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'post-test01-reportes.ps1')
}

if ($campaignFailed) {
  exit 1
}

exit 0
