# Orquestador: ejecuta las 4 herramientas de seguridad en orden
# ZAP → Nuclei → Dependency-Check → Trivy
# Continúa si alguno falla, reporta resumen al final
param(
  [string]$Target    = $env:REGINSA_URL,
  [string]$OutputDir = "reportes/security"
)

# Verificar que Docker esté disponible (una sola vez)
try {
  docker --version | Out-Null
} catch {
  throw "Docker no está disponible. Instala Docker antes de ejecutar este script."
}

# Crear OutputDir principal
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

# Definir array de resultados
$resultados = @()

# ─────────────────────────────────────────────
# 1. OWASP ZAP — llama al script existente en tests/security/zap/
# ─────────────────────────────────────────────
Write-Host "`n=== [1/4] OWASP ZAP ===" -ForegroundColor Cyan
$zapInicio = Get-Date
$zapEstado = "✅ PASS"
try {
  & "$PSScriptRoot\..\..\tests\security\zap\zap-baseline.ps1" -Target $Target -OutputDir "$OutputDir/zap"
} catch {
  Write-Host "ZAP falló: $_" -ForegroundColor Yellow
  $zapEstado = "❌ FAIL"
}
$zapDuracion = [math]::Round(((Get-Date) - $zapInicio).TotalSeconds)
$resultados += [PSCustomObject]@{ Herramienta = "OWASP ZAP";        Estado = $zapEstado; Duracion = "${zapDuracion}s" }

# ─────────────────────────────────────────────
# 2. Nuclei
# ─────────────────────────────────────────────
Write-Host "`n=== [2/4] Nuclei ===" -ForegroundColor Cyan
$nucleiInicio = Get-Date
$nucleiEstado = "✅ PASS"
try {
  & "$PSScriptRoot\run-nuclei.ps1" -Target $Target -OutputDir "$OutputDir/nuclei"
} catch {
  Write-Host "Nuclei falló: $_" -ForegroundColor Yellow
  $nucleiEstado = "❌ FAIL"
}
$nucleiDuracion = [math]::Round(((Get-Date) - $nucleiInicio).TotalSeconds)
$resultados += [PSCustomObject]@{ Herramienta = "Nuclei";           Estado = $nucleiEstado; Duracion = "${nucleiDuracion}s" }

# ─────────────────────────────────────────────
# 3. Dependency-Check
# ─────────────────────────────────────────────
Write-Host "`n=== [3/4] Dependency-Check ===" -ForegroundColor Cyan
$depInicio = Get-Date
$depEstado = "✅ PASS"
try {
  & "$PSScriptRoot\run-dependency-check.ps1" -ProjectDir "." -OutputDir "$OutputDir/dependency-check"
} catch {
  Write-Host "Dependency-Check falló: $_" -ForegroundColor Yellow
  $depEstado = "❌ FAIL"
}
$depDuracion = [math]::Round(((Get-Date) - $depInicio).TotalSeconds)
$resultados += [PSCustomObject]@{ Herramienta = "Dependency-Check"; Estado = $depEstado; Duracion = "${depDuracion}s" }

# ─────────────────────────────────────────────
# 4. Trivy
# ─────────────────────────────────────────────
Write-Host "`n=== [4/4] Trivy ===" -ForegroundColor Cyan
$trivyInicio = Get-Date
$trivyEstado = "✅ PASS"
try {
  & "$PSScriptRoot\run-trivy.ps1" -ProjectDir "." -OutputDir "$OutputDir/trivy"
} catch {
  Write-Host "Trivy falló: $_" -ForegroundColor Yellow
  $trivyEstado = "❌ FAIL"
}
$trivyDuracion = [math]::Round(((Get-Date) - $trivyInicio).TotalSeconds)
$resultados += [PSCustomObject]@{ Herramienta = "Trivy";            Estado = $trivyEstado; Duracion = "${trivyDuracion}s" }

# ─────────────────────────────────────────────
# RESUMEN FINAL
# ─────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor White
Write-Host "        RESUMEN DE SEGURIDAD            " -ForegroundColor White
Write-Host "========================================" -ForegroundColor White
$resultados | Format-Table -AutoSize

$fallos = $resultados | Where-Object { $_.Estado -eq "❌ FAIL" }
if ($fallos.Count -gt 0) {
  Write-Host "$($fallos.Count) herramienta(s) fallaron. Revisa los reportes en $OutputDir" -ForegroundColor Red
  exit 1
} else {
  Write-Host "Todas las herramientas pasaron exitosamente." -ForegroundColor Green
  exit 0
}
