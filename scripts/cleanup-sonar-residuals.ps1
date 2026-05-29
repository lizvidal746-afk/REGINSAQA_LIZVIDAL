<#
.SYNOPSIS
  Elimina artefactos residuales de SonarQube Scanner de los repos clonados.

.DESCRIPTION
  El scanner puede dejar carpetas .sonarqube/ o .scannerwork/ dentro de los
  repos clonados cuando se ejecuta desde sus directorios de trabajo.
  Los reportes finales deben salir al workspace principal (reportes/), no a los
  clones de SI091_REGINSA_*.
  Este script limpia esos residuos para mantener los subrepos intactos.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/cleanup-sonar-residuals.ps1
#>

$root = Split-Path -Parent $PSScriptRoot  # D:\SUNEDU\AUTOMATIZACION\REGINSA

$repoNames = @(
  'SI091_REGINSA_FRONTEND-1',
  'SI091_REGINSA_BACKEND',
  'SI091_REGINSA_ENLINEA',
  'SI091_REGINSA_CONFIG'
)

$targets = foreach ($repoName in $repoNames) {
  $repoRoot = Join-Path $root $repoName
  foreach ($residual in @('.sonarqube', '.scannerwork')) {
    @{
      Path  = Join-Path $repoRoot $residual
      Label = "$repoName $residual"
    }
  }
}

$removed = 0
$skipped = 0

foreach ($t in $targets) {
  if (Test-Path $t.Path) {
    try {
      Remove-Item -Recurse -Force $t.Path
      Write-Host "[ELIMINADO] $($t.Label)" -ForegroundColor Green
      $removed++
    } catch {
      Write-Host "[ERROR] No se pudo eliminar $($t.Label): $($_.Exception.Message)" -ForegroundColor Red
    }
  } else {
    Write-Host "[OK] No encontrado (ya limpio): $($t.Label)" -ForegroundColor DarkGray
    $skipped++
  }
}

Write-Host "`nResumen: $removed eliminados, $skipped ya limpios." -ForegroundColor Cyan

# Verificar que los residuos fueron limpiados y que el workspace queda libre
$centralSonar = Join-Path $root '.sonarqube'
$centralScan  = Join-Path $root '.scannerwork'
if (Test-Path $centralSonar) {
  Write-Host "[INFO] .sonarqube centralizado detectado en la raiz: $centralSonar" -ForegroundColor DarkCyan
} else {
  Write-Host "[INFO] .sonarqube centralizado no existe en la raiz" -ForegroundColor DarkGray
}
if (Test-Path $centralScan) {
  Write-Host "[INFO] .scannerwork centralizado detectado en la raiz: $centralScan" -ForegroundColor DarkCyan
} else {
  Write-Host "[INFO] .scannerwork centralizado no existe en la raiz" -ForegroundColor DarkGray
}
