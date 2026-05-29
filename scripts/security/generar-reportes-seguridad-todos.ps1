# Genera reportes Word/HTML por categoria de seguridad + reporte maestro
# Lee desde: reportes/security/{Date}/{categoria}/{herramienta}/
# Genera por categoria: reporte-sast, reporte-sca, reporte-dast, reporte-container-infra
# Genera maestro: reporte-maestro-seguridad-{Date}
# Normas: OWASP ASVS 4.0, ISO/IEC 27001, NIST SP 800-115, CVSSv3.1
param(
  [string]$Date       = (Get-Date -Format 'yyyy-MM-dd_HH-mm'),
  [string]$BaseOutput = "reportes/security",
  [string]$Target     = $env:REGINSA_URL,
  [string]$Lang       = "es"   # es | en
)

$ErrorActionPreference = 'Continue'
Set-StrictMode -Version Latest

$workspacePath = [System.IO.Path]::GetFullPath($PWD.Path)
$dateDir       = [System.IO.Path]::GetFullPath((Join-Path $workspacePath "$BaseOutput/$Date"))
$fechaGen      = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

if (-not (Test-Path $dateDir)) {
  throw "Carpeta fechada no encontrada: $dateDir`nEjecuta primero: npm run test:security:all"
}

# ──────────────────────────────────────────────────────────────
# FUNCIONES DE PARSEO POR HERRAMIENTA
# ──────────────────────────────────────────────────────────────

function Read-SarifFindings {
  param([string]$FilePath)
  $findings = @()
  if (-not (Test-Path $FilePath)) { return ,$findings }
  try {
    $sarif = Get-Content $FilePath -Raw | ConvertFrom-Json
    foreach ($run in $sarif.runs) {
      foreach ($result in $run.results) {
        # Bearer usa 'error'/'warning'/'note'; algunos SARIF no tienen 'level' -- defaultear a INFO
        $level = if ($result.PSObject.Properties['level']) { $result.level } else { 'none' }
        $sev = switch ($level) {
          'error'   { 'ALTO' }
          'warning' { 'MEDIO' }
          'note'    { 'BAJO' }
          default   { 'INFO' }
        }
        $file = ""
        $line = ""
        try {
          $loc = $result.locations[0].physicalLocation
          $file = $loc.artifactLocation.uri
          $line = $loc.region.startLine
        } catch {
          Write-Verbose "Ubicacion SARIF sin datos validos, ignorada: $_"
        }
        $findings += [PSCustomObject]@{
          Severidad = $sev
          Regla     = if ($result.PSObject.Properties['ruleId']) { [string]$result.ruleId } else { 'unknown' }
          Mensaje   = ([string]$result.message.text) -replace '<[^>]+>', ''
          Archivo   = $file
          Linea     = $line
        }
      }
    }
  } catch { Write-Warning "SARIF parse error $FilePath`: $_" }
  return ,$findings
}

function Read-GitleaksFindings {
  param([string]$FilePath)
  $findings = @()
  if (-not (Test-Path $FilePath)) { return $findings }
  try {
    $data = Get-Content $FilePath -Raw | ConvertFrom-Json
    foreach ($item in $data) {
      $findings += [PSCustomObject]@{
        Severidad = 'ALTO'
        Regla     = [string]$item.Description
        Mensaje   = "Secret detectado en commit $([string]$item.Commit)"
        Archivo   = [string]$item.File
        Linea     = [string]$item.StartLine
      }
    }
  } catch { Write-Warning "Gitleaks parse error: $_" }
  return ,$findings
}

function Read-TruffleHogFindings {
  param([string]$FilePath)
  $findings = @()
  if (-not (Test-Path $FilePath)) { return $findings }
  try {
    $lines = Get-Content $FilePath
    foreach ($line in $lines) {
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      try {
        $item = $line | ConvertFrom-Json
        $verified = if ($item.Verified) { "VERIFICADO" } else { "sin verificar" }
        $file = try { [string]$item.SourceMetadata.Data.Git.file } catch { "" }
        $lineNum = try { [string]$item.SourceMetadata.Data.Git.line } catch { "" }
        $findings += [PSCustomObject]@{
          Severidad = if ($item.Verified) { 'CRITICO' } else { 'MEDIO' }
          Regla     = [string]$item.DetectorName
          Mensaje   = "Secret $([string]$item.DetectorName) - $verified"
          Archivo   = $file
          Linea     = $lineNum
        }
      } catch {
          Write-Verbose "Linea TruffleHog malformada, ignorada: $_"
        }
    }
  } catch { Write-Warning "TruffleHog parse error: $_" }
  return ,$findings
}

function Read-NucleiFindings {
  param([string]$FilePath)
  $findings = @()
  if (-not (Test-Path $FilePath)) { return $findings }
  try {
    $lines = Get-Content $FilePath
    foreach ($line in $lines) {
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      try {
        $item = $line | ConvertFrom-Json
        $sev = switch (([string]$item.info.severity).ToUpper()) {
          'CRITICAL' { 'CRITICO' }
          'HIGH'     { 'ALTO' }
          'MEDIUM'   { 'MEDIO' }
          'LOW'      { 'BAJO' }
          default    { 'INFO' }
        }
        $findings += [PSCustomObject]@{
          Severidad = $sev
          Regla     = [string]$item.'template-id'
          Mensaje   = [string]$item.info.name
          Archivo   = [string]$item.host
          Linea     = [string]$item.'matched-at'
        }
      } catch {
          Write-Verbose "Linea Nuclei malformada, ignorada: $_"
        }
    }
  } catch { Write-Warning "Nuclei parse error: $_" }
  return ,$findings
}

