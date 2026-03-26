param(
  [ValidateSet('all','funcional','k6')]
  [string]$Mode = 'all',

  [ValidateSet('fast','scale')]
  [string]$FunctionalMode = 'fast',

  [int]$Workers = 3,
  [int]$RepeatEach = 9,
  [int]$PoolTarget = 300,

  [ValidateSet('local','cloud')]
  [string]$K6Output = 'local',

  [int]$K6Cantidad = 2,
  [double]$K6SleepSeconds = -1,
  [int]$K6Vus = 0,
  [ValidateSet('fresh','mixed')]
  [string]$K6DatasetStrategy = 'fresh',
  [string]$PerfDuration = '10m',

  [string]$BaseUrl = '',
  [string]$BaseFrontend = '',
  [string]$EnvFile = '',
  [string]$ApiAuthHeader = '',
  [string]$GrafanaProjectId = '',
  [string]$GrafanaToken = '',

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CliArgs,

  [switch]$SkipClean,
  [switch]$SkipPrewarm,
  [switch]$SkipDataset
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$envLoader = Join-Path $PSScriptRoot 'shared/import-env-file.ps1'
if (Test-Path $envLoader) {
  & $envLoader -Path '.env'
  & $envLoader -Path '.env.k6'
  & $envLoader -Path '.env.k6.local'
  if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
    & $envLoader -Path $EnvFile
  }
}

function Resolve-NonEmpty([string]$primary, [string]$fallback) {
  if (-not [string]::IsNullOrWhiteSpace($primary)) { return $primary }
  return $fallback
}

$grafanaSecretsHelper = Join-Path $PSScriptRoot 'shared/grafana-secrets.ps1'
if (Test-Path $grafanaSecretsHelper) {
  . $grafanaSecretsHelper
}

function Get-CliOption([string]$name) {
  if ($null -eq $CliArgs) { return '' }
  for ($i = 0; $i -lt $CliArgs.Count; $i++) {
    $arg = [string]$CliArgs[$i]
    if ([string]::IsNullOrWhiteSpace($arg)) { continue }

    # Accept both --name=value and name=value forms.
    if ($arg -like "--$name=*") {
      $value = $arg.Substring($name.Length + 3).Trim()
      if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }

      # Recover from malformed input such as: --token= token=xxxx
      if ($i + 1 -lt $CliArgs.Count) {
        $next = [string]$CliArgs[$i + 1]
        if ($next -like "$name=*") {
          $nextValue = $next.Substring($name.Length + 1).Trim()
          if (-not [string]::IsNullOrWhiteSpace($nextValue)) { return $nextValue }
        }
        if (($next -notlike '--*') -and (-not [string]::IsNullOrWhiteSpace($next))) {
          return $next.Trim()
        }
      }
    }
    if ($arg -like "$name=*") {
      $value = $arg.Substring($name.Length + 1).Trim()
      if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
    }
    if ($arg -eq "--$name" -and $i + 1 -lt $CliArgs.Count) {
      $value = [string]$CliArgs[$i + 1]
      if (-not [string]::IsNullOrWhiteSpace($value)) { return $value.Trim() }
    }
  }
  return ''
}

function Get-TokenForCredential([string]$user, [string]$pass, [string]$frontendUrl) {
  $tokenOutput = & node scripts/postman/get-punku-token.js $user $pass $frontendUrl
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo obtener TOKEN_JWT para usuario $user (exit=$LASTEXITCODE)."
  }
  $token = [string]::Join('', @($tokenOutput)).Trim()
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw "TOKEN_JWT vacío para usuario $user."
  }
  return $token
}

function Has-AnyApiCredential() {
  if (-not [string]::IsNullOrWhiteSpace($apiAuthHeaderFinal)) { return $true }
  if (-not [string]::IsNullOrWhiteSpace($env:K6_AUTH_HEADERS)) { return $true }
  if (-not [string]::IsNullOrWhiteSpace($env:TOKEN)) { return $true }
  if ((-not [string]::IsNullOrWhiteSpace($env:REGINSA_USER)) -and (-not [string]::IsNullOrWhiteSpace($env:REGINSA_PASS))) { return $true }

  for ($i = 1; $i -le 20; $i++) {
    $tk = (Get-Item -Path "Env:TOKEN$($i)" -ErrorAction SilentlyContinue).Value
    if (-not [string]::IsNullOrWhiteSpace($tk)) { return $true }

    $u = (Get-Item -Path "Env:REGINSA_USER_$($i)" -ErrorAction SilentlyContinue).Value
    $p = (Get-Item -Path "Env:REGINSA_PASS_$($i)" -ErrorAction SilentlyContinue).Value
    if ((-not [string]::IsNullOrWhiteSpace($u)) -and (-not [string]::IsNullOrWhiteSpace($p))) { return $true }
  }

  return $false
}

