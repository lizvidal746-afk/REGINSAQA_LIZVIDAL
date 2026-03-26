param(
  [string]$BaseDir = 'reportes/security',
  [switch]$Recursivo
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $BaseDir)) {
  Write-Host "No existe carpeta: $BaseDir"
  exit 0
}

if ($Recursivo) {
  $files = Get-ChildItem -Path $BaseDir -Recurse -File -Filter 'sonar-*' -ErrorAction SilentlyContinue
} else {
  $files = Get-ChildItem -Path $BaseDir -File -Filter 'sonar-*' -ErrorAction SilentlyContinue
}

$count = 0
foreach ($f in $files) {
  Remove-Item -Path $f.FullName -Force
  $count += 1
}

Write-Host "Reportes Sonar eliminados: $count"
