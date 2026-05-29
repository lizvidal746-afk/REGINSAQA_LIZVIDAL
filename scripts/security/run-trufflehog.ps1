# Ejecuta TruffleHog v3 via Docker — verificacion activa de secretos
# A diferencia de Gitleaks, TruffleHog verifica si el secreto detectado
# es realmente valido haciendo una llamada real contra la API objetivo.
# Norma: ISO/IEC 27001 A.9.4.1, OWASP ASVS V2.10
param(
  [string]$OutputDir = "reportes/security/trufflehog",
  [switch]$AllBranches
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

$dWorkspace = ConvertTo-DockerPath $workspacePath
$dOutput    = ConvertTo-DockerPath $outputPath
$jsonFile   = Join-Path $outputPath 'trufflehog-results.json'

Write-Host "=== TruffleHog v3 Secret Verification ==="
Write-Host "Repositorio: $workspacePath"
Write-Host "Salida JSON: $jsonFile"
Write-Host "Solo secretos verificados (activos): SI"

$extraArgs = @('--only-verified', '--json')
if ($AllBranches) { $extraArgs += '--all-branches' }

# NOTA Windows: no montar el archivo de salida como bind-mount -- causa file lock.
# Solución: capturar stdout del contenedor y escribir el archivo desde PowerShell.
$dockerArgs = @(
  'run', '--rm',
  '--volume', "${dWorkspace}:/repo:ro",
  'trufflesecurity/trufflehog:latest',
  'filesystem', '/repo'
) + $extraArgs

Write-Host "Ejecutando: docker $($dockerArgs -join ' ')"
# Eliminar archivo previo para evitar file lock de antivirus o proceso anterior
if (Test-Path $jsonFile) { Remove-Item $jsonFile -Force -ErrorAction SilentlyContinue }
$stdout = & docker @dockerArgs 2>&1
$stdout | Where-Object { $_ -ne '' } | Out-File -FilePath $jsonFile -Encoding UTF8 -Force

$count = 0
if (Test-Path $jsonFile) {
  $count = (Get-Content $jsonFile | Where-Object { $_ -ne '' }).Count
  Write-Host "Secretos verificados encontrados: $count"
  Write-Host "Reporte JSON: $jsonFile"
} else {
  Write-Warning "No se genero archivo JSON -- revisar salida de TruffleHog."
}
