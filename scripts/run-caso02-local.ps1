param(
  [ValidateSet('all','funcional','k6')]
  [string]$Mode = 'all',

  [ValidateSet('fast','scale')]
  [string]$FunctionalMode = 'fast',

  [int]$Workers = 8,
  [int]$RepeatEach = 2,
  [int]$PoolTarget = 300,

  [ValidateSet('local','cloud')]
  [string]$K6Output = 'local',

  [int]$K6Cantidad = 2,
  [double]$K6SleepSeconds = -1,
  [int]$K6Vus = 0,
  [int]$K6SancionesPorRegistro = 1,
  [ValidateSet('0','1')]
  [string]$K6ForceSingleSancion = '0',
  [ValidateSet('0','1')]
  [string]$K6ForceSingleMedida = '1',
  [ValidateSet('0','1')]
  [string]$K6ExpectRateLimit = '1',
  [ValidateSet('0','1')]
  [string]$K6EnforceOkRate = '0',
  [ValidateSet('guardar_only','full')]
  [string]$K6HttpDetailMode = 'guardar_only',
  [ValidateSet('fixed','rotate','rotate_1_2','random')]
  [string]$K6RisMode = 'random',
  [string]$PerfDuration = '10m',

  [string]$BaseApi = '',
  [string]$BaseFrontend = '',
  [string]$EnvFile = '',
  [string]$ApiToken = '',
  [string]$GrafanaProjectId = '',
  [string]$GrafanaToken = '',

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CliArgs,

  [switch]$SkipClean,
  [switch]$SkipPrewarm
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
    if ($arg -like "--$name=*") {
      return $arg.Substring($name.Length + 3)
    }
    if ($arg -eq "--$name" -and $i + 1 -lt $CliArgs.Count) {
      return [string]$CliArgs[$i + 1]
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

$invokeOrFail = {
  param([string]$command, [string]$label)
  Write-Host "`n[RUN] $label" -ForegroundColor Cyan
  Write-Host "   $command" -ForegroundColor DarkGray
  Invoke-Expression $command
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo: $label (exit=$LASTEXITCODE)"
  }
}

$baseApiFinal = Resolve-NonEmpty $BaseApi $env:REGINSA_API_BASE
if ([string]::IsNullOrWhiteSpace($baseApiFinal)) {
  $baseApiFinal = 'https://reginsaapiqa.sunedu.gob.pe/api'
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

$apiTokenFinal = Resolve-NonEmpty $ApiToken $env:REGINSA_API_TOKEN
if ([string]::IsNullOrWhiteSpace($apiTokenFinal)) {
  $authHeader = $env:REGINSA_API_AUTH_HEADER
  if (-not [string]::IsNullOrWhiteSpace($authHeader)) {
    $apiTokenFinal = $authHeader
  }
}
if ([string]::IsNullOrWhiteSpace($apiTokenFinal) -and (-not [string]::IsNullOrWhiteSpace($apiUserFinal)) -and (-not [string]::IsNullOrWhiteSpace($apiPassFinal))) {
  $apiTokenFinal = "Bearer $(Get-TokenForCredential -user $apiUserFinal -pass $apiPassFinal -frontendUrl $baseFrontendFinal)"
}

$cloudToken = Resolve-NonEmpty $GrafanaToken $env:K6_CLOUD_TOKEN
$cloudProjectId = Resolve-NonEmpty $GrafanaProjectId $env:K6_CLOUD_PROJECT_ID
$k6CantidadFinal = [Math]::Max(1, $K6Cantidad)
$k6Mode = if ($k6CantidadFinal -le 2) { 'smoke' } else { 'fast' }
$k6VusFinal = if ($K6Vus -gt 0) { $K6Vus } else { 1 }
$k6SleepFinal = if ($K6SleepSeconds -ge 0) { [string]$K6SleepSeconds } else { '0' }


$env:REGINSA_POOL_TARGET = [string]$PoolTarget
$env:BASE_API = $baseApiFinal
$env:K6_CANTIDAD = [string]$k6CantidadFinal
$env:K6_TOTAL_REGISTROS = [string]$k6CantidadFinal
$env:K6_MODE = $k6Mode
$env:K6_FIXED_ITERATIONS = [string]$k6CantidadFinal
$env:K6_FIXED_VUS = [string]$k6VusFinal
$env:K6_VUS = [string]$k6VusFinal
$env:K6_SLEEP_SECONDS = $k6SleepFinal
$env:K6_SANCIONES_POR_REGISTRO = [string]([Math]::Max(1, $K6SancionesPorRegistro))
$env:K6_FORCE_SINGLE_SANCION = $K6ForceSingleSancion
$env:K6_FORCE_SINGLE_MEDIDA = $K6ForceSingleMedida
$env:K6_EXPECT_RATE_LIMIT = $K6ExpectRateLimit
$env:K6_ENFORCE_OK_RATE = $K6EnforceOkRate
$env:K6_HTTP_DETAIL_MODE = $K6HttpDetailMode
$env:K6_RIS_MODE = $K6RisMode
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
  $env:K6_TRACE_CASE = 'K6-02'
}
$env:PERF_DURATION = $PerfDuration

if (-not [string]::IsNullOrWhiteSpace($cloudProjectId)) {
  $env:K6_CLOUD_PROJECT_ID = $cloudProjectId
}
if (-not [string]::IsNullOrWhiteSpace($cloudToken)) {
  $env:K6_CLOUD_TOKEN = $cloudToken
}

if (-not [string]::IsNullOrWhiteSpace($apiTokenFinal)) {
  $env:TOKEN1 = $apiTokenFinal
  $env:K6_AUTH_HEADER = $apiTokenFinal
}

if ($Mode -ne 'k6') {
  Write-Host "=== RUN CASO 02 LOCAL ===" -ForegroundColor Green
  Write-Host "Mode=$Mode | FunctionalMode=$FunctionalMode | Workers=$Workers | RepeatEach=$RepeatEach" -ForegroundColor Green
  Write-Host "PoolTarget=$PoolTarget | K6Output=$K6Output | K6Modo=$k6Mode | K6Cantidad=$k6CantidadFinal | K6Sleep=$k6SleepFinal | K6Vus=$k6VusFinal" -ForegroundColor Green
  Write-Host "K6SancionesPorRegistro=$($env:K6_SANCIONES_POR_REGISTRO) | K6ForceSingleSancion=$K6ForceSingleSancion | K6ForceSingleMedida=$K6ForceSingleMedida" -ForegroundColor Green
}

if ($Mode -in @('all','funcional')) {
  if (-not $SkipClean) {
    & $invokeOrFail 'npm run clean:run' 'Limpieza rapida de ejecucion'
  }

  if (-not $SkipPrewarm) {
    & $invokeOrFail 'npm run pool:prewarm' 'Prewarm de pool'
  }

  if ($FunctionalMode -eq 'scale') {
    & $invokeOrFail "npm run test:02:scale -- --workers=$Workers --repeat-each=$RepeatEach --project=chromium" 'Caso 02 funcional scale'
  } else {
    & $invokeOrFail "npm run test:02:fast -- --workers=$Workers --repeat-each=$RepeatEach --project=chromium" 'Caso 02 funcional fast'
  }
}

if ($Mode -in @('all','k6')) {
  $skipPrewarmForK6 = $SkipPrewarm -or ($Mode -eq 'k6')
  if (-not $skipPrewarmForK6) {
    & $invokeOrFail 'npm run pool:prewarm' 'Prewarm de pool para k6'
  }

  Write-Host "[INFO] caso02 run_id=$($env:K6_TRACE_CASE) modo=$k6Mode cantidad=$k6CantidadFinal vus=$k6VusFinal" -ForegroundColor DarkCyan
  $k6SystemTagsArg = ''
  if ($K6HttpDetailMode -eq 'guardar_only') {
    $k6SystemTagsArg = ' --system-tags=status,method,name,scenario,group,check,error'
  }

  $k6Cmd = "k6 run$k6SystemTagsArg tests/performance/k6-grafana/k6_caso_02_registrar_sancion.js --env BASE_API=$baseApiFinal --env K6_CANTIDAD=$k6CantidadFinal --env K6_MODE=$k6Mode --env K6_TOTAL_REGISTROS=$k6CantidadFinal --env K6_FIXED_ITERATIONS=$k6CantidadFinal --env K6_VUS=$k6VusFinal --env K6_FIXED_VUS=$k6VusFinal --env K6_SLEEP_SECONDS=$k6SleepFinal --env K6_SANCIONES_POR_REGISTRO=$($env:K6_SANCIONES_POR_REGISTRO) --env K6_FORCE_SINGLE_SANCION=$K6ForceSingleSancion --env K6_FORCE_SINGLE_MEDIDA=$K6ForceSingleMedida --env K6_HTTP_DETAIL_MODE=$K6HttpDetailMode --env K6_RIS_MODE=$K6RisMode --env PERF_DURATION=$PerfDuration --summary-export reportes/k6-caso02-summary-local.json"

  if (-not [string]::IsNullOrWhiteSpace($cloudProjectId)) {
    $k6Cmd += " --env K6_CLOUD_PROJECT_ID=$cloudProjectId"
  }

  if ($K6Output -eq 'cloud') {
    if ([string]::IsNullOrWhiteSpace($cloudToken) -or [string]::IsNullOrWhiteSpace($cloudProjectId)) {
      throw 'K6Output=cloud requiere K6_CLOUD_TOKEN y K6_CLOUD_PROJECT_ID.'
    }
    $k6Cmd = "k6 run$k6SystemTagsArg -o cloud tests/performance/k6-grafana/k6_caso_02_registrar_sancion.js --env BASE_API=$baseApiFinal --env K6_CANTIDAD=$k6CantidadFinal --env K6_MODE=$k6Mode --env K6_TOTAL_REGISTROS=$k6CantidadFinal --env K6_FIXED_ITERATIONS=$k6CantidadFinal --env K6_VUS=$k6VusFinal --env K6_FIXED_VUS=$k6VusFinal --env K6_SLEEP_SECONDS=$k6SleepFinal --env K6_SANCIONES_POR_REGISTRO=$($env:K6_SANCIONES_POR_REGISTRO) --env K6_FORCE_SINGLE_SANCION=$K6ForceSingleSancion --env K6_FORCE_SINGLE_MEDIDA=$K6ForceSingleMedida --env K6_HTTP_DETAIL_MODE=$K6HttpDetailMode --env K6_RIS_MODE=$K6RisMode --env PERF_DURATION=$PerfDuration --env K6_CLOUD_PROJECT_ID=$cloudProjectId"
  }

  & $invokeOrFail $k6Cmd 'Ejecucion k6 caso 02'
}

Write-Host "`n[OK] Proceso completado." -ForegroundColor Green
