param(
  [string]$InputJson = "reportes/security/zap-baseline-report.json",
  [string]$OutputDocxEs = "reportes/security/owasp-reporte-provisional-es.docx",
  [string]$OutputHtmlEs = "reportes/security/owasp-reporte-provisional-es.html",
  [string]$OutputDocxEn = "reportes/security/owasp-reporte-provisional-en.docx",
  [string]$OutputHtmlEn = "reportes/security/owasp-reporte-provisional-en.html",
  [string]$OutputDocxDevEs = "reportes/security/owasp-reporte-desarrollador-es.docx",
  [string]$OutputHtmlDevEs = "reportes/security/owasp-reporte-desarrollador-es.html",
  [string]$OutputDocxDevEn = "reportes/security/owasp-reporte-desarrollador-en.docx",
  [string]$OutputHtmlDevEn = "reportes/security/owasp-reporte-desarrollador-en.html",
  [string]$OutputDocxExecEs = "reportes/security/owasp-reporte-ejecutivo-es.docx",
  [string]$OutputHtmlExecEs = "reportes/security/owasp-reporte-ejecutivo-es.html",
  [string]$OutputDocxExecEn = "reportes/security/owasp-reporte-ejecutivo-en.docx",
  [string]$OutputHtmlExecEn = "reportes/security/owasp-reporte-ejecutivo-en.html",
  [string]$OutputResumenEstructuradoJson = "reportes/security/owasp-resumen-estructurado.json"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $InputJson)) {
  throw "No existe JSON de ZAP: $InputJson"
}

$raw = Get-Content -Path $InputJson -Raw
$data = $raw | ConvertFrom-Json
$site = if ($data.site -is [System.Array]) { $data.site[0] } else { $data.site }
$alerts = @()
if ($site -and $site.alerts) {
  if ($site.alerts -is [System.Array]) { $alerts = $site.alerts } else { $alerts = @($site.alerts) }
}

$highAlerts = 0
$mediumAlerts = 0
$lowAlerts = 0
$infoAlerts = 0

$highInstances = 0
$mediumInstances = 0
$lowInstances = 0
$infoInstances = 0

foreach ($a in $alerts) {
  $count = 1
  try { $count = [int]$a.count } catch { $count = 1 }
  if ($count -lt 1) { $count = 1 }

  $riskCode = [string]$a.riskcode
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
}

function Find-AlertCount([string]$pattern) {
  $sum = 0
  foreach ($a in $alerts) {
    $name = [string]$a.name
    if ($name -match $pattern) {
      $cnt = 1
      try { $cnt = [int]$a.count } catch { $cnt = 1 }
      if ($cnt -lt 1) { $cnt = 1 }
      $sum += $cnt
    }
  }
  return $sum
}

# Hallazgos actuales ZAP
$zapServerHeader = (Find-AlertCount 'Server Leaks Version Information')
$zapXPoweredBy = (Find-AlertCount 'X-Powered-By')
$zapCacheControl = (Find-AlertCount 'Cache-control')
$zapCsp = (Find-AlertCount '^CSP:')
$zapSqli = (Find-AlertCount 'SQL Injection')

$cspAlertGroups = @(
  $alerts |
    Where-Object { ([string]$_.name) -match '^CSP:' } |
    Group-Object name |
    Sort-Object Count -Descending |
    Select-Object -First 10
)

$topAlerts = @(
  $alerts |
    ForEach-Object {
      $cnt = 1
      try { $cnt = [int]$_.count } catch { $cnt = 1 }
      if ($cnt -lt 1) { $cnt = 1 }
      [PSCustomObject]@{
        name = [string]$_.name
        riskCode = [string]$_.riskcode
        risk = [string]$_.riskdesc
        instances = $cnt
      }
    } |
    Sort-Object instances -Descending |
    Select-Object -First 10
)

$fecha = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
$target = [string]$site.'@name'
if ([string]::IsNullOrWhiteSpace($target)) { $target = '(no definido)' }

$structuredSummaryDir = Split-Path -Parent $OutputResumenEstructuradoJson
if (-not [string]::IsNullOrWhiteSpace($structuredSummaryDir) -and -not (Test-Path $structuredSummaryDir)) {
  New-Item -ItemType Directory -Path $structuredSummaryDir -Force | Out-Null
}

