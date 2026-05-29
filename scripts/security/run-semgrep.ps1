param(
  [string[]]$ProjectDirs = @("."),
  [string]$OutputDir = "reportes/security/semgrep"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$commonFunctions = Join-Path (Split-Path -Parent $PSScriptRoot) 'common/functions.ps1'
if (Test-Path $commonFunctions) {
  . $commonFunctions
}

function Resolve-WorkspaceChildPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BasePath,
    [Parameter(Mandatory = $true)]
    [string]$CandidatePath
  )

  if ([System.IO.Path]::IsPathRooted($CandidatePath)) {
    return [System.IO.Path]::GetFullPath($CandidatePath)
  }

  return [System.IO.Path]::GetFullPath((Join-Path $BasePath $CandidatePath))
}

$workspacePath = [System.IO.Path]::GetFullPath((Get-CurrentWorkspacePath))
$outputPath = Resolve-WorkspaceChildPath -BasePath $workspacePath -CandidatePath $OutputDir

New-DirectoryIfMissing -Path $outputPath
Assert-DockerAvailable

$scanTargets = @(foreach ($dir in $ProjectDirs) {
  $projPath = Resolve-WorkspaceChildPath -BasePath $workspacePath -CandidatePath $dir
  Test-PathExistence -Path $projPath -Message "El directorio de proyecto '$dir' no existe."
  if (-not $projPath.StartsWith($workspacePath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "ProjectDir debe estar dentro del workspace actual: $dir"
  }
  $rel = $projPath.Substring($workspacePath.Length).TrimStart([char[]]@('\', '/'))
  if ([string]::IsNullOrWhiteSpace($rel)) { '/src' } else { "/src/$($rel -replace '\\', '/')" }
})

$reportFile = Join-Path $outputPath 'semgrep-report.json'

Write-Host "Ejecutando Semgrep sobre: $($ProjectDirs -join ', ')"

# NOTA: semgrep/semgrep:latest NO usa semgrep como ENTRYPOINT en versiones recientes.
# Se debe pasar 'semgrep scan' como CMD explícito para evitar exit code 127.
# PYTHONHTTPSVERIFY=0 y REQUESTS_CA_BUNDLE='' resuelven el error de certificado SSL
# corporativo (proxy con self-signed cert) al descargar reglas de semgrep.dev.
docker run --rm `
  --mount "type=bind,source=$workspacePath,target=/src" `
  --mount "type=bind,source=$outputPath,target=/report" `
  --env PYTHONHTTPSVERIFY=0 `
  --env REQUESTS_CA_BUNDLE="" `
  --env SSL_CERT_FILE="" `
  --env SEMGREP_SEND_METRICS=off `
  --entrypoint semgrep `
  semgrep/semgrep:latest `
  scan @scanTargets `
  --config auto `
  --json `
  --output /report/semgrep-report.json

# Semgrep exit codes: 0=sin hallazgos, 1=hallazgos encontrados, 2=error de ejecucion
if ($LASTEXITCODE -eq 1) {
  Write-Host "  [Semgrep] Hallazgos detectados (exit 1 es esperado cuando hay findings)." -ForegroundColor Yellow
} elseif ($LASTEXITCODE -eq 2) {
  Write-Warning "Semgrep reporto error de ejecucion (exit 2) -- posible problema de red/SSL al descargar reglas."
  Write-Warning "El reporte puede estar incompleto."
} elseif ($LASTEXITCODE -ne 0) {
  throw "Fallo la ejecucion de Semgrep. Codigo de salida: $LASTEXITCODE"
}

if (-not (Test-Path $reportFile)) {
  Write-Warning "Semgrep no genero artefacto JSON en $reportFile"
  return
}

$reportJson = Get-Content $reportFile -Raw | ConvertFrom-Json
$totalFindings = @($reportJson.results).Count

Write-Host "Reporte JSON: $reportFile"
Write-Host "Total hallazgos Semgrep: $totalFindings"

Write-Host "No se encontraron hallazgos con las reglas configuradas."