function Read-OSVFindings {
  param([string]$FilePath)
  $findings = @()
  if (-not (Test-Path $FilePath)) { return $findings }
  try {
    $data = Get-Content $FilePath -Raw | ConvertFrom-Json
    foreach ($res in $data.results) {
      foreach ($pkg in $res.packages) {
        $pkgName    = [string]$pkg.package.name
        $pkgVersion = [string]$pkg.package.version
        foreach ($vuln in $pkg.vulnerabilities) {
          $findings += [PSCustomObject]@{
            Severidad = 'MEDIO'
            Regla     = [string]$vuln.id
            Mensaje   = if ($vuln.summary) { [string]$vuln.summary } else { $vuln.id }
            Archivo   = "${pkgName}@${pkgVersion}"
            Linea     = ""
          }
        }
      }
    }
  } catch { Write-Warning "OSV parse error: $_" }
  return ,$findings
}

function Read-GrypeFindings {
  param([string]$FilePath)
  $findings = @()
  if (-not (Test-Path $FilePath)) { return $findings }
  try {
    $data = Get-Content $FilePath -Raw | ConvertFrom-Json
    $matchList = if ($data -and $data.PSObject.Properties['matches'] -and $data.matches) { $data.matches } else { @() }
    foreach ($match in $matchList) {
      $vuln = $match.vulnerability
      $art  = $match.artifact
      $sev  = switch (([string]$vuln.severity).ToUpper()) {
        'CRITICAL' { 'CRITICO' }
        'HIGH'     { 'ALTO' }
        'MEDIUM'   { 'MEDIO' }
        'LOW'      { 'BAJO' }
        default    { 'INFO' }
      }
      $findings += [PSCustomObject]@{
        Severidad = $sev
        Regla     = [string]$vuln.id
        Mensaje   = if ($vuln.description) { ([string]$vuln.description).Substring(0, [Math]::Min(120, $vuln.description.Length)) } else { $vuln.id }
        Archivo   = "$([string]$art.name)@$([string]$art.version)"
        Linea     = ""
      }
    }
  } catch { Write-Warning "Grype parse error: $_" }
  return ,$findings
}

function Read-RetireJsFindings {
  param([string]$FilePath)
  $findings = @()
  if (-not (Test-Path $FilePath)) { return $findings }
  try {
    $data = Get-Content $FilePath -Raw | ConvertFrom-Json
    $dataArr = if ($data -is [array]) { $data } elseif ($data) { @($data) } else { @() }
    foreach ($fileEntry in $dataArr) {
      $resultList = if ($fileEntry -and $fileEntry.PSObject.Properties['results'] -and $fileEntry.results) { $fileEntry.results } else { @() }
      foreach ($result in $resultList) {
        $vulnList = if ($result -and $result.PSObject.Properties['vulnerabilities'] -and $result.vulnerabilities) { $result.vulnerabilities } else { @() }
        foreach ($vuln in $vulnList) {
          $cves = ($vuln.identifiers.CVE -join ", ")
          $sev = switch (([string]$vuln.severity).ToLower()) {
            'high'   { 'ALTO' }
            'medium' { 'MEDIO' }
            'low'    { 'BAJO' }
            default  { 'INFO' }
          }
          $findings += [PSCustomObject]@{
            Severidad = $sev
            Regla     = if ($cves) { $cves } else { "retire-js" }
            Mensaje   = "$([string]$result.component) v$([string]$result.version)"
            Archivo   = [string]$fileEntry.file
            Linea     = ""
          }
        }
      }
    }
  } catch { Write-Warning "RetireJS parse error: $_" }
  return ,$findings
}

function Read-DepCheckFindings {
  param([string]$FilePath)
  $findings = @()
  if (-not (Test-Path $FilePath)) { return $findings }
  try {
    $data = Get-Content $FilePath -Raw | ConvertFrom-Json
    foreach ($dep in $data.dependencies) {
      foreach ($vuln in $dep.vulnerabilities) {
        $sev = switch (([string]$vuln.severity).ToUpper()) {
          'CRITICAL' { 'CRITICO' }
          'HIGH'     { 'ALTO' }
          'MEDIUM'   { 'MEDIO' }
          'LOW'      { 'BAJO' }
          default    { 'INFO' }
        }
        $findings += [PSCustomObject]@{
          Severidad = $sev
          Regla     = [string]$vuln.name
          Mensaje   = if ($vuln.description) { ([string]$vuln.description).Substring(0, [Math]::Min(120, $vuln.description.Length)) } else { $vuln.name }
          Archivo   = [string]$dep.fileName
          Linea     = ""
        }
      }
    }
  } catch { Write-Warning "DepCheck parse error: $_" }
  return ,$findings
}

function Read-TrivyFindings {
  param([string]$FilePath)
  $findings = @()
  if (-not (Test-Path $FilePath)) { return $findings }
  try {
    $data = Get-Content $FilePath -Raw | ConvertFrom-Json
    foreach ($result in $data.Results) {
      $vulns = if ($result.PSObject.Properties['Vulnerabilities'] -and $result.Vulnerabilities) { $result.Vulnerabilities } else { @() }
      foreach ($vuln in $vulns) {
        $sev = switch (([string]$vuln.Severity).ToUpper()) {
          'CRITICAL' { 'CRITICO' }
          'HIGH'     { 'ALTO' }
          'MEDIUM'   { 'MEDIO' }
          'LOW'      { 'BAJO' }
          default    { 'INFO' }
        }
        $findings += [PSCustomObject]@{
          Severidad = $sev
          Regla     = [string]$vuln.VulnerabilityID
          Mensaje   = "$([string]$vuln.PkgName) v$([string]$vuln.InstalledVersion)"
          Archivo   = [string]$result.Target
          Linea     = ""
        }
      }
    }
  } catch { Write-Warning "Trivy parse error: $_" }
  return ,$findings
}