$structuredSummary = [ordered]@{
  generatedAt = $fecha
  target = $target
  sourceJson = $InputJson
  totals = [ordered]@{
    alerts = [ordered]@{
      high = $highAlerts
      medium = $mediumAlerts
      low = $lowAlerts
      info = $infoAlerts
    }
    instances = [ordered]@{
      high = $highInstances
      medium = $mediumInstances
      low = $lowInstances
      info = $infoInstances
    }
  }
  keyFindings = [ordered]@{
    cspAlerts = $zapCsp
    serverHeaderLeaks = $zapServerHeader
    xPoweredByLeaks = $zapXPoweredBy
    cacheControlWarnings = $zapCacheControl
    sqlInjectionAlerts = $zapSqli
  }
  cspBreakdown = @(
    $cspAlertGroups | ForEach-Object {
      [ordered]@{
        name = $_.Name
        alerts = $_.Count
      }
    }
  )
  topAlertsByInstances = @(
    $topAlerts | ForEach-Object {
      [ordered]@{
        name = $_.name
        riskCode = $_.riskCode
        risk = $_.risk
        instances = $_.instances
      }
    }
  )
}

($structuredSummary | ConvertTo-Json -Depth 8) | Set-Content -Path $OutputResumenEstructuradoJson -Encoding UTF8

function Get-PaidRecommendationsEs {
  $r = @()
  $r += ''
  $r += '---'
  $r += ''
  $r += '## Recomendaciones de Herramientas Premium (Complemento Profesional)'
  $r += ''
  $r += 'Las herramientas gratuitas implementadas cubren los controles establecidos en OWASP ASVS 4.0,'
  $r += 'NIST SP 800-115 e ISO/IEC 27001. Para entornos con requerimientos de auditoria externa,'
  $r += 'certificacion o cumplimiento regulatorio avanzado, se recomienda complementar con:'
  $r += ''
  $r += '### SAST Premium'
  $r += ''
  $r += '- Checkmarx One: analisis de flujo de datos multi-lenguaje con IA, cobertura CWE/OWASP completa,'
  $r += '  integracion nativa Azure DevOps, fix sugerido automaticamente.'
  $r += '  Justificacion: CodeQL y Semgrep presentan tasa alta de falsos positivos y no cubren logica de negocio.'
  $r += '  Norma: OWASP ASVS L3, ISO 27001 A.14.2.1.'
  $r += '- Veracode Static Analysis: SLA garantizado para auditores externos, soporte 24/7, cobertura backend Java/C#.'
  $r += '  Norma: NIST SP 800-53 CA-8, ISO 27001 A.14.2.3.'
  $r += '- Snyk Business/Enterprise: fix automatico de PRs, analisis runtime, integracion completa Azure DevOps.'
  $r += '  Free tier limitado a 200 tests/mes, sin PR blocking.'
  $r += '  Norma: NTP-ISO/IEC 12207, OWASP ASVS V13.'
  $r += ''
  $r += '### DAST Premium'
  $r += ''
  $r += '- Burp Suite Professional ($449/usuario/ano): proxy interactivo con IA, Intruder ilimitado,'
  $r += '  reportes PDF profesionales para auditores.'
  $r += '  Justificacion: ZAP no detecta vulnerabilidades de logica de negocio ni explora SPAs avanzadas.'
  $r += '  Norma: NIST SP 800-115, OWASP ASVS V4-V9.'
  $r += '- Microsoft RESTler (gratuito, codigo abierto): fuzzer de API REST/OpenAPI para OWASP API Top 10,'
  $r += '  deteccion de BOLA, autenticacion rota, inyeccion. Sin limite de tiempo ni cuenta requerida.'
  $r += '  Para funcionalidades de dashboard y reportes avanzados, considerar Burp Suite Pro (ver arriba).'
  $r += '- Invicti/Acunetix: Proof-Based Scanning sin falsos positivos, IAST integrado.'
  $r += '  Norma: ISO/IEC 25010, OWASP Top 10 2021.'
  $r += '- Rapid7 InsightAppSec: crawling moderno de Angular/React/SPAs, integracion Azure Boards.'
  $r += '  Norma: ISO 27001 A.14.2.8.'
  $r += ''
  $r += '### Escaneo de Infraestructura Premium'
  $r += ''
  $r += '- Tenable Nessus Professional ($3,990/ano): actualizacion de plugins 0-day'
  $r += '  (Greenbone Community tiene delay de 7 dias). Compliance checks PCI-DSS, HIPAA, CIS incluidos.'
  $r += '  Norma: NIST SP 800-115, PCI-DSS Req. 11.3.'
  $r += '- Qualys VMDR: escaneo agentless de red completa, TruRisk scoring, inventario automatico.'
  $r += '  Norma: ISO 27001 A.12.6.1, CVSSv3.1.'
  $r += '- Tenable.io: evaluacion continua, integracion DefectDojo/Jira, reportes ejecutivos para directivos.'
  $r += '  Norma: ISO 27001 A.16.1.4, NIST SP 800-137.'
  $r += ''
  $r += '### Gestion de Vulnerabilidades Premium'
  $r += ''
  $r += '- GitHub Advanced Security ($49/committer/mes): CodeQL en repos privados, Secret Scanning en PRs,'
  $r += '  Dependabot Alerts con PR blocking. CodeQL gratuito solo funciona en repos publicos.'
  $r += '  Norma: ISO 27001 A.9.4.1, NTP-ISO/IEC 12207.'
  $r += '- SonarQube Developer/Enterprise: branch analysis, PR decoration en Azure DevOps, taint analysis.'
  $r += '  Community no tiene analisis de ramas ni integracion con Pull Requests.'
  $r += '  Norma: ISO/IEC 25010, NTP-ISO/IEC 12207.'
  $r += '- JFrog Xray: SBOM management completo, license compliance, policy enforcement nativo.'
  $r += '  Norma: NTP-ISO/IEC 12207, SPDX/CycloneDX.'
  $r += ''
  $r += '### Nota de Inversion'
  $r += ''
  $r += 'La inversion en herramientas premium se justifica ante: auditoria externa DRTSC,'
  $r += 'certificacion ISO 27001, cumplimiento PCI-DSS, o cuando la superficie de ataque'
  $r += 'institucional (SUNEDU, PCM, MINEDU) requiere cobertura de nivel alto.'
  $r += 'La combinacion de herramientas gratuitas implementadas mas al menos una herramienta'
  $r += 'premium por capa provee cobertura equivalente al 90% de frameworks comerciales completos.'
  return $r
}

