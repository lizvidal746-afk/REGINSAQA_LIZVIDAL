<#
.SYNOPSIS
    Normaliza hallazgos: filtra falsos positivos, deduplica y agrupa por clave canonica.

.DESCRIPTION
    Lee un JSON consolidado (extraer-hallazgos.ps1) y produce un JSON normalizado:
      - Excluye rutas que son falsos positivos conocidos (.nuclei-templates, reportes/, .vscode/)
      - Agrupa por CVE / regla Semgrep / regla Checkov / SonarQube rule+componente
      - Cuenta ocurrencias y consolida archivos afectados
      - Asigna business_area heuristica (Sanciones | Login | Backend | Frontend | Pipeline | General)
      - Salida lista para consumo por analyze-findings.ps1 u Ollama

.EXAMPLE
    pwsh scripts/ai/normalize-findings.ps1
    pwsh scripts/ai/normalize-findings.ps1 -InputJson reportes/informes/hallazgos-consolidados-2026-05-06_16-15.json

.NOTES
    Compatible con PowerShell 5.1+ y 7+.
    Reduce tipicamente 600+ hallazgos a 40-60 accionables.
#>
[CmdletBinding()]
param(
    [string]$InputJson  = "",
    [string]$OutputJson = "",
    [switch]$AutoLatest
)

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

function Get-Prop { param($obj, [string]$name, $default = '')
    if ($null -eq $obj) { return $default }
    if ($obj.PSObject.Properties.Name -contains $name) {
        $v = $obj.$name
        if ($null -eq $v) { return $default }
        return $v
    }
    return $default
}

$Root        = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$InformesDir = Join-Path $Root 'reportes\informes'

# Auto-resolver el JSON mas reciente si no se paso ruta
if (-not $InputJson) {
    $latest = Get-ChildItem -Path $InformesDir -Filter 'hallazgos-consolidados-*.json' -File |
              Sort-Object Name -Descending | Select-Object -First 1
    if (-not $latest) { throw "No se encontro hallazgos-consolidados-*.json en $InformesDir" }
    $InputJson = $latest.FullName
}
if (-not $OutputJson) {
    $stamp = if ([IO.Path]::GetFileNameWithoutExtension($InputJson) -match '(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})') { $Matches[1] } else { Get-Date -Format 'yyyy-MM-dd_HH-mm' }
    $OutputJson = Join-Path $InformesDir "findings-normalized-$stamp.json"
}

Write-Host "`n=== NORMALIZACION DE HALLAZGOS ===" -ForegroundColor Magenta
Write-Host "  Input : $InputJson" -ForegroundColor Cyan
Write-Host "  Output: $OutputJson" -ForegroundColor Cyan

$data       = Get-Content $InputJson -Raw -Encoding UTF8 | ConvertFrom-Json
$hallazgos  = @($data.hallazgos)
$totalRaw   = $hallazgos.Count

# ── Reglas de exclusion (rutas que son falsos positivos clarisimos) ──
$excludePaths = @(
    '/.nuclei-templates/',
    '\.nuclei-templates\',
    '/reportes/newman/',
    '\reportes\newman\',
    '/reportes/security/',
    '\reportes\security\',
    '/reportes/informes/',
    '\reportes\informes\',
    '/.vscode/',
    '\.vscode\',
    '/node_modules/',
    '\node_modules\',
    '/test-files/',
    '\test-files\'
)

# ── Patrones que son falsos positivos por contenido ──
$excludePatternsInPath = @(
    'cve-2023-34039-keys',     # claves de ejemplo
    'detected-private-key.*nuclei',
    'detected-jwt-token.*reportes',
    'helpers/payloads',
    'helpers\\payloads'
)

function Test-IsFalsePositive {
    param($h)
    $path = ((Get-Prop $h 'componente_afectado') + ' ' + (Get-Prop $h 'impacto_tecnico')).ToString().ToLower()
    foreach ($p in $excludePaths)         { if ($path -like "*$($p.ToLower())*") { return $true } }
    foreach ($p in $excludePatternsInPath) { if ($path -match $p)                  { return $true } }
    return $false
}

