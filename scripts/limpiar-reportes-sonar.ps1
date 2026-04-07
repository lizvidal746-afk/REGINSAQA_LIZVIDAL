<#
.SYNOPSIS
    Limpia los reportes generados por SonarQube en reportes/security/sonar/
.EXAMPLE
    pwsh scripts/limpiar-reportes-sonar.ps1
    pwsh scripts/limpiar-reportes-sonar.ps1 -DryRun
#>
param([switch]$DryRun)

$Root    = Resolve-Path (Join-Path $PSScriptRoot '..')
$Target  = Join-Path $Root 'reportes\security\sonar'

Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "  LIMPIEZA REPORTES SONARQUBE — REGINSA" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow

if (-not (Test-Path $Target)) {
    Write-Host "  [--] Carpeta no encontrada: $Target" -ForegroundColor DarkGray
    return
}

$sonarFolders = Get-ChildItem -Path $Target -Directory
$sonarFiles   = Get-ChildItem -Path $Target -File

$total = ($sonarFolders | Measure-Object).Count + ($sonarFiles | Measure-Object).Count

if ($total -eq 0) {
    Write-Host "  [--] No se encontraron reportes SonarQube." -ForegroundColor DarkGray
    Write-Host ""
    return
}

Write-Host ""
Write-Host "  Elementos a eliminar en $Target :" -ForegroundColor White
$sonarFolders | ForEach-Object { Write-Host "    [DIR]  $($_.Name)" -ForegroundColor Cyan }
$sonarFiles   | ForEach-Object { Write-Host "    [FILE] $($_.Name)" -ForegroundColor Cyan }
Write-Host ""

if ($DryRun) {
    Write-Host "  [DRY-RUN] No se elimino nada. Usa sin -DryRun para borrar." -ForegroundColor Yellow
} else {
    $sonarFolders | Remove-Item -Recurse -Force
    $sonarFiles   | Remove-Item -Force
    Write-Host "  [OK] Eliminados $total elementos SonarQube." -ForegroundColor Green
}
Write-Host ""
