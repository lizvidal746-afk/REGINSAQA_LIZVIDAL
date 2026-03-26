param(
  [ValidateSet('limpiar-actual', 'listar-historico', 'borrar-historico')]
  [string]$Accion,
  [string]$SecurityDir = 'reportes/security',
  [string]$HistoryRoot = 'reportes/historico/security',
  [int]$Top = 5
)

$ErrorActionPreference = 'Stop'

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

function Get-CurrentSecurityFiles {
  param([string]$Dir)
  $all = @()
  foreach ($pattern in $patterns) {
    $all += Get-ChildItem -Path $Dir -File -Filter $pattern -ErrorAction SilentlyContinue
  }
  return @($all | Sort-Object FullName -Unique)
}

switch ($Accion) {
  'limpiar-actual' {
    if (-not (Test-Path $SecurityDir)) {
      throw "No existe carpeta: $SecurityDir"
    }

    $files = Get-CurrentSecurityFiles -Dir $SecurityDir
    foreach ($f in $files) {
      Remove-Item -Path $f.FullName -Force
    }

    Write-Host "Carpeta de seguridad limpiada: $SecurityDir"
    Write-Host "Archivos eliminados: $($files.Count)"
  }

  'listar-historico' {
    if (-not (Test-Path $HistoryRoot)) {
      Write-Host "No existe historico aun: $HistoryRoot"
      exit 0
    }

    $dirs = Get-ChildItem -Path $HistoryRoot -Directory | Sort-Object Name -Descending | Select-Object -First $Top
    if ($dirs.Count -eq 0) {
      Write-Host "No hay snapshots en: $HistoryRoot"
      exit 0
    }

    foreach ($d in $dirs) {
      $manifest = Join-Path $d.FullName 'manifest.json'
      if (Test-Path $manifest) {
        $m = Get-Content -Path $manifest -Raw | ConvertFrom-Json
        Write-Host "$($d.Name) | createdAt=$($m.createdAt) | files=$($m.fileCount)"
      } else {
        $count = (Get-ChildItem -Path $d.FullName -File -ErrorAction SilentlyContinue | Measure-Object).Count
        Write-Host "$($d.Name) | createdAt=(sin manifest) | files=$count"
      }
    }
  }

  'borrar-historico' {
    if (-not (Test-Path $HistoryRoot)) {
      Write-Host "No existe historico para borrar: $HistoryRoot"
      exit 0
    }

    Remove-Item -Path $HistoryRoot -Recurse -Force
    Write-Host "Historico eliminado: $HistoryRoot"
  }
}
