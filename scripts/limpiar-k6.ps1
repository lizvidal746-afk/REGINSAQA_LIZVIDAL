param(
  [ValidateSet('rapida','completa')]
  [string]$Modo = 'rapida'
)

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$reportesRoot = Join-Path $root 'reportes'
if (-not (Test-Path $reportesRoot)) {
  Write-Host 'No existe carpeta reportes. Nada por limpiar.'
  exit 0
}

$filesToDelete = Get-ChildItem -Path $reportesRoot -Recurse -File |
  Where-Object {
    $_.Name -like 'k6*' -or
    $_.Name -like '*k6*'
  }

foreach ($file in $filesToDelete) {
  Remove-Item -Path $file.FullName -Force
  Write-Host "Eliminado: $($file.FullName)"
}

if ($Modo -eq 'completa') {
  $dirsToDelete = Get-ChildItem -Path $reportesRoot -Recurse -Directory |
    Where-Object { $_.Name -like '*k6*' } |
    Sort-Object FullName -Descending

  foreach ($dir in $dirsToDelete) {
    Remove-Item -Path $dir.FullName -Recurse -Force
    Write-Host "Eliminado directorio: $($dir.FullName)"
  }
}

Write-Host "Limpieza k6 completada (modo: $Modo)"