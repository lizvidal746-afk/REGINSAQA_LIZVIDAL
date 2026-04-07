# Ejecuta OWASP Dependency-Check via Docker
# Escanea dependencias npm (package-lock.json) y .NET (*.csproj)
param(
  [string]$ProjectDir = ".",
  [string]$OutputDir  = "reportes/security/dependency-check"
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
$projectPath = Resolve-WorkspaceChildPath -BasePath $workspacePath -CandidatePath $ProjectDir
$outputPath = Resolve-WorkspaceChildPath -BasePath $workspacePath -CandidatePath $OutputDir

Test-PathExistence -Path $projectPath -Message "El directorio de proyecto '$ProjectDir' no existe."
New-DirectoryIfMissing -Path $outputPath
Assert-DockerAvailable

$scanTarget = if ($projectPath.StartsWith($workspacePath, [System.StringComparison]::OrdinalIgnoreCase)) {
  $relativeProject = $projectPath.Substring($workspacePath.Length).TrimStart([char[]]@('\', '/'))
  if ([string]::IsNullOrWhiteSpace($relativeProject)) {
    '/src'
  } else {
    "/src/$($relativeProject -replace '\\', '/')"
  }
} else {
  throw "ProjectDir debe estar dentro del workspace actual: $ProjectDir"
}

$reportHtml = Join-Path $outputPath 'dependency-check-report.html'
$reportJson = Join-Path $outputPath 'dependency-check-report.json'

Write-Host "Ejecutando OWASP Dependency-Check sobre $projectPath"
Write-Host "Directorio de salida: $outputPath"

docker run --rm `
  --mount "type=bind,source=$workspacePath,target=/src" `
  --mount "type=bind,source=$outputPath,target=/report" `
  owasp/dependency-check:latest `
  --project "REGINSA-QA" `
  --scan $scanTarget `
  --format HTML `
  --format JSON `
  --out /report `
  --failOnCVSS 7

if ($LASTEXITCODE -ne 0) {
  throw "Fallo la ejecucion de OWASP Dependency-Check. Codigo de salida: $LASTEXITCODE"
}

if (-not (Test-Path $reportHtml) -or -not (Test-Path $reportJson)) {
  throw "Dependency-Check finalizó sin generar todos los artefactos esperados en $outputPath"
}

$reportes = Get-ChildItem -Path $outputPath -File
if ($reportes.Count -eq 0) {
  throw "Dependency-Check no dejó archivos en $outputPath"
}

Write-Host "Reportes generados en $outputPath :"
foreach ($reporte in $reportes) {
  Write-Host "  - $($reporte.Name)"
}

