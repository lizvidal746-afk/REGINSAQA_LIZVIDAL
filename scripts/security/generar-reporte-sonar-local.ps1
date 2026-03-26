param(
  [string]$SonarHostUrl = $env:SONAR_HOST_URL,
  [string]$SonarToken = $env:SONAR_TOKEN,
  [string[]]$ProjectKeys = @(
    'si091reginsafrontend',
    'si091reginsabackend',
    'si091reginsaenlinea',
    'si091reginsaconfig'
  ),
  [string]$OutputDir = 'reportes/security'
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($SonarHostUrl)) {
  throw 'Falta SONAR_HOST_URL. Define variable de entorno o pasa -SonarHostUrl.'
}
if ([string]::IsNullOrWhiteSpace($SonarToken)) {
  throw 'Falta SONAR_TOKEN. Define variable de entorno o pasa -SonarToken.'
}

$SonarHostUrl = $SonarHostUrl.Trim().TrimEnd('/')

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$tokenBytes = [System.Text.Encoding]::ASCII.GetBytes("$SonarToken`:")
$basicToken = [Convert]::ToBase64String($tokenBytes)
$headers = @{ Authorization = "Basic $basicToken" }

function Get-SonarJson {
  param(
    [string]$Url,
    [hashtable]$Headers
  )
  try {
    return Invoke-RestMethod -Method Get -Uri $Url -Headers $Headers
  }
  catch {
    $statusCode = $null
    $responseText = ''
    try {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
        $statusCode = [int]$_.Exception.Response.StatusCode
      }
      if ($_.Exception.Response -and $_.Exception.Response.GetResponseStream) {
        $stream = $_.Exception.Response.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $responseText = $reader.ReadToEnd()
          $reader.Close()
        }
      }
    } catch {}

    $msg = "Error Sonar API [$statusCode] en URL: $Url"
    if (-not [string]::IsNullOrWhiteSpace($responseText)) {
      $msg += " | Respuesta: $responseText"
    }

    $ex = New-Object System.Exception($msg, $_.Exception)
    if ($statusCode -ne $null) {
      $ex.Data['StatusCode'] = $statusCode
    }
    throw $ex
  }
}

function Get-MetricValue {
  param(
    $Measures,
    [string]$Metric,
    [string]$Default = '0'
  )
  foreach ($m in $Measures) {
    if ($m.metric -eq $Metric) {
      if ($null -ne $m.value) { return [string]$m.value }
      break
    }
  }
  return $Default
}

function New-HtmlFromText {
  param(
    [string]$Title,
    [string]$Text,
    [string]$OutputPath,
    [string]$Lang = 'es'
  )

  Add-Type -AssemblyName System.Web
  $safe = [System.Web.HttpUtility]::HtmlEncode($Text)
  $safe = $safe -replace "`r`n|`n", '<br/>'

  $html = @"
<!doctype html>
<html lang="$Lang">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>$Title</title>
  <style>
    body { font-family: Segoe UI, Tahoma, sans-serif; margin: 24px; color: #111827; }
    h1 { margin-bottom: 10px; }
    .content { border: 1px solid #d1d5db; border-radius: 10px; padding: 16px; line-height: 1.55; }
  </style>
</head>
<body>
  <h1>$Title</h1>
  <div class="content">$safe</div>
</body>
</html>
"@

  $html | Set-Content -Path $OutputPath -Encoding UTF8
}


function New-DocxFromText {
  param(
    [string]$Text,
    [string]$OutputPath
  )

  $word = $null
  $doc = $null
  try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0

    $outputAbs = [System.IO.Path]::GetFullPath($OutputPath)
    $doc = $word.Documents.Add()
    $doc.Range().Text = $Text
    $doc.SaveAs([ref]$outputAbs, [ref]12)
    $doc.Close()
    $doc = $null
    return $true
  }
  catch {
    Write-Warning "No se pudo generar DOCX para $OutputPath. Detalle: $($_.Exception.Message)"
    return $false
  }
  finally {
    if ($null -ne $doc) {
      try { $doc.Close() } catch {}
    }
    if ($null -ne $word) {
      try { $word.Quit() } catch {}
      try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) } catch {}
    }
  }
}

