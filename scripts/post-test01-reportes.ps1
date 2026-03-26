$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host 'Generando reporte Allure...'
$allureResultsPath = Join-Path $root 'allure-results'
$allureResultFiles = @()
if (Test-Path $allureResultsPath) {
  $allureResultFiles = Get-ChildItem -Path $allureResultsPath -Filter '*-result.json' -ErrorAction SilentlyContinue
}

if ($allureResultFiles.Count -eq 0) {
  Write-Host '⚠️ No se encontraron resultados de Allure (*-result.json).'
} else {
  & npx allure generate allure-results --clean -o allure-report
  if ($LASTEXITCODE -ne 0) {
    Write-Host '❌ Falló la generación de Allure report.'
  }
}

$playwrightReport = Join-Path $root 'playwright-report/index.html'
$allureReportIndex = Join-Path $root 'allure-report/index.html'

function Start-ReportPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [string]$Label = 'reporte'
  )

  try {
    Start-Process $Path | Out-Null
    Write-Host "Abriendo ${Label}: $Path"
    return $true
  } catch {
    Write-Host "No se pudo abrir automáticamente $Label."
    return $false
  }
}

if (Test-Path $playwrightReport) {
  $openedPw = Start-ReportPath -Path $playwrightReport -Label 'Playwright report'
  if (-not $openedPw) {
    Write-Host 'Ábrelo manualmente con:'
    Write-Host '  npx playwright show-report'
  }
} else {
  Write-Host 'Playwright report no encontrado.'
}

# Allure NO debe abrirse con file:// (doble clic en index.html): el SPA queda en "Loading..."
# porque carga JSON bajo /data vía fetch; sin servidor HTTP falla. Usar solo: npx allure open
if ((Test-Path $allureReportIndex) -and ($allureResultFiles.Count -gt 0)) {
  Write-Host 'Abriendo Allure con servidor local (única forma que carga datos)...'
  try {
    $npx = (Get-Command npx -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
    if (-not $npx) { $npx = 'npx' }
    Start-Process -FilePath $npx -ArgumentList @('allure', 'open', 'allure-report') -WorkingDirectory $root | Out-Null
    Write-Host 'Allure: npx allure open allure-report (si no abre, ejecútalo manualmente en la raíz del repo).'
  } catch {
    Write-Host 'No se pudo iniciar allure open automáticamente. Ejecuta:'
    Write-Host '  npx allure open allure-report'
  }
} else {
  Write-Host 'Allure report no disponible para abrir (sin resultados o sin index generado).'
}