function Read-ZapFindings {
  param([string]$FilePath)
  $findings = @()
  if (-not (Test-Path $FilePath)) { return $findings }
  try {
    $data = Get-Content $FilePath -Raw | ConvertFrom-Json
    $site = if ($data.site -is [array]) { $data.site[0] } else { $data.site }
    foreach ($alert in $site.alerts) {
      $sev = switch ([string]$alert.riskcode) {
        '3' { 'ALTO' }
        '2' { 'MEDIO' }
        '1' { 'BAJO' }
        default { 'INFO' }
      }
      $cnt = try { [int]$alert.count } catch { 1 }
      $findings += [PSCustomObject]@{
        Severidad = $sev
        Regla     = [string]$alert.pluginid
        Mensaje   = "$([string]$alert.name) ($cnt instancias)"
        Archivo   = [string]$site.'@name'
        Linea     = [string]$alert.riskdesc
      }
    }
  } catch { Write-Warning "ZAP parse error: $_" }
  return $findings
}

# ──────────────────────────────────────────────────────────────
# GENERACION DE HTML COMPATIBLE CON WORD
# ──────────────────────────────────────────────────────────────

function Get-SeverityColor {
  param([string]$sev)
  switch ($sev.ToUpper()) {
    'CRITICO'  { return '#c0392b' }
    'ALTO'     { return '#e74c3c' }
    'MEDIO'    { return '#e67e22' }
    'BAJO'     { return '#f1c40f' }
    default    { return '#7f8c8d' }
  }
}

