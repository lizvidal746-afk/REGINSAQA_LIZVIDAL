param(
  [Parameter(Mandatory = $false)]
  [string]$Target = $env:REGINSA_URL,

  [Parameter(Mandatory = $false)]
  [string]$OutputDir = "reportes/security"
)

if ([string]::IsNullOrWhiteSpace($Target)) {
  throw "Define REGINSA_URL o pasa -Target para ejecutar ZAP."
}

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

Write-Host "[OWASP] Ejecutando baseline..."
& powershell -ExecutionPolicy Bypass -File tests/security/zap/zap-baseline.ps1 -Target $Target -OutputDir $OutputDir
if ($LASTEXITCODE -ne 0) {
  throw "Fallo la ejecucion de zap-baseline.ps1"
}

$jsonPath = Join-Path $OutputDir "zap-baseline-report.json"
$esPath = Join-Path $OutputDir "zap-baseline-report.es.md"

Write-Host "[OWASP] Traduciendo reporte a espanol..."
& powershell -ExecutionPolicy Bypass -File scripts/security/translate-zap-report.ps1 -InputJson $jsonPath -OutputMdEs $esPath
if ($LASTEXITCODE -ne 0) {
  throw "Fallo la traduccion del reporte ZAP"
}

Write-Host "[OWASP] Reportes generados:"
Write-Host " - $OutputDir/zap-baseline-report.html"
Write-Host " - $OutputDir/zap-baseline-report.json"
Write-Host " - $OutputDir/zap-baseline-report.md"
Write-Host " - $OutputDir/zap-baseline-report.es.md"
