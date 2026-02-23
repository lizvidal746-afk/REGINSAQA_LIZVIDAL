param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PlaywrightArgs
)

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:SKIP_SCREENSHOTS = '1'
$env:REGINSA_SCALE_MODE = '1'
if (-not $env:REGINSA_STRICT_VERIFY) {
  $env:REGINSA_STRICT_VERIFY = '1'
}
if (-not $env:REGINSA_VERIFY_API) {
  $env:REGINSA_VERIFY_API = '1'
}
if (-not $env:REGINSA_VERIFY_UI) {
  $env:REGINSA_VERIFY_UI = '0'
}
if (-not $env:REGINSA_FAST_VERIFY_ON_API) {
  $env:REGINSA_FAST_VERIFY_ON_API = '1'
}
if (-not $env:REGINSA_VERIFY_RETRIES) {
  $env:REGINSA_VERIFY_RETRIES = '2'
}
if (-not $env:REGINSA_VERIFY_WAIT_MS) {
  $env:REGINSA_VERIFY_WAIT_MS = '800'
}
if (-not $env:REGINSA_MAX_REINTENTOS) {
  $env:REGINSA_MAX_REINTENTOS = '2'
}
if (-not $env:REGINSA_ALLOW_UI_EVENTUAL) {
  $env:REGINSA_ALLOW_UI_EVENTUAL = '1'
}
if (-not $env:REGINSA_PW_RETRIES) {
  $env:REGINSA_PW_RETRIES = '2'
}
if (-not $env:REGINSA_SKIP_PREWARM) {
  $env:REGINSA_SKIP_PREWARM = '1'
}

function Set-MinIntEnv {
  param(
    [string]$Name,
    [int]$Min
  )

  $current = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($current)) {
    [Environment]::SetEnvironmentVariable($Name, [string]$Min)
    return
  }

  try {
    $value = [int]$current
    if ($value -lt $Min) {
      [Environment]::SetEnvironmentVariable($Name, [string]$Min)
    }
  } catch {
    [Environment]::SetEnvironmentVariable($Name, [string]$Min)
  }
}

function Get-RequestedWorkers {
  param([string[]]$InputArgs)

  for ($i = 0; $i -lt $InputArgs.Count; $i++) {
    $arg = $InputArgs[$i]
    if ($arg -match '^--workers=(\d+)$') {
      return [int]$matches[1]
    }
    if ($arg -eq '--workers' -and ($i + 1) -lt $InputArgs.Count) {
      $next = $InputArgs[$i + 1]
      if ($next -match '^\d+$') {
        return [int]$next
      }
    }
  }

  return 1
}

$requestedWorkers = Get-RequestedWorkers -InputArgs $PlaywrightArgs

if ($requestedWorkers -ge 8) {
  Set-MinIntEnv -Name 'REGINSA_REGISTRO_TIMEOUT_MS' -Min 120000
  Set-MinIntEnv -Name 'REGINSA_MAX_REINTENTOS' -Min 4
  Set-MinIntEnv -Name 'REGINSA_DATA_RETRIES' -Min 2
  Set-MinIntEnv -Name 'REGINSA_VERIFY_RETRIES' -Min 3
  Set-MinIntEnv -Name 'REGINSA_VERIFY_WAIT_MS' -Min 1200
  Set-MinIntEnv -Name 'REGINSA_CONFIRMAR_API_RETRIES' -Min 10
  Set-MinIntEnv -Name 'REGINSA_CONFIRMAR_API_WAIT_MS' -Min 1800
  Set-MinIntEnv -Name 'REGINSA_CONFIRMAR_API_RETRIES_EXT' -Min 24
  Set-MinIntEnv -Name 'REGINSA_CONFIRMAR_API_WAIT_MS_EXT' -Min 2200
  Set-MinIntEnv -Name 'REGINSA_CONFIRMAR_API_RETRIES_FINAL' -Min 24
  Set-MinIntEnv -Name 'REGINSA_CONFIRMAR_API_WAIT_MS_FINAL' -Min 2200
  Set-MinIntEnv -Name 'REGINSA_PW_RETRIES' -Min 2
  Write-Host '🛡️ Perfil anti-failed activado para alta concurrencia (workers>=8).' -ForegroundColor Cyan
}

if ($requestedWorkers -ge 7) {
  $missing = @()
  for ($slot = 7; $slot -le 8; $slot++) {
    $userVar = "REGINSA_USER_$slot"
    $passVar = "REGINSA_PASS_$slot"
    $userValue = [Environment]::GetEnvironmentVariable($userVar)
    $passValue = [Environment]::GetEnvironmentVariable($passVar)

    if ([string]::IsNullOrWhiteSpace($userValue) -or [string]::IsNullOrWhiteSpace($passValue)) {
      $missing += "$userVar/$passVar"
    }
  }

  if ($missing.Count -gt 0) {
    Write-Host "⚠️ Faltan credenciales dedicadas para --workers=$requestedWorkers en modo scale." -ForegroundColor Yellow
    Write-Host "   Faltan: $($missing -join ', ')" -ForegroundColor Yellow
    Write-Host "   Continuando con pool compartido (sin bloqueo)." -ForegroundColor Yellow
  } else {
    Write-Host "✅ Validación de pool paralelo: slots 7 y 8 disponibles." -ForegroundColor Green
  }
}

if ($env:REGINSA_SKIP_PREWARM -eq '1') {
  Write-Host 'Prewarm omitido por defecto (REGINSA_SKIP_PREWARM=1).'
} else {
  Write-Host "Precalentando pool (objetivo: $($env:REGINSA_POOL_TARGET))..."
  & node (Join-Path $PSScriptRoot 'prewarm-pool.js')
}

$retries = 1
try {
  $parsedRetries = [int]$env:REGINSA_PW_RETRIES
  if ($parsedRetries -ge 0) {
    $retries = $parsedRetries
  }
} catch {}

Write-Host 'Ejecutando Caso 03 en modo scale...'
& npx playwright test --grep '03-RECONSIDERAR SIN SANCIONES' --retries=$retries @PlaywrightArgs
$testExitCode = $LASTEXITCODE

if ($env:REGINSA_SKIP_POST_REPORTS -eq '1') {
  Write-Host 'Post reportes omitidos por REGINSA_SKIP_POST_REPORTS=1'
} else {
  Write-Host 'Generando y abriendo reportes...'
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'post-test01-reportes.ps1')
}

exit $testExitCode
