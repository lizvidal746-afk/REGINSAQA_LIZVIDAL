param(
  [string]$SecurityDir = "reportes/security",
  [string]$HistoryRoot = "reportes/historico/security",
  [switch]$LimpiarActual
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $SecurityDir)) {
  throw "No existe carpeta de reportes de seguridad: $SecurityDir"
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$snapshotDir = Join-Path $HistoryRoot $timestamp
New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null

$patterns = @(
  'zap-baseline-report.*',
  'zap-baseline-report.es.*',
  'owasp-reporte-provisional-es.*',
  'owasp-reporte-provisional-en.*',
  'owasp-reporte-desarrollador-*.*',
  'owasp-reporte-ejecutivo-*.*',
  'owasp-comparacion-interna.md',
  'owasp-comparativo-provisional.*'
)

$copied = @()
foreach ($pattern in $patterns) {
  $files = Get-ChildItem -Path $SecurityDir -File -Filter $pattern -ErrorAction SilentlyContinue
  foreach ($f in $files) {
    $dest = Join-Path $snapshotDir $f.Name
    Copy-Item -Path $f.FullName -Destination $dest -Force
    $copied += $f.Name
  }
}

$manifest = [PSCustomObject]@{
  createdAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  sourceDir = $SecurityDir
  snapshotDir = $snapshotDir
  fileCount = $copied.Count
  files = $copied
}

$manifestPath = Join-Path $snapshotDir 'manifest.json'
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8

if ($LimpiarActual) {
  foreach ($name in $copied) {
    $toDelete = Join-Path $SecurityDir $name
    if (Test-Path $toDelete) {
      Remove-Item -Path $toDelete -Force
    }
  }
  Write-Host "Se limpio la carpeta actual: $SecurityDir"
}

Write-Host "Snapshot OWASP generado: $snapshotDir"
Write-Host "Archivos versionados: $($copied.Count)"
