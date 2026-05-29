<#
.SYNOPSIS
    Genera Word comparativo IA con KPIs ANTES vs DESPUES + SLA + tendencias.

.DESCRIPTION
    Lee el comparativo Markdown generado por comparativo-ia.ps1 y produce
    COMPARATIVO_IA_<fecha>.docx con tablas formateadas y semaforo de tendencia.

.NOTES
    Requiere ejecutar primero: npm run ai:compare
#>
[CmdletBinding()]
param(
    [string]$PreviousJson = "",
    [string]$CurrentJson  = "",
    [string]$OutputDocx   = "",
    [string]$LogoPath     = ""
)

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'

$Root        = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$InformesDir = Join-Path $Root 'reportes\informes'

# Auto-detect 2 corridas
function Get-FechaCorta { param([string]$n) if ($n -match '(\d{4}-\d{2}-\d{2})') { $matches[1] } else { $null } }

if (-not $CurrentJson -or -not $PreviousJson) {
    $candidates = @()
    foreach ($pat in @('findings-analyzed-*.json','findings-normalized-*.json','hallazgos-consolidados-*.json')) {
        $candidates = Get-ChildItem -Path $InformesDir -Filter $pat -File | Where-Object { $_.Name -notmatch '_heuristic' } | Sort-Object Name -Descending
        if ($candidates.Count -ge 2) { break }
    }
    if ($candidates.Count -lt 2) { throw "Se requieren 2 archivos para comparar" }
    $cur = $candidates[0]
    $fcur = Get-FechaCorta $cur.Name
    $prev = $candidates | Select-Object -Skip 1 | Where-Object { (Get-FechaCorta $_.Name) -ne $fcur } | Select-Object -First 1
    if (-not $prev) { throw "Solo hay corridas del mismo dia ($fcur)" }
    if (-not $CurrentJson)  { $CurrentJson  = $cur.FullName }
    if (-not $PreviousJson) { $PreviousJson = $prev.FullName }
}
if (-not $OutputDocx) {
    $stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm'
    $OutputDocx = Join-Path $InformesDir "COMPARATIVO_IA_$stamp.docx"
}
if (-not $LogoPath) {
    $candidate = Join-Path $Root 'SI091_REGINSA_ENLINEA\src\assets\images\img-logo-sunedu.png'
    if (Test-Path $candidate) { $LogoPath = $candidate }
}

Write-Host "`n=== COMPARATIVO IA - WORD ===" -ForegroundColor Magenta
Write-Host "  Anterior: $PreviousJson" -ForegroundColor Cyan
Write-Host "  Actual  : $CurrentJson"  -ForegroundColor Cyan
Write-Host "  Output  : $OutputDocx"   -ForegroundColor Cyan

function Load-Findings { param([string]$Path)
    $j = Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.PSObject.Properties.Name -contains 'findings') {
        return @{ findings = @($j.findings); meta = $j.meta }
    }
    $list = @()
    foreach ($h in $j.hallazgos) {
        $hall = if ($h.PSObject.Properties.Name -contains 'hallazgo') { [string]$h.hallazgo } else { '' }
        $herr = if ($h.PSObject.Properties.Name -contains 'herramienta') { [string]$h.herramienta } else { 'unknown' }
        $key = if ($hall -match '(CVE-\d{4}-\d{4,7})') { "CVE::$($Matches[1])" }
               elseif ($hall -match '(GHSA-[a-z0-9-]+)') { "GHSA::$($Matches[1])" }
               elseif ($hall -match '(CKV2?_[A-Z0-9_]+)') { "CHECKOV::$($Matches[1])" }
               elseif ($hall -match '^\[([^\]]+)\]')      { "SEMGREP::$($Matches[1])" }
               else { "$herr`::$($hall.Substring(0,[Math]::Min(80,$hall.Length)))" }
        $list += [PSCustomObject]@{
            group_key            = $key
            severity             = if ($h.PSObject.Properties.Name -contains 'severidad') { [string]$h.severidad } else { 'MEDIA' }
            title                = $hall
            tool                 = $herr
            business_area        = 'General'
            occurrence_count     = 1
            estimated_effort_hours = 2
            remediation_priority = 'BACKLOG'
            first_seen           = if ($h.PSObject.Properties.Name -contains 'fecha_deteccion') { [string]$h.fecha_deteccion } else { '' }
        }
    }
    return @{ findings = $list; meta = $j.meta }
}

