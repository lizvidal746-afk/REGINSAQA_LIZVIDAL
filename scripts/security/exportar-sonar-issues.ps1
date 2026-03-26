param(
  [string]$SonarUrl,
  [string]$SonarToken,
  [string[]]$ProjectKeys = @(
    'si091reginsafrontend',
    'si091reginsabackend',
    'si091reginsaenlinea',
    'si091reginsaconfig'
  ),
  [string]$OutputDir = 'reportes/security'
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($SonarUrl)) {
  $SonarUrl = [Environment]::GetEnvironmentVariable('SONAR_HOST_URL')
}
if ([string]::IsNullOrWhiteSpace($SonarToken)) {
  $SonarToken = [Environment]::GetEnvironmentVariable('SONAR_TOKEN')
}

if ([string]::IsNullOrWhiteSpace($SonarUrl)) {
  throw 'Falta SONAR_HOST_URL. Define variable o pasa -SonarUrl.'
}
if ([string]::IsNullOrWhiteSpace($SonarToken)) {
  throw 'Falta SONAR_TOKEN. Define variable o pasa -SonarToken.'
}

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$tokenBytes = [System.Text.Encoding]::ASCII.GetBytes($SonarToken + ':')
$basicToken = [Convert]::ToBase64String($tokenBytes)
$headers = @{ Authorization = "Basic $basicToken" }

function Invoke-SonarApi {
  param(
    [string]$RequestUrl,
    [hashtable]$RequestHeaders
  )

  Invoke-RestMethod -Method Get -Uri $RequestUrl -Headers $RequestHeaders
}

