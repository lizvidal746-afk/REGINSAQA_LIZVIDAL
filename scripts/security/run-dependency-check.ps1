# Ejecuta OWASP Dependency-Check via Docker
# Escanea dependencias npm (package-lock.json) y .NET (*.csproj)
param(
  [string]$ProjectDir = ".",
  [string]$OutputDir  = "reportes/security/dependency-check"
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

Write-Host "Ejecutando OWASP Dependency-Check sobre $ProjectDir"
Write-Host "Directorio de salida: $OutputDir"

# Ejecutar OWASP Dependency-Check via Docker
docker run --rm `
  -v "${cwd}:/src" `
  -v "${cwd}/${OutputDir}:/report" `
  owasp/dependency-check:latest `
  --project "REGINSA-QA" `
  --scan /src `
  --format HTML `
  --format JSON `
  --out /report `
  --failOnCVSS 7

# Mostrar resumen
if (Test-Path "$OutputDir") {
  $reportes = Get-ChildItem -Path $OutputDir -File
  Write-Host "Reportes generados en $OutputDir :"
  foreach ($r in $reportes) {
    Write-Host "  - $($r.Name)"
  }
} else {
  Write-Host "No se generaron reportes. Verifica la ejecución de Dependency-Check."
}