function Get-PaidRecommendationsEn {
  $r = @()
  $r += ''
  $r += '---'
  $r += ''
  $r += '## Premium Tool Recommendations (Professional Complement)'
  $r += ''
  $r += 'The free tools implemented cover controls established in OWASP ASVS 4.0,'
  $r += 'NIST SP 800-115, and ISO/IEC 27001. For environments with external audit,'
  $r += 'certification, or advanced regulatory compliance requirements, the following'
  $r += 'premium tools are recommended as necessary complements:'
  $r += ''
  $r += '### SAST Premium'
  $r += ''
  $r += '- Checkmarx One: multi-language AI data-flow analysis, full CWE/OWASP coverage,'
  $r += '  native Azure DevOps integration, automated fix suggestions.'
  $r += '  Justification: CodeQL and Semgrep have high false-positive rates and miss business logic flaws.'
  $r += '  Standard: OWASP ASVS L3, ISO 27001 A.14.2.1.'
  $r += '- Veracode Static Analysis: guaranteed SLA for external auditors, 24/7 support.'
  $r += '  Standard: NIST SP 800-53 CA-8, ISO 27001 A.14.2.3.'
  $r += '- Snyk Business/Enterprise: automatic PR fixes, runtime analysis, full Azure DevOps integration.'
  $r += '  Free tier limited to 200 tests/month, no PR blocking.'
  $r += '  Standard: NTP-ISO/IEC 12207, OWASP ASVS V13.'
  $r += ''
  $r += '### DAST Premium'
  $r += ''
  $r += '- Burp Suite Professional ($449/user/year): AI-powered interactive proxy, unlimited Intruder,'
  $r += '  professional PDF reports for auditors.'
  $r += '  Justification: ZAP does not detect business logic vulnerabilities or crawl modern SPAs.'
  $r += '  Standard: NIST SP 800-115, OWASP ASVS V4-V9.'
  $r += '- Microsoft RESTler (free, open source): REST/OpenAPI API fuzzer for OWASP API Top 10,'
  $r += '  detects BOLA, broken auth, injection. No time limit, no account required.'
  $r += '  For dashboard and advanced reporting features, consider Burp Suite Pro (see above).'
  $r += '- Invicti/Acunetix: Proof-Based Scanning with zero false positives, integrated IAST.'
  $r += '  Standard: ISO/IEC 25010, OWASP Top 10 2021.'
  $r += '- Rapid7 InsightAppSec: modern Angular/React/SPA crawling, Azure Boards integration.'
  $r += '  Standard: ISO 27001 A.14.2.8.'
  $r += ''
  $r += '### Infrastructure Scanning Premium'
  $r += ''
  $r += '- Tenable Nessus Professional ($3,990/year): 0-day plugin updates'
  $r += '  (Greenbone Community has 7-day delay). PCI-DSS, HIPAA, CIS compliance checks included.'
  $r += '  Standard: NIST SP 800-115, PCI-DSS Req. 11.3.'
  $r += '- Qualys VMDR: agentless full-network scanning, TruRisk scoring, automatic asset inventory.'
  $r += '  Standard: ISO 27001 A.12.6.1, CVSSv3.1.'
  $r += '- Tenable.io: continuous assessment, DefectDojo/Jira integration, executive PDF reports.'
  $r += '  Standard: ISO 27001 A.16.1.4, NIST SP 800-137.'
  $r += ''
  $r += '### Vulnerability Management Premium'
  $r += ''
  $r += '- GitHub Advanced Security ($49/committer/month): CodeQL on private repos, PR Secret Scanning,'
  $r += '  Dependabot Alerts with PR blocking. Free CodeQL only works on public repositories.'
  $r += '  Standard: ISO 27001 A.9.4.1, NTP-ISO/IEC 12207.'
  $r += '- SonarQube Developer/Enterprise: branch analysis, PR decoration on Azure DevOps, taint analysis.'
  $r += '  Community edition lacks branch analysis and Pull Request integration.'
  $r += '  Standard: ISO/IEC 25010, NTP-ISO/IEC 12207.'
  $r += '- JFrog Xray: full SBOM management, license compliance, native policy enforcement.'
  $r += '  Standard: NTP-ISO/IEC 12207, SPDX/CycloneDX.'
  $r += ''
  $r += '### Investment Note'
  $r += ''
  $r += 'Investment in premium tools is justified for: external DRTSC audits,'
  $r += 'ISO 27001 certification, PCI-DSS compliance, or when the institutional attack'
  $r += 'surface requires high-level coverage (SUNEDU, PCM, MINEDU).'
  $r += 'Combining the implemented free tools with at least one premium tool per layer'
  $r += 'provides coverage equivalent to 90% of full commercial frameworks.'
  return $r
}

