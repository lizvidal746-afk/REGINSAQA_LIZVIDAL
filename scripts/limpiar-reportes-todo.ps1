<#
.SYNOPSIS
    Limpieza maestra de reportes con retencion configurable — REGINSA.

.DESCRIPTION
    Limpia las carpetas de salida (reportes/security, reportes/informes, reportes/playwright,
    reportes/k6, reportes/newman, etc.) conservando las N corridas mas recientes (por defecto 2).

    Uso tipico:
      - Antes de un ciclo nuevo: -Total                  (limpia TODO, deja base limpia)
      - Mantenimiento periodico: (sin parametros)        (conserva las 2 ultimas)
      - Solo simular:           -DryRun

    Estructura esperada:
      reportes/security/yyyy-MM-dd_HH-mm/...    (carpetas dated)
      reportes/informes/hallazgos-consolidados-yyyy-MM-dd_HH-mm.json
      reportes/informes/INFORME_QA_REGINSA_*_yyyy-MM-dd_HH-mm.docx
      reportes/informes/METRICAS_QA_REGINSA_yyyy-MM-dd_HH-mm.xlsx
      reportes/informes/INFORME_COMPARATIVO_*_yyyy-MM-dd_HH-mm.docx

.PARAMETER Conservar
    Numero de corridas mas recientes a mantener (1..10). Default: 2.

.PARAMETER Total
    Si se especifica, borra TODO sin conservar nada (limpieza total tipo plantilla limpia).

.PARAMETER DryRun
    Muestra lo que se eliminaria sin borrar nada.

.EXAMPLE
    pwsh scripts/limpiar-reportes-todo.ps1                  # conserva 2 ultimas
    pwsh scripts/limpiar-reportes-todo.ps1 -Conservar 3
    pwsh scripts/limpiar-reportes-todo.ps1 -Total           # limpieza total
    pwsh scripts/limpiar-reportes-todo.ps1 -Total -DryRun   # simular limpieza total
#>
param(
    [ValidateRange(1, 10)]
    [int]$Conservar = 2,
    [switch]$Total,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$Root      = Resolve-Path (Join-Path $PSScriptRoot '..')
$Reportes  = Join-Path $Root 'reportes'
$Security  = Join-Path $Reportes 'security'
$Informes  = Join-Path $Reportes 'informes'

Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "  LIMPIEZA MAESTRA DE REPORTES — REGINSA" -ForegroundColor Yellow
Write-Host "  Modo: $(if ($Total) { 'TOTAL (sin retencion)' } else { "Conservar $Conservar ultimas corridas" })  $(if ($DryRun) { '[DRY-RUN]' })" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow

if (-not (Test-Path $Reportes)) {
    Write-Host "  [--] Carpeta no encontrada: $Reportes" -ForegroundColor DarkGray
    return
}

$dateRegex = '\d{4}-\d{2}-\d{2}(_\d{2}-\d{2})?'

function Get-FechasDeCarpetas {
    param([string]$Path, [string]$Pattern = '*')
    if (-not (Test-Path $Path)) { return @() }
    Get-ChildItem -Path $Path -Directory -Filter $Pattern -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match $dateRegex } |
        Sort-Object Name -Descending
}

function Get-FechasDeArchivos {
    param([string]$Path, [string]$Pattern)
    if (-not (Test-Path $Path)) { return @() }
    Get-ChildItem -Path $Path -File -Filter $Pattern -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match $dateRegex } |
        Sort-Object Name -Descending
}

# ── 1) reportes/security/yyyy-MM-dd_HH-mm/ (carpetas dated) ──
Write-Host ""
Write-Host "── reportes/security/ (corridas dated) ──" -ForegroundColor Cyan
$secDirs = @(Get-FechasDeCarpetas -Path $Security)
if ($secDirs.Count -eq 0) {
    Write-Host "  [--] sin carpetas dated" -ForegroundColor DarkGray
} else {
    $aBorrar = if ($Total) { $secDirs } else { $secDirs | Select-Object -Skip $Conservar }
    $aMantener = if ($Total) { @() } else { $secDirs | Select-Object -First $Conservar }
    foreach ($d in $aMantener) { Write-Host "  [KEEP] $($d.Name)" -ForegroundColor Green }
    foreach ($d in $aBorrar)  {
        Write-Host "  [DEL]  $($d.Name)" -ForegroundColor Red
        if (-not $DryRun) { Remove-Item $d.FullName -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

# ── 2) reportes/informes/ (json + docx + xlsx) ──
Write-Host ""
Write-Host "── reportes/informes/ (consolidados) ──" -ForegroundColor Cyan

$patterns = @(
    @{ Tipo = 'JSON';  Filter = 'hallazgos-consolidados-*.json' },
    @{ Tipo = 'WORD';  Filter = 'INFORME_QA_REGINSA_*.docx' },
    @{ Tipo = 'EXCEL'; Filter = 'METRICAS_QA_REGINSA_*.xlsx' },
    @{ Tipo = 'COMP';  Filter = 'INFORME_COMPARATIVO_*.docx' }
)

foreach ($p in $patterns) {
    $files = @(Get-FechasDeArchivos -Path $Informes -Pattern $p.Filter)
    if ($files.Count -eq 0) {
        Write-Host "  [--] $($p.Tipo): sin archivos" -ForegroundColor DarkGray
        continue
    }
    $aBorrar   = if ($Total) { $files } else { $files | Select-Object -Skip $Conservar }
    $aMantener = if ($Total) { @() }    else { $files | Select-Object -First $Conservar }
    foreach ($f in $aMantener) { Write-Host "  [KEEP] $($p.Tipo): $($f.Name)" -ForegroundColor Green }
    foreach ($f in $aBorrar)  {
        Write-Host "  [DEL]  $($p.Tipo): $($f.Name)" -ForegroundColor Red
        if (-not $DryRun) { Remove-Item $f.FullName -Force -ErrorAction SilentlyContinue }
    }
}

# ── 3) Subcarpetas dentro de reportes/informes/ (ej. 2026-05-04/) ──
Write-Host ""
Write-Host "── reportes/informes/ (subcarpetas dated) ──" -ForegroundColor Cyan
$infDirs = @(Get-FechasDeCarpetas -Path $Informes)
if ($infDirs.Count -eq 0) {
    Write-Host "  [--] sin subcarpetas dated" -ForegroundColor DarkGray
} else {
    $aBorrar   = if ($Total) { $infDirs } else { $infDirs | Select-Object -Skip $Conservar }
    $aMantener = if ($Total) { @() }      else { $infDirs | Select-Object -First $Conservar }
    foreach ($d in $aMantener) { Write-Host "  [KEEP] $($d.Name)" -ForegroundColor Green }
    foreach ($d in $aBorrar)  {
        Write-Host "  [DEL]  $($d.Name)" -ForegroundColor Red
        if (-not $DryRun) { Remove-Item $d.FullName -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

# ── 4) Otros (k6, newman, playwright) — opcional, solo si Total ──
if ($Total) {
    Write-Host ""
    Write-Host "── Otros (Total) ──" -ForegroundColor Cyan
    $opcional = @('k6', 'newman', 'playwright', 'reginsa-results')
    foreach ($sub in $opcional) {
        $p = Join-Path $Reportes $sub
        if (Test-Path $p) {
            Write-Host "  [DEL]  reportes/$sub/" -ForegroundColor Red
            if (-not $DryRun) {
                Get-ChildItem $p -Force -ErrorAction SilentlyContinue |
                    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  $(if ($DryRun) { 'DRY-RUN COMPLETADO (no se borro nada)' } else { 'LIMPIEZA COMPLETADA' })" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
