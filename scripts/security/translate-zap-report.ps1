param(
  [Parameter(Mandatory = $false)]
  [string]$InputJson = "reportes/security/zap-baseline-report.json",

  [Parameter(Mandatory = $false)]
  [string]$OutputMdEs = "reportes/security/zap-baseline-report.es.md",

  [Parameter(Mandatory = $false)]
  [string]$OutputHtmlEs = "reportes/security/zap-baseline-report.es.html"
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

$highAlerts = 0
$mediumAlerts = 0
$lowAlerts = 0
$infoAlerts = 0

$highInstances = 0
$mediumInstances = 0
$lowInstances = 0
$infoInstances = 0

$rows = @()
foreach ($a in $alerts) {
  $risk = [string]$a.riskdesc
  $riskCode = [string]$a.riskcode
  $name = [string]$a.name
  $count = [int]($a.count | ForEach-Object { $_ } | Select-Object -First 1)
  if (-not $count) { $count = 1 }

  switch ($riskCode) {
    '3' {
      $highAlerts += 1
      $highInstances += $count
    }
    '2' {
      $mediumAlerts += 1
      $mediumInstances += $count
    }
    '1' {
      $lowAlerts += 1
      $lowInstances += $count
    }
    default {
      $infoAlerts += 1
      $infoInstances += $count
    }
  }

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
  "- Hallazgos High (alertas): $highAlerts",
  "- Hallazgos Medium (alertas): $mediumAlerts",
  "- Hallazgos Low (alertas): $lowAlerts",
  "- Hallazgos Informational (alertas): $infoAlerts",
  "",
  "- High (ocurrencias): $highInstances",
  "- Medium (ocurrencias): $mediumInstances",
  "- Low (ocurrencias): $lowInstances",
  "- Informational (ocurrencias): $infoInstances",
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

$title = "Reporte OWASP ZAP (ES)"
$htmlRows = @()
foreach ($a in $alerts) {
  $risk = [string]$a.riskdesc
  $name = [string]$a.name
  $count = [int]($a.count | ForEach-Object { $_ } | Select-Object -First 1)
  if (-not $count) { $count = 1 }
  $htmlRows += "<tr><td>$name</td><td>$risk</td><td>$count</td></tr>"
}

$html = @"
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>$title</title>
  <style>
    body { font-family: Segoe UI, Tahoma, sans-serif; margin: 24px; color: #1f2937; }
    h1 { margin-bottom: 6px; }
    .meta { color: #4b5563; margin: 4px 0; }
    .cards { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0; }
    .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 14px; min-width: 120px; }
    .label { color: #6b7280; font-size: 12px; }
    .value { font-size: 22px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 13px; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <h1>$title</h1>
  <div class="meta">Fecha: $fecha</div>
  <div class="meta">Target: $targetUrl</div>
  <div class="meta">Fuente: $InputJson</div>

  <h2>Resumen Ejecutivo</h2>
  <div class="cards">
    <div class="card"><div class="label">High (alertas)</div><div class="value">$highAlerts</div></div>
    <div class="card"><div class="label">Medium (alertas)</div><div class="value">$mediumAlerts</div></div>
    <div class="card"><div class="label">Low (alertas)</div><div class="value">$lowAlerts</div></div>
    <div class="card"><div class="label">Informational (alertas)</div><div class="value">$infoAlerts</div></div>
  </div>
  <div class="meta">Ocurrencias: High=$highInstances, Medium=$mediumInstances, Low=$lowInstances, Info=$infoInstances</div>

  <h2>Detalle de Alertas</h2>
  <table>
    <thead>
      <tr><th>Alerta</th><th>Riesgo</th><th>Ocurrencias</th></tr>
    </thead>
    <tbody>
      $(($htmlRows -join "`r`n"))
    </tbody>
  </table>
</body>
</html>
"@

$html | Set-Content -Path $OutputHtmlEs -Encoding UTF8
Write-Host "Reporte HTML en espanol generado: $OutputHtmlEs"
