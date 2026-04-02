<#
.SYNOPSIS
  Limpia archivos temporales y residuales de la raiz del proyecto REGINSA.

.DESCRIPTION
  Elimina:
  1. Logs temporales (.tmp-*) de ejecuciones pasadas
  2. Archivos residuales de debug/borradores que ya no se usan
  3. Script duplicado cleanup-sonar-residual.ps1 (singular)

.EXAMPLE
  npm run cleanup:raiz
  powershell -ExecutionPolicy Bypass -File scripts/cleanup-raiz.ps1
#>

$root = Split-Path -Parent $PSScriptRoot  # D:\SUNEDU\AUTOMATIZACION\REGINSA

# --- 1. Logs temporales (.tmp-*) ---
Write-Host "`n[1/3] Eliminando logs temporales (.tmp-*)..." -ForegroundColor Cyan
$tmpFiles = Get-ChildItem -Path $root -Filter ".tmp-*" -File -Force
$tmpCount = 0
foreach ($f in $tmpFiles) {
  Remove-Item $f.FullName -Force
  Write-Host "  [OK] $($f.Name)" -ForegroundColor DarkGray
  $tmpCount++
}
if ($tmpCount -eq 0) { Write-Host "  Sin archivos .tmp-* (ya esta limpio)" -ForegroundColor DarkGray }

# --- 2. Archivos residuales/borradores ---
Write-Host "`n[2/3] Eliminando archivos residuales..." -ForegroundColor Cyan
$residuales = @(
  @{ Path = Join-Path $root 'script.js';                  Label = 'script.js (duplicado de k6_caso_02_registrar_sancion_completo.js)' }
  @{ Path = Join-Path $root 'Reconsideracion.js';         Label = 'Reconsideracion.js (chunk Webpack Angular, no pertenece aqui)' }
  @{ Path = Join-Path $root 'verificar_actualizacion.js'; Label = 'verificar_actualizacion.js (borrador obsoleto)' }
  @{ Path = Join-Path $root 'temp_payload.json';          Label = 'temp_payload.json (payload manual temporal)' }
  @{ Path = Join-Path $root 'pasos-limpieza-git.txt';     Label = 'pasos-limpieza-git.txt (guia informativa obsoleta)' }
  @{ Path = Join-Path $root 'reginsaqa.sunedu.gob.pe.har'; Label = 'reginsaqa.sunedu.gob.pe.har (grabacion de red, ya no se necesita)' }
  @{ Path = Join-Path $root 'test-env.txt';               Label = 'test-env.txt (redundante con .env.example)' }
  @{ Path = Join-Path $root 'credentials-temp.txt';       Label = 'credentials-temp.txt (CREDENCIALES: no subir al repo)' }
)
$resCount = 0
foreach ($r in $residuales) {
  if (Test-Path $r.Path) {
    Remove-Item $r.Path -Force
    Write-Host "  [OK] $($r.Label)" -ForegroundColor Green
    $resCount++
  } else {
    Write-Host "  [--] Ya no existe: $($r.Label)" -ForegroundColor DarkGray
  }
}

# --- 3. Script duplicado (singular vs plural) ---
Write-Host "`n[3/3] Eliminando script duplicado..." -ForegroundColor Cyan
$singular = Join-Path $PSScriptRoot 'cleanup-sonar-residual.ps1'
if (Test-Path $singular) {
  Remove-Item $singular -Force
  Write-Host "  [OK] cleanup-sonar-residual.ps1 (reemplazado por cleanup-sonar-residuals.ps1)" -ForegroundColor Green
} else {
  Write-Host "  [--] cleanup-sonar-residual.ps1 ya no existe" -ForegroundColor DarkGray
}

Write-Host "`n[LISTO] Limpieza de raiz completada:" -ForegroundColor Cyan
Write-Host "  - Logs .tmp-*: $tmpCount eliminados" -ForegroundColor White
Write-Host "  - Residuales:  $resCount eliminados" -ForegroundColor White
Write-Host "`nConservados (son funcionales):" -ForegroundColor DarkCyan
Write-Host "  k6_caso_02_registrar_sancion_completo.js  <- bundle para k6 cloud run" -ForegroundColor DarkCyan
Write-Host "  k6_bundle.tar                              <- bundle para k6 cloud" -ForegroundColor DarkCyan
Write-Host "  administrados.txt, Id_entidad.*            <- datos de prueba" -ForegroundColor DarkCyan
Write-Host "  storageState.json                          <- estado de auth Playwright" -ForegroundColor DarkCyan
Write-Host "  zap.yaml, sonar-project.properties         <- configs de herramientas" -ForegroundColor DarkCyan