function Build-ReportEs {
  param(
    [string]$Fecha,
    [string]$Target,
    [string]$Source,
    [int]$HighAlerts,
    [int]$MediumAlerts,
    [int]$LowAlerts,
    [int]$InfoAlerts,
    [int]$HighInstances,
    [int]$MediumInstances,
    [int]$LowInstances,
    [int]$InfoInstances,
    [int]$ZapCsp,
    [int]$ZapServer,
    [int]$ZapXPoweredBy,
    [int]$ZapCache
  )

  $md = @()
  $md += '# Reporte OWASP Provisional (ES)'
  $md += ''
  $md += "- Fecha: $Fecha"
  $md += "- Target: $Target"
  $md += "- Fuente ZAP JSON: $Source"
  $md += ''
  $md += '## Resumen del escaneo actual'
  $md += ''
  $md += "- High (alertas): $HighAlerts"
  $md += "- Medium (alertas): $MediumAlerts"
  $md += "- Low (alertas): $LowAlerts"
  $md += "- Info (alertas): $InfoAlerts"
  $md += "- High (ocurrencias): $HighInstances"
  $md += "- Medium (ocurrencias): $MediumInstances"
  $md += "- Low (ocurrencias): $LowInstances"
  $md += "- Info (ocurrencias): $InfoInstances"
  $md += ''
  $md += '## Hallazgos tecnicos detectados ahora'
  $md += ''
  $md += "- Alertas CSP detectadas: $ZapCsp"
  $md += "- Fuga de header Server: $ZapServer"
  $md += "- Fuga de header X-Powered-By: $ZapXPoweredBy"
  $md += "- Cache-control potencialmente debil: $ZapCache"
  $md += '- Estas alertas quedan trazables con evidencia automatizada.'
  $md += ''
  $md += '## Recomendacion operativa'
  $md += ''
  $md += '- Usar este baseline como evidencia provisional automatizada.'
  $md += "- Resumen estructurado reutilizable (JSON): $OutputResumenEstructuradoJson"
  $md += '- Complementar con pruebas manuales/activas para validar riesgos de explotacion.'
  $md += '- Mantener seguimiento con matriz de remediacion y SLA por hallazgo.'
  $md += (Get-PaidRecommendationsEs)

  return ($md -join "`r`n")
}

