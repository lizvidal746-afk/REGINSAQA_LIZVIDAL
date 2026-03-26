param(
  [ValidateSet('local','cloud')]
  [string]$K6Output = 'local',

  [int]$K6Cantidad = 0,
  [double]$K6SleepSeconds = 0,
  [int]$K6Vus = 1,
  [string]$PerfDuration = '10m',

  [ValidateSet('single','pool')]
  [string]$UserMode = 'single',
  [int]$PoolSize = 8,
  [int]$UserSlot = 1,
  [string]$ApiUser = '',
  [string]$ApiPass = '',
  [string]$ApiToken = '',
  [string]$EnvFile = '',

  [string]$GrafanaProjectId = '',
  [string]$GrafanaToken = '',

  [string]$Casos = '00,01,02,03,04'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ($K6Cantidad -le 0) {
  throw 'Debes indicar -K6Cantidad mayor a 0.'
}

function Resolve-NonEmpty([string]$primary, [string]$fallback) {
  if (-not [string]::IsNullOrWhiteSpace($primary)) { return $primary }
  return $fallback
}

$grafanaSecretsHelper = Join-Path $PSScriptRoot 'shared/grafana-secrets.ps1'
if (Test-Path $grafanaSecretsHelper) {
  . $grafanaSecretsHelper
}

$envLoader = Join-Path $PSScriptRoot 'shared/import-env-file.ps1'
if (Test-Path $envLoader) {
  & $envLoader -Path $EnvFile
}

$cloudProjectId = Resolve-NonEmpty $GrafanaProjectId $env:K6_CLOUD_PROJECT_ID
$cloudToken = Resolve-NonEmpty $GrafanaToken $env:K6_CLOUD_TOKEN

if (Get-Command Resolve-GrafanaCloudSecrets -ErrorAction SilentlyContinue) {
  $resolvedGrafanaSecrets = Resolve-GrafanaCloudSecrets -GrafanaProjectId $cloudProjectId -GrafanaToken $cloudToken -PersistProvided
  $cloudProjectId = [string]$resolvedGrafanaSecrets.ProjectId
  $cloudToken = [string]$resolvedGrafanaSecrets.Token
}

if ($K6Output -eq 'cloud') {
  if ([string]::IsNullOrWhiteSpace($cloudProjectId) -or [string]::IsNullOrWhiteSpace($cloudToken)) {
    throw 'K6Output=cloud requiere K6_CLOUD_PROJECT_ID y K6_CLOUD_TOKEN.'
  }
}

$apiTokenFinal = Resolve-NonEmpty $ApiToken (Resolve-NonEmpty $env:REGINSA_API_AUTH_HEADER $env:REGINSA_API_TOKEN)
if (-not [string]::IsNullOrWhiteSpace($apiTokenFinal)) {
  $env:REGINSA_API_AUTH_HEADER = $apiTokenFinal
  $env:REGINSA_API_TOKEN = $apiTokenFinal
}

$caseList = @($Casos.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ -in @('00','01','02','03','04') })
if ($caseList.Count -eq 0) {
  throw 'Casos inválidos. Usa combinación de: 00,01,02,03,04.'
}

$statusMap = [ordered]@{}

function Invoke-RunnerCommand([string]$caseId, [string[]]$pwshArgs) {
  Write-Output "`n=== Caso $caseId ==="
  try {
    & powershell @pwshArgs
    if ($LASTEXITCODE -ne 0) {
      $statusMap[$caseId] = @{ ok = $false; exitCode = $LASTEXITCODE; finishedAt = (Get-Date).ToString('s') }
      return
    }
    $statusMap[$caseId] = @{ ok = $true; exitCode = 0; finishedAt = (Get-Date).ToString('s') }
  } catch {
    Write-Output "Caso $caseId falló: $($_.Exception.Message)"
    $statusMap[$caseId] = @{ ok = $false; exitCode = 1; finishedAt = (Get-Date).ToString('s'); error = $_.Exception.Message }
  }
}

