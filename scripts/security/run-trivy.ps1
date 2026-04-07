# Ejecuta Trivy via Docker para escanear filesystem
# Busca vulnerabilidades en dependencias y misconfigurations
param(
  [string]$ProjectDir = ".",
  [string]$OutputDir  = "reportes/security/trivy"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$trivyImage = if ([string]::IsNullOrWhiteSpace($env:TRIVY_IMAGE)) {
  'ghcr.io/aquasecurity/trivy:latest'
} else {
  $env:TRIVY_IMAGE
}

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

$projectPathNormalized = $projectPath.Replace('\\', '/')
$scanTarget = if ($projectPathNormalized.StartsWith($workspacePath.Replace('\\', '/'), [System.StringComparison]::OrdinalIgnoreCase)) {
  $relativeProject = $projectPath.Substring($workspacePath.Length).TrimStart([char[]]@('\', '/'))
  if ([string]::IsNullOrWhiteSpace($relativeProject)) {
    '/workdir'
  } else {
    "/workdir/$($relativeProject -replace '\\', '/')"
  }
} else {
  throw "ProjectDir debe estar dentro del workspace actual: $ProjectDir"
}

$reportFile = Join-Path $outputPath 'trivy-report.json'
$reportPath = "/report/trivy-report.json"

Write-Host "Ejecutando Trivy filesystem scan sobre $projectPath"

Write-Host "`n--- Resultados en consola (tabla) ---"
docker run --rm `
  --mount "type=bind,source=$workspacePath,target=/workdir" `
  $trivyImage `
  fs $scanTarget `
  --severity HIGH,CRITICAL `
  --format table

if ($LASTEXITCODE -ne 0) {
  throw "Fallo la ejecucion en consola de Trivy. Codigo de salida: $LASTEXITCODE"
}

Write-Host "`n--- Generando reporte JSON ---"
docker run --rm `
  --mount "type=bind,source=$workspacePath,target=/workdir" `
  --mount "type=bind,source=$outputPath,target=/report" `
  $trivyImage `
  fs $scanTarget `
  --severity HIGH,CRITICAL `
  --format json `
  --output $reportPath

if ($LASTEXITCODE -ne 0) {
  throw "Fallo la generacion del reporte JSON de Trivy. Codigo de salida: $LASTEXITCODE"
}

if (-not (Test-Path $reportFile)) {
  throw "Trivy finalizó sin generar artefacto JSON en $reportFile"
}

$reportInfo = Get-Item $reportFile
if ($reportInfo.Length -le 2) {
  throw "Trivy generó un reporte vacío o incompleto en $reportFile"
}

$reportJson = Get-Content $reportFile -Raw | ConvertFrom-Json
$totalVulns = ($reportJson.Results | Where-Object { $_.Vulnerabilities } | ForEach-Object { $_.Vulnerabilities } | Measure-Object).Count

Write-Host "Reporte JSON: $reportFile"

if ($totalVulns -gt 0) {
  throw "Trivy encontró $totalVulns vulnerabilidades de severidad HIGH o CRITICAL. Revisa el reporte en $reportFile"
}

Write-Host "No se encontraron vulnerabilidades HIGH o CRITICAL."
