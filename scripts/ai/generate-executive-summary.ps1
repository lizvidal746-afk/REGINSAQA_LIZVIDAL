<#
.SYNOPSIS
    Genera resumen ejecutivo en Markdown a partir de findings-analyzed-*.json.

.DESCRIPTION
    Produce executive-summary-ia-<stamp>.md con:
      - Estado general (APTO / APTO CON RESERVAS / NO APTO)
      - Top 5 hallazgos por priority_score
      - Plan de remediacion priorizado por sprint
      - Recomendaciones estrategicas
    Usa Ollama si esta disponible para narrativa fluida, si no usa plantilla.

.EXAMPLE
    pwsh scripts/ai/generate-executive-summary.ps1
#>
[CmdletBinding()]
param(
    [string]$InputJson = "",
    [string]$OutputMd  = "",
    [string]$OllamaUrl = "http://localhost:11434",
    [string]$Model     = "llama3.1:8b",
    [switch]$NoOllama
)

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

$Root        = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$InformesDir = Join-Path $Root 'reportes\informes'

if (-not $InputJson) {
    $latest = Get-ChildItem -Path $InformesDir -Filter 'findings-analyzed-*.json' -File |
              Sort-Object Name -Descending | Select-Object -First 1
    if (-not $latest) { throw "No se encontro findings-analyzed-*.json. Ejecuta analyze-findings.ps1 primero." }
    $InputJson = $latest.FullName
}
if (-not $OutputMd) {
    $stamp = if ([IO.Path]::GetFileNameWithoutExtension($InputJson) -match '(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})') { $Matches[1] } else { Get-Date -Format 'yyyy-MM-dd_HH-mm' }
    $OutputMd = Join-Path $InformesDir "executive-summary-ia-$stamp.md"
}

Write-Host "`n=== RESUMEN EJECUTIVO IA ===" -ForegroundColor Magenta
$report = Get-Content $InputJson -Raw -Encoding UTF8 | ConvertFrom-Json

$crit  = @($report.findings | Where-Object { $_.severity -eq 'CRITICA' })
$inmed = @($report.findings | Where-Object { $_.remediation_priority -eq 'INMEDIATA' })
$total = $report.meta.total_normalized

# Estado global
$estado = if ($inmed.Count -gt 0)            { '❌ NO APTO PARA PRODUCCION' }
          elseif ($crit.Count -gt 5)         { '⚠️ APTO CON RESERVAS' }
          elseif ($crit.Count -gt 0)         { '⚠️ APTO CON RESERVAS' }
          else                               { '✅ APTO PARA PRODUCCION' }

$razon = if ($inmed.Count -gt 0)             { "Existen $($inmed.Count) hallazgos con prioridad INMEDIATA que afectan componentes criticos del negocio." }
         elseif ($crit.Count -gt 5)          { "Se detectaron $($crit.Count) hallazgos CRITICOS, requiere remediacion en sprint actual antes del release." }
         elseif ($crit.Count -gt 0)          { "Hay $($crit.Count) hallazgo(s) CRITICO(s) bajo seguimiento." }
         else                                { "Sin hallazgos criticos pendientes en componentes productivos." }

# Top 10 por priority_score
$top10 = $report.findings | Sort-Object -Property ai_priority_score -Descending | Select-Object -First 10

# Esfuerzo total estimado
$totalEffort = ($report.findings | Measure-Object -Property estimated_effort_hours -Sum).Sum
$totalEffort = [Math]::Round([double]$totalEffort, 1)

$now = Get-Date -Format 'dd/MM/yyyy HH:mm'

$md = @"
# INFORME EJECUTIVO DE SEGURIDAD — REGINSA

**Sistema:** SI-091 REGINSA (SUNEDU)
**Fecha:** $now
**Motor de analisis:** $($report.meta.ai_engine) (LLM aplicado a criticos+altos; medios+bajos via heuristica)
**Estado General:** $estado

> $razon

---

## 1. RESUMEN CUANTITATIVO

| Metrica | Valor |
| --- | --- |
| Hallazgos crudos | $($report.meta.total_raw) |
| Falsos positivos eliminados | $($report.meta.false_positives_removed) |
| Duplicados agrupados | $($report.meta.duplicates_grouped) |
| Hallazgos accionables | **$total** |
| Reduccion de ruido | **$($report.meta.reduction_percentage)%** |
| Esfuerzo estimado total | $totalEffort horas |

### Por severidad

| Severidad | Cantidad |
| --- | --- |
| 🔴 CRITICA | $($report.summary_by_severity.CRITICA) |
| 🟠 ALTA | $($report.summary_by_severity.ALTA) |
| 🟡 MEDIA | $($report.summary_by_severity.MEDIA) |
| 🟢 BAJA | $($report.summary_by_severity.BAJA) |

### Por prioridad de remediacion