$prev = Load-Findings $PreviousJson
$curr = Load-Findings $CurrentJson

$prevByKey = @{}; foreach ($f in $prev.findings) { $prevByKey[$f.group_key] = $f }
$currByKey = @{}; foreach ($f in $curr.findings) { $currByKey[$f.group_key] = $f }

$resolved   = @(); foreach ($k in $prevByKey.Keys) { if (-not $currByKey.ContainsKey($k)) { $resolved   += $prevByKey[$k] } }
$newOnes    = @(); foreach ($k in $currByKey.Keys) { if (-not $prevByKey.ContainsKey($k)) { $newOnes    += $currByKey[$k] } }
$persistent = @(); foreach ($k in $currByKey.Keys) { if ($prevByKey.ContainsKey($k))      { $persistent += $currByKey[$k] } }

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

function Tendencia { param([double]$ant, [double]$act)
    if ($ant -eq 0 -and $act -eq 0) { return 'Estable (0%)' }
    if ($ant -eq 0) { return "Aumento (+inf)" }
    $delta = (($act - $ant) / $ant) * 100
    $deltaR = [Math]::Round($delta, 1)
    $sign = if ($deltaR -gt 0) { '+' } else { '' }
    $eti = if ($deltaR -gt 5) { 'Aumento' } elseif ($deltaR -lt -5) { 'Mejora' } else { 'Estable' }
    return "$eti ($sign$deltaR%)"
}

$slaMap = @{ 'CRITICA' = 3; 'ALTA' = 7; 'MEDIA' = 30; 'BAJA' = 90 }
function Get-DaysOpen { param($f)
    if (-not $f.first_seen) { return 0 }
    try { return [int]([DateTime]::Now - [DateTime]::Parse($f.first_seen)).TotalDays } catch { return 0 }
}

$enSla = 0; $totalCheck = 0
foreach ($f in $persistent) { $totalCheck++; $d = Get-DaysOpen $f; $sla = $slaMap[$f.severity]; if (-not $sla) { $sla = 30 }; if ($d -le $sla) { $enSla++ } }
$slaCompl = if ($totalCheck -gt 0) { [Math]::Round(($enSla / [double]$totalCheck) * 100, 1) } else { 100 }

$tasaResol = if ($rPrev.Total -gt 0) { [Math]::Round(($resolved.Count / [double]$rPrev.Total) * 100, 1) } else { 0 }
$pctCrit = if ($rCurr.Total -gt 0) { ($rCurr.CRITICA / [double]$rCurr.Total) * 100 } else { 0 }
$indCal = [Math]::Max(0, 100 - ($pctCrit * 3) - ((100 - $slaCompl) * 0.5))
$indCal = [Math]::Round($indCal, 1)

$frase = if ($rCurr.CRITICA -gt 0 -and $tasaResol -lt 20) { 'NO APTO - alta cantidad de criticos sin resolver' }
         elseif ($rCurr.CRITICA -gt 0)                    { 'APTO CON RESERVAS - atender criticos antes del release' }
         else                                             { 'APTO - tendencia positiva' }

