param(
  [Parameter(Mandatory = $true)]
  [string]$SonarUrl,
  [Parameter(Mandatory = $true)]
  [string]$SonarToken,
  [Parameter(Mandatory = $true)]
  [string]$ProjectKey,
  [string]$OutputDir = 'reportes/security'
)

$ErrorActionPreference = 'Stop'

$SonarUrl = $SonarUrl.Trim().TrimEnd('/')

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$tokenBytes = [System.Text.Encoding]::ASCII.GetBytes($SonarToken + ':')
$basicToken = [Convert]::ToBase64String($tokenBytes)
$headers = @{ Authorization = "Basic $basicToken" }

function Invoke-SonarApi {
  param([string]$RequestUrl)
  try {
    Invoke-RestMethod -Method Get -Uri $RequestUrl -Headers $headers
  }
  catch {
    $statusCode = $null
    try {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $statusCode = [int]$_.Exception.Response.StatusCode
      }
    } catch {}

    $ex = New-Object System.Exception("Error Sonar API [$statusCode] en URL: $RequestUrl", $_.Exception)
    if ($statusCode -ne $null) {
      $ex.Data['StatusCode'] = $statusCode
    }
    throw $ex
  }
}

function Normalize-Count($value) {
  if ($null -eq $value) { return 1 }
  $v = [string]$value
  if ([string]::IsNullOrWhiteSpace($v)) { return 1 }
  try {
    $n = [int]$v
    if ($n -lt 1) { return 1 }
    return $n
  }
  catch {
    return 1
  }
}

$issues = @()
$page = 1
$pageSize = 500
while ($true) {
  $projectKeyEscaped = [System.Uri]::EscapeDataString($ProjectKey)
  $url = "$SonarUrl/api/issues/search?componentKeys=$projectKeyEscaped&resolved=false&additionalFields=_all&ps=$pageSize&p=$page"
  try {
    $resp = Invoke-SonarApi -RequestUrl $url
  }
  catch {
    $statusCode = $null
    try {
      if ($_.Exception.Data.Contains('StatusCode')) {
        $statusCode = [int]$_.Exception.Data['StatusCode']
      }
    } catch {}

    if ($statusCode -eq 404) {
      break
    }

    throw
  }

  if ($null -eq $resp.issues -or $resp.issues.Count -eq 0) {
    break
  }

  $issues += $resp.issues

  if ($null -eq $resp.paging) { break }
  $total = [int]$resp.paging.total
  $current = [int]$resp.paging.pageIndex
  $ps = [int]$resp.paging.pageSize
  if (($current * $ps) -ge $total) { break }

  $page += 1
}

$projectKeyEscaped = [System.Uri]::EscapeDataString($ProjectKey)
$historyMetrics = 'bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density'

$measures = $null
$history = $null
try {
  $measures = Invoke-SonarApi -RequestUrl "$SonarUrl/api/measures/component?component=$projectKeyEscaped&metricKeys=alert_status,bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,sqale_rating,reliability_rating,security_rating,security_hotspots_reviewed"
  $history = Invoke-SonarApi -RequestUrl "$SonarUrl/api/measures/search_history?component=$projectKeyEscaped&metrics=$historyMetrics&ps=2"
}
catch {
  $statusCode = $null
  try {
    if ($_.Exception.Data.Contains('StatusCode')) {
      $statusCode = [int]$_.Exception.Data['StatusCode']
    }
  } catch {}

  if ($statusCode -ne 404) {
    throw
  }
}

$severityGroups = @($issues | Group-Object severity | Sort-Object Count -Descending)
$ruleGroups = @($issues | Group-Object rule | Sort-Object Count -Descending | Select-Object -First 10)
$componentGroups = @($issues | Group-Object component | Sort-Object Count -Descending | Select-Object -First 10)

$moduleOwner = 'QA + Desarrollo'
$moduleSla = '30 dias'
if ($ProjectKey -match 'frontend') {
  $moduleOwner = 'Equipo Frontend'
  $moduleSla = '15 dias'
}
elseif ($ProjectKey -match 'backend') {
  $moduleOwner = 'Equipo Backend'
  $moduleSla = '30 dias'
}
elseif ($ProjectKey -match 'enlinea') {
  $moduleOwner = 'Equipo Enlinea'
  $moduleSla = '21 dias'
}
elseif ($ProjectKey -match 'config') {
  $moduleOwner = 'Equipo Plataforma/Config'
  $moduleSla = '30 dias'
}

$quickWins = @()
if (($issues | Where-Object { $_.severity -in @('BLOCKER', 'CRITICAL', 'MAJOR') }).Count -gt 0) {
  $quickWins += 'Atacar severidades BLOCKER/CRITICAL/MAJOR en primera iteracion.'
}
if (($issues | Where-Object { $_.rule -match 'security|vulnerability|xss|sqli|auth|hotspot' }).Count -gt 0) {
  $quickWins += 'Priorizar reglas de seguridad y hotspots sin revisar.'
}
if (($issues | Where-Object { $_.type -eq 'CODE_SMELL' }).Count -gt 0) {
  $quickWins += 'Aplicar reglas de estilo y limpieza para reducir code smells mas frecuentes.'
}
if ($quickWins.Count -eq 0) {
  $quickWins += 'Mantener gate estricto en new code y monitoreo semanal.'
}