$invokeOrFail = {
  param([string]$command, [string]$label)
  $safeCommand = $command
  $safeCommand = [regex]::Replace($safeCommand, "(?i)(K6_AUTH_HEADER=')([^']+)(')", '$1***$3')
  $safeCommand = [regex]::Replace($safeCommand, "(?i)(TOKEN1=')([^']+)(')", '$1***$3')
  Write-Host "`n[RUN] $label" -ForegroundColor Cyan
  Write-Host "   $safeCommand" -ForegroundColor DarkGray
  Invoke-Expression $command
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo: $label (exit=$LASTEXITCODE)"
  }
}

$baseUrlFinal = Resolve-NonEmpty $BaseUrl $env:REGINSA_API_BASE
if ([string]::IsNullOrWhiteSpace($baseUrlFinal)) {
  $baseUrlFinal = 'https://reginsaapiqa.sunedu.gob.pe/api'
}

$baseFrontendFinal = Resolve-NonEmpty $BaseFrontend (Resolve-NonEmpty $env:REGINSA_BASE_URL $env:REGINSA_URL)
if ([string]::IsNullOrWhiteSpace($baseFrontendFinal)) {
  $baseFrontendFinal = 'https://reginsaqa.sunedu.gob.pe'
}

$cantidadRaw = Resolve-NonEmpty (Get-CliOption 'cantidad') $env:npm_config_cantidad
if (-not [string]::IsNullOrWhiteSpace($cantidadRaw)) {
  $cantidadParsed = 0
  if ([int]::TryParse($cantidadRaw, [ref]$cantidadParsed) -and $cantidadParsed -gt 0) {
    $K6Cantidad = $cantidadParsed
  }
}

$datasetStrategyRaw = Resolve-NonEmpty (Get-CliOption 'datasetstrategy') (Resolve-NonEmpty $env:npm_config_datasetstrategy $env:K6_DATASET_STRATEGY)
if (-not [string]::IsNullOrWhiteSpace($datasetStrategyRaw)) {
  $normalizedStrategy = $datasetStrategyRaw.Trim().ToLowerInvariant()
  if ($normalizedStrategy -in @('fresh', 'mixed')) {
    $K6DatasetStrategy = $normalizedStrategy
  }
}

$GrafanaProjectId = Resolve-NonEmpty $GrafanaProjectId (Resolve-NonEmpty (Get-CliOption 'project') $env:npm_config_project)
$GrafanaToken = Resolve-NonEmpty $GrafanaToken (Resolve-NonEmpty (Get-CliOption 'token') $env:npm_config_token)

if (Get-Command Resolve-GrafanaCloudSecrets -ErrorAction SilentlyContinue) {
  $resolvedGrafanaSecrets = Resolve-GrafanaCloudSecrets -GrafanaProjectId $GrafanaProjectId -GrafanaToken $GrafanaToken -PersistProvided
  $GrafanaProjectId = [string]$resolvedGrafanaSecrets.ProjectId
  $GrafanaToken = [string]$resolvedGrafanaSecrets.Token
}

$apiUserFromCli = Resolve-NonEmpty (Get-CliOption 'user') $env:npm_config_user
$apiPassFromCli = Resolve-NonEmpty (Get-CliOption 'pass') $env:npm_config_pass

$slotUser1 = (Get-Item -Path 'Env:REGINSA_USER_1' -ErrorAction SilentlyContinue).Value
$slotPass1 = (Get-Item -Path 'Env:REGINSA_PASS_1' -ErrorAction SilentlyContinue).Value
$apiUserFinal = Resolve-NonEmpty $apiUserFromCli (Resolve-NonEmpty $env:REGINSA_USER $slotUser1)
$apiPassFinal = Resolve-NonEmpty $apiPassFromCli (Resolve-NonEmpty $env:REGINSA_PASS $slotPass1)

$apiAuthFromCli = Resolve-NonEmpty (Get-CliOption 'authheader') (Get-CliOption 'apitoken')
$ApiAuthHeader = Resolve-NonEmpty $ApiAuthHeader (Resolve-NonEmpty $apiAuthFromCli (Resolve-NonEmpty $env:npm_config_authheader $env:npm_config_apitoken))

