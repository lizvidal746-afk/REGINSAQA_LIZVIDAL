<#
.SYNOPSIS
    Limpia los reportes generados por Trivy en reportes/security/
.EXAMPLE
    pwsh scripts/limpiar-reportes-trivy.ps1
    pwsh scripts/limpiar-reportes-trivy.ps1 -DryRun
#>
param([switch]$DryRun)

$Root    = Resolve-Path (Join-Path $PSScriptRoot '..')
$Target  = Join-Path $Root 'reportes\security'

Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "  LIMPIEZA REPORTES TRIVY — REGINSA" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow

if (-not (Test-Path $Target)) {
    Write-Host "  [--] Carpeta no encontrada: $Target" -ForegroundColor DarkGray
    return
}

$trivyFolders = Get-ChildItem -Path $Target -Directory | Where-Object { $_.Name -like 'trivy-*' }
$trivyFiles   = Get-ChildItem -Path $Target -File      | Where-Object { $_.Name -like '*trivy*' }

$total = ($trivyFolders | Measure-Object).Count + ($trivyFiles | Measure-Object).Count

if ($total -eq 0) {
    Write-Host "  [--] No se encontraron reportes Trivy." -ForegroundColor DarkGray
    Write-Host ""
    return
}

Write-Host ""
Write-Host "  Elementos a eliminar:" -ForegroundColor White
$trivyFolders | ForEach-Object { Write-Host "    [DIR]  $($_.Name)" -ForegroundColor Cyan }
$trivyFiles   | ForEach-Object { Write-Host "    [FILE] $($_.Name)" -ForegroundColor Cyan }
Write-Host ""

if ($DryRun) {
    Write-Host "  [DRY-RUN] No se elimino nada. Usa sin -DryRun para borrar." -ForegroundColor Yellow
} else {
    $trivyFolders | Remove-Item -Recurse -Force
    $trivyFiles   | Remove-Item -Force
    Write-Host "  [OK] Eliminados $total elementos Trivy." -ForegroundColor Green
}
Write-Host ""
