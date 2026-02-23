param(
  [string]$Target = $env:REGINSA_URL,
  [string]$OutputDir = "reportes/security"
)

if ([string]::IsNullOrWhiteSpace($Target)) {
  throw "Define REGINSA_URL o pasa -Target para ejecutar ZAP."
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$cwd = Get-Location
$reportHtml = Join-Path $cwd "$OutputDir/zap-baseline-report.html"
$reportJson = Join-Path $cwd "$OutputDir/zap-baseline-report.json"
$reportMd = Join-Path $cwd "$OutputDir/zap-baseline-report.md"

Write-Host "Ejecutando OWASP ZAP baseline contra $Target"

docker run --rm `
  -v "${cwd}:/zap/wrk/:rw" `
  ghcr.io/zaproxy/zaproxy:stable `
  zap-baseline.py -t "$Target" -r "${reportHtml}" -J "${reportJson}" -w "${reportMd}" -m 5