function Export-IssuesForProject {
  param(
    [string]$ApiUrl,
    [hashtable]$RequestHeaders,
    [string]$ProjectKey,
    [string]$OutDir
  )

  $page = 1
  $pageSize = 500
  $allIssues = @()

  while ($true) {
    $requestUrl = "$ApiUrl/api/issues/search?componentKeys=$ProjectKey&resolved=false&additionalFields=_all&ps=$pageSize&p=$page"
    $response = Invoke-SonarApi -RequestUrl $requestUrl -RequestHeaders $RequestHeaders

    if ($null -eq $response.issues -or $response.issues.Count -eq 0) {
      break
    }

    $allIssues += $response.issues

    if ($null -eq $response.paging) {
      break
    }

    $total = [int]$response.paging.total
    $current = [int]$response.paging.pageIndex
    $ps = [int]$response.paging.pageSize

    if (($current * $ps) -ge $total) {
      break
    }

    $page += 1
  }

  $rows = @()
  foreach ($issue in $allIssues) {
    $lineValue = ''
    if ($null -ne $issue.line) {
      $lineValue = [string]$issue.line
    }

    $rows += [PSCustomObject]@{
      projectKey = $ProjectKey
      issueKey = $issue.key
      type = $issue.type
      severity = $issue.severity
      status = $issue.status
      resolution = $issue.resolution
      component = $issue.component
      line = $lineValue
      rule = $issue.rule
      message = $issue.message
      effort = $issue.effort
      debt = $issue.debt
      author = $issue.author
      creationDate = $issue.creationDate
      updateDate = $issue.updateDate
      tags = (($issue.tags | ForEach-Object { $_ }) -join ';')
      url = "$ApiUrl/project/issues?id=$ProjectKey&issues=$($issue.key)&open=$($issue.key)"
    }
  }

  $hotspotsToReview = 'N/A'
  try {
    $hotspotsUrl = "$ApiUrl/api/hotspots/search?projectKey=$ProjectKey&status=TO_REVIEW&ps=1"
    $hotspotsResponse = Invoke-SonarApi -RequestUrl $hotspotsUrl -RequestHeaders $RequestHeaders
    if ($hotspotsResponse.paging -and $null -ne $hotspotsResponse.paging.total) {
      $hotspotsToReview = [string]$hotspotsResponse.paging.total
    }
  }
  catch {
    $hotspotsToReview = 'N/A'
  }

  $safeKey = $ProjectKey -replace '[^a-zA-Z0-9_-]', '_'
  $htmlPath = Join-Path $OutDir "sonar-$safeKey-issues.html"

  Add-Type -AssemblyName System.Web

  $bySeverity = $rows | Group-Object severity | Sort-Object Name
  $byType = $rows | Group-Object type | Sort-Object Name

  $severityRows = @()
  foreach ($group in $bySeverity) {
    $severityRows += "<tr><td>$($group.Name)</td><td>$($group.Count)</td></tr>"
  }
  if ($severityRows.Count -eq 0) {
    $severityRows += '<tr><td>(sin issues)</td><td>0</td></tr>'
  }

  $typeRows = @()
  foreach ($group in $byType) {
    $typeRows += "<tr><td>$($group.Name)</td><td>$($group.Count)</td></tr>"
  }
  if ($typeRows.Count -eq 0) {
    $typeRows += '<tr><td>(sin issues)</td><td>0</td></tr>'
  }

  $issueRows = @()
  foreach ($row in $rows) {
    $msg = [System.Web.HttpUtility]::HtmlEncode([string]$row.message)
    $issueRows += "<tr><td>$($row.issueKey)</td><td>$($row.type)</td><td>$($row.severity)</td><td>$($row.status)</td><td>$($row.component)</td><td>$($row.line)</td><td>$msg</td></tr>"
  }
  if ($issueRows.Count -eq 0) {
    $issueRows += '<tr><td colspan="7">No hay issues abiertos.</td></tr>'
  }

  $generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $html = @"
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sonar Issues - $ProjectKey</title>
  <style>
    body { font-family: Segoe UI, Tahoma, sans-serif; margin: 24px; color: #111827; }
    h1, h2 { margin: 8px 0; }
    .meta { color: #4b5563; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; font-size: 13px; }
    th { background: #f3f4f6; }
    .split { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  </style>
</head>
<body>
  <h1>Detalle de Issues Sonar - $ProjectKey</h1>
  <div class="meta">Generado: $generatedAt</div>
  <div class="meta">Servidor API: $ApiUrl</div>
  <div class="meta">Issues abiertos: $($rows.Count)</div>
  <div class="meta">Hotspots pendientes de revision: $hotspotsToReview</div>

  <div class="split">
    <div>
      <h2>Distribucion por severidad</h2>
      <table>
        <thead><tr><th>Severidad</th><th>Cantidad</th></tr></thead>
        <tbody>
          $(($severityRows -join "`r`n"))
        </tbody>
      </table>
    </div>
    <div>
      <h2>Distribucion por tipo</h2>
      <table>
        <thead><tr><th>Tipo</th><th>Cantidad</th></tr></thead>
        <tbody>
          $(($typeRows -join "`r`n"))
        </tbody>
      </table>
    </div>
  </div>

  <h2>Issues abiertos</h2>
  <table>
    <thead>
      <tr>
        <th>Issue Key</th>
        <th>Tipo</th>
        <th>Severidad</th>
        <th>Estado</th>
        <th>Componente</th>
        <th>Linea</th>
        <th>Mensaje</th>
      </tr>
    </thead>
    <tbody>
      $(($issueRows -join "`r`n"))
    </tbody>
  </table>
</body>
</html>
"@

  $html | Set-Content -Path $htmlPath -Encoding UTF8

  [PSCustomObject]@{
    projectKey = $ProjectKey
    issueCount = $rows.Count
    hotspotsToReview = $hotspotsToReview
    htmlPath = $htmlPath
    rows = $rows
  }
}

$summaries = @()

foreach ($projectKey in $ProjectKeys) {
  $result = Export-IssuesForProject -ApiUrl $SonarUrl -RequestHeaders $headers -ProjectKey $projectKey -OutDir $OutputDir
  $summaries += $result
  Write-Host ("Issues exportados " + $projectKey + " -> " + $result.issueCount + " issues  ->  " + $result.htmlPath)
}

Write-Host "Exportacion de issues completada ($($summaries.Count) proyectos)."
