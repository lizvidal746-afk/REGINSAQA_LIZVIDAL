# Ejecuta Trivy via Docker para escanear filesystem
# Busca vulnerabilidades en dependencias y misconfigurations
param(
  [string]$ProjectDir = ".",
  [string]$OutputDir  = "reportes/security/trivy"
)

# Validar que ProjectDir existe
if (-not (Test-Path $ProjectDir)) {
  throw "El directorio de proyecto '$ProjectDir' no existe."
}

# Crear OutputDir si no existe
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

# Verificar que Docker esté disponible
try {
  docker --version | Out-Null
} catch {
  throw "Docker no está disponible. Instala Docker antes de ejecutar este script."
}

$cwd = $PWD.Path

Write-Host "Ejecutando Trivy filesystem scan sobre $ProjectDir"

# Primera ejecución: salida en tabla para consola
Write-Host "`n--- Resultados en consola (tabla) ---"
docker run --rm `
  -v "${cwd}:/workdir" `
  aquasec/trivy:latest `
  fs /workdir `
  --severity HIGH,CRITICAL `
  --format table

# Segunda ejecución: salida en JSON para archivo
Write-Host "`n--- Generando reporte JSON ---"
docker run --rm `
  -v "${cwd}:/workdir" `
  aquasec/trivy:latest `
  fs /workdir `
  --severity HIGH,CRITICAL `
  --format json `
  --output "/workdir/$OutputDir/trivy-report.json"

# Si hay hallazgos HIGH o CRITICAL, lanzar error descriptivo
if (Test-Path "$OutputDir/trivy-report.json") {
  $reportJson = Get-Content "$OutputDir/trivy-report.json" -Raw | ConvertFrom-Json
  $totalVulns = ($reportJson.Results | Where-Object { $_.Vulnerabilities } | ForEach-Object { $_.Vulnerabilities } | ForEach-Object { $_ } | Measure-Object).Count

  Write-Host "Reporte JSON: $OutputDir/trivy-report.json"

  if ($totalVulns -gt 0) {
    throw "Trivy encontró $totalVulns vulnerabilidades de severidad HIGH o CRITICAL. Revisa el reporte en $OutputDir/trivy-report.json"
  } else {
    Write-Host "No se encontraron vulnerabilidades HIGH o CRITICAL."
  }
} else {
  Write-Host "No se generó reporte JSON. Verifica la ejecución de Trivy."
}