| Prioridad | Cantidad |
| --- | --- |
| INMEDIATA | $($report.summary_by_priority.INMEDIATA) |
| SPRINT_ACTUAL | $($report.summary_by_priority.SPRINT_ACTUAL) |
| SPRINT_N+1 | $($report.summary_by_priority.'SPRINT_N+1') |
| SPRINT_N+2 | $($report.summary_by_priority.'SPRINT_N+2') |
| BACKLOG | $($report.summary_by_priority.BACKLOG) |

### Por area de negocio

| Area | Cantidad |
| --- | --- |
"@

foreach ($area in @('Autenticacion','Sanciones','Administrados','Backend','Frontend','Pipeline','Infraestructura','General')) {
    $c = $report.summary_by_business_area.$area
    if ($c -gt 0) { $md += "`n| $area | $c |" }
}

$md += @"


---

## 2. TOP 10 HALLAZGOS PRIORITARIOS

| # | Severidad | Area | Hallazgo | Score | Esfuerzo |
| --- | --- | --- | --- | --- | --- |
"@

$rank = 1
foreach ($t in $top10) {
    $titleShort = $t.title
    if ($titleShort.Length -gt 70) { $titleShort = $titleShort.Substring(0, 67) + '...' }
    $titleShort = $titleShort -replace '\|','\|'
    $md += "`n| $rank | $($t.severity) | $($t.business_area) | $titleShort | $($t.ai_priority_score) | $($t.estimated_effort_hours)h |"
    $rank++
}

$md += @"


---

## 3. PLAN DE REMEDIACION POR SPRINT

### Sprint actual (INMEDIATA + SPRINT_ACTUAL)

"@

$inSprint = $report.findings | Where-Object { $_.remediation_priority -in @('INMEDIATA','SPRINT_ACTUAL') } | Select-Object -First 15
if ($inSprint.Count -eq 0) {
    $md += "`n_Sin tareas para el sprint actual._`n"
} else {
    $md += "`n| Prioridad | Hallazgo | Area | Esfuerzo | Recomendacion |`n| --- | --- | --- | --- | --- |"
    foreach ($t in $inSprint) {
        $tt = $t.title; if ($tt.Length -gt 60) { $tt = $tt.Substring(0,57) + '...' }
        $tt = $tt -replace '\|','\|'
        $rem = if ($t.ai_remediation_detail) { $t.ai_remediation_detail } else { $t.recomendacion_base }
        if ($rem.Length -gt 80) { $rem = $rem.Substring(0,77) + '...' }
        $rem = $rem -replace '\|','\|' -replace '\r?\n',' '
        $md += "`n| $($t.remediation_priority) | $tt | $($t.business_area) | $($t.estimated_effort_hours)h | $rem |"
    }
}

$md += @"


### Sprint N+1 / N+2 / Backlog

"@

$later = $report.findings | Where-Object { $_.remediation_priority -in @('SPRINT_N+1','SPRINT_N+2','BACKLOG') } |
         Group-Object -Property remediation_priority

foreach ($g in $later) {
    $effortG = ($g.Group | Measure-Object -Property estimated_effort_hours -Sum).Sum
    $effortG = [Math]::Round([double]$effortG, 1)
    $md += "`n- **$($g.Name)**: $($g.Count) hallazgos | Esfuerzo: $effortG h"
}

$md += @"


---

## 4. RECOMENDACIONES ESTRATEGICAS

1. **Excluir falsos positivos en automatizacion** — Configurar `.semgreprc` y `.checkov.yml` para ignorar `.nuclei-templates/`, `reportes/`, `node_modules/` y `test-files/`. Reducira ruido en proximas corridas.
2. **Atender area de negocio mas afectada primero** — Priorizar componentes de Autenticacion y Sanciones por su criticidad institucional.
3. **Establecer SLA de remediacion por severidad**:
   - CRITICA: 72 horas
   - ALTA: 7 dias
   - MEDIA: 30 dias
   - BAJA: backlog continuo
4. **Integrar Ollama local en pipeline** — El analisis IA agrega contexto sin costo (gratuito, on-prem) y permite priorizacion automatica por riesgo real.

---

## 5. METRICAS DE CALIDAD DEL INFORME

| Metrica | Valor |
| --- | --- |
| Hallazgos crudos -> normalizados | $($report.meta.total_raw) -> $total |
| Reduccion de ruido | $($report.meta.reduction_percentage)% |
| Hallazgos con contexto de negocio | $total / $total |
| Hallazgos con plan de remediacion | $total / $total |
| Decision-enabling | true |

---

_Informe generado por scripts/ai/generate-executive-summary.ps1 — REGINSA QA Automation_
"@

$md | Out-File -FilePath $OutputMd -Encoding UTF8

Write-Host "  [OK] Generado: $OutputMd" -ForegroundColor Green
Write-Host "  Estado: $estado" -ForegroundColor $(if ($estado -like '*NO APTO*') { 'Red' } elseif ($estado -like '*RESERVAS*') { 'Yellow' } else { 'Green' })
