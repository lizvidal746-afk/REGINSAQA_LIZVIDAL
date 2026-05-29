# Agrega `permissions: contents: read` a todos los workflows de GitHub Actions
# que no tienen un bloque permissions a nivel top (requerido por CKV2_GHA_1)
# Uso: pwsh -File scripts/fix-workflow-permissions.ps1

$workflowDir = "D:\SUNEDU\AUTOMATIZACION\REGINSA\.github\workflows"

if (-not (Test-Path $workflowDir)) {
  Write-Host "ERROR: No se encontro directorio $workflowDir" -ForegroundColor Red
  exit 1
}

$files  = [System.IO.Directory]::GetFiles($workflowDir, "*.yml")
$fixed  = 0
$skip   = 0

Write-Host "Analizando $($files.Count) workflows en $workflowDir`n"

foreach ($filePath in $files) {
  $fileName = [System.IO.Path]::GetFileName($filePath)
  $content  = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)

  if ($content -match '(?m)^permissions:') {
    Write-Host "  OK    $fileName" -ForegroundColor DarkGray
    $skip++
    continue
  }

  if ($content -match '(?m)^jobs:') {
    $newContent = $content -replace '(?m)^jobs:', "permissions:`n  contents: read`n`njobs:"
    [System.IO.File]::WriteAllText($filePath, $newContent, [System.Text.Encoding]::UTF8)
    Write-Host "  FIXED $fileName" -ForegroundColor Green
    $fixed++
  } else {
    Write-Host "  WARN  $fileName  (sin bloque jobs:)" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "================================"
Write-Host "  Total archivos   : $($files.Count)"
Write-Host "  Corregidos       : $fixed" -ForegroundColor Green
Write-Host "  Ya tenian permiso: $skip"  -ForegroundColor DarkGray
Write-Host "================================"


if (-not (Test-Path $workflowDir)) {
  Write-Host "ERROR: No se encontro directorio $workflowDir" -ForegroundColor Red
  exit 1
}

$files  = Get-ChildItem $workflowDir -Filter "*.yml"
$fixed  = 0
$skip   = 0
$noJob  = 0

Write-Host "Analizando $($files.Count) workflows en $workflowDir`n"

foreach ($file in $files) {
  $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)

  if ($content -match '(?m)^permissions:') {
    Write-Host "  OK   $($file.Name)" -ForegroundColor DarkGray
    $skip++
    continue
  }

  if ($content -match '(?m)^jobs:') {
    $newContent = $content -replace '(?m)^jobs:', "permissions:`n  contents: read`n`njobs:"
    [System.IO.File]::WriteAllText($file.FullName, $newContent, [System.Text.Encoding]::UTF8)
    Write-Host "  FIXED $($file.Name)" -ForegroundColor Green
    $fixed++
  } else {
    Write-Host "  WARN  $($file.Name)  (sin bloque jobs:)" -ForegroundColor Yellow
    $noJob++
  }
}

Write-Host ""
Write-Host "================================"
Write-Host "  Total archivos   : $($files.Count)"
Write-Host "  Corregidos       : $fixed" -ForegroundColor Green
Write-Host "  Ya tenian permiso: $skip"  -ForegroundColor DarkGray
Write-Host "  Sin jobs: block  : $noJob" -ForegroundColor Yellow
Write-Host "================================"