$apiAuthHeaderFinal = Resolve-NonEmpty $ApiAuthHeader $env:REGINSA_API_AUTH_HEADER
if ([string]::IsNullOrWhiteSpace($apiAuthHeaderFinal) -and (-not [string]::IsNullOrWhiteSpace($apiUserFinal)) -and (-not [string]::IsNullOrWhiteSpace($apiPassFinal))) {
  $punkuToken = Get-TokenForCredential -user $apiUserFinal -pass $apiPassFinal -frontendUrl $baseFrontendFinal
  $apiAuthHeaderFinal = "Bearer $punkuToken"
}
$cloudToken = Resolve-NonEmpty $GrafanaToken $env:K6_CLOUD_TOKEN
$cloudProjectId = Resolve-NonEmpty $GrafanaProjectId $env:K6_CLOUD_PROJECT_ID
$k6CantidadFinal = [Math]::Max(1, $K6Cantidad)
$k6Mode = if ($k6CantidadFinal -le 2) { 'smoke' } else { 'fast' }
$k6VusFinal = if ($K6Vus -gt 0) { $K6Vus } else { 1 }
$k6SleepFinal = if ($K6SleepSeconds -ge 0) { [string]$K6SleepSeconds } else { '0' }

$env:REGINSA_POOL_TARGET = [string]$PoolTarget
$env:BASE_URL = $baseUrlFinal
$env:K6_CANTIDAD = [string]$k6CantidadFinal
$env:K6_TOTAL_REGISTROS = [string]$k6CantidadFinal
$env:K6_MODE = $k6Mode
$env:K6_FIXED_ITERATIONS = [string]$k6CantidadFinal
$env:K6_FIXED_VUS = [string]$k6VusFinal
$env:K6_VUS = [string]$k6VusFinal
$env:K6_SLEEP_SECONDS = $k6SleepFinal
$env:K6_DATASET_STRATEGY = $K6DatasetStrategy
$env:K6_EXPECT_RATE_LIMIT = '1'
$env:K6_ENFORCE_OK_RATE = '0'
$k6PrefixInfo = $null
try {
  $k6PrefixRaw = & node scripts/generar-k6-prefijo-global.js
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($k6PrefixRaw)) {
    $k6PrefixInfo = $k6PrefixRaw | ConvertFrom-Json
  }
} catch {
  $k6PrefixInfo = $null
}

if ($null -ne $k6PrefixInfo) {
  $env:K6_PREFIX_SEQUENCE = [string]$k6PrefixInfo.sequence
  $env:K6_RUN_ID = [string]$k6PrefixInfo.slug
  $env:K6_TRACE_CASE = [string]$k6PrefixInfo.slug
} else {
  $env:K6_TRACE_CASE = 'K6-01'
}
$env:PERF_DURATION = $PerfDuration

if (-not [string]::IsNullOrWhiteSpace($cloudProjectId)) {
  $env:K6_CLOUD_PROJECT_ID = $cloudProjectId
}
if (-not [string]::IsNullOrWhiteSpace($cloudToken)) {
  $env:K6_CLOUD_TOKEN = $cloudToken
}

if (-not [string]::IsNullOrWhiteSpace($apiAuthHeaderFinal)) {
  $env:K6_AUTH_HEADER = $apiAuthHeaderFinal
  $env:K6_AUTO_LOGIN = '0'
}

if (-not [string]::IsNullOrWhiteSpace($apiUserFinal)) {
  $env:REGINSA_USER = $apiUserFinal
}
if (-not [string]::IsNullOrWhiteSpace($apiPassFinal)) {
  $env:REGINSA_PASS = $apiPassFinal
}
if ((-not [string]::IsNullOrWhiteSpace($env:REGINSA_USER)) -and (-not [string]::IsNullOrWhiteSpace($env:REGINSA_PASS)) -and [string]::IsNullOrWhiteSpace($apiAuthHeaderFinal)) {
  $env:K6_AUTO_LOGIN = '1'
}

Write-Host "=== RUN CASO 01 LOCAL ===" -ForegroundColor Green
if ($Mode -eq 'k6') {
  Write-Host "Mode=$Mode | K6Output=$K6Output | K6Modo=$k6Mode | K6Cantidad=$k6CantidadFinal | K6Sleep=$k6SleepFinal | K6Vus=$k6VusFinal | DatasetStrategy=$K6DatasetStrategy" -ForegroundColor Green
} elseif ($Mode -eq 'funcional') {
  Write-Host "Mode=$Mode | FunctionalMode=$FunctionalMode | Workers=$Workers | RepeatEach=$RepeatEach | PoolTarget=$PoolTarget" -ForegroundColor Green
} else {
  Write-Host "Mode=$Mode | FunctionalMode=$FunctionalMode | Workers=$Workers | RepeatEach=$RepeatEach" -ForegroundColor Green
  Write-Host "PoolTarget=$PoolTarget | K6Output=$K6Output | K6Modo=$k6Mode | K6Cantidad=$k6CantidadFinal | K6Sleep=$k6SleepFinal | K6Vus=$k6VusFinal" -ForegroundColor Green
}