# === Generar Word ===
$word = $null; $doc = $null; $step = 'init'
$COLOR_HEAD_BG = [int]0x1F4E79
$COLOR_HEAD_FG = [int]0xFFFFFF

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $doc = $word.Documents.Add()
    $sel = $word.Selection

    $doc.PageSetup.TopMargin    = $word.CentimetersToPoints(2.5)
    $doc.PageSetup.BottomMargin = $word.CentimetersToPoints(2.5)
    $doc.PageSetup.LeftMargin   = $word.CentimetersToPoints(2.5)
    $doc.PageSetup.RightMargin  = $word.CentimetersToPoints(2.5)

    function Style-HeaderRow { param($row)
        for ($c = 1; $c -le $row.Cells.Count; $c++) {
            $row.Cells.Item($c).Range.Font.Bold = $true
            $row.Cells.Item($c).Range.Font.Color = [int]$COLOR_HEAD_FG
            $row.Cells.Item($c).Shading.BackgroundPatternColor = [int]$COLOR_HEAD_BG
        }
    }
    function Add-Table { param([string[][]]$Data, [int[]]$ColPercents)
        $tbl = $doc.Tables.Add($sel.Range, $Data.Count, $Data[0].Count)
        $tbl.Borders.Enable = $true
        $tbl.PreferredWidthType = 2
        $tbl.PreferredWidth = [float]100
        for ($r = 0; $r -lt $Data.Count; $r++) {
            for ($c = 0; $c -lt $Data[$r].Count; $c++) {
                $tbl.Cell($r+1, $c+1).Range.Text = [string]$Data[$r][$c]
            }
        }
        if ($ColPercents) {
            for ($c = 0; $c -lt $ColPercents.Count; $c++) {
                $tbl.Columns.Item($c+1).PreferredWidthType = 2
                $tbl.Columns.Item($c+1).PreferredWidth = [float]$ColPercents[$c]
            }
        }
        Style-HeaderRow $tbl.Rows.Item(1)
        $sel.EndOf(15) | Out-Null
        $sel.TypeParagraph()
    }
    function Add-Heading { param([string]$Text, [int]$Level = 1)
        $builtin = -1 - $Level
        try { $sel.Style = $builtin } catch { $sel.Font.Bold = $true; $sel.Font.Size = (16 - $Level) }
        $sel.TypeText($Text); $sel.TypeParagraph()
        try { $sel.Style = -1 } catch { $sel.Font.Bold = $false; $sel.Font.Size = 11 }
    }
    function Add-Para { param([string]$Text) $sel.TypeText($Text); $sel.TypeParagraph() }

    $step = 'portada'
    if ($LogoPath -and (Test-Path $LogoPath)) {
        $sel.ParagraphFormat.Alignment = 1
        $sel.InlineShapes.AddPicture($LogoPath) | Out-Null
        $sel.TypeParagraph()
    }
    $sel.ParagraphFormat.Alignment = 1
    $sel.Font.Size = 22; $sel.Font.Bold = $true; $sel.Font.Color = $COLOR_HEAD_BG
    $sel.TypeText("INFORME COMPARATIVO IA"); $sel.TypeParagraph()
    $sel.Font.Size = 16
    $sel.TypeText("Sistema REGINSA - SUNEDU"); $sel.TypeParagraph()
    $sel.Font.Size = 12; $sel.Font.Bold = $false; $sel.Font.Color = [int]0x000000
    $sel.TypeText("Comparacion entre dos corridas consecutivas"); $sel.TypeParagraph()
    $sel.TypeParagraph()
    $sel.Font.Size = 11
    $sel.TypeText("Fecha: $(Get-Date -Format 'dd/MM/yyyy HH:mm')"); $sel.TypeParagraph()
    $sel.TypeText("Norma aplicada: ISO/IEC 25010 + ISTQB"); $sel.TypeParagraph()
    $sel.TypeParagraph()
    $sel.Font.Size = 14; $sel.Font.Bold = $true
    $color = if ($frase -like '*NO APTO*') { [int]0x0000C0 } elseif ($frase -like '*RESERVAS*') { [int]0x0080FF } else { [int]0x008000 }
    $sel.Font.Color = $color
    $sel.TypeText("Estado: $frase"); $sel.TypeParagraph()

    $sel.InsertNewPage()
    $sel.ParagraphFormat.Alignment = 0
    $sel.Font.Color = [int]0x000000; $sel.Font.Size = 11; $sel.Font.Bold = $false

    # KPIs
    $step = 'kpi matrix'
    Add-Heading "1. Matriz Comparativa de KPIs"
    $kpiData = @(
        @('Indicador','Anterior','Actual','Tendencia'),
        @('Hallazgos accionables', [string]$rPrev.Total,  [string]$rCurr.Total,  (Tendencia $rPrev.Total  $rCurr.Total)),
        @('CRITICA',               [string]$rPrev.CRITICA,[string]$rCurr.CRITICA,(Tendencia $rPrev.CRITICA $rCurr.CRITICA)),
        @('ALTA',                  [string]$rPrev.ALTA,   [string]$rCurr.ALTA,   (Tendencia $rPrev.ALTA   $rCurr.ALTA)),
        @('MEDIA',                 [string]$rPrev.MEDIA,  [string]$rCurr.MEDIA,  (Tendencia $rPrev.MEDIA  $rCurr.MEDIA)),
        @('BAJA',                  [string]$rPrev.BAJA,   [string]$rCurr.BAJA,   (Tendencia $rPrev.BAJA   $rCurr.BAJA)),
        @('Hallazgos resueltos',   '-',                   [string]$resolved.Count,   '-'),
        @('Hallazgos nuevos',      '-',                   [string]$newOnes.Count,    '-'),
        @('Hallazgos persistentes','-',                   [string]$persistent.Count, '-'),
        @('Tasa de resolucion',    '-',                   "$tasaResol%",             '-'),
        @('Cumplimiento SLA',      '-',                   "$slaCompl%",              '-'),
        @('Indice de calidad QA',  '-',                   "$indCal/100",             '-')
    )
    Add-Table -Data $kpiData -ColPercents @(35, 18, 18, 29)

    # Resueltos
    $step = 'resueltos'
    Add-Heading "2. Hallazgos Resueltos en este Ciclo ($($resolved.Count))"
    if ($resolved.Count -eq 0) {
        Add-Para "Sin resoluciones en este ciclo."
    } else {
        $resData = @(@('Severidad','Hallazgo','Herramienta'))
        foreach ($r in ($resolved | Select-Object -First 20)) {
            $t = [string]$r.title; if ($t.Length -gt 80) { $t = $t.Substring(0,77) + '...' }
            $resData += ,@([string]$r.severity, $t, [string]$r.tool)
        }
        Add-Table -Data $resData -ColPercents @(15, 65, 20)
        if ($resolved.Count -gt 20) { Add-Para "... y $($resolved.Count - 20) hallazgos resueltos adicionales." }
    }

    # Nuevos
    $step = 'nuevos'
    Add-Heading "3. Hallazgos Nuevos ($($newOnes.Count))"
    if ($newOnes.Count -eq 0) {
        Add-Para "Sin hallazgos nuevos. Excelente."
    } else {
        $newData = @(@('Severidad','Area','Hallazgo','Esfuerzo'))
        foreach ($n in ($newOnes | Select-Object -First 25)) {
            $t = [string]$n.title; if ($t.Length -gt 70) { $t = $t.Substring(0,67) + '...' }
            $eff = if ($n.PSObject.Properties.Name -contains 'estimated_effort_hours') { "$($n.estimated_effort_hours)h" } else { 'N/D' }
            $area = if ($n.PSObject.Properties.Name -contains 'business_area') { $n.business_area } else { 'N/D' }
            $newData += ,@([string]$n.severity, $area, $t, $eff)
        }
        Add-Table -Data $newData -ColPercents @(15, 18, 57, 10)
        if ($newOnes.Count -gt 25) { Add-Para "... y $($newOnes.Count - 25) hallazgos nuevos adicionales." }
    }

    # Persistentes con SLA
    $step = 'persistentes'
    Add-Heading "4. Hallazgos Persistentes y Cumplimiento SLA"
    Add-Para "SLA aplicado por severidad: CRITICA 3 dias, ALTA 7 dias, MEDIA 30 dias, BAJA 90 dias."
    $fueraSla = @()
    foreach ($f in $persistent) { $d = Get-DaysOpen $f; $sla = $slaMap[$f.severity]; if (-not $sla) { $sla = 30 }; if ($d -gt $sla) { $fueraSla += [PSCustomObject]@{ f=$f; days=$d; sla=$sla } } }
    if ($fueraSla.Count -eq 0) {
        Add-Para "Todos los persistentes estan dentro de SLA."
    } else {
        Add-Heading "4.1 Fuera de SLA - escalar inmediatamente" 2
        $slaData = @(@('Severidad','Dias abierto','SLA (dias)','Hallazgo'))
        foreach ($x in ($fueraSla | Sort-Object -Property { -$_.days } | Select-Object -First 20)) {
            $t = [string]$x.f.title; if ($t.Length -gt 70) { $t = $t.Substring(0,67) + '...' }
            $slaData += ,@([string]$x.f.severity, [string]$x.days, [string]$x.sla, $t)
        }
        Add-Table -Data $slaData -ColPercents @(15, 15, 15, 55)
    }

    # Deuda tecnica acumulada
    $step = 'deuda comparativa'
    Add-Heading "5. Deuda Tecnica - Evolucion"
    $deudaPrev = ($prev.findings | Measure-Object -Property estimated_effort_hours -Sum).Sum
    $deudaCurr = ($curr.findings | Measure-Object -Property estimated_effort_hours -Sum).Sum
    $deudaPrev = [Math]::Round([double]$deudaPrev,1)
    $deudaCurr = [Math]::Round([double]$deudaCurr,1)
    $deudaData = @(
        @('Concepto','Anterior (h)','Actual (h)','Variacion'),
        @('Deuda total acumulada', [string]$deudaPrev, [string]$deudaCurr, (Tendencia $deudaPrev $deudaCurr))
    )
    Add-Table -Data $deudaData -ColPercents @(40, 20, 20, 20)

    # Conclusiones
    $step = 'conclusiones'
    Add-Heading "6. Conclusiones y Plan de Accion"
    Add-Para "Estado: $frase"
    Add-Para "Tasa de resolucion ciclo: $tasaResol% ($($resolved.Count) de $($rPrev.Total))."
    Add-Para "Cumplimiento SLA actual: $slaCompl%."
    Add-Para "Indice de calidad QA: $indCal / 100."
    if ($newOnes.Count -gt $resolved.Count) {
        Add-Para "ALERTA: ingresaron mas hallazgos nuevos ($($newOnes.Count)) que los resueltos ($($resolved.Count)). Revisar pipelines y procesos de revision de codigo."
    }
    if ($fueraSla.Count -gt 0) {
        Add-Para "ALERTA: $($fueraSla.Count) hallazgos persistentes fuera de SLA. Escalar a jefatura."
    }

    $step = 'guardar'
    if (Test-Path $OutputDocx) { Remove-Item $OutputDocx -Force }
    $doc.SaveAs2([string]$OutputDocx, 12)
    $doc.Close($false)
    $word.Quit()

    Write-Host "`n  RESUMEN COMPARATIVO:" -ForegroundColor Yellow
    Write-Host "    Anterior: $($rPrev.Total) (CRIT $($rPrev.CRITICA) | ALTA $($rPrev.ALTA))" -ForegroundColor DarkGray
    Write-Host "    Actual  : $($rCurr.Total) (CRIT $($rCurr.CRITICA) | ALTA $($rCurr.ALTA))" -ForegroundColor DarkGray
    Write-Host "    Resueltos: $($resolved.Count) | Nuevos: $($newOnes.Count) | Persistentes: $($persistent.Count)" -ForegroundColor DarkGray
    Write-Host "    Indice calidad: $indCal/100 | SLA: $slaCompl%" -ForegroundColor White
    Write-Host "  [OK] Generado: $OutputDocx" -ForegroundColor Green
}
catch {
    Write-Host "`n  [ERROR] paso '$step' - $($_.Exception.Message)" -ForegroundColor Red
    if ($doc)  { try { $doc.Close($false) } catch {} }
    if ($word) { try { $word.Quit() } catch {} }
    throw
}
finally {
    if ($word) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null 2>$null }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
