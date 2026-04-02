<# 
  Limpieza de carpetas residuales de SonarQube
  Ejecutar desde: D:\SUNEDU\AUTOMATIZACION\REGINSA
  
  Elimina:
  1. .scannerwork de los 4 repos clonados (se centraliza en REGINSA raiz)
  2. si091reginsabackend/ residual en la raiz del proyecto (de ejecucion fallida)
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Path $PSScriptRoot -Parent

$foldersToDelete = @(
  # .scannerwork en repos clonados (el de REGINSA raiz se MANTIENE)
  (Join-Path $root 'SI091_REGINSA_FRONTEND-1\.scannerwork'),
  (Join-Path $root 'SI091_REGINSA_BACKEND\.scannerwork'),
  (Join-Path $root 'SI091_REGINSA_ENLINEA\.scannerwork'),
  (Join-Path $root 'SI091_REGINSA_CONFIG\.scannerwork'),
  # Carpeta residual de ejecucion fallida de sonar
  (Join-Path $root 'si091reginsabackend')
)

$deleted = 0
foreach ($folder in $foldersToDelete) {
  if (Test-Path $folder) {
    Remove-Item -Recurse -Force $folder
    Write-Host "[DELETED] $folder" -ForegroundColor Green
    $deleted++
  } else {
    Write-Host "[SKIP]    $folder (no existe)" -ForegroundColor DarkGray
  }
}

Write-Host "`n[OK] Limpieza completada: $deleted carpetas eliminadas." -ForegroundColor Cyan

# Verificar que .scannerwork centralizado sigue en REGINSA raiz
$central = Join-Path $root '.scannerwork'
if (Test-Path $central) {
  Write-Host "[INFO] .scannerwork centralizado OK: $central" -ForegroundColor DarkCyan
} else {
  Write-Host "[INFO] .scannerwork centralizado no existe aun (se creara al ejecutar sonar-scanner)" -ForegroundColor Yellow
}