if ($Mode -in @('all','funcional')) {
  if (-not $SkipClean) {
    & $invokeOrFail 'npm run clean:run' 'Limpieza rapida de ejecucion'
  }

  if (-not $SkipPrewarm) {
    & $invokeOrFail 'npm run pool:prewarm' 'Prewarm de pool'
  }

  if ($FunctionalMode -eq 'scale') {
    & $invokeOrFail "npm run test:01:scale -- --workers=$Workers --repeat-each=$RepeatEach --project=chromium" 'Caso 01 funcional scale'
  } else {
    & $invokeOrFail "npm run test:01:fast -- --workers=$Workers --repeat-each=$RepeatEach --project=chromium" 'Caso 01 funcional fast'
  }
}

if ($Mode -in @('all','k6')) {
  if (-not (Has-AnyApiCredential)) {
    throw 'No se detectó credencial API para caso01. Usa token API (REGINSA_API_AUTH_HEADER o --authheader/--apitoken) o usuario/password (--user/--pass o REGINSA_USER/REGINSA_PASS). Nota: --token es para Grafana Cloud, no para API REGINSA.'
  }

  if (-not $SkipPrewarm) {
    & $invokeOrFail 'npm run pool:prewarm' 'Prewarm de pool para k6'
  }

  if (-not $SkipDataset) {
    & $invokeOrFail "node scripts/generar-k6-caso01-dataset.js --size=$k6CantidadFinal --strategy=$K6DatasetStrategy" 'Generacion dataset k6 caso 01'
  }

  $k6Cmd = "k6 run tests/performance/k6-grafana/k6_caso_01_agregar_administrado.js --env BASE_URL=$baseUrlFinal --env K6_CANTIDAD=$k6CantidadFinal --env K6_MODE=$k6Mode --env K6_TOTAL_REGISTROS=$k6CantidadFinal --env K6_FIXED_ITERATIONS=$k6CantidadFinal --env K6_VUS=$k6VusFinal --env K6_FIXED_VUS=$k6VusFinal --env K6_SLEEP_SECONDS=$k6SleepFinal --env PERF_DURATION=$PerfDuration --summary-export reportes/k6-caso01-summary-local.json"

  if (-not [string]::IsNullOrWhiteSpace($cloudProjectId)) {
    $k6Cmd += " --env K6_CLOUD_PROJECT_ID=$cloudProjectId"
  }
  if (-not [string]::IsNullOrWhiteSpace($apiAuthHeaderFinal)) {
    $k6Cmd += " --env K6_AUTH_HEADER='$apiAuthHeaderFinal'"
  }

  if ($K6Output -eq 'cloud') {
    if ([string]::IsNullOrWhiteSpace($cloudToken) -or [string]::IsNullOrWhiteSpace($cloudProjectId)) {
      throw 'K6Output=cloud requiere K6_CLOUD_TOKEN y K6_CLOUD_PROJECT_ID.'
    }
    $k6Cmd = "k6 run -o cloud tests/performance/k6-grafana/k6_caso_01_agregar_administrado.js --env BASE_URL=$baseUrlFinal --env K6_CANTIDAD=$k6CantidadFinal --env K6_MODE=$k6Mode --env K6_TOTAL_REGISTROS=$k6CantidadFinal --env K6_FIXED_ITERATIONS=$k6CantidadFinal --env K6_VUS=$k6VusFinal --env K6_FIXED_VUS=$k6VusFinal --env K6_SLEEP_SECONDS=$k6SleepFinal --env PERF_DURATION=$PerfDuration --env K6_CLOUD_PROJECT_ID=$cloudProjectId"
    if (-not [string]::IsNullOrWhiteSpace($apiAuthHeaderFinal)) {
      $k6Cmd += " --env K6_AUTH_HEADER='$apiAuthHeaderFinal'"
    }
  }

  & $invokeOrFail $k6Cmd 'Ejecucion k6 caso 01'
  & $invokeOrFail 'node scripts/verificar-k6-caso01-persistencia.js' 'Auditoria de persistencia caso 01'
}

Write-Host "`n[OK] Proceso completado." -ForegroundColor Green