# ── Clave de agrupacion canonica ──
function Get-GroupKey {
    param($h)
    $hall = [string](Get-Prop $h 'hallazgo' '')
    $herr = [string](Get-Prop $h 'herramienta' 'unknown')
    if (-not $herr) { $herr = 'unknown' }

    # 1. CVE - mas confiable
    if ($hall -match '(CVE-\d{4}-\d{4,7})') { return "CVE::$($Matches[1])" }
    if ($hall -match '(GHSA-[a-z0-9-]+)')   { return "GHSA::$($Matches[1])" }

    # 2. Reglas Checkov
    if ($hall -match '(CKV2?_[A-Z0-9_]+)')  { return "CHECKOV::$($Matches[1])" }

    # 3. Reglas Semgrep [rule.id]
    if ($hall -match '^\[([^\]]+)\]')       { return "SEMGREP::$($Matches[1])" }

    # 4. SonarQube: agrupar por regla detectada
    if ($herr -eq 'SonarQube' -and $hall -match '([A-Z][a-zA-Z]+:[A-Z][a-zA-Z0-9]+)') {
        $compRaw = [string](Get-Prop $h 'componente_afectado' 'global')
        $comp = if ($compRaw) { Split-Path -Leaf $compRaw } else { 'global' }
        return "SONAR::$($Matches[1])::$comp"
    }

    # 5. Bearer / Trivy / OSV / RetireJS / ZAP / Nuclei: por titulo normalizado
    $titleNorm = ($hall -replace '\s+', ' ').Trim()
    if ($titleNorm.Length -gt 80) { $titleNorm = $titleNorm.Substring(0, 80) }
    return "$herr`::$titleNorm"
}

# ── Heuristica de business_area (sin IA, basada en path) ──
function Get-BusinessArea {
    param($h)
    $path = ((Get-Prop $h 'componente_afectado') + ' ' + (Get-Prop $h 'impacto_tecnico')).ToString().ToLower()
    if ($path -match 'login|auth|jwt|token|password') { return 'Autenticacion' }
    if ($path -match 'sancion')                       { return 'Sanciones' }
    if ($path -match 'administrad')                   { return 'Administrados' }
    if ($path -match 'enlinea|portal|frontend|angular|\.html|\.ts|\.scss') { return 'Frontend' }
    if ($path -match 'backend|spring|java|controller|service|repository|\.cs|\.deps\.json') { return 'Backend' }
    if ($path -match '\.github/workflows|workflows\\|pipelines/|jenkinsfile|buildspec|azure-pipelines') { return 'Pipeline' }
    if ($path -match 'docker|dockerfile|kubernetes|k8s|helm') { return 'Infraestructura' }
    return 'General'
}

# ── Heuristica de exploitability (sin IA) ──
function Get-Exploitability {
    param($h, $isProductionPath)
    $sev = [string](Get-Prop $h 'severidad' '')
    if (-not $isProductionPath) { return 'BAJA' }
    $hall = [string](Get-Prop $h 'hallazgo' '')
    if ($sev -eq 'CRITICA' -and $hall -match 'CVE-|GHSA-|RCE|injection|xss') { return 'ALTA' }
    if ($sev -eq 'CRITICA') { return 'MEDIA' }
    if ($sev -eq 'ALTA')    { return 'MEDIA' }
    return 'BAJA'
}

function Get-RemediationPriority {
    param($severity, $exploitability, $businessArea)
    $isCriticalArea = $businessArea -in @('Autenticacion','Sanciones','Administrados','Backend','Frontend')
    if ($severity -eq 'CRITICA' -and $exploitability -eq 'ALTA' -and $isCriticalArea) { return 'INMEDIATA' }
    if ($severity -eq 'CRITICA' -and $isCriticalArea)                                  { return 'SPRINT_ACTUAL' }
    if ($severity -eq 'CRITICA')                                                       { return 'SPRINT_N+1' }
    if ($severity -eq 'ALTA' -and $isCriticalArea)                                     { return 'SPRINT_N+1' }
    if ($severity -eq 'ALTA')                                                          { return 'SPRINT_N+2' }
    return 'BACKLOG'
}

