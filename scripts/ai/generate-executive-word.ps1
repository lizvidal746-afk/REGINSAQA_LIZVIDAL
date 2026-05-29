<#
.SYNOPSIS
    Genera Word ejecutivo IA con 11 secciones ISTQB / ISO 25010.

.DESCRIPTION
    Lee findings-analyzed-*.json y produce INFORME_EJECUTIVO_IA_<fecha>.docx con:
      1. Portada (logo SUNEDU)
      2. Resumen ejecutivo (Estado APTO/RESERVAS/NO APTO)
      3. Alcance de pruebas
      4. KPIs cuantitativos
      5. Distribucion ISO 25010
      6. Top 10 prioritarios
      7. Analisis IA por hallazgo critico
      8. Plan remediacion por sprint
      9. Deuda tecnica acumulada (SQALE)
     10. Recomendaciones estrategicas
     11. Anexo: glosario y herramientas

.NOTES
    Usa los mismos patrones COM (PreferredWidthType=2 en porcentaje) que
    comparar-corridas.ps1 para evitar errores de Int32/Int64 en Office x64.
#>
[CmdletBinding()]
param(
    [string]$InputJson = "",
    [string]$OutputDocx = "",
    [string]$LogoPath = ""
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
if (-not $OutputDocx) {
    $stamp = if ([IO.Path]::GetFileNameWithoutExtension($InputJson) -match '(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})') { $Matches[1] } else { Get-Date -Format 'yyyy-MM-dd_HH-mm' }
    $OutputDocx = Join-Path $InformesDir "INFORME_EJECUTIVO_IA_$stamp.docx"
}
if (-not $LogoPath) {
    $candidate = Join-Path $Root 'SI091_REGINSA_ENLINEA\src\assets\images\img-logo-sunedu.png'
    if (Test-Path $candidate) { $LogoPath = $candidate }
}

Write-Host "`n=== INFORME EJECUTIVO IA - WORD ===" -ForegroundColor Magenta
Write-Host "  Input : $InputJson"  -ForegroundColor Cyan
Write-Host "  Output: $OutputDocx" -ForegroundColor Cyan
Write-Host "  Logo  : $(if ($LogoPath) { $LogoPath } else { '(sin logo)' })" -ForegroundColor DarkGray

$report = Get-Content $InputJson -Raw -Encoding UTF8 | ConvertFrom-Json

# Colores institucionales (BGR para Word)
$COLOR_HEADER_BG  = [int]0x1F4E79      # azul SUNEDU
$COLOR_HEADER_FG  = [int]0xFFFFFF
$COLOR_CRIT_BG    = [int]0xCCCCF4   # pastel rojo  (#F4CCCC en BGR)
$COLOR_ALTA_BG    = [int]0xCDE5FC   # pastel naranja (#FCE5CD en BGR)
$COLOR_MEDIA_BG   = [int]0xCCF2FF   # pastel amarillo (#FFF2CC en BGR)
$COLOR_BAJA_BG    = [int]0xD3EAD9   # pastel verde (#D9EAD3 en BGR)
$COLOR_TEXT_FG    = [int]0x000000

$word = $null
$doc  = $null
$step = 'init'

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $doc = $word.Documents.Add()
    $sel = $word.Selection

    # Margenes
    $doc.PageSetup.TopMargin    = $word.CentimetersToPoints(2.5)
    $doc.PageSetup.BottomMargin = $word.CentimetersToPoints(2.5)
    $doc.PageSetup.LeftMargin   = $word.CentimetersToPoints(2.5)
    $doc.PageSetup.RightMargin  = $word.CentimetersToPoints(2.5)

    # Encabezado
    $hdr = $doc.Sections.Item(1).Headers.Item(1).Range
    $hdr.Text = "SUNEDU - REGINSA | Informe Ejecutivo de Seguridad QA con IA"
    $hdr.Font.Size = 9
    $hdr.Font.Color = [int]0x808080

    # =========== SECCION 1: PORTADA ===========
    $step = 'portada'
    if ($LogoPath -and (Test-Path $LogoPath)) {
        $sel.ParagraphFormat.Alignment = 1
        $sel.InlineShapes.AddPicture($LogoPath) | Out-Null
        $sel.TypeParagraph()
    }
    $sel.ParagraphFormat.Alignment = 1
    $sel.Font.Size = 24; $sel.Font.Bold = $true; $sel.Font.Color = $COLOR_HEADER_BG
    $sel.TypeText("INFORME EJECUTIVO DE SEGURIDAD"); $sel.TypeParagraph()
    $sel.Font.Size = 18
    $sel.TypeText("Sistema REGINSA - SUNEDU"); $sel.TypeParagraph()
    $sel.TypeParagraph()
    $sel.Font.Size = 14; $sel.Font.Bold = $false; $sel.Font.Color = $COLOR_TEXT_FG
    $sel.TypeText("Analisis con Inteligencia Artificial Local (Ollama)"); $sel.TypeParagraph()
    $sel.TypeParagraph()
    $sel.Font.Size = 12
    $sel.TypeText("Fecha de emision: $(Get-Date -Format 'dd/MM/yyyy HH:mm')"); $sel.TypeParagraph()
    $sel.TypeText("Motor de analisis: $($report.meta.ai_engine)"); $sel.TypeParagraph()
    $sel.TypeText("Norma: ISO/IEC 25010 + ISTQB Test Report Template"); $sel.TypeParagraph()
    $sel.TypeParagraph()

    # Estado global
    $crit  = @($report.findings | Where-Object { $_.severity -eq 'CRITICA' })
    $inmed = @($report.findings | Where-Object { $_.remediation_priority -eq 'INMEDIATA' })
    $estado = if ($inmed.Count -gt 0)        { 'NO APTO PARA PRODUCCION' }
              elseif ($crit.Count -gt 0)     { 'APTO CON RESERVAS' }
              else                           { 'APTO PARA PRODUCCION' }
    $estadoColor = if ($estado -like '*NO APTO*') { [int]0x0000C0 } elseif ($estado -like '*RESERVAS*') { [int]0x0080FF } else { [int]0x008000 }

    $sel.Font.Size = 16; $sel.Font.Bold = $true; $sel.Font.Color = $estadoColor
    $sel.TypeText("ESTADO GENERAL: $estado"); $sel.TypeParagraph()

    $sel.InsertNewPage()
    $sel.ParagraphFormat.Alignment = 0
    $sel.Font.Color = $COLOR_TEXT_FG; $sel.Font.Size = 11; $sel.Font.Bold = $false

    # WdBuiltinStyle: Normal=-1, Heading1=-2, Heading2=-3, Heading3=-4, Heading4=-5 (idioma-agnostico)
    function Add-Heading { param([string]$Text, [int]$Level = 1)
        $builtin = -1 - $Level   # Level 1 -> -2, Level 2 -> -3, etc.
        try { $sel.Style = $builtin } catch { $sel.Font.Bold = $true; $sel.Font.Size = (16 - $Level) }
        $sel.TypeText($Text); $sel.TypeParagraph()
        try { $sel.Style = -1 } catch { $sel.Font.Bold = $false; $sel.Font.Size = 11 }
    }
    function Add-Para { param([string]$Text)
        $sel.TypeText($Text); $sel.TypeParagraph()
    }
    function Style-HeaderRow { param($row)
        for ($c = 1; $c -le $row.Cells.Count; $c++) {
            $row.Cells.Item($c).Range.Font.Bold = $true
            $row.Cells.Item($c).Range.Font.Color = [int]$COLOR_HEADER_FG
            $row.Cells.Item($c).Shading.BackgroundPatternColor = [int]$COLOR_HEADER_BG
        }
    }
    function Add-Table { param([string[][]]$Data, [int[]]$ColPercents)
        $rows = $Data.Count
        $cols = $Data[0].Count
        $tbl = $doc.Tables.Add($sel.Range, $rows, $cols)
        $tbl.Borders.Enable = $true
        $tbl.PreferredWidthType = 2
        $tbl.PreferredWidth = [float]100
        for ($r = 0; $r -lt $rows; $r++) {
            for ($c = 0; $c -lt $cols; $c++) {
                $tbl.Cell($r+1, $c+1).Range.Text = [string]$Data[$r][$c]
            }
        }
        if ($ColPercents) {
            for ($c = 0; $c -lt $cols; $c++) {
                $tbl.Columns.Item($c+1).PreferredWidthType = 2
                $tbl.Columns.Item($c+1).PreferredWidth = [float]$ColPercents[$c]
            }
        }
        Style-HeaderRow $tbl.Rows.Item(1)
        # Mover seleccion DESPUES de la tabla para evitar incrustaciones
        $endRange = $doc.Range($tbl.Range.End, $tbl.Range.End)
        $endRange.Select()
        $sel.TypeParagraph()
        return $tbl
    }

    # =========== SECCION 2: RESUMEN EJECUTIVO ===========
    $step = 'resumen ejecutivo'
    Add-Heading "1. Resumen Ejecutivo"

    $razon = if ($inmed.Count -gt 0)        { "Existen $($inmed.Count) hallazgos con prioridad INMEDIATA en componentes criticos del negocio (Autenticacion, Sanciones, Administrados)." }
             elseif ($crit.Count -gt 5)     { "Se detectaron $($crit.Count) hallazgos CRITICOS que requieren remediacion en el sprint actual antes del release." }
             elseif ($crit.Count -gt 0)     { "Hay $($crit.Count) hallazgo(s) CRITICO(s) bajo seguimiento y plan de mitigacion." }
             else                           { "Sin hallazgos criticos pendientes en componentes productivos." }
    Add-Para $razon

    Add-Heading "1.1 Indicadores clave" 2
    $totalEffort = ($report.findings | Measure-Object -Property estimated_effort_hours -Sum).Sum
    $totalEffort = [Math]::Round([double]$totalEffort, 1)

    $kpiData = @(
        @('Indicador','Valor','Estado'),
        @('Hallazgos crudos detectados',     [string]$report.meta.total_raw,                     '-'),
        @('Falsos positivos eliminados',     [string]$report.meta.false_positives_removed,       'OK'),
        @('Duplicados consolidados',         [string]$report.meta.duplicates_grouped,            'OK'),
        @('Hallazgos accionables',           [string]$report.meta.total_normalized,              $(if ($crit.Count -eq 0) {'OK'} elseif ($crit.Count -le 5) {'OBSERVACION'} else {'CRITICO'})),
        @('Reduccion de ruido (%)',          "$($report.meta.reduction_percentage)%",            'OK'),
        @('Esfuerzo total estimado (horas)', [string]$totalEffort,                               '-'),
        @('Motor de analisis',               [string]$report.meta.ai_engine,                     '-'),
        @('Estado general',                  $estado,                                            '-')
    )
    Add-Table -Data $kpiData -ColPercents @(45, 30, 25) | Out-Null

    # =========== SECCION 3: ALCANCE ===========
    $step = 'alcance'
    Add-Heading "2. Alcance de Pruebas"
    Add-Para "El presente informe consolida los hallazgos de seguridad detectados sobre el sistema SI-091 REGINSA, incluyendo backend Spring Boot, frontend Angular y configuraciones de pipeline CI/CD. Se aplicaron las siguientes herramientas de las cuatro disciplinas SAST, DAST, SCA y Pipeline-as-Code:"

    $alcanceData = @(
        @('Disciplina','Herramientas','Cobertura'),
        @('SAST',     'Semgrep, Bearer, SonarQube, CodeQL',         'Codigo fuente Java/TS/JS'),
        @('DAST',     'OWASP ZAP, Nikto, Wapiti, Nuclei',           'Endpoints HTTP en QA'),
        @('SCA',      'Trivy, OSV, RetireJS, Syft+Grype, OWASP DC', 'Dependencias NPM/Maven'),
        @('Pipeline', 'Checkov, TruffleHog, Gitleaks',              'GitHub Actions + Dockerfiles')
    )
    Add-Table -Data $alcanceData -ColPercents @(15, 50, 35) | Out-Null
    Add-Para "Nota: Las pruebas Nmap (escaneo de red) se ejecutan unicamente bajo autorizacion expresa y no estan incluidas en el pipeline automatico."

    # =========== SECCION 4: KPIs CUANTITATIVOS ===========
    $step = 'kpis severidad'
    Add-Heading "3. Distribucion por Severidad"
    $sevData = @(
        @('Severidad','Cantidad','% del Total','SLA Recomendado'),
        @('CRITICA', [string]$report.summary_by_severity.CRITICA, $(if ($report.meta.total_normalized -gt 0) { "$([Math]::Round(($report.summary_by_severity.CRITICA / [double]$report.meta.total_normalized) * 100, 1))%" } else { '0%' }), '72 horas'),
        @('ALTA',    [string]$report.summary_by_severity.ALTA,    $(if ($report.meta.total_normalized -gt 0) { "$([Math]::Round(($report.summary_by_severity.ALTA / [double]$report.meta.total_normalized) * 100, 1))%" }    else { '0%' }), '7 dias'),
        @('MEDIA',   [string]$report.summary_by_severity.MEDIA,   $(if ($report.meta.total_normalized -gt 0) { "$([Math]::Round(($report.summary_by_severity.MEDIA / [double]$report.meta.total_normalized) * 100, 1))%" }   else { '0%' }), '30 dias'),
        @('BAJA',    [string]$report.summary_by_severity.BAJA,    $(if ($report.meta.total_normalized -gt 0) { "$([Math]::Round(($report.summary_by_severity.BAJA / [double]$report.meta.total_normalized) * 100, 1))%" }    else { '0%' }), '90 dias')
    )
    Add-Table -Data $sevData -ColPercents @(25, 20, 25, 30) | Out-Null

    # =========== SECCION 5: ISO 25010 ===========
    $step = 'iso 25010'
    Add-Heading "4. Distribucion por Caracteristica ISO/IEC 25010"
    $isoMap = @{}
    foreach ($f in $report.findings) {
        $iso = if ($f.iso25010) { [string]$f.iso25010 } else { 'No clasificado' }
        if (-not $isoMap.ContainsKey($iso)) { $isoMap[$iso] = @{ count = 0; effort = 0.0 } }
        $isoMap[$iso].count++
        $isoMap[$iso].effort += [double]$f.estimated_effort_hours
    }
    $isoData = @(@('Caracteristica ISO 25010','Cantidad','Esfuerzo (h)'))
    foreach ($k in ($isoMap.Keys | Sort-Object)) {
        $isoData += ,@([string]$k, [string]$isoMap[$k].count, [string]([Math]::Round($isoMap[$k].effort,1)))
    }
    Add-Table -Data $isoData -ColPercents @(50, 25, 25) | Out-Null

    # =========== SECCION 6: TOP 10 PRIORITARIOS ===========
    $step = 'top 10'
    Add-Heading "5. Top 10 Hallazgos Prioritarios"
    Add-Para "Ordenados por puntaje IA de prioridad (0-100). Combina severidad, explotabilidad, area de negocio y exposicion productiva."
    $top10 = $report.findings | Sort-Object -Property ai_priority_score -Descending | Select-Object -First 10
    $topData = @(@('#','Severidad','Area','Hallazgo','Score','Esfuerzo'))
    $i = 1
    foreach ($t in $top10) {
        $title = [string]$t.title
        if ($title.Length -gt 80) { $title = $title.Substring(0,77) + '...' }
        $topData += ,@([string]$i, [string]$t.severity, [string]$t.business_area, $title, [string]$t.ai_priority_score, "$($t.estimated_effort_hours)h")
        $i++
    }
    Add-Table -Data $topData -ColPercents @(5, 12, 15, 48, 10, 10) | Out-Null

    # =========== SECCION 7: ANALISIS IA POR HALLAZGO CRITICO ===========
    $step = 'analisis IA criticos'
    Add-Heading "6. Analisis IA por Hallazgo Critico"
    Add-Para "Para cada hallazgo CRITICO se incluye el analisis contextualizado generado por el motor de IA con conocimiento del stack REGINSA (Spring Boot, Angular, datos sensibles)."

    $critList = $report.findings | Where-Object { $_.severity -eq 'CRITICA' } | Sort-Object -Property ai_priority_score -Descending | Select-Object -First 15
    $idx = 1
    foreach ($f in $critList) {
        Add-Heading ("6.$idx $([string]$f.title)" ) 3
        Add-Para "Herramienta: $([string]$f.tool) | Area: $([string]$f.business_area) | Score: $([int]$f.ai_priority_score) | Esfuerzo: $([string]$f.estimated_effort_hours) h | Ocurrencias: $([int]$f.occurrence_count)"
        if ($f.ai_risk_analysis)      { Add-Para "Riesgo: $([string]$f.ai_risk_analysis)" }
        if ($f.ai_business_impact)    { Add-Para "Impacto al negocio: $([string]$f.ai_business_impact)" }
        if ($f.ai_remediation_detail) { Add-Para "Remediacion sugerida: $([string]$f.ai_remediation_detail)" }
        $idx++
    }

    # =========== SECCION 8: PLAN POR SPRINT ===========
    $step = 'plan sprint'
    Add-Heading "7. Plan de Remediacion por Sprint"
    foreach ($p in @('INMEDIATA','SPRINT_ACTUAL','SPRINT_N+1','SPRINT_N+2','BACKLOG')) {
        $items = @($report.findings | Where-Object { $_.remediation_priority -eq $p })
        if ($items.Count -eq 0) { continue }
        Add-Heading "7.$p ($($items.Count) hallazgos)" 3
        $effortSum = ($items | Measure-Object -Property estimated_effort_hours -Sum).Sum
        $effortSum = [Math]::Round([double]$effortSum, 1)
        Add-Para "Esfuerzo estimado del bloque: $effortSum horas."
        $planData = @(@('Severidad','Area','Hallazgo','Esfuerzo'))
        foreach ($it in ($items | Select-Object -First 12)) {
            $tt = [string]$it.title
            if ($tt.Length -gt 70) { $tt = $tt.Substring(0,67) + '...' }
            $planData += ,@([string]$it.severity, [string]$it.business_area, $tt, "$($it.estimated_effort_hours)h")
        }
        Add-Table -Data $planData -ColPercents @(15, 20, 55, 10) | Out-Null
        if ($items.Count -gt 12) { Add-Para "... y $($items.Count - 12) hallazgos adicionales en este bloque." }
    }

    # =========== SECCION 9: DEUDA TECNICA ===========
    $step = 'deuda tecnica'
    Add-Heading "8. Deuda Tecnica Acumulada (modelo SQALE)"
    $deudaTotal = ($report.findings | Measure-Object -Property estimated_effort_hours -Sum).Sum
    $deudaTotal = [Math]::Round([double]$deudaTotal, 1)
    $deudaCrit  = ($report.findings | Where-Object { $_.severity -eq 'CRITICA' } | Measure-Object -Property estimated_effort_hours -Sum).Sum
    $deudaCrit  = [Math]::Round([double]$deudaCrit, 1)
    $deudaAlta  = ($report.findings | Where-Object { $_.severity -eq 'ALTA' } | Measure-Object -Property estimated_effort_hours -Sum).Sum
    $deudaAlta  = [Math]::Round([double]$deudaAlta, 1)

    $deudaData = @(
        @('Concepto','Horas','Equivalente'),
        @('Deuda total acumulada',           [string]$deudaTotal, "$([Math]::Round($deudaTotal/8,1)) dias-persona"),
        @('Deuda critica (urgente)',         [string]$deudaCrit,  "$([Math]::Round($deudaCrit/8,1)) dias-persona"),
        @('Deuda alta',                      [string]$deudaAlta,  "$([Math]::Round($deudaAlta/8,1)) dias-persona"),
        @('Deuda media + baja',              [string]([Math]::Round($deudaTotal-$deudaCrit-$deudaAlta,1)),"-")
    )
    Add-Table -Data $deudaData -ColPercents @(50, 25, 25) | Out-Null
    Add-Para "Indice de deuda: la suma de horas-persona necesarias para remediar todos los hallazgos accionables. Util para planificacion de capacity en proximos sprints."

    # =========== SECCION 10: RECOMENDACIONES ===========
    $step = 'recomendaciones'
    Add-Heading "9. Recomendaciones Estrategicas"
    Add-Para "1. Priorizar componentes de Autenticacion, Sanciones y Administrados por su criticidad institucional."
    Add-Para "2. Establecer SLA contractual de remediacion: CRITICA 72h | ALTA 7d | MEDIA 30d | BAJA 90d."
    Add-Para "3. Configurar reglas de exclusion en .semgreprc, .checkov.yml para evitar reescaneo de paths irrelevantes."
    Add-Para "4. Mantener Ollama y modelos IA actualizados ejecutando 'npm run ai:update' al inicio de cada sprint."
    Add-Para "5. Programar comparativo automatico entre corridas para detectar regresiones tempranas."
    Add-Para "6. Integrar el reporte ejecutivo IA al ciclo de revision con jefatura cada 2 semanas."

    # =========== SECCION 11: ANEXO ===========
    $step = 'anexo'
    Add-Heading "10. Anexo: Glosario y Trazabilidad"
    $glosData = @(
        @('Termino','Definicion'),
        @('SAST', 'Static Application Security Testing - analisis de codigo fuente'),
        @('DAST', 'Dynamic Application Security Testing - analisis en ejecucion'),
        @('SCA',  'Software Composition Analysis - dependencias y librerias'),
        @('CVE',  'Common Vulnerabilities and Exposures - identificador estandar'),
        @('GHSA', 'GitHub Security Advisory - aviso de seguridad de GitHub'),
        @('SQALE','Software Quality Assessment based on Lifecycle Expectations - modelo de deuda tecnica'),
        @('ISO/IEC 25010', 'Norma de calidad de producto software (8 caracteristicas)'),
        @('ISTQB', 'International Software Testing Qualifications Board')
    )
    Add-Table -Data $glosData -ColPercents @(20, 80) | Out-Null

    Add-Heading "10.1 Trazabilidad de archivos fuente" 2
    Add-Para "Datos normalizados: $InputJson"
    Add-Para "Fecha de analisis: $($report.meta.analyzed_at)"
    $aiCount = [int]($report.meta.ai_processed)
    $totalCount = @($report.findings).Count
    $heurCount = [Math]::Max(0, $totalCount - $aiCount)
    Add-Para "Hallazgos analizados con LLM (Ollama, criticos+altos): $aiCount"
    Add-Para "Hallazgos analizados con heuristica (medios+bajos): $heurCount"
    Add-Para "Total hallazgos accionables: $totalCount"

    # =========== GUARDAR ===========
    $step = 'guardar'
    if (Test-Path $OutputDocx) { Remove-Item $OutputDocx -Force }
    $doc.SaveAs2([string]$OutputDocx, 12)
    $doc.Close($false)
    $word.Quit()

    Write-Host "`n  [OK] Generado: $OutputDocx" -ForegroundColor Green
}
catch {
    Write-Host "`n  [ERROR] paso '$step' - $($_.Exception.Message)" -ForegroundColor Red
    if ($doc)  { try { $doc.Close($false)  } catch {} }
    if ($word) { try { $word.Quit()        } catch {} }
    throw
}
finally {
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null 2>$null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
