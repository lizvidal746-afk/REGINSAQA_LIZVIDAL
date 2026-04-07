Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

param(
  [string]$ProjectDir = ".",
  [string]$OutputDir = "reportes/security/semgrep"
)

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
$projectPath = Resolve-WorkspaceChildPath -BasePath $workspacePath -CandidatePath $ProjectDir
$outputPath = Resolve-WorkspaceChildPath -BasePath $workspacePath -CandidatePath $OutputDir

Test-PathExistence -Path $projectPath -Message "El directorio de proyecto '$ProjectDir' no existe."
New-DirectoryIfMissing -Path $outputPath
Assert-DockerAvailable

$scanTarget = if ($projectPath.StartsWith($workspacePath, [System.StringComparison]::OrdinalIgnoreCase)) {
  $relativeProject = $projectPath.Substring($workspacePath.Length).TrimStart('\\', '/')
  if ([string]::IsNullOrWhiteSpace($relativeProject)) {
    '/src'
  } else {
    "/src/$($relativeProject -replace '\\', '/')"
  }
} else {
  throw "ProjectDir debe estar dentro del workspace actual: $ProjectDir"
}

$reportFile = Join-Path $outputPath 'semgrep-report.json'

Write-Host "Ejecutando Semgrep sobre $projectPath"

docker run --rm `
  --mount "type=bind,source=$workspacePath,target=/src" `
  --mount "type=bind,source=$outputPath,target=/report" `
  semgrep/semgrep `
  scan $scanTarget `
  --config p/default `
  --config p/owasp-top-ten `
  --config p/typescript `
  --config p/javascript `
  --config p/secrets `
  --json `
  --output /report/semgrep-report.json

if ($LASTEXITCODE -ne 0) {
  throw "Fallo la ejecucion de Semgrep. Codigo de salida: $LASTEXITCODE"
}

if (-not (Test-Path $reportFile)) {
  throw "Semgrep finalizó sin generar artefacto JSON en $reportFile"
}

$reportJson = Get-Content $reportFile -Raw | ConvertFrom-Json
$totalFindings = @($reportJson.results).Count

Write-Host "Reporte JSON: $reportFile"

if ($totalFindings -gt 0) {
  throw "Semgrep encontró $totalFindings hallazgos. Revisa el reporte en $reportFile"
}

Write-Host "No se encontraron hallazgos con las reglas configuradas."