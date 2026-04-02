<#
.SYNOPSIS
  Elimina artefactos residuales de SonarQube Scanner de los repos clonados.

.DESCRIPTION
  El scanner crea .scannerwork/ en el directorio desde donde se ejecuta.
  Todos los escaneos deben ejecutarse desde REGINSA (centralizado).
  Este script limpia .scannerwork/ de repos clonados donde no deberia estar.
  Tambien elimina si091reginsabackend/ mal ubicado en la raiz de REGINSA.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/cleanup-sonar-residuals.ps1
#>

$root = Split-Path -Parent $PSScriptRoot  # D:\SUNEDU\AUTOMATIZACION\REGINSA

$targets = @(
  @{ Path = Join-Path $root 'SI091_REGINSA_FRONTEND-1\.scannerwork'; Label = 'FRONTEND-1 .scannerwork' }
  @{ Path = Join-Path $root 'SI091_REGINSA_BACKEND\.scannerwork';    Label = 'BACKEND .scannerwork' }
  @{ Path = Join-Path $root 'SI091_REGINSA_ENLINEA\.scannerwork';    Label = 'ENLINEA .scannerwork' }
  @{ Path = Join-Path $root 'SI091_REGINSA_CONFIG\.scannerwork';     Label = 'CONFIG .scannerwork' }
  @{ Path = Join-Path $root 'si091reginsabackend';                   Label = 'Carpeta residual si091reginsabackend (raiz)' }
)

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

# Verificar que .scannerwork centralizado sigue en REGINSA raiz
$central = Join-Path $root '.scannerwork'
if (Test-Path $central) {
  Write-Host "[INFO] .scannerwork centralizado OK: $central" -ForegroundColor DarkCyan
} else {
  Write-Host "[INFO] .scannerwork centralizado no existe aun (se creara al ejecutar sonar-scanner)" -ForegroundColor Yellow
}
