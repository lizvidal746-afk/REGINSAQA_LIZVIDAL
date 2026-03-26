param(
  [string]$BaseDir = 'reportes/security',
  [string]$RunId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [string]$Target = $env:REGINSA_URL
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Target)) {
  throw 'Falta REGINSA_URL para OWASP. Define variable o pasa -Target.'
}

$owaspDir = Join-Path $BaseDir "owasp/$RunId"
$sonarDir = Join-Path $BaseDir "sonar/$RunId"

New-Item -ItemType Directory -Path $owaspDir -Force | Out-Null
New-Item -ItemType Directory -Path $sonarDir -Force | Out-Null

Write-Host "[RUN] OWASP en carpeta: $owaspDir"
& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/security/generar-reportes-owasp-fechados.ps1 -Target $Target -BaseDir $BaseDir -RunId $RunId
if ($LASTEXITCODE -ne 0) {
  throw 'Fallo generar-reportes-owasp-fechados.ps1'
}

Write-Host "[RUN] Sonar reportes resumen en carpeta: $sonarDir"
& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/security/generar-reporte-sonar-local.ps1 -OutputDir $sonarDir
if ($LASTEXITCODE -ne 0) {
  throw 'Fallo generar-reporte-sonar-local.ps1'
}

Write-Host "[RUN] Sonar detalle de issues en carpeta: $sonarDir"
& powershell -NoProfile -ExecutionPolicy Bypass -File scripts/security/exportar-sonar-issues.ps1 -OutputDir $sonarDir
if ($LASTEXITCODE -ne 0) {
  throw 'Fallo exportar-sonar-issues.ps1'
}

Write-Host "Run completado:"
Write-Host " - OWASP: $owaspDir"
Write-Host " - Sonar: $sonarDir"
