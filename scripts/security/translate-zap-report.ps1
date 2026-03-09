param(
  [Parameter(Mandatory = $false)]
  [string]$InputJson = "reportes/security/zap-baseline-report.json",

  [Parameter(Mandatory = $false)]
  [string]$OutputMdEs = "reportes/security/zap-baseline-report.es.md"
)

if (-not (Test-Path $InputJson)) {
  throw "No existe reporte JSON de ZAP: $InputJson"
}

$raw = Get-Content -Path $InputJson -Raw
$data = $null
try {
  $data = $raw | ConvertFrom-Json
} catch {
  throw "No se pudo parsear JSON de ZAP: $InputJson"
}

$site = $null
if ($data.site -is [System.Array] -and $data.site.Count -gt 0) {
  $site = $data.site[0]
} elseif ($data.site) {
  $site = $data.site
}

$alerts = @()
if ($site -and $site.alerts) {
  if ($site.alerts -is [System.Array]) {
    $alerts = $site.alerts
  } else {
    $alerts = @($site.alerts)
  }
}

$high = 0
$medium = 0
$low = 0
$info = 0

$rows = @()
foreach ($a in $alerts) {
  $risk = [string]$a.riskdesc
  $name = [string]$a.name
  $count = [int]($a.count | ForEach-Object { $_ } | Select-Object -First 1)
  if (-not $count) { $count = 1 }

  if ($risk -match 'High') { $high += $count }
  elseif ($risk -match 'Medium') { $medium += $count }
  elseif ($risk -match 'Low') { $low += $count }
  else { $info += $count }

  $rows += "| $name | $risk | $count |"
}

$targetUrl = [string]$site.'@name'
if ([string]::IsNullOrWhiteSpace($targetUrl)) {
  $targetUrl = "(no definido en JSON)"
}

$fecha = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

$header = @(
  "# Reporte OWASP ZAP Traducido (ES)",
  "",
  "- Fecha: $fecha",
  "- Target: $targetUrl",
  "- Fuente: $InputJson",
  "",
  "## Resumen Ejecutivo",
  "",
  "- Hallazgos High: $high",
  "- Hallazgos Medium: $medium",
  "- Hallazgos Low: $low",
  "- Hallazgos Informational: $info",
  "",
  "## Interpretacion para Equipo",
  "",
  "- High: requiere correccion prioritaria antes de liberar.",
  "- Medium: corregir en el siguiente sprint con verificacion QA/Sec.",
  "- Low/Info: registrar como deuda tecnica y monitorear tendencia.",
  "",
  "## Detalle de Alertas",
  "",
  "| Alerta | Riesgo | Ocurrencias |",
  "|---|---|---|"
)

$all = $header + $rows
$all -join "`r`n" | Set-Content -Path $OutputMdEs -Encoding UTF8
Write-Host "Traduccion generada: $OutputMdEs"
