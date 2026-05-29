# Ejecuta RESTler (Microsoft) via Docker — API fuzzer estateful sin cuenta ni trial
# Detecta OWASP API Top 10: BOLA, BFLA, Auth bypass, Injection, SSRF, Misconfig
# 100% gratuito, open source, sin limite de uso
# Repo: https://github.com/microsoft/restler-fuzzer
# Norma: OWASP API Top 10 2023, OWASP ASVS V11, NIST SP 800-115
param(
  [Parameter(Mandatory = $true)]
  [string]$Target,
  [string]$OutputDir   = "reportes/security/restler",
  [decimal]$TimeBudget = 1
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
  if ($p -match '^([A-Za-z]):(.*)')  { return '/' + $Matches[1].ToLower() + $Matches[2] }
  return $p
}

$dOutput = ConvertTo-DockerPath $outputPath

# Extraer host y puerto del target
$uri      = [System.Uri]$Target
$host_    = $uri.Host
$port     = if ($uri.Port -gt 0) { $uri.Port } elseif ($uri.Scheme -eq 'https') { 443 } else { 80 }
$swaggerF = Join-Path $outputPath 'swagger.json'

Write-Host "=== RESTler API Fuzzer (Microsoft) ==="
Write-Host "Target    : $Target"
Write-Host "Host      : ${host_}:${port}"
Write-Host "Budget    : ${TimeBudget}h"
Write-Host "Salida    : $outputPath"

# Intentar descubrir OpenAPI spec
Write-Host "`nDescubriendo OpenAPI spec..."
$specUrls = @(
  "$Target/swagger.json",
  "$Target/api-docs",
  "$Target/openapi.json",
  "$Target/v1/swagger.json",
  "$Target/api/swagger.json"
)
$specFound = $false
foreach ($url in $specUrls) {
  try {
    Invoke-WebRequest -Uri $url -OutFile $swaggerF -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    if ((Get-Item $swaggerF).Length -gt 100) {
      Write-Host "  Spec encontrada en: $url"
      $specFound = $true
      break
    }
  } catch {
    Write-Verbose "URL de spec no disponible: $_"
  }
}
if (-not $specFound) {
  Write-Warning "No se encontro OpenAPI spec en el target. Usando spec minima."
  '{"openapi":"3.0.0","info":{"title":"REGINSA API","version":"1.0"},"paths":{}}' | Set-Content $swaggerF -Encoding UTF8
}

Write-Host "`n--- Pull imagen RESTler ---"
docker pull mcr.microsoft.com/restler/restler:latest

Write-Host "`n--- Compilando gramatica desde OpenAPI ---"
docker run --rm `
  --volume "${dOutput}:/workdir" `
  mcr.microsoft.com/restler/restler:latest `
  compile --api_spec /workdir/swagger.json

Write-Host "`n--- Ejecutando fuzz-lean ---"
docker run --rm `
  --volume "${dOutput}:/workdir" `
  mcr.microsoft.com/restler/restler:latest `
  fuzz-lean `
  --target_ip $host_ `
  --target_port $port `
  --api_spec_path /workdir/swagger.json `
  --time_budget $TimeBudget `
  --results_dir /workdir/results

Write-Host "`nReporte RESTler generado en: $outputPath"