foreach ($projectKey in $ProjectKeys) {
  $safeKey = $projectKey -replace '[^a-zA-Z0-9_-]', '_'

  $metrics = 'alert_status,bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,ncloc,reliability_rating,security_rating,sqale_rating,security_hotspots_reviewed'
  $projectKeyEscaped = [System.Uri]::EscapeDataString($projectKey)
  $measuresUrl = "$SonarHostUrl/api/measures/component?component=$projectKeyEscaped&metricKeys=$metrics"
  $issuesUrl = "$SonarHostUrl/api/issues/search?componentKeys=$projectKeyEscaped&resolved=false&ps=1"

  try {
    $measuresResponse = Get-SonarJson -Url $measuresUrl -Headers $headers
    $issuesResponse = Get-SonarJson -Url $issuesUrl -Headers $headers
  }
  catch {
    $statusCode = $null
    try {
      if ($_.Exception.Data.Contains('StatusCode')) {
        $statusCode = [int]$_.Exception.Data['StatusCode']
      }
    } catch {}

    if ($statusCode -eq 404) {
      Write-Warning "Proyecto '$projectKey' no encontrado o sin análisis en Sonar. Se omite este proyecto."
      continue
    }

    throw
  }

  $component = $measuresResponse.component
  $measureList = @()
  if ($null -ne $component.measures) { $measureList = $component.measures }

  $projectName = $component.name
  if ([string]::IsNullOrWhiteSpace($projectName)) { $projectName = $projectKey }

  $qualityGate = Get-MetricValue -Measures $measureList -Metric 'alert_status' -Default 'UNKNOWN'
  $bugs = Get-MetricValue -Measures $measureList -Metric 'bugs'
  $vulnerabilities = Get-MetricValue -Measures $measureList -Metric 'vulnerabilities'
  $codeSmells = Get-MetricValue -Measures $measureList -Metric 'code_smells'
  $coverage = Get-MetricValue -Measures $measureList -Metric 'coverage'
  $duplication = Get-MetricValue -Measures $measureList -Metric 'duplicated_lines_density'
  $ncloc = Get-MetricValue -Measures $measureList -Metric 'ncloc'
  $reliabilityRating = Get-MetricValue -Measures $measureList -Metric 'reliability_rating'
  $securityRating = Get-MetricValue -Measures $measureList -Metric 'security_rating'
  $maintainabilityRating = Get-MetricValue -Measures $measureList -Metric 'sqale_rating'
  $hotspotsReviewed = Get-MetricValue -Measures $measureList -Metric 'security_hotspots_reviewed'
  $openIssues = [string]$issuesResponse.total

  $now = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

  $execEs = @()
  $execEs += "Reporte Ejecutivo SonarQube (ES) - $projectName"
  $execEs += ''
  $execEs += "Fecha: $now"
  $execEs += 'Entidad: SUNEDU - REGINSA'
  $execEs += "Proyecto: $projectName"
  $execEs += "Project Key: $projectKey"
  $execEs += "Quality Gate: $qualityGate"
  $execEs += ''
  $execEs += 'Resumen ejecutivo:'
  $execEs += "- Bugs: $bugs"
  $execEs += "- Vulnerabilidades: $vulnerabilities"
  $execEs += "- Code Smells: $codeSmells"
  $execEs += "- Open Issues: $openIssues"
  $execEs += "- Cobertura: $coverage%"
  $execEs += "- Duplicacion: $duplication%"
  $execEs += "- Lineas de codigo: $ncloc"
  $execEs += ''
  $execEs += 'Decision recomendada:'
  $execEs += '- Priorizar correccion de bugs y vulnerabilidades abiertas.'
  $execEs += '- Revisar calidad de cobertura y deuda tecnica para siguiente sprint.'

  $execEn = @()
  $execEn += "SonarQube Executive Report (EN) - $projectName"
  $execEn += ''
  $execEn += "Date: $now"
  $execEn += 'Institution: SUNEDU - REGINSA'
  $execEn += "Project: $projectName"
  $execEn += "Project Key: $projectKey"
  $execEn += "Quality Gate: $qualityGate"
  $execEn += ''
  $execEn += 'Executive summary:'
  $execEn += "- Bugs: $bugs"
  $execEn += "- Vulnerabilities: $vulnerabilities"
  $execEn += "- Code Smells: $codeSmells"
  $execEn += "- Open Issues: $openIssues"
  $execEn += "- Coverage: $coverage%"
  $execEn += "- Duplication: $duplication%"
  $execEn += "- Lines of code: $ncloc"
  $execEn += ''
  $execEn += 'Recommended decision:'
  $execEn += '- Prioritize fixing open bugs and vulnerabilities.'
  $execEn += '- Review coverage and technical debt for the next sprint.'

  $devEs = @()
  $devEs += "Reporte Tecnico para Desarrollo (ES) - $projectName"
  $devEs += ''
  $devEs += "Fecha: $now"
  $devEs += 'Entidad: SUNEDU - REGINSA'
  $devEs += "Project Key: $projectKey"
  $devEs += "Quality Gate: $qualityGate"
  $devEs += ''
  $devEs += 'Metricas para desarrollo:'
  $devEs += "- Bugs: $bugs"
  $devEs += "- Vulnerabilidades: $vulnerabilities"
  $devEs += "- Code Smells: $codeSmells"
  $devEs += "- Open Issues: $openIssues"
  $devEs += "- Reliability rating: $reliabilityRating"
  $devEs += "- Security rating: $securityRating"
  $devEs += "- Maintainability rating: $maintainabilityRating"
  $devEs += "- Security hotspots reviewed: $hotspotsReviewed"
  $devEs += "- Cobertura: $coverage%"
  $devEs += "- Duplicacion: $duplication%"
  $devEs += ''
  $devEs += 'Accion sugerida:'
  $devEs += '- Atender primero issues de severidad alta y media.'
  $devEs += '- Documentar falsos positivos con evidencia reproducible.'
  $devEs += '- Reanalizar despues de cada correccion para validar cierre.'

  $devEn = @()
  $devEn += "Technical Report for Development (EN) - $projectName"
  $devEn += ''
  $devEn += "Date: $now"
  $devEn += 'Institution: SUNEDU - REGINSA'
  $devEn += "Project Key: $projectKey"
  $devEn += "Quality Gate: $qualityGate"
  $devEn += ''
  $devEn += 'Development metrics:'
  $devEn += "- Bugs: $bugs"
  $devEn += "- Vulnerabilities: $vulnerabilities"
  $devEn += "- Code Smells: $codeSmells"
  $devEn += "- Open Issues: $openIssues"
  $devEn += "- Reliability rating: $reliabilityRating"
  $devEn += "- Security rating: $securityRating"
  $devEn += "- Maintainability rating: $maintainabilityRating"
  $devEn += "- Security hotspots reviewed: $hotspotsReviewed"
  $devEn += "- Coverage: $coverage%"
  $devEn += "- Duplication: $duplication%"
  $devEn += ''
  $devEn += 'Suggested action:'
  $devEn += '- Fix high and medium severity issues first.'
  $devEn += '- Document false positives with reproducible evidence.'
  $devEn += '- Re-run analysis after each fix to validate closure.'

  $execEsText = $execEs -join "`r`n"
  $execEnText = $execEn -join "`r`n"
  $devEsText = $devEs -join "`r`n"
  $devEnText = $devEn -join "`r`n"

  $execEsBase = Join-Path $OutputDir "sonar-$safeKey-ejecutivo-es"
  $execEnBase = Join-Path $OutputDir "sonar-$safeKey-executive-en"
  $devEsBase = Join-Path $OutputDir "sonar-$safeKey-desarrollador-es"
  $devEnBase = Join-Path $OutputDir "sonar-$safeKey-developer-en"

  [void](New-DocxFromText -Text $execEsText -OutputPath "$execEsBase.docx")
  [void](New-DocxFromText -Text $execEnText -OutputPath "$execEnBase.docx")
  [void](New-DocxFromText -Text $devEsText -OutputPath "$devEsBase.docx")
  [void](New-DocxFromText -Text $devEnText -OutputPath "$devEnBase.docx")

  New-HtmlFromText -Title "Reporte Ejecutivo SonarQube (ES) - $projectName" -Text $execEsText -OutputPath "$execEsBase.html" -Lang 'es'
  New-HtmlFromText -Title "SonarQube Executive Report (EN) - $projectName" -Text $execEnText -OutputPath "$execEnBase.html" -Lang 'en'
  New-HtmlFromText -Title "Reporte Tecnico para Desarrollo (ES) - $projectName" -Text $devEsText -OutputPath "$devEsBase.html" -Lang 'es'
  New-HtmlFromText -Title "Technical Report for Development (EN) - $projectName" -Text $devEnText -OutputPath "$devEnBase.html" -Lang 'en'

  Write-Host "Reportes Sonar generados para $projectKey en $OutputDir"
}
