<#
.SYNOPSIS
    Comparativo inteligente de hallazgos entre dos corridas, con KPIs, SLA y tendencias.

.DESCRIPTION
    Lee dos JSONs normalizados/analizados y genera:
      - Matriz comparativa de KPIs ANTES vs DESPUES con tendencia visual
      - Hallazgos resueltos / nuevos / persistentes con dias-abierto y SLA
      - Proyeccion lineal de cuando estaria limpio el sistema
      - Salida Markdown lista para incrustar en informe Word

    Los hallazgos se matchean por group_key (CVE / GHSA / CKV / regla Semgrep / SonarQube rule+componente).

.EXAMPLE
    pwsh scripts/ai/comparativo-ia.ps1
    pwsh scripts/ai/comparativo-ia.ps1 -PreviousJson <ruta> -CurrentJson <ruta>

.NOTES
    SLA por defecto:
      - CRITICA: 3 dias
      - ALTA   : 7 dias
      - MEDIA  : 30 dias
      - BAJA   : 90 dias
#>
[CmdletBinding()]
param(
    [string]$PreviousJson = "",
    [string]$CurrentJson  = "",
    [string]$OutputMd     = ""
)

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

$Root        = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$InformesDir = Join-Path $Root 'reportes\informes'

# ── Auto-detectar las dos corridas mas recientes con FECHAS distintas ──
function Get-FechaCorta { param([string]$n) if ($n -match '(\d{4}-\d{2}-\d{2})') { $matches[1] } else { $null } }

if (-not $CurrentJson -or -not $PreviousJson) {
    # Preferir analyzed > normalized > consolidados
    $candidates = @()
    foreach ($pat in @('findings-analyzed-*.json','findings-normalized-*.json','hallazgos-consolidados-*.json')) {
        $candidates = Get-ChildItem -Path $InformesDir -Filter $pat -File | Sort-Object Name -Descending
        if ($candidates.Count -ge 2) { break }
    }
    if ($candidates.Count -lt 2) { throw "Se requieren 2 archivos en $InformesDir para comparar" }

    $cur = $candidates[0]
    $fcur = Get-FechaCorta $cur.Name
    $prev = $candidates | Select-Object -Skip 1 | Where-Object { (Get-FechaCorta $_.Name) -ne $fcur } | Select-Object -First 1
    if (-not $prev) { throw "Solo hay corridas del mismo dia ($fcur)" }
    if (-not $CurrentJson)  { $CurrentJson  = $cur.FullName }
    if (-not $PreviousJson) { $PreviousJson = $prev.FullName }
}

if (-not $OutputMd) {
    $stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm'
    $OutputMd = Join-Path $InformesDir "comparativo-ia-$stamp.md"
}

Write-Host "`n=== COMPARATIVO IA REGINSA ===" -ForegroundColor Magenta
Write-Host "  Anterior: $PreviousJson" -ForegroundColor Cyan
Write-Host "  Actual  : $CurrentJson"  -ForegroundColor Cyan
Write-Host "  Output  : $OutputMd"     -ForegroundColor Cyan

# ── Cargar y adaptar formato (acepta normalized/analyzed o crudo) ──
function Load-Findings {
    param([string]$Path)
    $j = Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.PSObject.Properties.Name -contains 'findings') {
        # Ya esta normalizado/analyzed
        return @{ findings = @($j.findings); meta = $j.meta; kind = 'normalized' }
    }
    # Crudo: convertir cada hallazgo a estructura minima compatible
    $list = @()
    foreach ($h in $j.hallazgos) {
        $key = if ($h.hallazgo -match '(CVE-\d{4}-\d{4,7})') { "CVE::$($Matches[1])" }
               elseif ($h.hallazgo -match '(GHSA-[a-z0-9-]+)') { "GHSA::$($Matches[1])" }
               elseif ($h.hallazgo -match '(CKV2?_[A-Z0-9_]+)') { "CHECKOV::$($Matches[1])" }
               elseif ($h.hallazgo -match '^\[([^\]]+)\]')      { "SEMGREP::$($Matches[1])" }
               else { "$($h.herramienta)::$([string]$h.hallazgo).Substring(0,[Math]::Min(80,([string]$h.hallazgo).Length))" }
        $list += [PSCustomObject]@{
            group_key            = $key
            severity             = [string]$h.severidad
            title                = [string]$h.hallazgo
            tool                 = [string]$h.herramienta
            business_area        = 'General'
            occurrence_count     = 1
            estimated_effort_hours = 2
            remediation_priority = 'BACKLOG'
            first_seen           = if ($h.fecha_deteccion) { [string]$h.fecha_deteccion } else { '' }
        }
    }
    return @{ findings = $list; meta = $j.meta; kind = 'raw' }
}

