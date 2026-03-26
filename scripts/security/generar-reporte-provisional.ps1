param(
  [string]$OutputFile = "reportes/security/reporte-provisional-qa-sec.md"
)

$ErrorActionPreference = 'Stop'

$securityDir = "reportes/security"
$newmanDir = "reportes/newman"

if (-not (Test-Path $securityDir)) {
  New-Item -ItemType Directory -Path $securityDir -Force | Out-Null
}

$now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$zapJson = Join-Path $securityDir "zap-baseline-report.json"
$zapHtml = Join-Path $securityDir "zap-baseline-report.html"
$zapMdEs = Join-Path $securityDir "zap-baseline-report.es.md"

$newmanFiles = @(
  @{ label = "caso01-api-test.xml"; paths = @("caso01-api-test.xml", "caso01/caso01-api-test.xml") },
  @{ label = "caso01-api-test.json"; paths = @("caso01-api-test.json", "caso01/caso01-api-test.json") },
  @{ label = "caso02-api-test.xml"; paths = @("caso02-api-test.xml", "caso02/caso02-api-test.xml") },
  @{ label = "caso02-api-test.json"; paths = @("caso02-api-test.json", "caso02/caso02-api-test.json") },
  @{ label = "caso03-api-test.xml"; paths = @("caso03-api-test.xml", "caso03/caso03-api-test.xml") },
  @{ label = "caso03-api-test.json"; paths = @("caso03-api-test.json", "caso03/caso03-api-test.json") },
  @{ label = "caso04-api-test.xml"; paths = @("caso04-api-test.xml", "caso04/caso04-api-test.xml") },
  @{ label = "caso04-api-test.json"; paths = @("caso04-api-test.json", "caso04/caso04-api-test.json") }
)

function ExistsText([string]$path) {
  if (Test-Path $path) { return "SI" }
  return "NO"
}

function ExistsAny([string[]]$relativePaths) {
  foreach ($rp in $relativePaths) {
    $full = Join-Path $newmanDir $rp
    if (Test-Path $full) { return "SI" }
  }
  return "NO"
}

$lines = @()
$lines += "# Reporte Provisional QA + Seguridad"
$lines += ""
$lines += "- Fecha: $now"
$lines += "- Alcance: OWASP ZAP baseline + Newman API casos 01-04"
$lines += ""
$lines += "## Evidencias OWASP"
$lines += ""
$lines += "| Archivo | Disponible |"
$lines += "|---|---|"
$lines += "| zap-baseline-report.json | $(ExistsText $zapJson) |"
$lines += "| zap-baseline-report.html | $(ExistsText $zapHtml) |"
$lines += "| zap-baseline-report.es.md | $(ExistsText $zapMdEs) |"
$lines += ""
$lines += "## Evidencias Newman"
$lines += ""
$lines += "| Archivo | Disponible |"
$lines += "|---|---|"
foreach ($f in $newmanFiles) {
  $lines += "| $($f.label) | $(ExistsAny $f.paths) |"
}
$lines += ""
$lines += "## Observaciones"
$lines += ""
$lines += "- Este reporte es provisional y se usa para comite operativo inicial."
$lines += "- Hallazgos se consideran cerrados solo con evidencia reproducible y validacion tecnica."
$lines += "- Separar siempre hallazgos de seguridad, negocio API y rendimiento para evitar ruido."

$lines -join "`r`n" | Set-Content -Path $OutputFile -Encoding UTF8
Write-Host "Reporte provisional generado: $OutputFile"
