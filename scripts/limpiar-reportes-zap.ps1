<#
.SYNOPSIS
    Limpia los reportes generados por OWASP ZAP en reportes/security/
.EXAMPLE
    pwsh scripts/limpiar-reportes-zap.ps1
    pwsh scripts/limpiar-reportes-zap.ps1 -DryRun
#>
param([switch]$DryRun)

$Root    = Resolve-Path (Join-Path $PSScriptRoot '..')
$Target  = Join-Path $Root 'reportes\security'

Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "  LIMPIEZA REPORTES ZAP — REGINSA" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow

if (-not (Test-Path $Target)) {
    Write-Host "  [--] Carpeta no encontrada: $Target" -ForegroundColor DarkGray
    return
}

# Carpetas que empiezan con "zap-" o archivos con "zap" en el nombre
$zapFolders = Get-ChildItem -Path $Target -Directory | Where-Object { $_.Name -like 'zap-*' }
$zapFiles   = Get-ChildItem -Path $Target -File      | Where-Object { $_.Name -like '*zap*' }

$total = ($zapFolders | Measure-Object).Count + ($zapFiles | Measure-Object).Count

if ($total -eq 0) {
    Write-Host "  [--] No se encontraron reportes ZAP." -ForegroundColor DarkGray
    Write-Host ""
    return
}

Write-Host ""
Write-Host "  Elementos a eliminar:" -ForegroundColor White
$zapFolders | ForEach-Object { Write-Host "    [DIR]  $($_.Name)" -ForegroundColor Cyan }
$zapFiles   | ForEach-Object { Write-Host "    [FILE] $($_.Name)" -ForegroundColor Cyan }
Write-Host ""

if ($DryRun) {
    Write-Host "  [DRY-RUN] No se elimino nada. Usa sin -DryRun para borrar." -ForegroundColor Yellow
} else {
    $zapFolders | Remove-Item -Recurse -Force
    $zapFiles   | Remove-Item -Force
    Write-Host "  [OK] Eliminados $total elementos ZAP." -ForegroundColor Green
}
Write-Host ""
