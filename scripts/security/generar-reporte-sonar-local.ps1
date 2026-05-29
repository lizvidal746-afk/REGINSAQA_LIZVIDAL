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

# Carpeta histórica dated (yyyyMMdd-HHmmss) por proyecto/idioma:
#   reportes/security/sonar/yyyyMMdd-HHmmss/<projectKey>/<es|en>/
$SonarStamp   = Get-Date -Format 'yyyyMMdd-HHmmss'
$SonarDatedRoot = Join-Path 'reportes/security/sonar' $SonarStamp
if (-not (Test-Path $SonarDatedRoot)) {
  New-Item -ItemType Directory -Path $SonarDatedRoot -Force | Out-Null
}

# Carpeta general de informes con fecha/hora (yyyy-MM-dd_HH-mm) — alli tambien
# se publican copias del informe ejecutivo SonarQube por proyecto.
$InformeStamp     = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$InformeSonarDir  = Join-Path 'reportes/informes' $InformeStamp
if (-not (Test-Path $InformeSonarDir)) {
  New-Item -ItemType Directory -Path $InformeSonarDir -Force | Out-Null
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
    } catch { Write-Warning "Ignorado al leer respuesta Sonar: $($_.Exception.Message)" }

    $msg = "Error Sonar API [$statusCode] en URL: $Url"
    if (-not [string]::IsNullOrWhiteSpace($responseText)) {
      $msg += " | Respuesta: $responseText"
    }

    $ex = New-Object System.Exception($msg, $_.Exception)
    if ($null -ne $statusCode) {
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
      try { $doc.Close() } catch { Write-Warning "Ignorado al cerrar documento Word: $($_.Exception.Message)" }
    }
    if ($null -ne $word) {
      try { $word.Quit() } catch { Write-Warning "Ignorado al salir de Word: $($_.Exception.Message)" }
      try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) } catch { Write-Warning "Ignorado al liberar COM Word: $($_.Exception.Message)" }
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
    } catch { Write-Warning "Ignorado al leer StatusCode: $($_.Exception.Message)" }

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

  # --------------------------------------------------------------------------
  # Detalle del Quality Gate (condiciones que aprueban / fallan)
  # API: /api/qualitygates/project_status
  # --------------------------------------------------------------------------
  $qgUrl = "$SonarHostUrl/api/qualitygates/project_status?projectKey=$projectKeyEscaped"
  $qgFailedConditions = @()
  $qgPassedConditions = @()
  try {
    $qgResp = Get-SonarJson -Url $qgUrl -Headers $headers
    if ($qgResp -and $qgResp.projectStatus -and $qgResp.projectStatus.conditions) {
      foreach ($c in $qgResp.projectStatus.conditions) {
        $line = "{0,-35} {1,-7} actual={2,-10} umbral={3} {4}" -f `
          $c.metricKey, $c.status, $c.actualValue, $c.errorThreshold, $c.comparator
        if ($c.status -eq 'OK') { $qgPassedConditions += $line } else { $qgFailedConditions += $line }
      }
    }
  } catch {
    Write-Verbose "No se pudo consultar Quality Gate detallado: $_"
  }

  # --------------------------------------------------------------------------
  # Top issues por severidad (BLOCKER, CRITICAL, MAJOR)
  # --------------------------------------------------------------------------
  $sevSummary = [ordered]@{ BLOCKER=0; CRITICAL=0; MAJOR=0; MINOR=0; INFO=0 }
  $topIssues = @()
  try {
    $sevUrl = "$SonarHostUrl/api/issues/search?componentKeys=$projectKeyEscaped&resolved=false&ps=100&s=SEVERITY&asc=false"
    $sevResp = Get-SonarJson -Url $sevUrl -Headers $headers
    if ($sevResp -and $sevResp.issues) {
      foreach ($iss in $sevResp.issues) {
        $sev = [string]$iss.severity
        if ($sevSummary.Contains($sev)) { $sevSummary[$sev] = $sevSummary[$sev] + 1 }
      }
      $topIssues = @($sevResp.issues | Where-Object { $_.severity -in @('BLOCKER','CRITICAL') } | Select-Object -First 10)
    }
  } catch {
    Write-Verbose "No se pudo obtener top issues: $_"
  }

  # --------------------------------------------------------------------------
  # Mapeo criticidad y normas tecnicas (ISO/IEC 25010, OWASP, CWE, NIST)
  # --------------------------------------------------------------------------
  function Convert-RatingToLevel { param([string]$R)
    switch ($R) {
      '1.0' { return 'A (Excelente)' }
      '2.0' { return 'B (Bueno)' }
      '3.0' { return 'C (Aceptable)' }
      '4.0' { return 'D (Deficiente)' }
      '5.0' { return 'E (Critico)' }
      default { return "$R (sin evaluar)" }
    }
  }
  $reliabilityLabel    = Convert-RatingToLevel $reliabilityRating
  $securityLabel       = Convert-RatingToLevel $securityRating
  $maintainabilityLbl  = Convert-RatingToLevel $maintainabilityRating

  function Convert-SeverityToCriticality { param([string]$S)
    switch ($S) {
      'BLOCKER'  { return 'CRITICA  - Bloqueo en produccion (CVSS >= 9.0)' }
      'CRITICAL' { return 'ALTA     - Riesgo significativo (CVSS 7.0-8.9)' }
      'MAJOR'    { return 'MEDIA    - Impacto funcional (CVSS 4.0-6.9)' }
      'MINOR'    { return 'BAJA     - Mejora recomendada (CVSS < 4.0)' }
      'INFO'     { return 'INFO     - Informacion / buena practica' }
      default    { return $S }
    }
  }

  # --------------------------------------------------------------------------
  # Generacion del bloque de detalle (texto reusable ES/EN)
  # --------------------------------------------------------------------------
  $detalleEs = @()
  $detalleEs += ''
  $detalleEs += '=========================================================='
  $detalleEs += 'DETALLE DEL QUALITY GATE (api/qualitygates/project_status)'
  $detalleEs += '=========================================================='
  if ($qgFailedConditions.Count -gt 0) {
    $detalleEs += "Estado: $qualityGate"
    $detalleEs += ''
    $detalleEs += "Condiciones FALLIDAS ($($qgFailedConditions.Count)):"
    foreach ($l in $qgFailedConditions) { $detalleEs += "  X $l" }
    $detalleEs += ''
  } else {
    $detalleEs += "Estado: $qualityGate (todas las condiciones aprobadas)"
  }
  if ($qgPassedConditions.Count -gt 0) {
    $detalleEs += "Condiciones APROBADAS ($($qgPassedConditions.Count)):"
    foreach ($l in $qgPassedConditions) { $detalleEs += "  OK $l" }
  }

  $detalleEs += ''
  $detalleEs += '=========================================================='
  $detalleEs += 'CRITICIDAD - DISTRIBUCION DE ISSUES (referencia CVSSv3.1)'
  $detalleEs += '=========================================================='
  foreach ($k in $sevSummary.Keys) {
    $criticidad = Convert-SeverityToCriticality $k
    $detalleEs += ("  {0,-9} = {1,-4}  -> {2}" -f $k, $sevSummary[$k], $criticidad)
  }

  if ($topIssues.Count -gt 0) {
    $detalleEs += ''
    $detalleEs += '=========================================================='
    $detalleEs += 'TOP HALLAZGOS PRIORITARIOS (BLOCKER + CRITICAL)'
    $detalleEs += '=========================================================='
    $i = 1
    foreach ($iss in $topIssues) {
      $detalleEs += "[$i] $($iss.severity) - regla $($iss.rule)"
      $detalleEs += "    Componente : $($iss.component)"
      if ($iss.line) { $detalleEs += "    Linea      : $($iss.line)" }
      $detalleEs += "    Mensaje    : $($iss.message)"
      $detalleEs += "    Tipo       : $($iss.type)"
      $detalleEs += "    URL        : $SonarHostUrl/project/issues?id=$projectKey&issues=$($iss.key)&open=$($iss.key)"
      $detalleEs += ''
      $i++
    }
  }

  $detalleEs += ''
  $detalleEs += '=========================================================='
  $detalleEs += 'CALIFICACIONES (escala A-E, ISO/IEC 25010)'
  $detalleEs += '=========================================================='
  $detalleEs += "  Confiabilidad   (Reliability)     : $reliabilityLabel"
  $detalleEs += "  Seguridad       (Security)        : $securityLabel"
  $detalleEs += "  Mantenibilidad  (Maintainability) : $maintainabilityLbl"
  $detalleEs += "  Hotspots revisados                : $hotspotsReviewed%"

  $detalleEs += ''
  $detalleEs += '=========================================================='
  $detalleEs += 'RECOMENDACIONES POR CATEGORIA Y NORMA TECNICA'
  $detalleEs += '=========================================================='
  if ([int]$bugs -gt 0) {
    $detalleEs += "[BUGS = $bugs]  ISO/IEC 25010 - Confiabilidad / CWE-CATEGORY-Quality"
    $detalleEs += '  - Corregir antes del siguiente release. Reliability rating debe ser A.'
    $detalleEs += '  - Cubrir cada bug con prueba unitaria de regresion (Sonar regla S2925).'
  }
  if ([int]$vulnerabilities -gt 0) {
    $detalleEs += "[VULNERABILIDADES = $vulnerabilities]  OWASP Top 10:2021 / CWE Top 25"
    $detalleEs += '  - Plazo maximo de remediacion: BLOCKER 7 dias, CRITICAL 30 dias (NIST SP 800-53 SI-2).'
    $detalleEs += '  - Verificar con re-escaneo y prueba DAST (OWASP ZAP).'
  }
  if ([double]$hotspotsReviewed -lt 100.0) {
    $detalleEs += "[HOTSPOTS REVISADOS = $hotspotsReviewed%]  OWASP ASVS V14 / CWE-1006"
    $detalleEs += '  - Cada Security Hotspot debe ser revisado por un revisor con rol Security.'
    $detalleEs += '  - Marcar como SAFE/FIXED en SonarQube tras evaluacion.'
  }
  if ([double]$coverage -lt 80.0) {
    $detalleEs += "[COBERTURA = $coverage%]  ISO/IEC 25010 - Testabilidad"
    $detalleEs += '  - Meta institucional: >= 80% en codigo nuevo (Sonar Way default).'
    $detalleEs += '  - Importar lcov.info (frontend/enlinea) o coverlet (backend C#) en CI.'
  }
  if ([double]$duplication -gt 3.0) {
    $detalleEs += "[DUPLICACION = $duplication%]  ISO/IEC 25010 - Mantenibilidad"
    $detalleEs += '  - Refactorizar en componentes/funciones reutilizables (DRY).'
    $detalleEs += '  - Meta: < 3% (umbral default Sonar Way).'
  }
  if ([int]$codeSmells -gt 100) {
    $detalleEs += "[CODE SMELLS = $codeSmells]  ISO/IEC 25010 - Mantenibilidad"
    $detalleEs += '  - Priorizar reglas S3776 (complejidad cognitiva), S2933 (readonly), S107 (parametros).'
    $detalleEs += '  - Habilitar regla en pre-commit (sonar-cli local) para evitar acumulacion.'
  }

  $detalleEs += ''
  $detalleEs += '=========================================================='
  $detalleEs += 'NORMAS Y MARCOS DE REFERENCIA APLICADOS'
  $detalleEs += '=========================================================='
  $detalleEs += '  - ISO/IEC 25010:2011  -- Modelo de calidad de producto software'
  $detalleEs += '  - ISO/IEC 27001:2022  -- Seguridad de la informacion (control A.8.28)'
  $detalleEs += '  - OWASP Top 10:2021   -- Riesgos de seguridad en aplicaciones web'
  $detalleEs += '  - OWASP ASVS 4.0      -- Application Security Verification Standard'
  $detalleEs += '  - CWE Top 25 (2024)   -- Common Weakness Enumeration mas peligrosas'
  $detalleEs += '  - NIST SP 800-53 r5   -- Controles SI-2 (Flaw Remediation), SA-11 (Developer Testing)'
  $detalleEs += '  - CVSS v3.1           -- Common Vulnerability Scoring System'
  $detalleEs += '  - SUNEDU Directiva    -- Politica institucional de calidad de software'

  $detalleEs += ''
  $detalleEs += "Dashboard SonarQube: $SonarHostUrl/dashboard?id=$projectKey"
  $detalleEs += "Issues directos    : $SonarHostUrl/project/issues?id=$projectKey&resolved=false"

  # Version EN del bloque de detalle (resumida, mismas secciones)
  $detalleEn = @()
  $detalleEn += ''
  $detalleEn += '=========================================================='
  $detalleEn += 'QUALITY GATE DETAIL (api/qualitygates/project_status)'
  $detalleEn += '=========================================================='
  if ($qgFailedConditions.Count -gt 0) {
    $detalleEn += "Status: $qualityGate"
    $detalleEn += "FAILED conditions ($($qgFailedConditions.Count)):"
    foreach ($l in $qgFailedConditions) { $detalleEn += "  X $l" }
  } else {
    $detalleEn += "Status: $qualityGate (all conditions passed)"
  }
  $detalleEn += ''
  $detalleEn += 'SEVERITY DISTRIBUTION (CVSSv3.1 reference):'
  foreach ($k in $sevSummary.Keys) {
    $detalleEn += ("  {0,-9} = {1}" -f $k, $sevSummary[$k])
  }
  $detalleEn += ''
  $detalleEn += 'RATINGS (A-E scale, ISO/IEC 25010):'
  $detalleEn += "  Reliability     : $reliabilityLabel"
  $detalleEn += "  Security        : $securityLabel"
  $detalleEn += "  Maintainability : $maintainabilityLbl"
  $detalleEn += "  Hotspots Reviewed : $hotspotsReviewed%"
  $detalleEn += ''
  $detalleEn += 'STANDARDS APPLIED: ISO/IEC 25010, ISO/IEC 27001, OWASP Top 10:2021, OWASP ASVS 4.0, CWE Top 25, NIST SP 800-53 r5, CVSS v3.1'
  $detalleEn += ''
  $detalleEn += "Dashboard: $SonarHostUrl/dashboard?id=$projectKey"

  $detalleEsText = $detalleEs -join "`r`n"
  $detalleEnText = $detalleEn -join "`r`n"

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

  $execEsText = ($execEs -join "`r`n") + "`r`n" + $detalleEsText
  $execEnText = ($execEn -join "`r`n") + "`r`n" + $detalleEnText
  $devEsText  = ($devEs  -join "`r`n") + "`r`n" + $detalleEsText
  $devEnText  = ($devEn  -join "`r`n") + "`r`n" + $detalleEnText

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

  # Copia histórica dated: reportes/security/sonar/<stamp>/<projectKey>/<es|en>/
  $datedProj = Join-Path $SonarDatedRoot $safeKey
  $datedEs   = Join-Path $datedProj 'es'
  $datedEn   = Join-Path $datedProj 'en'
  New-Item -ItemType Directory -Path $datedEs -Force | Out-Null
  New-Item -ItemType Directory -Path $datedEn -Force | Out-Null
  Copy-Item "$execEsBase.html" (Join-Path $datedEs 'ejecutivo.html') -Force -ErrorAction SilentlyContinue
  Copy-Item "$execEsBase.docx" (Join-Path $datedEs 'ejecutivo.docx') -Force -ErrorAction SilentlyContinue
  Copy-Item "$devEsBase.html"  (Join-Path $datedEs 'desarrollador.html') -Force -ErrorAction SilentlyContinue
  Copy-Item "$devEsBase.docx"  (Join-Path $datedEs 'desarrollador.docx') -Force -ErrorAction SilentlyContinue
  Copy-Item "$execEnBase.html" (Join-Path $datedEn 'executive.html') -Force -ErrorAction SilentlyContinue
  Copy-Item "$execEnBase.docx" (Join-Path $datedEn 'executive.docx') -Force -ErrorAction SilentlyContinue
  Copy-Item "$devEnBase.html"  (Join-Path $datedEn 'developer.html') -Force -ErrorAction SilentlyContinue
  Copy-Item "$devEnBase.docx"  (Join-Path $datedEn 'developer.docx') -Force -ErrorAction SilentlyContinue

  # Informe ejecutivo (ES) tambien en reportes/informes/<stamp>/ por proyecto
  Copy-Item "$execEsBase.docx" (Join-Path $InformeSonarDir "sonar-$safeKey-ejecutivo-$InformeStamp.docx") -Force -ErrorAction SilentlyContinue
  Copy-Item "$execEsBase.html" (Join-Path $InformeSonarDir "sonar-$safeKey-ejecutivo-$InformeStamp.html") -Force -ErrorAction SilentlyContinue

  Write-Host "Reportes Sonar generados para $projectKey en $OutputDir"
  Write-Host "  + Copia historica: $datedProj"
  Write-Host "  + Informe ejecutivo: $InformeSonarDir"
}
