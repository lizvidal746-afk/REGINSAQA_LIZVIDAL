# Ejecuta Schemathesis via Docker — fuzzer OpenAPI/Swagger (reemplazo de RESTler).
# RESTler de Microsoft no publica imagen Docker oficial; Schemathesis es la alternativa
# mantenida con imagen publica en GHCR. Cubre OWASP API Security Top 10 2023.
# Repo: https://github.com/schemathesis/schemathesis  (Licencia: MIT)
# Norma: OWASP API Top 10 2023, OWASP ASVS V11, NIST SP 800-115
param(
  [Parameter(Mandatory = $true)]
  [string]$Target,
  [string]$OutputDir = "reportes/security/schemathesis",
  [string]$SpecUrl   = "",
  [int]$Workers      = 2,
  [int]$Hypothesis   = 50  # numero de casos generados por endpoint
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

# Override imagen via env: $env:SCHEMATHESIS_IMAGE='schemathesis/schemathesis:6.x'
$schemaImage = if (-not [string]::IsNullOrWhiteSpace($env:SCHEMATHESIS_IMAGE)) {
  $env:SCHEMATHESIS_IMAGE
} else {
  'schemathesis/schemathesis:stable'
}

# Descubrir spec si no se paso por parametro
if ([string]::IsNullOrWhiteSpace($SpecUrl)) {
  $candidates = @(
    "$Target/swagger/v1/swagger.json",
    "$Target/swagger.json",
    "$Target/api-docs",
    "$Target/openapi.json",
    "$Target/v3/api-docs"
  )
  foreach ($c in $candidates) {
    try {
      $resp = Invoke-WebRequest -Uri $c -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
      if ($resp.StatusCode -eq 200 -and $resp.Content.Length -gt 100) {
        $SpecUrl = $c
        Write-Host "  Spec encontrada: $c" -ForegroundColor Green
        break
      }
    } catch {
      Write-Verbose "Spec no disponible en $c"
    }
  }
}

if ([string]::IsNullOrWhiteSpace($SpecUrl)) {
  Write-Warning "No se encontro OpenAPI/Swagger spec. Schemathesis no puede ejecutarse sin spec."
  Write-Warning "Define -SpecUrl 'https://host/swagger.json' o expone la spec en el target."
  '{"warning":"OpenAPI spec no encontrada","candidates_probed":' + ($candidates | ConvertTo-Json -Compress) + '}' |
    Set-Content (Join-Path $outputPath 'schemathesis-skipped.json') -Encoding UTF8
  return
}

Write-Host "=== Schemathesis API Fuzzer (reemplazo RESTler) ==="
Write-Host "Target  : $Target"
Write-Host "Spec    : $SpecUrl"
Write-Host "Imagen  : $schemaImage"
Write-Host "Salida  : $outputPath"

Write-Host "`n--- Pull imagen Schemathesis ---"
docker pull $schemaImage 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo descargar la imagen Schemathesis '$schemaImage'."
}

Write-Host "`n--- Ejecutando schemathesis run ---"
docker run --rm `
  --volume "${dOutput}:/reports" `
  $schemaImage `
  run $SpecUrl `
  --base-url $Target `
  --checks all `
  --workers $Workers `
  --hypothesis-max-examples $Hypothesis `
  --report /reports/schemathesis-report.tar.gz `
  --junit-xml /reports/schemathesis-junit.xml 2>&1 | Tee-Object -FilePath (Join-Path $outputPath 'schemathesis.log')

# Schemathesis devuelve exit != 0 cuando encuentra hallazgos (comportamiento esperado en QA).
$schemaExit = $LASTEXITCODE
Write-Host "`nReporte Schemathesis generado en: $outputPath (exit=$schemaExit)"
# No relanzamos error: el orquestador interpreta presencia de archivos.