function Get-EffortHours {
    param($groupKey, $occurrenceCount)
    if ($groupKey -like 'CVE::*' -or $groupKey -like 'GHSA::*') { return 2 }       # actualizar dependencia
    if ($groupKey -like 'CHECKOV::*') { return [Math]::Min(8, [Math]::Max(1, $occurrenceCount * 0.25)) }
    if ($groupKey -like 'SEMGREP::*') { return [Math]::Min(8, [Math]::Max(1, $occurrenceCount * 0.5)) }
    if ($groupKey -like 'SONAR::*')   { return [Math]::Min(4, [Math]::Max(0.5, $occurrenceCount * 0.25)) }
    return 2
}

# ── PROCESO ──
$fpRemoved = 0
$groups    = @{}

foreach ($h in $hallazgos) {
    if (Test-IsFalsePositive $h) { $fpRemoved++; continue }

    $key = Get-GroupKey $h
    if (-not $groups.ContainsKey($key)) {
        $groups[$key] = [ordered]@{
            group_key             = $key
            severity              = [string](Get-Prop $h 'severidad' 'MEDIA')
            tool                  = [string](Get-Prop $h 'herramienta' 'unknown')
            title                 = [string](Get-Prop $h 'hallazgo' '')
            iso25010              = [string](Get-Prop $h 'caracteristica_iso25010' '')
            recomendacion_base    = [string](Get-Prop $h 'recomendacion' '')
            significado_base      = [string](Get-Prop $h 'significado' '')
            occurrences           = New-Object System.Collections.Generic.List[object]
            affected_components   = New-Object System.Collections.Generic.List[string]
            cve_id                = if ($key -like 'CVE::*')  { $key.Substring(5) } else { '' }
            ghsa_id               = if ($key -like 'GHSA::*') { $key.Substring(6) } else { '' }
            first_seen            = [string](Get-Prop $h 'fecha_deteccion' '')
        }
    }
    $groups[$key].occurrences.Add(@{
        component   = [string](Get-Prop $h 'componente_afectado' '')
        evidence    = [string](Get-Prop $h 'impacto_tecnico' '')
        original_id = [string](Get-Prop $h 'id' '')
    }) | Out-Null
    $compName = [string](Get-Prop $h 'componente_afectado' '')
    if ($compName -and -not $groups[$key].affected_components.Contains($compName)) {
        $groups[$key].affected_components.Add($compName) | Out-Null
    }
}

# ── Construir findings normalizados ──
$findings = New-Object System.Collections.Generic.List[object]
foreach ($key in $groups.Keys) {
    $g = $groups[$key]
    # Determinar si la mayoria de ocurrencias estan en path productivo
    $prodCount = 0
    foreach ($occ in $g.occurrences) {
        $p = [string]$occ.component
        if ($p -notmatch 'nuclei-templates|node_modules|test|reportes|\.vscode') { $prodCount++ }
    }
    $isProd = $prodCount -gt ($g.occurrences.Count / 2)

    # Sample component para business_area
    $sample = [PSCustomObject]@{
        componente_afectado = if ($g.affected_components.Count -gt 0) { $g.affected_components[0] } else { '' }
        impacto_tecnico     = if ($g.occurrences.Count -gt 0) { $g.occurrences[0].evidence } else { '' }
    }
    $area      = Get-BusinessArea $sample
    $expl      = Get-Exploitability -h $sample -isProductionPath $isProd
    $priority  = Get-RemediationPriority -severity $g.severity -exploitability $expl -businessArea $area
    $effort    = Get-EffortHours -groupKey $key -occurrenceCount $g.occurrences.Count

    $findings.Add([PSCustomObject]@{
        group_key                 = $g.group_key
        severity                  = $g.severity
        tool                      = $g.tool
        title                     = $g.title
        iso25010                  = $g.iso25010
        cve_id                    = $g.cve_id
        ghsa_id                   = $g.ghsa_id
        occurrence_count          = $g.occurrences.Count
        affected_files_sample     = ($g.affected_components | Select-Object -First 5)
        affected_files_total      = $g.affected_components.Count
        business_area             = $area
        exploitability            = $expl
        remediation_priority      = $priority
        estimated_effort_hours    = $effort
        is_production_path        = $isProd
        first_seen                = $g.first_seen
        recomendacion_base        = $g.recomendacion_base
        significado_base          = $g.significado_base
        # Campos a llenar por Ollama (analyze-findings.ps1)
        ai_risk_analysis          = ''
        ai_business_impact        = ''
        ai_remediation_detail     = ''
        ai_priority_score         = 0
    }) | Out-Null
}

