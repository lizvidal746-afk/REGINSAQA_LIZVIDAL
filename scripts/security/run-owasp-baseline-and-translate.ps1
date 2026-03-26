param(
  [Parameter(Mandatory = $false)]
  [string]$Target = $env:REGINSA_URL,

  [Parameter(Mandatory = $false)]
  [string]$OutputDir = "reportes/security",

  [Parameter(Mandatory = $false)]
  [switch]$FailOnWarn
)

if ([string]::IsNullOrWhiteSpace($Target)) {
  throw "Define REGINSA_URL o pasa -Target para ejecutar ZAP."
}

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

Write-Host "[OWASP] Ejecutando baseline..."
$zapBaselineArgs = @(
  '-ExecutionPolicy', 'Bypass',
  '-File', 'tests/security/zap/zap-baseline.ps1',
  '-Target', $Target,
  '-OutputDir', $OutputDir
)

if ($FailOnWarn) {
  $zapBaselineArgs += '-FailOnWarn'
}

& powershell @zapBaselineArgs
if ($LASTEXITCODE -ne 0) {
  throw "Fallo la ejecucion de zap-baseline.ps1"
}

$jsonPath = Join-Path $OutputDir "zap-baseline-report.json"
$mdPath = Join-Path $OutputDir "zap-baseline-report.md"
$esPath = Join-Path $OutputDir "zap-baseline-report.es.md"
$esHtmlPath = Join-Path $OutputDir "zap-baseline-report.es.html"

$normalizeScript = "scripts/security/normalize-owasp-markdown.ps1"
if (Test-Path $normalizeScript) {
  Write-Host "[OWASP] Normalizando markdown base de ZAP..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File $normalizeScript -InputPath $mdPath
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo la normalizacion de markdown base ZAP"
  }
}

Write-Host "[OWASP] Traduciendo reporte a espanol..."
& powershell -ExecutionPolicy Bypass -File scripts/security/translate-zap-report.ps1 -InputJson $jsonPath -OutputMdEs $esPath -OutputHtmlEs $esHtmlPath
if ($LASTEXITCODE -ne 0) {
  throw "Fallo la traduccion del reporte ZAP"
}

if (Test-Path $normalizeScript) {
  Write-Host "[OWASP] Normalizando markdown traducido (ES)..."
  & powershell -NoProfile -ExecutionPolicy Bypass -File $normalizeScript -InputPath $esPath
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo la normalizacion de markdown traducido ZAP"
  }
}

Write-Host "[OWASP] Reportes generados:"
Write-Host " - $OutputDir/zap-baseline-report.html"
Write-Host " - $OutputDir/zap-baseline-report.json"
Write-Host " - $OutputDir/zap-baseline-report.md"
Write-Host " - $OutputDir/zap-baseline-report.es.md"
Write-Host " - $OutputDir/zap-baseline-report.es.html"
