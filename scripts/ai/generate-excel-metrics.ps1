<#
.SYNOPSIS
    Genera Excel con 8 hojas de metricas IA: Resumen, Hallazgos, Severidad, Area, ISO 25010, Plan Sprint, Tendencia, Deuda.

.DESCRIPTION
    Lee findings-analyzed-*.json y produce METRICAS_IA_<fecha>.xlsx con
    formato condicional, totales y tablas filtrables en cada hoja.
#>
[CmdletBinding()]
param(
    [string]$InputJson  = "",
    [string]$OutputXlsx = ""
)

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

$Root        = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$InformesDir = Join-Path $Root 'reportes\informes'

if (-not $InputJson) {
    $latest = Get-ChildItem -Path $InformesDir -Filter 'findings-analyzed-*.json' -File |
              Sort-Object Name -Descending | Select-Object -First 1
    if (-not $latest) { throw "No se encontro findings-analyzed-*.json" }
    $InputJson = $latest.FullName
}
if (-not $OutputXlsx) {
    $stamp = if ([IO.Path]::GetFileNameWithoutExtension($InputJson) -match '(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})') { $Matches[1] } else { Get-Date -Format 'yyyy-MM-dd_HH-mm' }
    $OutputXlsx = Join-Path $InformesDir "METRICAS_IA_$stamp.xlsx"
}

Write-Host "`n=== METRICAS IA - EXCEL ===" -ForegroundColor Magenta
Write-Host "  Input : $InputJson"  -ForegroundColor Cyan
Write-Host "  Output: $OutputXlsx" -ForegroundColor Cyan

$report = Get-Content $InputJson -Raw -Encoding UTF8 | ConvertFrom-Json

$excel = $null; $wb = $null; $step = 'init'

# Colores
$BG_HEAD  = 4286945  # Azul SUNEDU
# Colores pastel (BGR para Excel COM): rojo, naranja, amarillo, verde
$BG_CRIT  = 13421812   # #F4CCCC pastel rojo
$BG_ALTA  = 13493756   # #FCE5CD pastel naranja
$BG_MEDIA = 13431551   # #FFF2CC pastel amarillo
$BG_BAJA  = 13888217   # #D9EAD3 pastel verde
$FG_WHITE = 16777215

function Set-HeaderRow { param($range)
    $range.Font.Bold = $true
    $range.Font.Color = $FG_WHITE
    $range.Interior.Color = $BG_HEAD
    $range.HorizontalAlignment = -4108  # xlCenter
    $range.Borders.LineStyle = 1
}

function Get-SeverityColor { param($sev)
    switch ($sev) {
        'CRITICA' { return $BG_CRIT }
        'ALTA'    { return $BG_ALTA }
        'MEDIA'   { return $BG_MEDIA }
        'BAJA'    { return $BG_BAJA }
        default   { return 16777215 }
    }
}