$prev = Load-Findings $PreviousJson
$curr = Load-Findings $CurrentJson

$prevByKey = @{}
foreach ($f in $prev.findings) { $prevByKey[$f.group_key] = $f }
$currByKey = @{}
foreach ($f in $curr.findings) { $currByKey[$f.group_key] = $f }

# ── Clasificar ──
$resolved    = New-Object System.Collections.Generic.List[object]
$newOnes     = New-Object System.Collections.Generic.List[object]
$persistent  = New-Object System.Collections.Generic.List[object]

foreach ($k in $prevByKey.Keys) {
    if (-not $currByKey.ContainsKey($k)) { $resolved.Add($prevByKey[$k]) | Out-Null }
}
foreach ($k in $currByKey.Keys) {
    if (-not $prevByKey.ContainsKey($k)) { $newOnes.Add($currByKey[$k]) | Out-Null }
    else { $persistent.Add($currByKey[$k]) | Out-Null }
}

# ── SLA: dias abierto ──
$slaMap = @{ 'CRITICA' = 3; 'ALTA' = 7; 'MEDIA' = 30; 'BAJA' = 90 }
function Get-DaysOpen {
    param($f)
    if (-not $f.first_seen) { return 0 }
    try {
        $d = [DateTime]::Parse($f.first_seen)
        return [int]([DateTime]::Now - $d).TotalDays
    } catch { return 0 }
}
function Get-SlaStatus {
    param($f)
    $days = Get-DaysOpen $f
    $sla  = $slaMap[$f.severity]; if (-not $sla) { $sla = 30 }
    if ($days -gt $sla)        { return @{ status = 'FUERA_SLA'; days = $days; sla = $sla } }
    if ($days -gt ($sla * 0.7)) { return @{ status = 'PROXIMO_VENCER'; days = $days; sla = $sla } }
    return @{ status = 'EN_SLA'; days = $days; sla = $sla }
}

# ── Resumenes por severidad ──
function Resumir { param($lista)
    @{
        Total   = @($lista).Count
        CRITICA = @($lista | Where-Object { $_.severity -eq 'CRITICA' }).Count
        ALTA    = @($lista | Where-Object { $_.severity -eq 'ALTA' }).Count
        MEDIA   = @($lista | Where-Object { $_.severity -eq 'MEDIA' }).Count
        BAJA    = @($lista | Where-Object { $_.severity -eq 'BAJA' }).Count
    }
}
$rPrev = Resumir $prev.findings
$rCurr = Resumir $curr.findings
$rRes  = Resumir $resolved
$rNew  = Resumir $newOnes
$rPers = Resumir $persistent

# ── KPIs ──
function Tendencia { param([double]$ant, [double]$act, [switch]$invertir)
    if ($ant -eq 0 -and $act -eq 0) { return @{ icon = '⏹'; pct = '0%'; verde = $true } }
    if ($ant -eq 0) { return @{ icon = '🔴'; pct = '+inf'; verde = $false } }
    $delta = (($act - $ant) / $ant) * 100
    $deltaR = [Math]::Round($delta, 1)
    $sign = if ($deltaR -gt 0) { '+' } else { '' }
    $bueno = if ($invertir) { $delta -le 0 } else { $delta -ge 0 }
    $icon = if ($bueno -and [Math]::Abs($delta) -lt 5) { '⏹' } elseif ($bueno) { '🟢' } else { '🔴' }
    @{ icon = $icon; pct = "$sign$deltaR%"; verde = $bueno }
}