$trend = @{}
if ($history.measures) {
  foreach ($m in $history.measures) {
    $hist = @($m.history)
    if ($hist.Count -ge 2) {
      $latest = [double](Normalize-Count $hist[$hist.Count - 1].value)
      $prev = [double](Normalize-Count $hist[$hist.Count - 2].value)
      $trend[$m.metric] = [ordered]@{
        previous = $prev
        current = $latest
        delta = ($latest - $prev)
      }
    }
  }
}

$safeKey = $ProjectKey -replace '[^a-zA-Z0-9_-]', '_'
$summaryJsonPath = Join-Path $OutputDir "sonar-$safeKey-accionable-resumen.json"
$matrixCsvPath = Join-Path $OutputDir "sonar-$safeKey-plan-remediacion.csv"

if ($null -eq $measures -or $null -eq $measures.component) {
  $summarySkipped = [ordered]@{
    generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    projectKey = $ProjectKey
    status = 'SKIPPED'
    reason = 'Project not found in current Sonar instance or no analysis yet'
    metrics = @{}
    trend = @{}
    bySeverity = @()
    topRules = @()
    topFiles = @()
    quickWins = @('Ejecutar análisis sonar-scanner del proyecto en esta instancia y volver a generar el reporte.')
  }

  ($summarySkipped | ConvertTo-Json -Depth 8) | Set-Content -Path $summaryJsonPath -Encoding UTF8
  @() | Export-Csv -Path $matrixCsvPath -NoTypeInformation -Encoding UTF8

  Write-Warning "Proyecto '$ProjectKey' no encontrado o sin análisis en Sonar para resumen accionable. Se generó salida vacía controlada."
  Write-Host "Resumen accionable generado: $summaryJsonPath"
  Write-Host "Plan de remediacion generado: $matrixCsvPath"
  exit 0
}

$measureMap = @{}
foreach ($m in @($measures.component.measures)) {
  $measureMap[$m.metric] = $m.value
}

$summary = [ordered]@{
  generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  projectKey = $ProjectKey
  qualityGate = $measureMap['alert_status']
  metrics = [ordered]@{
    bugs = $measureMap['bugs']
    vulnerabilities = $measureMap['vulnerabilities']
    codeSmells = $measureMap['code_smells']
    coverage = $measureMap['coverage']
    duplicatedLinesDensity = $measureMap['duplicated_lines_density']
    maintainabilityRating = $measureMap['sqale_rating']
    reliabilityRating = $measureMap['reliability_rating']
    securityRating = $measureMap['security_rating']
    securityHotspotsReviewed = $measureMap['security_hotspots_reviewed']
  }
  trend = $trend
  bySeverity = @($severityGroups | ForEach-Object { [ordered]@{ severity = $_.Name; count = $_.Count } })
  topRules = @($ruleGroups | ForEach-Object { [ordered]@{ rule = $_.Name; count = $_.Count } })
  topFiles = @($componentGroups | ForEach-Object { [ordered]@{ component = $_.Name; count = $_.Count } })
  quickWins = $quickWins
}

($summary | ConvertTo-Json -Depth 8) | Set-Content -Path $summaryJsonPath -Encoding UTF8

$rows = @()
$topIssueRows = @($issues | Sort-Object severity,creationDate | Select-Object -First 25)
$id = 1
foreach ($i in $topIssueRows) {
  $rows += [PSCustomObject]@{
    ID = ('SONAR-{0:d3}' -f $id)
    Proyecto = $ProjectKey
    Hallazgo = [string]$i.message
    Tipo = [string]$i.type
    Severidad = [string]$i.severity
    ImpactoTecnico = 'Degradacion de calidad/mantenibilidad'
    ImpactoNegocio = 'Riesgo de retrabajo y defectos en produccion'
    Recomendacion = ('Corregir regla {0} en {1}' -f [string]$i.rule, [string]$i.component)
    Responsable = $moduleOwner
    SLA = $moduleSla
    Estado = 'Pendiente'
    Prioridad = if ($i.severity -in @('BLOCKER','CRITICAL')) { 'Alta' } elseif ($i.severity -eq 'MAJOR') { 'Media' } else { 'Baja' }
    URL = "$SonarUrl/project/issues?id=$ProjectKey&issues=$($i.key)&open=$($i.key)"
  }
  $id += 1
}

$rows | Export-Csv -Path $matrixCsvPath -NoTypeInformation -Encoding UTF8

Write-Host "Resumen accionable generado: $summaryJsonPath"
Write-Host "Plan de remediacion generado: $matrixCsvPath"