function Build-HtmlDocument {
  param(
    [string]$Titulo,
    [string]$Subtitulo,
    [string]$BodyContent
  )
  $logoGov = "SUNEDU - Superintendencia Nacional de Educacion Superior Universitaria"
  return @"
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8"/>
<meta name="generator" content="REGINSA Security Suite"/>
<!--[if gte mso 9]>
<xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml>
<![endif]-->
<style>
  body { font-family: 'Calibri', Arial, sans-serif; font-size: 11pt; color: #1a1a2e; margin: 2cm; line-height: 1.5; }
  h1 { font-size: 18pt; color: #1a237e; border-bottom: 3px solid #1a237e; padding-bottom: 8px; margin-top: 0; }
  h2 { font-size: 14pt; color: #283593; margin-top: 24px; border-left: 4px solid #1a237e; padding-left: 10px; }
  h3 { font-size: 12pt; color: #3949ab; margin-top: 16px; }
  .header-box { background: #1a237e; color: white; padding: 16px 20px; border-radius: 6px; margin-bottom: 20px; }
  .header-box h1 { color: white; border-bottom: 1px solid rgba(255,255,255,0.4); font-size: 20pt; }
  .header-box p { margin: 4px 0; font-size: 10pt; opacity: 0.9; }
  .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10pt; }
  .meta-table td { padding: 5px 10px; border: 1px solid #c5cae9; }
  .meta-table td:first-child { background: #e8eaf6; font-weight: bold; width: 200px; }
  .summary-grid { display: table; width: 100%; margin-bottom: 20px; }
  .summary-card { display: table-cell; padding: 12px 16px; text-align: center; border-radius: 6px; margin: 4px; }
  .card-critico { background: #ffcdd2; border: 2px solid #c0392b; }
  .card-alto    { background: #fce4ec; border: 2px solid #e74c3c; }
  .card-medio   { background: #fff3e0; border: 2px solid #e67e22; }
  .card-bajo    { background: #fffde7; border: 2px solid #f1c40f; }
  .card-info    { background: #e8eaf6; border: 2px solid #7f8c8d; }
  .card-count   { font-size: 28pt; font-weight: bold; display: block; }
  .card-label   { font-size: 9pt; font-weight: bold; }
  table.findings { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 10px; }
  table.findings th { background: #1a237e; color: white; padding: 8px 10px; text-align: left; }
  table.findings td { padding: 6px 10px; border-bottom: 1px solid #e0e0e0; vertical-align: top; }
  table.findings tr:nth-child(even) { background: #f5f5f5; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; color: white; font-size: 9pt; font-weight: bold; }
  .tool-section { border: 1px solid #c5cae9; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; }
  .tool-header  { background: #e8eaf6; padding: 8px 12px; border-radius: 4px; margin-bottom: 10px; font-weight: bold; }
  .no-findings  { color: #2ecc71; font-weight: bold; padding: 8px; }
  .file-not-found { color: #7f8c8d; font-style: italic; padding: 8px; }
  .normas { font-size: 9pt; color: #546e7a; border-top: 1px solid #e0e0e0; margin-top: 8px; padding-top: 6px; }
  @page { size: A4; margin: 2cm; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<div class="header-box">
  <h1>$Titulo</h1>
  <p>$Subtitulo</p>
  <p>$logoGov | Generado: $fechaGen | Fecha de escaneo: $Date</p>
</div>
$BodyContent
</body>
</html>
"@
}

function Build-FindingsTable {
  param([array]$Findings, [string]$ToolName)
  # Filtrar nulos y objetos sin propiedad Severidad para evitar errores de StrictMode
  $safeFindings = @($Findings | Where-Object { $_ -ne $null -and $_.PSObject.Properties['Severidad'] })
  if ($safeFindings.Count -eq 0) {
    return "<div class='no-findings'>${ToolName}: No se detectaron hallazgos.</div>"
  }
  $critico = @($safeFindings | Where-Object { $_.Severidad -eq 'CRITICO' }).Count
  $alto    = @($safeFindings | Where-Object { $_.Severidad -eq 'ALTO' }).Count
  $medio   = @($safeFindings | Where-Object { $_.Severidad -eq 'MEDIO' }).Count
  $bajo    = @($safeFindings | Where-Object { $_.Severidad -eq 'BAJO' }).Count
  $total   = $safeFindings.Count

  $summaryHtml = @"
<p><strong>Total: $total hallazgos</strong> |
  <span style='color:#c0392b'>Critico: $critico</span> |
  <span style='color:#e74c3c'>Alto: $alto</span> |
  <span style='color:#e67e22'>Medio: $medio</span> |
  <span style='color:#b7950b'>Bajo: $bajo</span>
</p>
"@

  $rows = $safeFindings | Sort-Object Severidad | ForEach-Object {
    $color = Get-SeverityColor $_.Severidad
    "<tr><td><span class='badge' style='background:$color'>$($_.Severidad)</span></td><td>$($_.Regla)</td><td>$($_.Mensaje)</td><td>$($_.Archivo)</td><td>$($_.Linea)</td></tr>"
  }

  return $summaryHtml + @"
<table class='findings'>
  <thead><tr><th>Severidad</th><th>Regla / CVE</th><th>Descripcion</th><th>Archivo / Paquete</th><th>Linea / URL</th></tr></thead>
  <tbody>$($rows -join "")</tbody>
</table>
"@
}

function Write-Report {
  param([string]$Titulo, [string]$Subtitulo, [string]$BodyContent, [string]$BaseName)
  $html  = Build-HtmlDocument -Titulo $Titulo -Subtitulo $Subtitulo -BodyContent $BodyContent
  $htmlPath = Join-Path $dateDir "${BaseName}.html"
  $docxPath = Join-Path $dateDir "${BaseName}.docx"
  $html | Out-File -FilePath $htmlPath -Encoding UTF8 -Force
  $html | Out-File -FilePath $docxPath -Encoding UTF8 -Force
  Write-Host "  Generado: $htmlPath" -ForegroundColor Green
  Write-Host "  Generado: $docxPath" -ForegroundColor Green
}

# ──────────────────────────────────────────────────────────────
# REPORTE 1: SAST
# ──────────────────────────────────────────────────────────────
Write-Host "`n=== Generando reporte SAST ===" -ForegroundColor Cyan

$bearerF    = @(Read-SarifFindings   (Join-Path $dateDir "sast/bearer/bearer-results.sarif"))
$checkovF   = @(Read-SarifFindings   (Join-Path $dateDir "sast/checkov/results_sarif.sarif"))
$semgrepF   = @(Read-SarifFindings   (Join-Path $dateDir "sast/semgrep/semgrep-results.json"))
$gitleaksF  = @(Read-GitleaksFindings(Join-Path $dateDir "sast/gitleaks/gitleaks-report.json"))
$truffleF   = @(Read-TruffleHogFindings(Join-Path $dateDir "sast/trufflehog/trufflehog-results.json"))

$totalSast = $bearerF.Count + $checkovF.Count + $semgrepF.Count + $gitleaksF.Count + $truffleF.Count

$body = @"
<h2>Resumen SAST</h2>
<table class='meta-table'>
  <tr><td>Fecha de escaneo</td><td>$Date</td></tr>
  <tr><td>Total hallazgos</td><td>$totalSast</td></tr>
  <tr><td>Herramientas ejecutadas</td><td>Bearer, Checkov, Semgrep, Gitleaks, TruffleHog</td></tr>
  <tr><td>Normas</td><td>OWASP ASVS 4.0 V2/V14, ISO/IEC 27001 A.9/A.14, NTP-ISO/IEC 12207</td></tr>
</table>

<div class='tool-section'>
  <div class='tool-header'>Bearer - Data-Flow Analysis + PII Detection (OWASP ASVS V2.10)</div>
  $(Build-FindingsTable $bearerF "Bearer")
  <div class='normas'>Norma: ISO/IEC 27001 A.9.4.1, OWASP ASVS V2.10</div>
</div>

<div class='tool-section'>
  <div class='tool-header'>Checkov  -  IaC Security (Dockerfile + GitHub Actions + Azure Pipelines)</div>
  $(Build-FindingsTable $checkovF "Checkov")
  <div class='normas'>Norma: CIS Benchmarks, NIST 800-190, OWASP Top 10 A05 (Misconfiguration)</div>
</div>

<div class='tool-section'>
  <div class='tool-header'>Semgrep  -  OWASP Top 10 + TypeScript/JavaScript Rules</div>
  $(Build-FindingsTable $semgrepF "Semgrep")
  <div class='normas'>Norma: OWASP Top 10 2021, OWASP ASVS V13, ISO/IEC 25010</div>
</div>

<div class='tool-section'>
  <div class='tool-header'>Gitleaks  -  Secrets en historial Git</div>
  $(Build-FindingsTable $gitleaksF "Gitleaks")
  <div class='normas'>Norma: ISO/IEC 27001 A.9.4.1, OWASP ASVS V2.10, NTP-ISO/IEC 12207</div>
</div>

<div class='tool-section'>
  <div class='tool-header'>TruffleHog v3  -  Secrets con verificacion activa via API</div>
  $(Build-FindingsTable $truffleF "TruffleHog")
  <div class='normas'>Norma: ISO/IEC 27001 A.9.4.1, OWASP ASVS V2.10  -  Los secrets VERIFIED son confirmedos activamente</div>
</div>
"@

Write-Report -Titulo "Reporte SAST  -  $Date" -Subtitulo "Static Application Security Testing | REGINSA QA" -BodyContent $body -BaseName "reporte-sast-$Date"

# ──────────────────────────────────────────────────────────────
# REPORTE 2: SCA
# ──────────────────────────────────────────────────────────────
Write-Host "`n=== Generando reporte SCA ===" -ForegroundColor Cyan

$depcheckF = @(Read-DepCheckFindings(Join-Path $dateDir "sca/dependency-check/dependency-check-report.json"))
$osvF      = @(Read-OSVFindings     (Join-Path $dateDir "sca/osv/osv-results.json"))
$retireF   = @(Read-RetireJsFindings(Join-Path $dateDir "sca/retirejs/retire-results.json"))
$grypeF    = @(Read-GrypeFindings   (Join-Path $dateDir "sca/syft-grype/grype-results.json"))

$sbomPath  = Join-Path $dateDir "sca/syft-grype/sbom-cyclonedx.json"
$sbomExist = Test-Path $sbomPath
$totalSca  = $depcheckF.Count + $osvF.Count + $retireF.Count + $grypeF.Count

$body = @"
<h2>Resumen SCA</h2>
<table class='meta-table'>
  <tr><td>Fecha de escaneo</td><td>$Date</td></tr>
  <tr><td>Total CVEs / vulnerabilidades</td><td>$totalSca</td></tr>
  <tr><td>SBOM CycloneDX generado</td><td>$(if ($sbomExist) { 'SI  -  ' + $sbomPath } else { 'NO' })</td></tr>
  <tr><td>Herramientas ejecutadas</td><td>OWASP Dependency-Check, OSV-Scanner, Retire.js, Syft+Grype</td></tr>
  <tr><td>Normas</td><td>CVSSv3.1, CWE/NVD, NTIA SBOM, NTP-ISO/IEC 12207, OWASP Top 10 A06</td></tr>
</table>

<div class='tool-section'>
  <div class='tool-header'>OWASP Dependency-Check  -  CVE en dependencias via NVD</div>
  $(Build-FindingsTable $depcheckF "OWASP Dependency-Check")
  <div class='normas'>Norma: OWASP Top 10 A06 (Vulnerable and Outdated Components), CVSSv3.1, CWE/NVD</div>
</div>

<div class='tool-section'>
  <div class='tool-header'>OSV-Scanner (Google)  -  Base de datos OSV (actualizacion mas rapida que NVD)</div>
  $(Build-FindingsTable $osvF "OSV-Scanner")
  <div class='normas'>Norma: CVSSv3.1, NTP-ISO/IEC 12207  -  OSV actualiza en horas vs. dias de NVD</div>
</div>

<div class='tool-section'>
  <div class='tool-header'>Retire.js  -  CVE en librerias JavaScript (bundled + minificadas)</div>
  $(Build-FindingsTable $retireF "Retire.js")
  <div class='normas'>Norma: OWASP Top 10 A06, CVSSv3.1  -  Detecta CVEs en JS minificado que NPM audit no encuentra</div>
</div>

<div class='tool-section'>
  <div class='tool-header'>Syft + Grype  -  SBOM CycloneDX + escaneo CVE</div>
  $(Build-FindingsTable $grypeF "Grype")
  <div class='normas'>Norma: NTIA SBOM, NTP-ISO/IEC 12207, CVSSv3.1  -  SBOM disponible en: $sbomPath</div>
</div>
"@

Write-Report -Titulo "Reporte SCA  -  $Date" -Subtitulo "Software Composition Analysis | REGINSA QA" -BodyContent $body -BaseName "reporte-sca-$Date"

# ──────────────────────────────────────────────────────────────
# REPORTE 3: DAST
# ──────────────────────────────────────────────────────────────
Write-Host "`n=== Generando reporte DAST ===" -ForegroundColor Cyan

$zapF      = @(Read-ZapFindings    (Join-Path $dateDir "dast/zap/zap-baseline-report.json"))
$nucleiF   = @(Read-NucleiFindings (Join-Path $dateDir "dast/nuclei/nuclei-results.json"))

$niktoHtml  = Join-Path $dateDir "dast/nikto/nikto-report.html"
$wapitiHtml = Join-Path $dateDir "dast/wapiti/wapiti-report.html"
$restlerTxt = Join-Path $dateDir "dast/restler/restler-results.txt"

$niktoStatus   = if (Test-Path $niktoHtml)  { "Generado: $niktoHtml"  } else { "No ejecutado o sin resultados" }
$wapitiStatus  = if (Test-Path $wapitiHtml) { "Generado: $wapitiHtml" } else { "No ejecutado o sin resultados" }
$restlerStatus = if (Test-Path $restlerTxt) { "Generado: $restlerTxt" } else { "No ejecutado o sin resultados" }

$totalDast = $zapF.Count + $nucleiF.Count
$targetUrl = if ($Target) { $Target } else { '(no definido)' }

$body = @"
<h2>Resumen DAST</h2>
<table class='meta-table'>
  <tr><td>Fecha de escaneo</td><td>$Date</td></tr>
  <tr><td>URL objetivo</td><td>$targetUrl</td></tr>
  <tr><td>Hallazgos parseables</td><td>$totalDast (ZAP + Nuclei)</td></tr>
  <tr><td>Herramientas ejecutadas</td><td>OWASP ZAP, Nikto, Wapiti, Nuclei, RESTler</td></tr>
  <tr><td>Normas</td><td>OWASP Top 10 2021, OWASP API Top 10 2023, NIST SP 800-115, OWASP ASVS V4-V9</td></tr>
</table>

<div class='tool-section'>
  <div class='tool-header'>OWASP ZAP  -  Baseline Scan (headers, CORS, XSS reflejado, SQLi, etc.)</div>
  $(Build-FindingsTable $zapF "OWASP ZAP")
  <div class='normas'>Norma: OWASP Top 10 2021, OWASP ASVS V4-V9, NIST SP 800-115</div>
</div>

<div class='tool-section'>
  <div class='tool-header'>Nuclei  -  5000+ Templates CVE + Misconfiguracion + Exposicion</div>
  $(Build-FindingsTable $nucleiF "Nuclei")
  <div class='normas'>Norma: CVSSv3.1, OWASP Top 10 2021, CWE/NVD  -  Templates actualizados diariamente</div>
</div>

<div class='tool-section'>
  <div class='tool-header'>Nikto  -  Escaneo Web Server (headers HTTP, configs defecto, software desactualizado)</div>
  <p>Estado: $niktoStatus</p>
  <p>Ver reporte HTML completo: <a href='$niktoHtml'>nikto-report.html</a></p>
  <div class='normas'>Norma: OWASP Top 10 A05 (Misconfiguration), A06 (Outdated), NIST SP 800-115</div>
</div>

<div class='tool-section'>
  <div class='tool-header'>Wapiti  -  DAST Activo (SQLi, XSS, XXE, SSRF, CRLF, Path Traversal)</div>
  <p>Estado: $wapitiStatus</p>
  <p>Ver reporte HTML completo: <a href='$wapitiHtml'>wapiti-report.html</a></p>
  <div class='normas'>Norma: OWASP Top 10 A01-A03, A06, NIST SP 800-115</div>
</div>

<div class='tool-section'>
  <div class='tool-header'>Microsoft RESTler  -  API Fuzzer OWASP API Top 10 2023</div>
  <p>Estado: $restlerStatus</p>
  <p>RESTler detecta: BOLA (API1), Broken Auth (API2), Broken Object Property (API3), SSRF (API7), Misconfig (API8), Injection (API9)</p>
  <div class='normas'>Norma: OWASP API Top 10 2023, OWASP ASVS V11, NIST SP 800-115</div>
</div>
"@

Write-Report -Titulo "Reporte DAST  -  $Date" -Subtitulo "Dynamic Application Security Testing | REGINSA QA" -BodyContent $body -BaseName "reporte-dast-$Date"

# ──────────────────────────────────────────────────────────────
# REPORTE 4: CONTAINER + INFRA
# ──────────────────────────────────────────────────────────────
Write-Host "`n=== Generando reporte Container + Infra ===" -ForegroundColor Cyan

$trivyF    = @(Read-TrivyFindings(Join-Path $dateDir "container/trivy/trivy-report.json"))
$lynisDat  = Join-Path $dateDir "infra/lynis/lynis-report.dat"
$lynisLog  = Join-Path $dateDir "infra/lynis/lynis.log"
$lynisStatus = if (Test-Path $lynisDat) { "Generado: $lynisDat" } else { "No ejecutado" }

$body = @"
<h2>Resumen Container + Infraestructura</h2>
<table class='meta-table'>
  <tr><td>Fecha de escaneo</td><td>$Date</td></tr>
  <tr><td>CVEs de container (Trivy)</td><td>$($trivyF.Count)</td></tr>
  <tr><td>Auditoria OS (Lynis)</td><td>$lynisStatus</td></tr>
  <tr><td>Herramientas ejecutadas</td><td>Trivy, Lynis</td></tr>
  <tr><td>Normas</td><td>CIS Benchmarks, NIST 800-190, ISO/IEC 27001 A.12, CVSSv3.1</td></tr>
</table>

<div class='tool-section'>
  <div class='tool-header'>Trivy  -  Filesystem + Container CVE + Misconfiguracion</div>
  $(Build-FindingsTable $trivyF "Trivy")
  <div class='normas'>Norma: NIST 800-190, CIS Docker Benchmark, CVSSv3.1</div>
</div>

<div class='tool-section'>
  <div class='tool-header'>Lynis  -  Auditoria de Hardening del Sistema Operativo</div>
  <p>Estado: $lynisStatus</p>
  <p>Lynis verifica: SSH configuration, file permissions, kernel parameters, running services,
     password policies, boot settings, network configuration, user accounts.</p>
  <p>Ver reporte completo: <a href='$lynisDat'>lynis-report.dat</a></p>
  $(if (Test-Path $lynisLog) {
    $warnCount = (Get-Content $lynisLog | Select-String "Warning").Count
    $suggCount = (Get-Content $lynisLog | Select-String "Suggestion").Count
    "<p><strong>Warnings: $warnCount | Suggestions: $suggCount</strong></p>"
  })
  <div class='normas'>Norma: CIS Benchmarks, ISO/IEC 27001 A.12, NTP-ISO/IEC 12207</div>
</div>
"@

Write-Report -Titulo "Reporte Container + Infra  -  $Date" -Subtitulo "Container e Infraestructura Security | REGINSA QA" -BodyContent $body -BaseName "reporte-container-infra-$Date"

# ──────────────────────────────────────────────────────────────
# REPORTE MAESTRO  -  Todos los hallazgos consolidados
# ──────────────────────────────────────────────────────────────
Write-Host "`n=== Generando reporte MAESTRO ===" -ForegroundColor Cyan

$todosFindings = @()
$todosFindings += $bearerF   | ForEach-Object { $_ | Add-Member -NotePropertyName Herramienta -NotePropertyValue "Bearer"        -Force -PassThru }
$todosFindings += $checkovF  | ForEach-Object { $_ | Add-Member -NotePropertyName Herramienta -NotePropertyValue "Checkov"       -Force -PassThru }
$todosFindings += $semgrepF  | ForEach-Object { $_ | Add-Member -NotePropertyName Herramienta -NotePropertyValue "Semgrep"       -Force -PassThru }
$todosFindings += $gitleaksF | ForEach-Object { $_ | Add-Member -NotePropertyName Herramienta -NotePropertyValue "Gitleaks"      -Force -PassThru }
$todosFindings += $truffleF  | ForEach-Object { $_ | Add-Member -NotePropertyName Herramienta -NotePropertyValue "TruffleHog"    -Force -PassThru }
$todosFindings += $depcheckF | ForEach-Object { $_ | Add-Member -NotePropertyName Herramienta -NotePropertyValue "DepCheck"      -Force -PassThru }
$todosFindings += $osvF      | ForEach-Object { $_ | Add-Member -NotePropertyName Herramienta -NotePropertyValue "OSV-Scanner"   -Force -PassThru }
$todosFindings += $retireF   | ForEach-Object { $_ | Add-Member -NotePropertyName Herramienta -NotePropertyValue "Retire.js"     -Force -PassThru }
$todosFindings += $grypeF    | ForEach-Object { $_ | Add-Member -NotePropertyName Herramienta -NotePropertyValue "Grype"         -Force -PassThru }
$todosFindings += $trivyF    | ForEach-Object { $_ | Add-Member -NotePropertyName Herramienta -NotePropertyValue "Trivy"         -Force -PassThru }
$todosFindings += $zapF      | ForEach-Object { $_ | Add-Member -NotePropertyName Herramienta -NotePropertyValue "ZAP"           -Force -PassThru }
$todosFindings += $nucleiF   | ForEach-Object { $_ | Add-Member -NotePropertyName Herramienta -NotePropertyValue "Nuclei"        -Force -PassThru }

$totalGeneral  = @($todosFindings).Count
$criticos      = @($todosFindings | Where-Object { $_.Severidad -eq 'CRITICO' }).Count
$altos         = @($todosFindings | Where-Object { $_.Severidad -eq 'ALTO'    }).Count
$medios        = @($todosFindings | Where-Object { $_.Severidad -eq 'MEDIO'   }).Count
$bajos         = @($todosFindings | Where-Object { $_.Severidad -eq 'BAJO'    }).Count

# Lee el resumen de ejecucion si existe
$resumenExecJson = Join-Path $dateDir "resumen-ejecutivo.json"
$resumenExec     = if (Test-Path $resumenExecJson) { Get-Content $resumenExecJson -Raw | ConvertFrom-Json } else { $null }
$herramientasHtml = ""
if ($resumenExec) {
  $rows = $resumenExec.herramientas | ForEach-Object {
    $estadoColor = switch ($_.estado) {
      "PASS" { "#27ae60" }
      "WARN" { "#e67e22" }
      "SKIP" { "#7f8c8d" }
      default { "#7f8c8d" }
    }
    "<tr><td>$($_.herramienta)</td><td>$($_.categoria.ToUpper())</td><td><span class='badge' style='background:$estadoColor'>$($_.estado)</span></td><td>$($_.duracion)</td></tr>"
  }
  $herramientasHtml = @"
<h2>Estado de Herramientas</h2>
<table class='findings'>
  <thead><tr><th>Herramienta</th><th>Categoria</th><th>Estado</th><th>Duracion</th></tr></thead>
  <tbody>$($rows -join "")</tbody>
</table>
"@
}

$topFindingsRows = (@($todosFindings | Where-Object { $_ -ne $null -and $_.PSObject.Properties['Severidad'] }) |
  Sort-Object { switch ($_.Severidad) { 'CRITICO' {0} 'ALTO' {1} 'MEDIO' {2} 'BAJO' {3} default {4} } } |
  Select-Object -First 50 | ForEach-Object {
    $color = Get-SeverityColor $_.Severidad
    "<tr><td><span class='badge' style='background:$color'>$($_.Severidad)</span></td><td>$($_.Herramienta)</td><td>$($_.Regla)</td><td>$($_.Mensaje)</td><td>$($_.Archivo)</td></tr>"
  })

# ──────────────────────────────────────────────────────────────
# RESUMEN SONARQUBE  -  consulta API y enlaza al reporte especifico
# Citar: reportes sonar-{projectKey}-ejecutivo-es.html / -desarrollador-es.html
# ──────────────────────────────────────────────────────────────
$sonarHtml = ""
$sonarUrl   = if ($env:SONAR_HOST_URL) { $env:SONAR_HOST_URL.Trim().TrimEnd('/') } else { 'http://localhost:9000' }
$sonarToken = $env:SONAR_TOKEN
$sonarProjectKeys = @('si091reginsabackend','si091reginsafrontend','si091reginsaenlinea')
$sonarRows = @()

if (-not [string]::IsNullOrWhiteSpace($sonarToken)) {
  try {
    $tokB = [System.Text.Encoding]::ASCII.GetBytes("$sonarToken`:")
    $sHdr = @{ Authorization = "Basic " + [Convert]::ToBase64String($tokB) }
    foreach ($pk in $sonarProjectKeys) {
      try {
        $mUrl = "$sonarUrl/api/measures/component?component=$pk&metricKeys=alert_status,bugs,vulnerabilities,security_hotspots,code_smells,coverage,security_hotspots_reviewed,reliability_rating,security_rating,sqale_rating,ncloc"
        $mRes = Invoke-RestMethod -Uri $mUrl -Headers $sHdr -Method Get -ErrorAction Stop
        $mp = @{}
        foreach ($m in $mRes.component.measures) { $mp[$m.metric] = $m.value }
        $qg = if ($mp.ContainsKey('alert_status')) { $mp['alert_status'] } else { 'UNKNOWN' }
        $qgColor = switch ($qg) { 'OK' {'#27ae60'} 'ERROR' {'#c0392b'} default {'#7f8c8d'} }
        $qgLabel = switch ($qg) { 'OK' {'PASSED'} 'ERROR' {'FAILED'} default {$qg} }
        $r2lvl = { param($r) switch ($r) {'1.0'{'A'} '2.0'{'B'} '3.0'{'C'} '4.0'{'D'} '5.0'{'E'} default{'-'} } }
        $relL = & $r2lvl ($mp['reliability_rating'])
        $secL = & $r2lvl ($mp['security_rating'])
        $mntL = & $r2lvl ($mp['sqale_rating'])
        $reportLink = "sonar-$pk-ejecutivo-es.html"
        $sonarRows += "<tr>" +
          "<td><strong>$($mRes.component.name)</strong><br/><small>$pk</small></td>" +
          "<td><span class='badge' style='background:$qgColor'>$qgLabel</span></td>" +
          "<td>$($mp['bugs']) ($relL)</td>" +
          "<td>$($mp['vulnerabilities']) ($secL)</td>" +
          "<td>$($mp['security_hotspots']) / $($mp['security_hotspots_reviewed'])%</td>" +
          "<td>$($mp['code_smells']) ($mntL)</td>" +
          "<td>$($mp['coverage'])%</td>" +
          "<td>$($mp['ncloc'])</td>" +
          "<td><a href='$reportLink'>Ver detalle</a><br/><a href='$sonarUrl/dashboard?id=$pk' target='_blank'>Dashboard</a></td>" +
          "</tr>"
      } catch {
        $sonarRows += "<tr><td colspan='9'><em>${pk}: sin datos en SonarQube ($_)</em></td></tr>"
      }
    }
    if ($sonarRows.Count -gt 0) {
      $sonarHtml = @"
<h2>Resumen SonarQube (Calidad y Seguridad de Codigo)</h2>
<p><small>Datos obtenidos en vivo desde <code>$sonarUrl</code> mediante API <code>/api/measures/component</code> y <code>/api/qualitygates/project_status</code>.
Calificaciones segun ISO/IEC 25010. Cada fila enlaza al reporte especifico generado por proyecto.</small></p>
<table class='findings'>
  <thead><tr>
    <th>Proyecto</th><th>Quality Gate</th><th>Bugs (Reliab.)</th><th>Vulnerab. (Sec.)</th>
    <th>Hotspots / % Rev.</th><th>Code Smells (Maint.)</th><th>Cobertura</th><th>LOC</th><th>Reporte</th>
  </tr></thead>
  <tbody>$($sonarRows -join "")</tbody>
</table>
"@
    }
  } catch {
    $sonarHtml = "<h2>Resumen SonarQube</h2><p><em>No se pudo consultar SonarQube en $sonarUrl ($_)</em></p>"
  }
} else {
  $sonarHtml = "<h2>Resumen SonarQube</h2><p><em>SONAR_TOKEN no definido. Define la variable de entorno para incluir metricas Sonar en este reporte.</em></p>"
}

$body = @"
$herramientasHtml

<h2>Resumen Ejecutivo</h2>
<table class='meta-table'>
  <tr><td>Fecha de escaneo</td><td>$Date</td></tr>
  <tr><td>URL objetivo</td><td>$targetUrl</td></tr>
  <tr><td>Total hallazgos parseables</td><td>$totalGeneral</td></tr>
  <tr><td>Critico / Alto</td><td style='color:#c0392b;font-weight:bold'>$criticos / $altos</td></tr>
  <tr><td>Medio / Bajo</td><td>$medios / $bajos</td></tr>
  <tr><td>Herramientas ejecutadas</td><td>Bearer, Checkov, Semgrep, Gitleaks, TruffleHog, DepCheck, OSV, RetireJS, Grype, Trivy, ZAP, Nuclei, Wapiti, Nikto, RESTler, Lynis, SonarQube</td></tr>
  <tr><td>Normas aplicadas</td><td>OWASP ASVS 4.0, OWASP Top 10 2021, OWASP API Top 10 2023, ISO/IEC 27001, ISO/IEC 25010, NIST SP 800-115, CVSSv3.1, CIS Benchmarks, NTIA SBOM</td></tr>
</table>

$sonarHtml

<h2>Top 50 Hallazgos por Severidad</h2>
<table class='findings'>
  <thead><tr><th>Severidad</th><th>Herramienta</th><th>Regla / CVE</th><th>Descripcion</th><th>Archivo / Paquete</th></tr></thead>
  <tbody>$($topFindingsRows -join "")</tbody>
</table>

<h2>Reportes por Categoria</h2>
<ul>
  <li><a href='reporte-sast-$Date.html'>Reporte SAST</a>  -  Bearer, Checkov, Semgrep, Gitleaks, TruffleHog</li>
  <li><a href='reporte-sca-$Date.html'>Reporte SCA</a>  -  DepCheck, OSV, RetireJS, Grype (+SBOM CycloneDX)</li>
  <li><a href='reporte-dast-$Date.html'>Reporte DAST</a>  -  ZAP, Nikto, Wapiti, Nuclei, RESTler</li>
  <li><a href='reporte-container-infra-$Date.html'>Reporte Container + Infra</a>  -  Trivy, Lynis</li>
</ul>

<p class='normas'>
  Clasificacion de severidad segun CVSSv3.1: Critico (CVSS 9.0-10.0), Alto (7.0-8.9), Medio (4.0-6.9), Bajo (0.1-3.9).<br/>
  Normas aplicadas: OWASP ASVS 4.0, OWASP Top 10 2021, OWASP API Top 10 2023, ISO/IEC 27001 A.9/A.12/A.14/A.16,
  NIST SP 800-115, ISO/IEC 25010, NTP-ISO/IEC 12207, CVSSv3.1, CIS Benchmarks, NTIA SBOM.
</p>
"@

Write-Report -Titulo "Reporte Maestro de Seguridad  -  $Date" -Subtitulo "SAST + SCA + DAST + Container + Infra | REGINSA QA" -BodyContent $body -BaseName "reporte-maestro-seguridad-$Date"

# ──────────────────────────────────────────────────────────────
# RESUMEN FINAL EN CONSOLA
# ──────────────────────────────────────────────────────────────
Write-Host "`n======================================================" -ForegroundColor Green
Write-Host "  REPORTES GENERADOS  -  $Date" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  Carpeta : $dateDir" -ForegroundColor Cyan
Write-Host "  SAST    : reporte-sast-$Date.html/.docx" -ForegroundColor White
Write-Host "  SCA     : reporte-sca-$Date.html/.docx" -ForegroundColor White
Write-Host "  DAST    : reporte-dast-$Date.html/.docx" -ForegroundColor White
Write-Host "  Infra   : reporte-container-infra-$Date.html/.docx" -ForegroundColor White
Write-Host "  MAESTRO : reporte-maestro-seguridad-$Date.html/.docx" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Total hallazgos: $totalGeneral  (Critico:$criticos  Alto:$altos  Medio:$medios  Bajo:$bajos)" -ForegroundColor $(if ($criticos -gt 0) { "Red" } elseif ($altos -gt 0) { "Yellow" } else { "Green" })
Write-Host ""
Write-Host "  Abre el reporte maestro en Word/browser:" -ForegroundColor Cyan
Write-Host "  $dateDir\reporte-maestro-seguridad-$Date.html" -ForegroundColor White
Write-Host "======================================================`n" -ForegroundColor Green
