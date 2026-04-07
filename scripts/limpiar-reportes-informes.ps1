<#
.SYNOPSIS
    Limpia los informes Word/Excel/JSON consolidados generados en reportes/informes/
.EXAMPLE
    pwsh scripts/limpiar-reportes-informes.ps1
    pwsh scripts/limpiar-reportes-informes.ps1 -DryRun
    pwsh scripts/limpiar-reportes-informes.ps1 -Tipo hallazgos   # solo JSON
    pwsh scripts/limpiar-reportes-informes.ps1 -Tipo word
    pwsh scripts/limpiar-reportes-informes.ps1 -Tipo excel
#>
param(
    [ValidateSet('Todos', 'hallazgos', 'word', 'excel')]
    [string]$Tipo = 'Todos',
    [switch]$DryRun
)

$Root     = Resolve-Path (Join-Path $PSScriptRoot '..')
$Informes = Join-Path $Root 'reportes\informes'

Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "  LIMPIEZA INFORMES GENERADOS — REGINSA" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow

if (-not (Test-Path $Informes)) {
    Write-Host "  [--] Carpeta no encontrada: $Informes" -ForegroundColor DarkGray
    return
}

$toDelete = @()
if ($Tipo -eq 'Todos' -or $Tipo -eq 'hallazgos') {
    $toDelete += Get-ChildItem -Path $Informes -Filter 'hallazgos-consolidados-*.json' -File -ErrorAction SilentlyContinue
}
if ($Tipo -eq 'Todos' -or $Tipo -eq 'word') {
    $toDelete += Get-ChildItem -Path $Informes -Filter 'INFORME_QA_REGINSA_*.docx'    -File -ErrorAction SilentlyContinue
}
if ($Tipo -eq 'Todos' -or $Tipo -eq 'excel') {
    $toDelete += Get-ChildItem -Path $Informes -Filter 'METRICAS_QA_REGINSA_*.xlsx'   -File -ErrorAction SilentlyContinue
}

if ($toDelete.Count -eq 0) {
    Write-Host "  [--] No se encontraron informes a limpiar (tipo: $Tipo)." -ForegroundColor DarkGray
    Write-Host ""
    return
}

Write-Host ""
Write-Host "  Archivos a eliminar en reportes/informes/ :" -ForegroundColor White
$toDelete | ForEach-Object { Write-Host "    $($_.Name)" -ForegroundColor Cyan }
Write-Host ""

if ($DryRun) {
    Write-Host "  [DRY-RUN] No se elimino nada. Usa sin -DryRun para borrar." -ForegroundColor Yellow
} else {
    $toDelete | Remove-Item -Force
    Write-Host "  [OK] Eliminados $($toDelete.Count) informes." -ForegroundColor Green
}
Write-Host ""
