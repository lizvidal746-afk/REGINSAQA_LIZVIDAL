<#
.SYNOPSIS
    Limpia los reportes de performance k6 en reportes/ (JSON de estado, resumen, dataset)
    NO elimina el log de Grafana Cloud ni los JSON de secuencia activa.
.EXAMPLE
    pwsh scripts/limpiar-reportes-k6.ps1
    pwsh scripts/limpiar-reportes-k6.ps1 -DryRun
    pwsh scripts/limpiar-reportes-k6.ps1 -IncluirSecuencias   # elimina tambien JSON de secuencia/persistencia
#>
param(
    [switch]$DryRun,
    [switch]$IncluirSecuencias
)

$Root     = Resolve-Path (Join-Path $PSScriptRoot '..')
$Reportes = Join-Path $Root 'reportes'

Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "  LIMPIEZA REPORTES K6 — REGINSA" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow

# Patrones a eliminar siempre (resumen y estado de presentacion)
$siemprePatrones = @(
    'k6-presentacion-00-04-resumen.json',
    'k6-presentacion-00-04-resumen.md',
    'k6-presentacion-status.json',
    'k6-caso04-summary.json',
    'k6-global-secuencia.json'
)

# Patrones a eliminar solo con -IncluirSecuencias
$secuenciaPatrones = @(
    'k6-caso01-dataset.json',
    'k6-caso01-persistencia.json',
    'k6-caso01-secuencia.json',
    'funcional-caso01-secuencia.json',
    'funcional-caso01-secuencia-state.json',
    'reconsideracion-*.json',
    'dynamic-candidate-pool.json'
)

$toDelete = @()
foreach ($pat in $siemprePatrones) {
    $resolved = Get-ChildItem -Path $Reportes -Filter $pat -File -ErrorAction SilentlyContinue
    if ($resolved) { $toDelete += $resolved }
}

if ($IncluirSecuencias) {
    foreach ($pat in $secuenciaPatrones) {
        $resolved = Get-ChildItem -Path $Reportes -Filter $pat -File -ErrorAction SilentlyContinue
        if ($resolved) { $toDelete += $resolved }
    }
}

if ($toDelete.Count -eq 0) {
    Write-Host "  [--] No se encontraron archivos k6 a limpiar." -ForegroundColor DarkGray
    Write-Host ""
    return
}

Write-Host ""
Write-Host "  Archivos a eliminar:" -ForegroundColor White
$toDelete | ForEach-Object { Write-Host "    $($_.Name)" -ForegroundColor Cyan }
if (-not $IncluirSecuencias) {
    Write-Host ""
    Write-Host "  (Usa -IncluirSecuencias para borrar tambien JSON de dataset/secuencia/persistencia)" -ForegroundColor DarkGray
}
Write-Host ""

if ($DryRun) {
    Write-Host "  [DRY-RUN] No se elimino nada. Usa sin -DryRun para borrar." -ForegroundColor Yellow
} else {
    $toDelete | Remove-Item -Force
    Write-Host "  [OK] Eliminados $($toDelete.Count) archivos k6." -ForegroundColor Green
}
Write-Host ""