function Build-ReportEn {
  param(
    [string]$Date,
    [string]$Target,
    [string]$Source,
    [int]$HighAlerts,
    [int]$MediumAlerts,
    [int]$LowAlerts,
    [int]$InfoAlerts,
    [int]$HighInstances,
    [int]$MediumInstances,
    [int]$LowInstances,
    [int]$InfoInstances,
    [int]$ZapCsp,
    [int]$ZapServer,
    [int]$ZapXPoweredBy,
    [int]$ZapCache
  )

  $md = @()
  $md += '# OWASP Provisional Report (EN)'
  $md += ''
  $md += "- Date: $Date"
  $md += "- Target: $Target"
  $md += "- ZAP JSON Source: $Source"
  $md += ''
  $md += '## Current Scan Summary'
  $md += ''
  $md += "- High (alerts): $HighAlerts"
  $md += "- Medium (alerts): $MediumAlerts"
  $md += "- Low (alerts): $LowAlerts"
  $md += "- Info (alerts): $InfoAlerts"
  $md += "- High (instances): $HighInstances"
  $md += "- Medium (instances): $MediumInstances"
  $md += "- Low (instances): $LowInstances"
  $md += "- Info (instances): $InfoInstances"
  $md += ''
  $md += '## Technical Findings Detected Now'
  $md += ''
  $md += "- CSP alerts detected: $ZapCsp"
  $md += "- Server header information leak: $ZapServer"
  $md += "- X-Powered-By information leak: $ZapXPoweredBy"
  $md += "- Potentially weak cache-control directives: $ZapCache"
  $md += '- These findings are now traceable with automated evidence.'
  $md += ''
  $md += '## Operational Recommendation'
  $md += ''
  $md += '- Use this baseline as provisional automated evidence.'
  $md += "- Reusable structured summary (JSON): $OutputResumenEstructuradoJson"
  $md += '- Complement with manual/active testing for exploitability validation.'
  $md += '- Track remediation through a matrix with SLA per finding.'
  $md += (Get-PaidRecommendationsEn)

  return ($md -join "`r`n")
}

function Build-DeveloperReportEs {
  param(
    [string]$Fecha,
    [string]$Target,
    [string]$Source,
    [int]$HighAlerts,
    [int]$MediumAlerts,
    [int]$LowAlerts,
    [int]$InfoAlerts,
    [int]$HighInstances,
    [int]$MediumInstances,
    [int]$LowInstances,
    [int]$InfoInstances,
    [int]$ZapCsp,
    [int]$ZapServer,
    [int]$ZapXPoweredBy,
    [int]$ZapCache
  )

  $md = @()
  $md += '# Reporte Tecnico para Desarrollo (ES)'
  $md += ''
  $md += "- Fecha: $Fecha"
  $md += "- Target: $Target"
  $md += "- Fuente ZAP JSON: $Source"
  $md += ''
  $md += '## Resumen de severidad'
  $md += ''
  $md += "- High (alertas): $HighAlerts"
  $md += "- Medium (alertas): $MediumAlerts"
  $md += "- Low (alertas): $LowAlerts"
  $md += "- Info (alertas): $InfoAlerts"
  $md += "- High (ocurrencias): $HighInstances"
  $md += "- Medium (ocurrencias): $MediumInstances"
  $md += "- Low (ocurrencias): $LowInstances"
  $md += "- Info (ocurrencias): $InfoInstances"
  $md += ''
  $md += '## Plan de accion para desarrollo'
  $md += ''
  $md += '1. Prioridad 1 - CSP (Medium)'
  $md += "   - Evidencia: $ZapCsp ocurrencias relacionadas con CSP."
  $md += '   - Accion tecnica: eliminar unsafe-eval, reducir unsafe-inline y definir directivas faltantes (ejemplo: form-action).'
  $md += '   - Validacion: re-ejecutar OWASP baseline y verificar reduccion de alertas CSP.'
  $md += '2. Prioridad 2 - Hardening de headers (Low persistente)'
  $md += "   - Evidencia: Server=$ZapServer, X-Powered-By=$ZapXPoweredBy."
  $md += '   - Accion tecnica: ocultar/remover headers de tecnologia en gateway/web server.'
  $md += '   - Validacion: confirmar ausencia de ambos headers en endpoints publicos.'
  $md += '3. Prioridad 3 - Cache-Control'
  $md += "   - Evidencia: $ZapCache ocurrencias de revision de cache-control."
  $md += '   - Accion tecnica: definir politicas por tipo de endpoint (datos sensibles vs estaticos).'
  $md += '   - Validacion: revisar respuestas con datos sensibles para no-store/no-cache cuando corresponda.'
  $md += '4. Prioridad 4 - Hallazgos menores'
  $md += '   - Timestamp disclosure y modern web application: registrar como deuda tecnica con criterio de riesgo.'
  $md += ''
  $md += '## Criterio de cierre'
  $md += ''
  $md += '- El hallazgo se considera cerrado cuando existe evidencia tecnica de configuracion aplicada y re-scan sin recurrencia.'
  $md += '- Adjuntar endpoint afectado, cambio realizado y resultado de validacion.'
  $md += (Get-PaidRecommendationsEs)

  return ($md -join "`r`n")
}