try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $wb = $excel.Workbooks.Add()

    while ($wb.Worksheets.Count -gt 1) { $wb.Worksheets.Item($wb.Worksheets.Count).Delete() }

    function Add-Sheet { param([string]$Name)
        $ws = $wb.Worksheets.Add()
        $ws.Name = $Name
        return $ws
    }

    # ── HOJA 1: RESUMEN ──
    $step = 'hoja resumen'
    $ws1 = $wb.Worksheets.Item(1); $ws1.Name = 'Resumen'
    $ws1.Cells.Item(1,1) = 'INFORME DE METRICAS IA - REGINSA'
    $ws1.Range('A1:C1').Merge() | Out-Null
    $ws1.Range('A1:C1').Font.Size = 16
    $ws1.Range('A1:C1').Font.Bold = $true
    $ws1.Range('A1:C1').Interior.Color = $BG_HEAD
    $ws1.Range('A1:C1').Font.Color = $FG_WHITE
    $ws1.Range('A1:C1').HorizontalAlignment = -4108

    $ws1.Cells.Item(3,1) = 'Fecha emision';    $ws1.Cells.Item(3,2) = (Get-Date -Format 'dd/MM/yyyy HH:mm')
    $ws1.Cells.Item(4,1) = 'Motor IA';         $ws1.Cells.Item(4,2) = [string]$report.meta.ai_engine
    $ws1.Cells.Item(5,1) = 'Archivo origen';   $ws1.Cells.Item(5,2) = [IO.Path]::GetFileName($InputJson)

    $crit  = @($report.findings | Where-Object { $_.severity -eq 'CRITICA' })
    $inmed = @($report.findings | Where-Object { $_.remediation_priority -eq 'INMEDIATA' })
    $estado = if ($inmed.Count -gt 0) { 'NO APTO PARA PRODUCCION' } elseif ($crit.Count -gt 0) { 'APTO CON RESERVAS' } else { 'APTO PARA PRODUCCION' }
    $ws1.Cells.Item(7,1) = 'ESTADO GENERAL'
    $ws1.Cells.Item(7,2) = $estado
    $ws1.Range('A7:B7').Font.Bold = $true
    $ws1.Cells.Item(7,2).Interior.Color = $(if ($estado -like '*NO APTO*') { $BG_CRIT } elseif ($estado -like '*RESERVAS*') { $BG_ALTA } else { $BG_BAJA })
    $ws1.Cells.Item(7,2).Font.Color = $FG_WHITE

    $kpis = @(
        @('Hallazgos crudos',          $report.meta.total_raw),
        @('Falsos positivos',          $report.meta.false_positives_removed),
        @('Duplicados agrupados',      $report.meta.duplicates_grouped),
        @('Hallazgos accionables',     $report.meta.total_normalized),
        @('Reduccion de ruido (%)',    "$($report.meta.reduction_percentage)%"),
        @('CRITICA',                   $report.summary_by_severity.CRITICA),
        @('ALTA',                      $report.summary_by_severity.ALTA),
        @('MEDIA',                     $report.summary_by_severity.MEDIA),
        @('BAJA',                      $report.summary_by_severity.BAJA),
        @('INMEDIATA',                 $report.summary_by_priority.INMEDIATA),
        @('SPRINT_ACTUAL',             $report.summary_by_priority.SPRINT_ACTUAL),
        @('SPRINT_N+1',                $report.summary_by_priority.'SPRINT_N+1'),
        @('SPRINT_N+2',                $report.summary_by_priority.'SPRINT_N+2'),
        @('BACKLOG',                   $report.summary_by_priority.BACKLOG)
    )
    $ws1.Cells.Item(9,1) = 'KPI';  $ws1.Cells.Item(9,2) = 'Valor'
    Set-HeaderRow $ws1.Range('A9:B9')
    $r = 10
    foreach ($k in $kpis) { $ws1.Cells.Item($r,1) = $k[0]; $ws1.Cells.Item($r,2) = $k[1]; $r++ }

    # ── KPI EXTRA: MTTR por severidad (vs corrida anterior) ──
    $step = 'mttr'
    $r += 1
    $ws1.Cells.Item($r,1) = 'MTTR (corrida anterior -> actual)'
    $ws1.Cells.Item($r,2) = 'Promedio dias / SLA'
    Set-HeaderRow $ws1.Range("A${r}:B${r}")
    $r++

    # Localizar findings-analyzed-*.json anterior (excluyendo la actual)
    $prevFile = Get-ChildItem -Path $InformesDir -Filter 'findings-analyzed-*.json' -File -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -ne $InputJson } |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1

    $slaMap = @{ 'CRITICA' = 7; 'ALTA' = 15; 'MEDIA' = 30; 'BAJA' = 90 }
    $now = Get-Date

    if ($prevFile) {
        $prevReport = Get-Content $prevFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        $currKeys = @{}
        foreach ($f in $report.findings) { if ($f.group_key) { $currKeys[[string]$f.group_key] = $true } }

        # Resueltos = en anterior pero no en actual
        $resolved = @($prevReport.findings | Where-Object { $_.group_key -and -not $currKeys.ContainsKey([string]$_.group_key) })

        foreach ($sev in @('CRITICA','ALTA','MEDIA','BAJA')) {
            $sla = $slaMap[$sev]
            $bucket = @($resolved | Where-Object { $_.severity -eq $sev -and $_.first_seen -and ([string]$_.first_seen).Trim() -ne '' })
            if ($bucket.Count -eq 0) {
                $ws1.Cells.Item($r,1) = "MTTR $sev"
                $ws1.Cells.Item($r,2) = "Sin resueltos (SLA $sla d)"
            } else {
                $totalDays = 0.0
                foreach ($f in $bucket) {
                    try {
                        $fs = Get-Date ([string]$f.first_seen)
                        $totalDays += ($now - $fs).TotalDays
                    } catch { }
                }
                $avg = [Math]::Round($totalDays / $bucket.Count, 1)
                $ws1.Cells.Item($r,1) = "MTTR $sev ($($bucket.Count) resueltos)"
                $ws1.Cells.Item($r,2) = "$avg d / SLA $sla d"
                $ws1.Cells.Item($r,2).Interior.Color = $(if ($avg -le $sla) { $BG_BAJA } else { $BG_CRIT })
            }
            $r++
        }
    } else {
        $ws1.Cells.Item($r,1) = 'MTTR'
        $ws1.Cells.Item($r,2) = 'Sin corrida anterior para comparar'
        $r++
    }

    # ── KPI EXTRA: KEV Exposure ──
    $step = 'kev exposure'
    $r += 1
    $ws1.Cells.Item($r,1) = 'KEV Exposure (CVEs explotados activos)'
    $ws1.Cells.Item($r,2) = 'Valor'
    Set-HeaderRow $ws1.Range("A${r}:B${r}")
    $r++

    $kevActive = @($report.findings | Where-Object { $_.in_kev -eq $true -and $_.kev_dateAdded -and ([string]$_.kev_dateAdded).Trim() -ne '' })
    if ($kevActive.Count -eq 0) {
        $ws1.Cells.Item($r,1) = 'Hallazgos KEV activos'
        $ws1.Cells.Item($r,2) = 0
        $ws1.Cells.Item($r,2).Interior.Color = $BG_BAJA
        $r++
    } else {
        $exposures = @()
        foreach ($f in $kevActive) {
            try { $exposures += ($now - (Get-Date ([string]$f.kev_dateAdded))).TotalDays } catch { }
        }
        $maxExp = [Math]::Round(($exposures | Measure-Object -Maximum).Maximum, 1)
        $avgExp = [Math]::Round(($exposures | Measure-Object -Average).Average, 1)
        $kevColor = if ($avgExp -gt 14) { $BG_CRIT } elseif ($avgExp -gt 7) { $BG_MEDIA } else { $BG_BAJA }

        $ws1.Cells.Item($r,1) = 'Hallazgos KEV activos';      $ws1.Cells.Item($r,2) = $kevActive.Count;       $ws1.Cells.Item($r,2).Interior.Color = $BG_CRIT; $r++
        $ws1.Cells.Item($r,1) = 'Exposicion maxima (dias)';   $ws1.Cells.Item($r,2) = $maxExp; $r++
        $ws1.Cells.Item($r,1) = 'Exposicion promedio (dias)'; $ws1.Cells.Item($r,2) = $avgExp; $ws1.Cells.Item($r,2).Interior.Color = $kevColor; $r++

        # Detalle por CVE (top 5 mas expuestos)
        $top = $kevActive | Sort-Object { try { ($now - (Get-Date ([string]$_.kev_dateAdded))).TotalDays } catch { 0 } } -Descending | Select-Object -First 5
        foreach ($f in $top) {
            $cve = if ($f.cve_primary) { [string]$f.cve_primary } else { 'CVE?' }
            try { $d = [Math]::Round(($now - (Get-Date ([string]$f.kev_dateAdded))).TotalDays, 0) } catch { $d = '?' }
            $ws1.Cells.Item($r,1) = "  $cve"
            $ws1.Cells.Item($r,2) = "$d dias en KEV"
            $r++
        }
    }

    $ws1.Columns.Item('A:B').AutoFit() | Out-Null

    # ── HOJA 2: HALLAZGOS (tabla maestra) ──
    $step = 'hoja hallazgos'
    $ws2 = Add-Sheet 'Hallazgos'
    $headers = @('#','Severidad','Prioridad','Score IA','Area','Herramienta','Hallazgo','ISO 25010','Esfuerzo (h)','Ocurrencias','Riesgo IA','Impacto Negocio','Remediacion')
    for ($c = 0; $c -lt $headers.Count; $c++) { $ws2.Cells.Item(1,$c+1) = $headers[$c] }
    Set-HeaderRow $ws2.Range($ws2.Cells.Item(1,1), $ws2.Cells.Item(1,$headers.Count))

    $r = 2
    $idx = 1
    $sortedFindings = $report.findings | Sort-Object -Property ai_priority_score -Descending
    foreach ($f in $sortedFindings) {
        $ws2.Cells.Item($r,1)  = $idx
        $ws2.Cells.Item($r,2)  = [string]$f.severity
        $ws2.Cells.Item($r,3)  = [string]$f.remediation_priority
        $ws2.Cells.Item($r,4)  = [int]$f.ai_priority_score
        $ws2.Cells.Item($r,5)  = [string]$f.business_area
        $ws2.Cells.Item($r,6)  = [string]$f.tool
        $ws2.Cells.Item($r,7)  = [string]$f.title
        $ws2.Cells.Item($r,8)  = [string]$f.iso25010
        $ws2.Cells.Item($r,9)  = [double]$f.estimated_effort_hours
        $ws2.Cells.Item($r,10) = [int]$f.occurrence_count
        $ws2.Cells.Item($r,11) = [string]$f.ai_risk_analysis
        $ws2.Cells.Item($r,12) = [string]$f.ai_business_impact
        $ws2.Cells.Item($r,13) = [string]$f.ai_remediation_detail

        # Color por severidad
        $cellSev = $ws2.Cells.Item($r,2)
        $cellSev.Interior.Color = (Get-SeverityColor $f.severity)
        $cellSev.Font.Color = $FG_WHITE
        $cellSev.Font.Bold = $true

        $r++; $idx++
    }
    # Auto-filtro
    $lastCol = [char](64 + $headers.Count)
    $rngTbl = $ws2.Range("A1:${lastCol}$($r-1)")
    $rngTbl.AutoFilter() | Out-Null
    $ws2.Range("A1:${lastCol}1").EntireColumn.AutoFit() | Out-Null
    # Anchos razonables
    $ws2.Columns.Item('G').ColumnWidth = 50
    $ws2.Columns.Item('K').ColumnWidth = 60
    $ws2.Columns.Item('L').ColumnWidth = 40
    $ws2.Columns.Item('M').ColumnWidth = 60
    $rngTbl.WrapText = $true
    $ws2.Application.ActiveWindow.SplitRow = 1
    $ws2.Application.ActiveWindow.FreezePanes = $true

    # ── HOJA 3: POR SEVERIDAD ──
    $step = 'hoja severidad'
    $ws3 = Add-Sheet 'Por Severidad'
    $ws3.Cells.Item(1,1) = 'Severidad'; $ws3.Cells.Item(1,2) = 'Cantidad'; $ws3.Cells.Item(1,3) = '% Total'; $ws3.Cells.Item(1,4) = 'SLA'
    Set-HeaderRow $ws3.Range('A1:D1')
    $sevs = @(
        @('CRITICA', $report.summary_by_severity.CRITICA, '72 horas'),
        @('ALTA',    $report.summary_by_severity.ALTA,    '7 dias'),
        @('MEDIA',   $report.summary_by_severity.MEDIA,   '30 dias'),
        @('BAJA',    $report.summary_by_severity.BAJA,    '90 dias')
    )
    $r = 2
    foreach ($s in $sevs) {
        $ws3.Cells.Item($r,1) = $s[0]
        $ws3.Cells.Item($r,2) = $s[1]
        $pct = if ($report.meta.total_normalized -gt 0) { [Math]::Round(($s[1] / [double]$report.meta.total_normalized) * 100, 1) } else { 0 }
        $ws3.Cells.Item($r,3) = "$pct%"
        $ws3.Cells.Item($r,4) = $s[2]
        $ws3.Cells.Item($r,1).Interior.Color = (Get-SeverityColor $s[0])
        $ws3.Cells.Item($r,1).Font.Color = $FG_WHITE
        $ws3.Cells.Item($r,1).Font.Bold = $true
        $r++
    }
    $ws3.Columns.Item('A:D').AutoFit() | Out-Null

    # ── HOJA 4: POR AREA NEGOCIO ──
    $step = 'hoja area'
    $ws4 = Add-Sheet 'Por Area Negocio'
    $ws4.Cells.Item(1,1) = 'Area';  $ws4.Cells.Item(1,2) = 'Cantidad';  $ws4.Cells.Item(1,3) = 'Esfuerzo (h)'; $ws4.Cells.Item(1,4) = 'Criticos'
    Set-HeaderRow $ws4.Range('A1:D1')
    $r = 2
    foreach ($area in @('Autenticacion','Sanciones','Administrados','Backend','Frontend','Pipeline','Infraestructura','General')) {
        $items = @($report.findings | Where-Object { $_.business_area -eq $area })
        if ($items.Count -eq 0) { continue }
        $effort = ($items | Measure-Object -Property estimated_effort_hours -Sum).Sum
        $criticos = @($items | Where-Object { $_.severity -eq 'CRITICA' }).Count
        $ws4.Cells.Item($r,1) = $area
        $ws4.Cells.Item($r,2) = $items.Count
        $ws4.Cells.Item($r,3) = [Math]::Round([double]$effort,1)
        $ws4.Cells.Item($r,4) = $criticos
        if ($criticos -gt 0) {
            $ws4.Cells.Item($r,4).Interior.Color = $BG_CRIT
            $ws4.Cells.Item($r,4).Font.Color = $FG_WHITE
            $ws4.Cells.Item($r,4).Font.Bold = $true
        }
        $r++
    }
    $ws4.Columns.Item('A:D').AutoFit() | Out-Null

    # ── HOJA 5: POR ISO 25010 ──
    $step = 'hoja iso'
    $ws5 = Add-Sheet 'Por ISO 25010'
    $ws5.Cells.Item(1,1) = 'Caracteristica ISO/IEC 25010'; $ws5.Cells.Item(1,2) = 'Cantidad'; $ws5.Cells.Item(1,3) = 'Esfuerzo (h)'
    Set-HeaderRow $ws5.Range('A1:C1')
    $isoMap = @{}
    foreach ($f in $report.findings) {
        $iso = if ($f.iso25010) { [string]$f.iso25010 } else { 'No clasificado' }
        if (-not $isoMap.ContainsKey($iso)) { $isoMap[$iso] = @{ count = 0; effort = 0.0 } }
        $isoMap[$iso].count++
        $isoMap[$iso].effort += [double]$f.estimated_effort_hours
    }
    $r = 2
    foreach ($k in ($isoMap.Keys | Sort-Object)) {
        $ws5.Cells.Item($r,1) = $k
        $ws5.Cells.Item($r,2) = $isoMap[$k].count
        $ws5.Cells.Item($r,3) = [Math]::Round([double]$isoMap[$k].effort,1)
        $r++
    }
    $ws5.Columns.Item('A:C').AutoFit() | Out-Null

    # ── HOJA 6: PLAN SPRINT ──
    $step = 'hoja sprint'
    $ws6 = Add-Sheet 'Plan Sprint'
    $ws6.Cells.Item(1,1) = 'Prioridad'; $ws6.Cells.Item(1,2) = 'Severidad'; $ws6.Cells.Item(1,3) = 'Area'; $ws6.Cells.Item(1,4) = 'Hallazgo'; $ws6.Cells.Item(1,5) = 'Esfuerzo (h)'; $ws6.Cells.Item(1,6) = 'Score IA'
    Set-HeaderRow $ws6.Range('A1:F1')
    $r = 2
    foreach ($p in @('INMEDIATA','SPRINT_ACTUAL','SPRINT_N+1','SPRINT_N+2','BACKLOG')) {
        $items = @($report.findings | Where-Object { $_.remediation_priority -eq $p })
        foreach ($it in $items) {
            $ws6.Cells.Item($r,1) = $p
            $ws6.Cells.Item($r,2) = [string]$it.severity
            $ws6.Cells.Item($r,3) = [string]$it.business_area
            $ws6.Cells.Item($r,4) = [string]$it.title
            $ws6.Cells.Item($r,5) = [double]$it.estimated_effort_hours
            $ws6.Cells.Item($r,6) = [int]$it.ai_priority_score
            $ws6.Cells.Item($r,2).Interior.Color = (Get-SeverityColor $it.severity)
            $ws6.Cells.Item($r,2).Font.Color = $FG_WHITE
            $ws6.Cells.Item($r,2).Font.Bold = $true
            $r++
        }
    }
    if ($r -gt 2) {
        $ws6.Range("A1:F$($r-1)").AutoFilter() | Out-Null
        $ws6.Application.ActiveWindow.SplitRow = 1
        $ws6.Application.ActiveWindow.FreezePanes = $true
    }
    $ws6.Columns.Item('A:F').AutoFit() | Out-Null
    $ws6.Columns.Item('D').ColumnWidth = 60

    # ── HOJA 7: TENDENCIA ──
    $step = 'hoja tendencia'
    $ws7 = Add-Sheet 'Tendencia'
    $ws7.Cells.Item(1,1) = 'Esta hoja se llenara cuando exista al menos una corrida anterior comparativa.'
    $ws7.Cells.Item(2,1) = 'Ejecutar: npm run ai:compare'
    $ws7.Cells.Item(4,1) = 'Fecha';  $ws7.Cells.Item(4,2) = 'Total';  $ws7.Cells.Item(4,3) = 'Critica';  $ws7.Cells.Item(4,4) = 'Alta';  $ws7.Cells.Item(4,5) = 'Resueltos';  $ws7.Cells.Item(4,6) = 'Nuevos';  $ws7.Cells.Item(4,7) = 'Indice Calidad'
    Set-HeaderRow $ws7.Range('A4:G4')
    $ws7.Cells.Item(5,1) = (Get-Date -Format 'dd/MM/yyyy')
    $ws7.Cells.Item(5,2) = $report.meta.total_normalized
    $ws7.Cells.Item(5,3) = $report.summary_by_severity.CRITICA
    $ws7.Cells.Item(5,4) = $report.summary_by_severity.ALTA
    $ws7.Cells.Item(5,5) = '-'
    $ws7.Cells.Item(5,6) = '-'
    $ws7.Cells.Item(5,7) = '-'
    $ws7.Columns.Item('A:G').AutoFit() | Out-Null

    # ── HOJA 8: DEUDA TECNICA ──
    $step = 'hoja deuda'
    $ws8 = Add-Sheet 'Deuda Tecnica'
    $ws8.Cells.Item(1,1) = 'Concepto'; $ws8.Cells.Item(1,2) = 'Horas'; $ws8.Cells.Item(1,3) = 'Dias-persona'
    Set-HeaderRow $ws8.Range('A1:C1')
    $deudaTotal = ($report.findings | Measure-Object -Property estimated_effort_hours -Sum).Sum
    $deudaCrit  = ($report.findings | Where-Object { $_.severity -eq 'CRITICA' } | Measure-Object -Property estimated_effort_hours -Sum).Sum
    $deudaAlta  = ($report.findings | Where-Object { $_.severity -eq 'ALTA' }    | Measure-Object -Property estimated_effort_hours -Sum).Sum
    $deudaMed   = ($report.findings | Where-Object { $_.severity -eq 'MEDIA' }   | Measure-Object -Property estimated_effort_hours -Sum).Sum
    $deudaBaja  = ($report.findings | Where-Object { $_.severity -eq 'BAJA' }    | Measure-Object -Property estimated_effort_hours -Sum).Sum
    $rows = @(
        @('Deuda total',     $deudaTotal),
        @('Deuda critica',   $deudaCrit),
        @('Deuda alta',      $deudaAlta),
        @('Deuda media',     $deudaMed),
        @('Deuda baja',      $deudaBaja)
    )
    $r = 2
    foreach ($x in $rows) {
        $ws8.Cells.Item($r,1) = $x[0]
        $ws8.Cells.Item($r,2) = [Math]::Round([double]$x[1],1)
        $ws8.Cells.Item($r,3) = [Math]::Round([double]$x[1] / 8.0, 1)
        $r++
    }
    $ws8.Columns.Item('A:C').AutoFit() | Out-Null

    # Activar la primera hoja
    $wb.Worksheets.Item(1).Activate()

    $step = 'guardar'
    if (Test-Path $OutputXlsx) { Remove-Item $OutputXlsx -Force }
    $wb.SaveAs([string]$OutputXlsx, 51)  # xlOpenXMLWorkbook = 51
    $wb.Close($false)
    $excel.Quit()

    Write-Host "`n  [OK] Generado: $OutputXlsx" -ForegroundColor Green
}
catch {
    Write-Host "`n  [ERROR] paso '$step' - $($_.Exception.Message)" -ForegroundColor Red
    if ($wb)    { try { $wb.Close($false) } catch {} }
    if ($excel) { try { $excel.Quit() } catch {} }
    throw
}
finally {
    if ($excel) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null 2>$null }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