$tTotal  = Tendencia -ant $rPrev.Total   -act $rCurr.Total   -invertir
$tCrit   = Tendencia -ant $rPrev.CRITICA -act $rCurr.CRITICA -invertir
$tAlta   = Tendencia -ant $rPrev.ALTA    -act $rCurr.ALTA    -invertir
$tMedia  = Tendencia -ant $rPrev.MEDIA   -act $rCurr.MEDIA   -invertir
$tBaja   = Tendencia -ant $rPrev.BAJA    -act $rCurr.BAJA    -invertir

$tasaResol = if ($rPrev.Total -gt 0) { [Math]::Round(($resolved.Count / [double]$rPrev.Total) * 100, 1) } else { 0 }

# Calculo dias promedio abierto entre criticos persistentes
$daysList = @()
foreach ($f in $persistent | Where-Object { $_.severity -eq 'CRITICA' }) { $daysList += (Get-DaysOpen $f) }
$diasPromedio = if ($daysList.Count -gt 0) { [Math]::Round(($daysList | Measure-Object -Average).Average, 1) } else { 0 }

# SLA cumplimiento
$enSla = 0; $totalCheck = 0
foreach ($f in $persistent) { $totalCheck++; if ((Get-SlaStatus $f).status -eq 'EN_SLA') { $enSla++ } }
$slaCompl = if ($totalCheck -gt 0) { [Math]::Round(($enSla / [double]$totalCheck) * 100, 1) } else { 100 }

# Indice de calidad
$pctCrit = if ($rCurr.Total -gt 0) { ($rCurr.CRITICA / [double]$rCurr.Total) * 100 } else { 0 }
$indCal  = [Math]::Max(0, 100 - ($pctCrit * 3) - ((100 - $slaCompl) * 0.5))
$indCal  = [Math]::Round($indCal, 1)

# Proyeccion: si tasa actual de resolucion (resueltos/ciclo) se mantiene
$velResol = $resolved.Count
$ciclosLimpiar = if ($velResol -gt 0) { [Math]::Ceiling($rCurr.Total / [double]$velResol) } else { '∞' }

# ── Construir Markdown ──
$now = Get-Date -Format 'dd/MM/yyyy HH:mm'
$prevDate = if ($prev.meta.PSObject.Properties.Name -contains 'generated_at') { $prev.meta.generated_at } elseif ($prev.meta.PSObject.Properties.Name -contains 'fecha_extraccion') { $prev.meta.fecha_extraccion } else { 'N/D' }
$currDate = if ($curr.meta.PSObject.Properties.Name -contains 'generated_at') { $curr.meta.generated_at } elseif ($curr.meta.PSObject.Properties.Name -contains 'fecha_extraccion') { $curr.meta.fecha_extraccion } else { 'N/D' }

$frase = if ($rCurr.CRITICA -gt 0 -and $tasaResol -lt 20)  { '❌ NO APTO — alta cantidad de criticos sin resolver' }
         elseif ($rCurr.CRITICA -gt 0)                     { '⚠️ APTO CON RESERVAS — atender criticos antes del release' }
         elseif ($tCrit.verde -and $tasaResol -gt 30)      { '✅ APTO — tendencia positiva sostenida' }
         else                                              { '⚠️ APTO CON RESERVAS' }

$md = @"
# INFORME COMPARATIVO DE SEGUIMIENTO QA

**Sistema:** SI-091 REGINSA — SUNEDU
**Generado:** $now
**Corrida anterior:** $prevDate
**Corrida actual:** $currDate

> **Estado:** $frase

---

## 1. MATRIZ COMPARATIVA DE KPIs