foreach ($caseId in $caseList) {
  switch ($caseId) {
    '00' {
      $args00 = @(
        '-ExecutionPolicy', 'Bypass',
        '-File', 'scripts/run-caso00-login.ps1',
        '-K6Output', $K6Output,
        '-K6Cantidad', $K6Cantidad,
        '-K6Vus', $K6Vus,
        '-PerfDuration', $PerfDuration,
        '-UserMode', $UserMode,
        '-PoolSize', $PoolSize,
        '-UserSlot', $UserSlot,
        '-EnvFile', $EnvFile
      )
      if (-not [string]::IsNullOrWhiteSpace($ApiUser)) { $args00 += @('-ApiUser', $ApiUser) }
      if (-not [string]::IsNullOrWhiteSpace($ApiPass)) { $args00 += @('-ApiPass', $ApiPass) }
      if (-not [string]::IsNullOrWhiteSpace($cloudProjectId)) { $args00 += @('-GrafanaProjectId', $cloudProjectId) }
      if (-not [string]::IsNullOrWhiteSpace($cloudToken)) { $args00 += @('-GrafanaToken', $cloudToken) }
      Invoke-RunnerCommand -caseId '00' -pwshArgs $args00
    }
    '01' {
      $args01 = @(
        '-ExecutionPolicy', 'Bypass',
        '-File', 'scripts/run-caso01-local.ps1',
        '-Mode', 'k6',
        '-K6Output', $K6Output,
        '-K6Cantidad', $K6Cantidad,
        '-K6SleepSeconds', $K6SleepSeconds,
        '-K6Vus', $K6Vus,
        '-PerfDuration', $PerfDuration,
        '-SkipPrewarm'
      )
      if (-not [string]::IsNullOrWhiteSpace($apiTokenFinal)) { $args01 += @('-ApiAuthHeader', $apiTokenFinal) }
      if (-not [string]::IsNullOrWhiteSpace($ApiUser)) { $args01 += @('--user', $ApiUser) }
      if (-not [string]::IsNullOrWhiteSpace($ApiPass)) { $args01 += @('--pass', $ApiPass) }
      if (-not [string]::IsNullOrWhiteSpace($cloudProjectId)) { $args01 += @('-GrafanaProjectId', $cloudProjectId) }
      if (-not [string]::IsNullOrWhiteSpace($cloudToken)) { $args01 += @('-GrafanaToken', $cloudToken) }
      Invoke-RunnerCommand -caseId '01' -pwshArgs $args01
    }
    '02' {
      $args02 = @(
        '-ExecutionPolicy', 'Bypass',
        '-File', 'scripts/run-caso02-local.ps1',
        '-Mode', 'k6',
        '-K6Output', $K6Output,
        '-K6Cantidad', $K6Cantidad,
        '-K6SleepSeconds', $K6SleepSeconds,
        '-K6Vus', $K6Vus,
        '-PerfDuration', $PerfDuration,
        '-SkipPrewarm'
      )
      if (-not [string]::IsNullOrWhiteSpace($apiTokenFinal)) { $args02 += @('-ApiToken', $apiTokenFinal) }
      if (-not [string]::IsNullOrWhiteSpace($cloudProjectId)) { $args02 += @('-GrafanaProjectId', $cloudProjectId) }
      if (-not [string]::IsNullOrWhiteSpace($cloudToken)) { $args02 += @('-GrafanaToken', $cloudToken) }
      Invoke-RunnerCommand -caseId '02' -pwshArgs $args02
    }
    '03' {
      $args03 = @(
        '-ExecutionPolicy', 'Bypass',
        '-File', 'scripts/run-caso03-local.ps1',
        '-K6Output', $K6Output,
        '-K6Cantidad', $K6Cantidad,
        '-K6SleepSeconds', $K6SleepSeconds,
        '-K6Vus', $K6Vus,
        '-PerfDuration', $PerfDuration
      )
      if (-not [string]::IsNullOrWhiteSpace($apiTokenFinal)) { $args03 += @('-ApiToken', $apiTokenFinal) }
      if (-not [string]::IsNullOrWhiteSpace($cloudProjectId)) { $args03 += @('-GrafanaProjectId', $cloudProjectId) }
      if (-not [string]::IsNullOrWhiteSpace($cloudToken)) { $args03 += @('-GrafanaToken', $cloudToken) }
      Invoke-RunnerCommand -caseId '03' -pwshArgs $args03
    }
    '04' {
      $args04 = @(
        '-ExecutionPolicy', 'Bypass',
        '-File', 'scripts/run-caso04-local.ps1',
        '-K6Output', $K6Output,
        '-K6Cantidad', $K6Cantidad,
        '-K6SleepSeconds', $K6SleepSeconds,
        '-K6Vus', $K6Vus,
        '-PerfDuration', $PerfDuration
      )
      if (-not [string]::IsNullOrWhiteSpace($apiTokenFinal)) { $args04 += @('-ApiToken', $apiTokenFinal) }
      if (-not [string]::IsNullOrWhiteSpace($cloudProjectId)) { $args04 += @('-GrafanaProjectId', $cloudProjectId) }
      if (-not [string]::IsNullOrWhiteSpace($cloudToken)) { $args04 += @('-GrafanaToken', $cloudToken) }
      Invoke-RunnerCommand -caseId '04' -pwshArgs $args04
    }
  }
}

if (-not (Test-Path 'reportes')) {
  New-Item -ItemType Directory -Path 'reportes' | Out-Null
}
$statusPath = 'reportes/k6-presentacion-status.json'
$statusData = [ordered]@{
  generatedAt = (Get-Date).ToString('s')
  output = $K6Output
  cantidad = $K6Cantidad
  sleepSeconds = $K6SleepSeconds
  vus = $K6Vus
  casos = $statusMap
}
$statusData | ConvertTo-Json -Depth 6 | Set-Content -Path $statusPath -Encoding UTF8

Write-Output "`nGenerando resumen final..."
& node scripts/generar-resumen-k6-presentacion.js

$failed = @($statusMap.GetEnumerator() | Where-Object { -not $_.Value.ok }).Count
if ($failed -gt 0) {
  throw "Finalizó con $failed caso(s) fallidos. Revisa reportes/k6-presentacion-00-04-resumen.md"
}

Write-Output "`nPresentación k6 00-04 completada."
