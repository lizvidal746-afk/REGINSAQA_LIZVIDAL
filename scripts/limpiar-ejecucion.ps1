param(
  [ValidateSet('rapida','completa','reinicio')]
  [string]$Modo = 'rapida',
  [switch]$GuardarEvidencia
)

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$targetsBase = @(
  'allure-results',
  'allure-report',
  'playwright-report',
  'test-results',
  'screenshots',
  'errors',
  '.tmp-caso1.log',
  '.tmp-caso1.json',
  '.tmp-caso1-run.log',
  '.tmp-caso1-run3.log',
  '.tmp-caso1-after-fix.log',
  '.tmp-caso1-after-fallback.log',
  '.tmp-caso1-after-enoent-fix.log',
  '.tmp-caso1-plain.log',
  '.tmp-caso1-junit.xml'
)

$targetsReportesOperativos = @(
  'reportes/registros-administrados.json',
  'reportes/administrados-reservados.json',
  'reportes/administrados-registrados.json',
  'reportes/administrados-pool.json',
  'reportes/administrados-run.json',
  'reportes/administrados-reservados.lock',
  'reportes/administrados-run.lock',
  'reportes/administrados-pool.lock',
  'reportes/k6-summary.json'
)

$targetsCompletos = @(
  'storageState.json'
)

$historicoPath = 'reportes/historico/administrados-historico.json'

function Get-JsonArray($ruta) {
  if (-not (Test-Path $ruta)) { return @() }
  $raw = Get-Content -Raw -Path $ruta
  if (-not $raw) { return @() }
  $data = $raw | ConvertFrom-Json
  if ($data -is [System.Array]) {
    return @($data)
  }
  if ($data.registros) {
    return @($data.registros)
  }
  return @()
}

function Join-AdministradosHistorico {
  $baseHistorico = Get-JsonArray $historicoPath
  $registros = Get-JsonArray 'reportes/registros-administrados.json'
  $administrados = Get-JsonArray 'reportes/administrados-registrados.json'

  $todos = @()
  $todos += $baseHistorico
  $todos += $registros
  $todos += $administrados

  $unicos = @{}
  foreach ($item in $todos) {
    $ruc = "$($item.ruc)".Trim()
    $razon = "$($item.razonSocial)".Trim()
    if ([string]::IsNullOrWhiteSpace($ruc) -and [string]::IsNullOrWhiteSpace($razon)) { continue }
    $key = "${ruc}|${razon}".ToUpperInvariant()
    if (-not $unicos.ContainsKey($key)) {
      $unicos[$key] = [PSCustomObject]@{
        ruc = $item.ruc
        razonSocial = $item.razonSocial
        nombreComercial = $item.nombreComercial
        estado = $item.estado
        timestamp = $item.timestamp
      }
    }
  }

  $historicoDir = Split-Path -Parent $historicoPath
  if (-not (Test-Path $historicoDir)) {
    New-Item -ItemType Directory -Path $historicoDir -Force | Out-Null
  }

  $resultado = @($unicos.Values)
  $resultado | ConvertTo-Json -Depth 6 | Set-Content -Path $historicoPath -Encoding UTF8
  Write-Host "Historico consolidado: $historicoPath ($($resultado.Count) registros)"
}

function Remove-ResidualMediaArtifacts {
  $patterns = @('*.webm', 'trace.zip')
  foreach ($pattern in $patterns) {
    $archivos = Get-ChildItem -Path $root -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue
    foreach ($archivo in $archivos) {
      try {
        Remove-Item -Path $archivo.FullName -Force -ErrorAction SilentlyContinue
        Write-Host "Eliminado residual: $($archivo.FullName)"
      } catch {}
    }
  }
}

$allTargets = @()
$allTargets += $targetsBase
if ($Modo -eq 'completa') {
  $allTargets += $targetsReportesOperativos
  $allTargets += $targetsCompletos
}
if ($Modo -eq 'reinicio') {
  Join-AdministradosHistorico
  $allTargets += $targetsReportesOperativos
}

if ($GuardarEvidencia) {
  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $archiveDir = Join-Path $root "artifacts-archive/$timestamp"
  New-Item -ItemType Directory -Path $archiveDir -Force | Out-Null

  foreach ($target in $allTargets) {
    if (Test-Path $target) {
      $dest = Join-Path $archiveDir $target
      $destParent = Split-Path -Parent $dest
      New-Item -ItemType Directory -Path $destParent -Force | Out-Null
      Copy-Item -Path $target -Destination $dest -Recurse -Force
    }
  }

  $zipPath = Join-Path $root "artifacts-archive/$timestamp.zip"
  Compress-Archive -Path "$archiveDir/*" -DestinationPath $zipPath -Force
  Write-Host "Evidencias archivadas en: $zipPath"
}

foreach ($target in $allTargets) {
  if (Test-Path $target) {
    Remove-Item -Path $target -Recurse -Force
    Write-Host "Eliminado: $target"
  }
}

if ($Modo -in @('reinicio', 'completa')) {
  Remove-ResidualMediaArtifacts
}

if (-not (Test-Path 'reportes')) {
  New-Item -ItemType Directory -Path 'reportes' | Out-Null
}

Write-Host "Limpieza completada (modo: $Modo)"