| Indicador | Anterior | Actual | Tendencia |
| --- | --- | --- | --- |
| Hallazgos accionables | $($rPrev.Total) | $($rCurr.Total) | $($tTotal.icon) $($tTotal.pct) |
| 🔴 CRITICOS | $($rPrev.CRITICA) | $($rCurr.CRITICA) | $($tCrit.icon) $($tCrit.pct) |
| 🟠 ALTOS | $($rPrev.ALTA) | $($rCurr.ALTA) | $($tAlta.icon) $($tAlta.pct) |
| 🟡 MEDIOS | $($rPrev.MEDIA) | $($rCurr.MEDIA) | $($tMedia.icon) $($tMedia.pct) |
| 🟢 BAJOS | $($rPrev.BAJA) | $($rCurr.BAJA) | $($tBaja.icon) $($tBaja.pct) |
| Resueltos en ciclo | — | $($resolved.Count) | ✅ |
| Nuevos en ciclo | — | $($newOnes.Count) | $(if ($newOnes.Count -le $resolved.Count) {'🟢'} else {'🟡'}) |
| Persistentes | — | $($persistent.Count) | — |
| Tasa de resolucion | — | $tasaResol% | $(if ($tasaResol -ge 20) {'🟢'} else {'🔴'}) |
| Dias prom. abierto (CRIT) | — | $diasPromedio | $(if ($diasPromedio -le 7) {'🟢'} elseif ($diasPromedio -le 30) {'🟡'} else {'🔴'}) |
| Cumplimiento SLA | — | $slaCompl% | $(if ($slaCompl -ge 80) {'🟢'} elseif ($slaCompl -ge 60) {'🟡'} else {'🔴'}) |
| Indice de calidad QA | — | $indCal/100 | $(if ($indCal -ge 70) {'🟢'} elseif ($indCal -ge 50) {'🟡'} else {'🔴'}) |

---

## 2. HALLAZGOS RESUELTOS ($($resolved.Count))

"@

if ($resolved.Count -eq 0) {
    $md += "_Sin resoluciones en este ciclo._`n"
} else {
    $md += "| Severidad | Hallazgo | Herramienta |`n| --- | --- | --- |`n"
    foreach ($r in ($resolved | Select-Object -First 20)) {
        $t = $r.title; if ($t.Length -gt 80) { $t = $t.Substring(0,77)+'...' }
        $t = $t -replace '\|','\|'
        $md += "| ✅ $($r.severity) | $t | $($r.tool) |`n"
    }
    if ($resolved.Count -gt 20) { $md += "_... y $($resolved.Count - 20) mas_`n" }
}

$md += @"

---

## 3. HALLAZGOS NUEVOS ($($newOnes.Count))

"@
if ($newOnes.Count -eq 0) {
    $md += "_Sin hallazgos nuevos. Excelente._`n"
} else {
    $md += "| Severidad | Area | Hallazgo | Esfuerzo | Prioridad |`n| --- | --- | --- | --- | --- |`n"
    $newSorted = $newOnes | Sort-Object @{ Expression = { @{'CRITICA'=0;'ALTA'=1;'MEDIA'=2;'BAJA'=3}[$_.severity] } }
    foreach ($n in ($newSorted | Select-Object -First 25)) {
        $t = $n.title; if ($t.Length -gt 70) { $t = $t.Substring(0,67)+'...' }
        $t = $t -replace '\|','\|'
        $effort = if ($n.PSObject.Properties.Name -contains 'estimated_effort_hours') { "$($n.estimated_effort_hours)h" } else { 'N/D' }
        $prio   = if ($n.PSObject.Properties.Name -contains 'remediation_priority') { $n.remediation_priority } else { 'N/D' }
        $area   = if ($n.PSObject.Properties.Name -contains 'business_area') { $n.business_area } else { 'N/D' }
        $md += "| 🆕 $($n.severity) | $area | $t | $effort | $prio |`n"
    }
    if ($newOnes.Count -gt 25) { $md += "_... y $($newOnes.Count - 25) mas_`n" }
}

$md += @"

---

## 4. PERSISTENTES — CON ALERTAS DE SLA ($($persistent.Count))

"@

$persistOrdered = $persistent | Sort-Object @{ Expression = { -(Get-DaysOpen $_) } }
$fueraSla    = @($persistOrdered | Where-Object { (Get-SlaStatus $_).status -eq 'FUERA_SLA' })
$proxVencer  = @($persistOrdered | Where-Object { (Get-SlaStatus $_).status -eq 'PROXIMO_VENCER' })