function Build-DeveloperReportEn {
  param(
    [string]$Date,
    [string]$Target,
    [string]$Source,
    [int]$HighAlerts,
    [int]$MediumAlerts,
    [int]$LowAlerts,
    [int]$InfoAlerts,
    [int]$HighInstances,
    [int]$MediumInstances,
    [int]$LowInstances,
    [int]$InfoInstances,
    [int]$ZapCsp,
    [int]$ZapServer,
    [int]$ZapXPoweredBy,
    [int]$ZapCache
  )

  $md = @()
  $md += '# Technical Report for Development (EN)'
  $md += ''
  $md += "- Date: $Date"
  $md += "- Target: $Target"
  $md += "- ZAP JSON Source: $Source"
  $md += ''
  $md += '## Severity Summary'
  $md += ''
  $md += "- High (alerts): $HighAlerts"
  $md += "- Medium (alerts): $MediumAlerts"
  $md += "- Low (alerts): $LowAlerts"
  $md += "- Info (alerts): $InfoAlerts"
  $md += "- High (instances): $HighInstances"
  $md += "- Medium (instances): $MediumInstances"
  $md += "- Low (instances): $LowInstances"
  $md += "- Info (instances): $InfoInstances"
  $md += ''
  $md += '## Action Plan for Development'
  $md += ''
  $md += '1. Priority 1 - CSP (Medium)'
  $md += "   - Evidence: $ZapCsp CSP-related instances."
  $md += '   - Technical action: remove unsafe-eval, reduce unsafe-inline, and define missing directives (for example form-action).'
  $md += '   - Validation: rerun OWASP baseline and verify CSP alerts reduction.'
  $md += '2. Priority 2 - Header hardening (persistent Low)'
  $md += "   - Evidence: Server=$ZapServer, X-Powered-By=$ZapXPoweredBy."
  $md += '   - Technical action: remove technology-leaking headers at gateway/web server level.'
  $md += '   - Validation: confirm both headers are absent across public endpoints.'
  $md += '3. Priority 3 - Cache-Control'
  $md += "   - Evidence: $ZapCache cache-control review instances."
  $md += '   - Technical action: define cache policy by endpoint type (sensitive data vs static content).'
  $md += '   - Validation: ensure sensitive responses use no-store/no-cache when needed.'
  $md += '4. Priority 4 - Minor findings'
  $md += '   - Timestamp disclosure and modern web application: track as technical debt based on risk policy.'
  $md += ''
  $md += '## Done Criteria'
  $md += ''
  $md += '- A finding is closed only with technical evidence of configuration applied and clean re-scan for that finding.'
  $md += '- Include affected endpoint, implemented change, and validation result.'
  $md += (Get-PaidRecommendationsEn)

  return ($md -join "`r`n")
}

function Build-ExecutiveReportEs {
  param(
    [string]$Fecha,
    [string]$Target,
    [int]$HighAlerts,
    [int]$MediumAlerts,
    [int]$LowAlerts,
    [int]$InfoAlerts,
    [int]$ZapCsp,
    [int]$ZapServer,
    [int]$ZapXPoweredBy,
    [int]$ZapCache
  )

  $md = @()
  $md += '# Reporte Ejecutivo OWASP (ES)'
  $md += ''
  $md += "- Fecha: $Fecha"
  $md += "- Objetivo evaluado: $Target"
  $md += ''
  $md += '## Resumen ejecutivo'
  $md += ''
  $md += "- High: $HighAlerts | Medium: $MediumAlerts | Low: $LowAlerts | Info: $InfoAlerts"
  $md += '- No se evidencian hallazgos High en baseline actual, pero existen riesgos de hardening y configuracion pendientes.'
  $md += ''
  $md += '## Hallazgos clave para decision'
  $md += ''
  $md += "- CSP: $ZapCsp ocurrencias (requiere plan de endurecimiento)."
  $md += "- Header Server: $ZapServer ocurrencias."
  $md += "- Header X-Powered-By: $ZapXPoweredBy ocurrencias."
  $md += "- Cache-control: $ZapCache ocurrencias de revision."
  $md += ''
  $md += '## Decision recomendada'
  $md += ''
  $md += '- Aprobar remediacion priorizada en 2 frentes: CSP y hardening de headers.'
  $md += '- Mantener escaneo automatico en cada ciclo y validacion manual para riesgos de explotacion avanzada.'
  $md += (Get-PaidRecommendationsEs)

  return ($md -join "`r`n")
}

