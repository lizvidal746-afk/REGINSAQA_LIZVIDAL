Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

param(
  [string]$ProjectDir = ".",
  [string]$OutputDir = "reportes/security/gitleaks"
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
$configPath = Join-Path $workspacePath '.gitleaks.toml'

Test-PathExistence -Path $projectPath -Message "El directorio de proyecto '$ProjectDir' no existe."
Test-PathExistence -Path $configPath -Message "No se encontró la configuración .gitleaks.toml en el workspace."
New-DirectoryIfMissing -Path $outputPath
Assert-DockerAvailable

$scanTarget = if ($projectPath.StartsWith($workspacePath, [System.StringComparison]::OrdinalIgnoreCase)) {
  $relativeProject = $projectPath.Substring($workspacePath.Length).TrimStart('\\', '/')
  if ([string]::IsNullOrWhiteSpace($relativeProject)) {
    '/repo'
  } else {
    "/repo/$($relativeProject -replace '\\', '/')"
  }
} else {
  throw "ProjectDir debe estar dentro del workspace actual: $ProjectDir"
}

$reportFile = Join-Path $outputPath 'gitleaks-report.json'

Write-Host "Ejecutando Gitleaks sobre $projectPath"

docker run --rm `
  --mount "type=bind,source=$workspacePath,target=/repo" `
  --mount "type=bind,source=$outputPath,target=/report" `
  zricethezav/gitleaks:latest `
  detect `
  --source $scanTarget `
  --config /repo/.gitleaks.toml `
  --report-format json `
  --report-path /report/gitleaks-report.json `
  --redact `
  --exit-code 0

if ($LASTEXITCODE -ne 0) {
  throw "Fallo la ejecucion de Gitleaks. Codigo de salida: $LASTEXITCODE"
}

if (-not (Test-Path $reportFile)) {
  throw "Gitleaks finalizó sin generar artefacto JSON en $reportFile"
}

$findings = Get-Content $reportFile -Raw | ConvertFrom-Json
$totalFindings = @($findings).Count

Write-Host "Reporte JSON: $reportFile"

if ($totalFindings -gt 0) {
  throw "Gitleaks encontró $totalFindings posibles secretos. Revisa el reporte en $reportFile"
}

Write-Host "No se encontraron secretos expuestos."