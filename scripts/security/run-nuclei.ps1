# Ejecuta Nuclei via Docker contra un target web
# Genera reporte JSONL y SARIF
param(
  [string]$Target    = $env:REGINSA_URL,
  [string]$OutputDir = "reportes/security/nuclei"
)

# Validar Target
if ([string]::IsNullOrWhiteSpace($Target)) {
  throw "Define REGINSA_URL o pasa -Target para ejecutar Nuclei."
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

Write-Host "Ejecutando Nuclei contra $Target"
Write-Host "Directorio de salida: $OutputDir"

# Ejecutar Nuclei via Docker
docker run --rm `
  -v "${cwd}:/output" `
  projectdiscovery/nuclei:latest `
  -u "$Target" `
  -severity critical,high,medium `
  -exclude-type dos `
  -jsonl -output "/output/$OutputDir/nuclei-report.jsonl" `
  -sarif-export "/output/$OutputDir/nuclei-report.sarif"

# Mostrar resumen de hallazgos
if (Test-Path "$OutputDir/nuclei-report.jsonl") {
  $totalHallazgos = (Get-Content "$OutputDir/nuclei-report.jsonl" | Measure-Object -Line).Lines
  Write-Host "Hallazgos encontrados: $totalHallazgos"
  Write-Host "Reporte JSONL: $OutputDir/nuclei-report.jsonl"
  Write-Host "Reporte SARIF: $OutputDir/nuclei-report.sarif"
} else {
  Write-Host "No se generó reporte. Verifica la ejecución de Nuclei."
}
