# Ejecuta Lynis via Docker — auditoria de hardening del sistema
# Equivalente gratuito al modulo OS hardening de Tenable Nessus
# Cubre: SSH, permisos, kernel params, servicios, politicas de contrasenas
# Norma: CIS Benchmarks, ISO/IEC 27001 A.12, NTP-ISO/IEC 12207
param(
  [string]$OutputDir = "reportes/security/lynis"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$commonFunctions = Join-Path (Split-Path -Parent $PSScriptRoot) 'common/functions.ps1'
if (Test-Path $commonFunctions) { . $commonFunctions }

$workspacePath = [System.IO.Path]::GetFullPath((Get-CurrentWorkspacePath))
$outputPath    = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($workspacePath, $OutputDir))

New-DirectoryIfMissing -Path $outputPath
Assert-DockerAvailable

function ConvertTo-DockerPath {
  param([string]$WinPath)
  $p = $WinPath -replace '\\', '/'
  if ($p -match '^([A-Za-z]):(.*)') { return '/' + $Matches[1].ToLower() + $Matches[2] }
  return $p
}

$dOutput = ConvertTo-DockerPath $outputPath

Write-Host "=== Lynis System Hardening Audit ==="
Write-Host "Salida: $outputPath"
Write-Host ""
Write-Host "[INFO] Lynis auditara el entorno del runner/sistema donde corre Docker."
Write-Host "       Para auditar un servidor en produccion, ejecutar Lynis directamente"
Write-Host "       en ese servidor con: lynis audit system"
Write-Host ""

# Metodo oficial CISOfy (no existe imagen oficial mantenida en Docker Hub):
# levantar contenedor Alpine, clonar repo de Lynis, ejecutar audit.
# Repo: https://github.com/CISOfy/lynis
$containerName = "lynis-audit-$([System.Guid]::NewGuid().ToString('N').Substring(0,8))"

try {
  Write-Host "`n--- Levantando contenedor Alpine temporal ($containerName) ---"
  docker run -d --name $containerName --entrypoint=tail alpine:latest -F /dev/null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el contenedor Alpine temporal." }

  Write-Host "--- Instalando git + clonando Lynis desde repo oficial ---"
  docker exec -t $containerName apk add --no-cache git 2>&1 | Out-Host
  docker exec -t $containerName git clone --depth 1 https://github.com/CISOfy/lynis /lynis 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Falla al clonar Lynis. Verifica conexion (firewall corporativo?)." }

  Write-Host "--- Ejecutando 'lynis audit system' ---"
  docker exec -t --workdir=/lynis --env LANGUAGE=en --env LANG=en $containerName `
    ./lynis audit system --no-colors --quiet --report-file /lynis/lynis-report.dat 2>&1 | Out-Host

  Write-Host "--- Copiando reportes al host ---"
  docker cp "${containerName}:/lynis/lynis-report.dat" (Join-Path $outputPath 'lynis-report.dat') 2>&1 | Out-Host
  docker cp "${containerName}:/var/log/lynis.log"      (Join-Path $outputPath 'lynis.log')        2>&1 | Out-Null
}
finally {
  Write-Host "--- Limpiando contenedor temporal ---"
  docker rm -f $containerName 2>&1 | Out-Null
}

Write-Host "`nReportes Lynis generados en: $outputPath"
Write-Host "  - lynis-report.dat (datos estructurados)"
Write-Host "  - lynis.log (log detallado)"