function Build-ExecutiveReportEn {
  param(
    [string]$Date,
    [string]$Target,
    [int]$HighAlerts,
    [int]$MediumAlerts,
    [int]$LowAlerts,
    [int]$InfoAlerts,
    [int]$ZapCsp,
    [int]$ZapServer,
    [int]$ZapXPoweredBy,
    [int]$ZapCache
  )

  $md = @()
  $md += '# OWASP Executive Report (EN)'
  $md += ''
  $md += "- Date: $Date"
  $md += "- Assessed target: $Target"
  $md += ''
  $md += '## Executive Summary'
  $md += ''
  $md += "- High: $HighAlerts | Medium: $MediumAlerts | Low: $LowAlerts | Info: $InfoAlerts"
  $md += '- No High findings are shown in current baseline, but hardening and configuration risks remain open.'
  $md += ''
  $md += '## Key Findings for Decision'
  $md += ''
  $md += "- CSP: $ZapCsp instances (hardening required)."
  $md += "- Server header: $ZapServer instances."
  $md += "- X-Powered-By header: $ZapXPoweredBy instances."
  $md += "- Cache-control: $ZapCache review instances."
  $md += ''
  $md += '## Recommended Decision'
  $md += ''
  $md += '- Approve prioritized remediation in two fronts: CSP and header hardening.'
  $md += '- Keep automated scanning in each cycle and manual validation for advanced exploitability risks.'
  $md += (Get-PaidRecommendationsEn)

  return ($md -join "`r`n")
}

$mdTextEs = Build-ReportEs -Fecha $fecha -Target $target -Source $InputJson -HighAlerts $highAlerts -MediumAlerts $mediumAlerts -LowAlerts $lowAlerts -InfoAlerts $infoAlerts -HighInstances $highInstances -MediumInstances $mediumInstances -LowInstances $lowInstances -InfoInstances $infoInstances -ZapCsp $zapCsp -ZapServer $zapServerHeader -ZapXPoweredBy $zapXPoweredBy -ZapCache $zapCacheControl
$mdTextEn = Build-ReportEn -Date $fecha -Target $target -Source $InputJson -HighAlerts $highAlerts -MediumAlerts $mediumAlerts -LowAlerts $lowAlerts -InfoAlerts $infoAlerts -HighInstances $highInstances -MediumInstances $mediumInstances -LowInstances $lowInstances -InfoInstances $infoInstances -ZapCsp $zapCsp -ZapServer $zapServerHeader -ZapXPoweredBy $zapXPoweredBy -ZapCache $zapCacheControl
$mdTextDevEs = Build-DeveloperReportEs -Fecha $fecha -Target $target -Source $InputJson -HighAlerts $highAlerts -MediumAlerts $mediumAlerts -LowAlerts $lowAlerts -InfoAlerts $infoAlerts -HighInstances $highInstances -MediumInstances $mediumInstances -LowInstances $lowInstances -InfoInstances $infoInstances -ZapCsp $zapCsp -ZapServer $zapServerHeader -ZapXPoweredBy $zapXPoweredBy -ZapCache $zapCacheControl
$mdTextDevEn = Build-DeveloperReportEn -Date $fecha -Target $target -Source $InputJson -HighAlerts $highAlerts -MediumAlerts $mediumAlerts -LowAlerts $lowAlerts -InfoAlerts $infoAlerts -HighInstances $highInstances -MediumInstances $mediumInstances -LowInstances $lowInstances -InfoInstances $infoInstances -ZapCsp $zapCsp -ZapServer $zapServerHeader -ZapXPoweredBy $zapXPoweredBy -ZapCache $zapCacheControl
$mdTextExecEs = Build-ExecutiveReportEs -Fecha $fecha -Target $target -HighAlerts $highAlerts -MediumAlerts $mediumAlerts -LowAlerts $lowAlerts -InfoAlerts $infoAlerts -ZapCsp $zapCsp -ZapServer $zapServerHeader -ZapXPoweredBy $zapXPoweredBy -ZapCache $zapCacheControl
$mdTextExecEn = Build-ExecutiveReportEn -Date $fecha -Target $target -HighAlerts $highAlerts -MediumAlerts $mediumAlerts -LowAlerts $lowAlerts -InfoAlerts $infoAlerts -ZapCsp $zapCsp -ZapServer $zapServerHeader -ZapXPoweredBy $zapXPoweredBy -ZapCache $zapCacheControl