# Ordenar por severidad y prioridad
$sevOrder = @{ 'CRITICA' = 0; 'ALTA' = 1; 'MEDIA' = 2; 'BAJA' = 3; 'INFO' = 4 }
$prioOrder = @{ 'INMEDIATA' = 0; 'SPRINT_ACTUAL' = 1; 'SPRINT_N+1' = 2; 'SPRINT_N+2' = 3; 'BACKLOG' = 4 }
$findingsSorted = $findings | Sort-Object `
    @{ Expression = { $sevOrder[$_.severity]  ?? 99 } }, `
    @{ Expression = { $prioOrder[$_.remediation_priority] ?? 99 } }, `
    @{ Expression = { -$_.occurrence_count } }

$totalNorm = $findingsSorted.Count
$dupGrouped = $totalRaw - $fpRemoved - $totalNorm

$reduction = if ($totalRaw -gt 0) { [Math]::Round(100 - ($totalNorm / [double]$totalRaw * 100), 1) } else { 0 }

$report = [ordered]@{
    meta = [ordered]@{
        source_file              = $InputJson
        generated_at             = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        total_raw                = $totalRaw
        false_positives_removed  = $fpRemoved
        duplicates_grouped       = $dupGrouped
        total_normalized         = $totalNorm
        reduction_percentage     = $reduction
    }
    summary_by_severity = [ordered]@{
        CRITICA = @($findingsSorted | Where-Object { $_.severity -eq 'CRITICA' }).Count
        ALTA    = @($findingsSorted | Where-Object { $_.severity -eq 'ALTA' }).Count
        MEDIA   = @($findingsSorted | Where-Object { $_.severity -eq 'MEDIA' }).Count
        BAJA    = @($findingsSorted | Where-Object { $_.severity -eq 'BAJA' }).Count
    }
    summary_by_priority = [ordered]@{
        INMEDIATA      = @($findingsSorted | Where-Object { $_.remediation_priority -eq 'INMEDIATA' }).Count
        SPRINT_ACTUAL  = @($findingsSorted | Where-Object { $_.remediation_priority -eq 'SPRINT_ACTUAL' }).Count
        'SPRINT_N+1'   = @($findingsSorted | Where-Object { $_.remediation_priority -eq 'SPRINT_N+1' }).Count
        'SPRINT_N+2'   = @($findingsSorted | Where-Object { $_.remediation_priority -eq 'SPRINT_N+2' }).Count
        BACKLOG        = @($findingsSorted | Where-Object { $_.remediation_priority -eq 'BACKLOG' }).Count
    }
    summary_by_business_area = @{}
    findings = $findingsSorted
}
foreach ($area in @('Autenticacion','Sanciones','Administrados','Backend','Frontend','Pipeline','Infraestructura','General')) {
    $report.summary_by_business_area[$area] = @($findingsSorted | Where-Object { $_.business_area -eq $area }).Count
}

$report | ConvertTo-Json -Depth 8 | Out-File -FilePath $OutputJson -Encoding UTF8

Write-Host "`n  RESUMEN:" -ForegroundColor Yellow
Write-Host "    Hallazgos crudos       : $totalRaw"
Write-Host "    Falsos positivos       : $fpRemoved" -ForegroundColor DarkGray
Write-Host "    Duplicados agrupados   : $dupGrouped" -ForegroundColor DarkGray
Write-Host "    Hallazgos normalizados : $totalNorm" -ForegroundColor Green
Write-Host "    Reduccion              : $reduction%" -ForegroundColor Green
Write-Host "`n  Por severidad: CRITICA $($report.summary_by_severity.CRITICA) | ALTA $($report.summary_by_severity.ALTA) | MEDIA $($report.summary_by_severity.MEDIA) | BAJA $($report.summary_by_severity.BAJA)"
Write-Host "  Por prioridad: INMEDIATA $($report.summary_by_priority.INMEDIATA) | SPRINT_ACTUAL $($report.summary_by_priority.SPRINT_ACTUAL) | N+1 $($report.summary_by_priority.'SPRINT_N+1') | N+2 $($report.summary_by_priority.'SPRINT_N+2') | BACKLOG $($report.summary_by_priority.BACKLOG)"
Write-Host "`n  [OK] Generado: $OutputJson" -ForegroundColor Green
