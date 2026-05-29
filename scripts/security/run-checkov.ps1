# Ejecuta Checkov via Docker — escaneo IaC: Dockerfile, GitHub Actions, Azure Pipelines
# Norma: CIS Benchmarks, NIST 800-190, OWASP Top 10 (IaC misconfig)
param(
  [string]$ProjectDir = ".",
  [string]$OutputDir  = "reportes/security/checkov"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$commonFunctions = Join-Path (Split-Path -Parent $PSScriptRoot) 'common/functions.ps1'
if (Test-Path $commonFunctions) { . $commonFunctions }

$workspacePath = [System.IO.Path]::GetFullPath((Get-CurrentWorkspacePath))
$outputPath    = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($workspacePath, $OutputDir))
$projectPath   = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($workspacePath, $ProjectDir))

New-DirectoryIfMissing -Path $outputPath
Assert-DockerAvailable

function ConvertTo-DockerPath {
  param([string]$WinPath)
  $p = $WinPath -replace '\\', '/'
  if ($p -match '^([A-Za-z]):(.*)') { return '/' + $Matches[1].ToLower() + $Matches[2] }
  return $p
}

$dProject = ConvertTo-DockerPath $projectPath
$dOutput  = ConvertTo-DockerPath $outputPath

# Config de Checkov (.checkov.yaml en la raiz del workspace)
$checkovConfig = Join-Path $workspacePath '.checkov.yaml'
$dConfig       = ConvertTo-DockerPath $checkovConfig
$hasConfig     = Test-Path $checkovConfig

Write-Host "=== Checkov IaC Scan ==="
Write-Host "Proyecto: $projectPath"
Write-Host "Salida  : $outputPath"
if ($hasConfig) { Write-Host "Config  : $checkovConfig" }

$dockerCmd = @(
  'run', '--rm',
  '--volume', "${dProject}:/project:ro",
  '--volume', "${dOutput}:/output"
)
if ($hasConfig) {
  $dockerCmd += @('--volume', "${dConfig}:/project/.checkov.yaml:ro")
}
$dockerCmd += @(
  'bridgecrew/checkov:latest',
  '--directory', '/project',
  '--framework', 'dockerfile,github_actions,azure_pipelines',
  '--output', 'sarif',
  '--output-file-path', '/output',
  '--soft-fail'
)
if ($hasConfig) {
  $dockerCmd += @('--config-file', '/project/.checkov.yaml')
}

docker @dockerCmd

Write-Host "Reporte Checkov generado en: $outputPath"