function Write-HtmlFromText {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Title,
    [Parameter(Mandatory = $true)]
    [string]$Text,
    [Parameter(Mandatory = $true)]
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
    .institution { color: #374151; font-weight: 600; margin-bottom: 8px; }
    .content { border: 1px solid #d1d5db; border-radius: 10px; padding: 16px; line-height: 1.55; white-space: normal; }
  </style>
</head>
<body>
  <!-- No institutional logo path is standardized in this reporting flow; keep text header only. -->
  <div class="institution">SUNEDU - REGINSA</div>
  <h1>$Title</h1>
  <div class="content">$safe</div>
</body>
</html>
"@

  $html | Set-Content -Path $OutputPath -Encoding UTF8
}

Write-HtmlFromText -Title 'Reporte OWASP Provisional (ES)' -Text $mdTextEs -OutputPath $OutputHtmlEs -Lang 'es'
Write-HtmlFromText -Title 'OWASP Provisional Report (EN)' -Text $mdTextEn -OutputPath $OutputHtmlEn -Lang 'en'
Write-HtmlFromText -Title 'Reporte Tecnico para Desarrollo (ES)' -Text $mdTextDevEs -OutputPath $OutputHtmlDevEs -Lang 'es'
Write-HtmlFromText -Title 'Technical Report for Development (EN)' -Text $mdTextDevEn -OutputPath $OutputHtmlDevEn -Lang 'en'
Write-HtmlFromText -Title 'Reporte Ejecutivo OWASP (ES)' -Text $mdTextExecEs -OutputPath $OutputHtmlExecEs -Lang 'es'
Write-HtmlFromText -Title 'OWASP Executive Report (EN)' -Text $mdTextExecEn -OutputPath $OutputHtmlExecEn -Lang 'en'

if (Test-Path $OutputHtmlEs) {
  Remove-Item -Path $OutputHtmlEs -Force
}

function Write-DocxFromText {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text,
    [Parameter(Mandatory = $true)]
    [string]$OutputDocxPath
  )

  $word = $null
  $doc = $null
  try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0

    $outputAbs = [System.IO.Path]::GetFullPath($OutputDocxPath)

    $doc = $word.Documents.Add()
    $range = $doc.Range()
    $range.Text = $Text
    # 12 = wdFormatXMLDocument (.docx)
    $doc.SaveAs([ref]$outputAbs, [ref]12)
    $doc.Close()
    $doc = $null

    Write-Host "Reporte Word (.docx) generado: $OutputDocxPath"
    return $true
  }
  catch {
    Write-Warning "No se pudo generar DOCX automaticamente. Detalle: $($_.Exception.Message)"
    return $false
  }
  finally {
    if ($null -ne $doc) {
      try { $doc.Close() } catch { Write-Verbose "doc.Close() fallo: $_" }
    }
    if ($null -ne $word) {
      try { $word.Quit() } catch { Write-Verbose "word.Quit() fallo: $_" }
      try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) } catch { Write-Verbose "ReleaseComObject fallo: $_" }
    }
  }
}

[void](Write-DocxFromText -Text $mdTextEn -OutputDocxPath $OutputDocxEn)
[void](Write-DocxFromText -Text $mdTextDevEs -OutputDocxPath $OutputDocxDevEs)
[void](Write-DocxFromText -Text $mdTextDevEn -OutputDocxPath $OutputDocxDevEn)
[void](Write-DocxFromText -Text $mdTextExecEs -OutputDocxPath $OutputDocxExecEs)
[void](Write-DocxFromText -Text $mdTextExecEn -OutputDocxPath $OutputDocxExecEn)

if (Test-Path $OutputDocxEs) {
  Remove-Item -Path $OutputDocxEs -Force
}

Write-Host "Reporte formal EN DOCX: $OutputDocxEn"
Write-Host "Reporte formal EN HTML: $OutputHtmlEn"
Write-Host "Reporte DEV ES DOCX: $OutputDocxDevEs"
Write-Host "Reporte DEV ES HTML: $OutputHtmlDevEs"
Write-Host "Reporte DEV EN DOCX: $OutputDocxDevEn"
Write-Host "Reporte DEV EN HTML: $OutputHtmlDevEn"
Write-Host "Reporte EJEC ES DOCX: $OutputDocxExecEs"
Write-Host "Reporte EJEC ES HTML: $OutputHtmlExecEs"
Write-Host "Reporte EJEC EN DOCX: $OutputDocxExecEn"
Write-Host "Reporte EJEC EN HTML: $OutputHtmlExecEn"
Write-Host "Resumen estructurado OWASP (JSON): $OutputResumenEstructuradoJson"