if ($fueraSla.Count -gt 0) {
    $md += "### 🔴 Fuera de SLA — escalar inmediatamente`n`n"
    $md += "| Severidad | Dias abierto | SLA | Hallazgo |`n| --- | --- | --- | --- |`n"
    foreach ($f in ($fueraSla | Select-Object -First 15)) {
        $s = Get-SlaStatus $f
        $t = $f.title; if ($t.Length -gt 70) { $t = $t.Substring(0,67)+'...' }
        $t = $t -replace '\|','\|'
        $md += "| $($f.severity) | $($s.days) | $($s.sla) | $t |`n"
    }
    $md += "`n"
}
if ($proxVencer.Count -gt 0) {
    $md += "### 🟡 Proximos a vencer SLA`n`n"
    $md += "| Severidad | Dias abierto | SLA | Hallazgo |`n| --- | --- | --- | --- |`n"
    foreach ($f in ($proxVencer | Select-Object -First 10)) {
        $s = Get-SlaStatus $f
        $t = $f.title; if ($t.Length -gt 70) { $t = $t.Substring(0,67)+'...' }
        $t = $t -replace '\|','\|'
        $md += "| $($f.severity) | $($s.days) | $($s.sla) | $t |`n"
    }
    $md += "`n"
}
if ($fueraSla.Count -eq 0 -and $proxVencer.Count -eq 0) {
    $md += "_Todos los persistentes estan dentro de SLA._`n"
}

$md += @"

---

## 5. PROYECCION

| Escenario | Tasa resolucion | Ciclos restantes | Estado |
| --- | --- | --- | --- |
| Actual | $velResol /ciclo | $ciclosLimpiar | $(if ($velResol -lt 5) {'🔴 Insuficiente'} elseif ($velResol -lt 15) {'🟡 Realista'} else {'🟢 Optimista'}) |
| Realista (8/ciclo) | 8 /ciclo | $([Math]::Ceiling($rCurr.Total / 8.0)) | 🟡 |
| Optimista (15/ciclo) | 15 /ciclo | $([Math]::Ceiling($rCurr.Total / 15.0)) | 🟢 |

---

## 6. PLAN DE ACCION RECOMENDADO

"@

$accSprint = $newOnes | Where-Object { ($_.PSObject.Properties.Name -contains 'remediation_priority') -and ($_.remediation_priority -in @('INMEDIATA','SPRINT_ACTUAL')) } | Select-Object -First 10
if ($accSprint.Count -gt 0) {
    $md += "**Sprint actual:**`n`n"
    foreach ($a in $accSprint) {
        $t = $a.title; if ($t.Length -gt 80) { $t = $t.Substring(0,77)+'...' }
        $t = $t -replace '\|','\|'
        $eff = if ($a.PSObject.Properties.Name -contains 'estimated_effort_hours') { "$($a.estimated_effort_hours)h" } else { '?' }
        $md += "- [ ] **$($a.severity)** $t _($eff)_`n"
    }
} else {
    $md += "_Sin acciones inmediatas requeridas en sprint actual._`n"
}

$md += @"


---

_Comparativo generado por scripts/ai/comparativo-ia.ps1 — REGINSA QA Automation_
"@

$md | Out-File -FilePath $OutputMd -Encoding UTF8

Write-Host "`n  RESUMEN COMPARATIVO:" -ForegroundColor Yellow
Write-Host ("    Anterior: {0} (CRIT {1} | ALTA {2})" -f $rPrev.Total, $rPrev.CRITICA, $rPrev.ALTA) -ForegroundColor DarkGray
Write-Host ("    Actual  : {0} (CRIT {1} | ALTA {2})" -f $rCurr.Total, $rCurr.CRITICA, $rCurr.ALTA) -ForegroundColor DarkGray
Write-Host ("    Resueltos: {0} | Nuevos: {1} | Persistentes: {2}" -f $resolved.Count, $newOnes.Count, $persistent.Count) -ForegroundColor DarkGray
Write-Host ("    Indice calidad: {0}/100 | SLA cumplimiento: {1}%" -f $indCal, $slaCompl) -ForegroundColor White
Write-Host "  [OK] Generado: $OutputMd" -ForegroundColor Green
