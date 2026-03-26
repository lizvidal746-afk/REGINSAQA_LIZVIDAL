param(
  [ValidateSet('k6')]
  [string]$Mode = 'k6',

  [ValidateSet('local','cloud')]
  [string]$K6Output = 'local',

  [int]$K6Cantidad = 2,
  [double]$K6SleepSeconds = 0,
  [int]$K6Vus = 1,
  [string]$PerfDuration = '10m',
  [string]$K6ExpectRateLimit = '1',
  [string]$K6EnforceOkRate = '0',

  [string]$BaseApi = '',
  [string]$BaseFrontend = '',
  [string]$EnvFile = '',
  [string]$ApiToken = '',
  [string]$GrafanaProjectId = '',
  [string]$GrafanaToken = '',

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CliArgs
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

if ($Mode -ne 'k6') {
  throw 'Este runner solo soporta Mode=k6.'
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
  $apiTokenFinal = Resolve-NonEmpty '' $env:REGINSA_API_AUTH_HEADER
}
if ([string]::IsNullOrWhiteSpace($apiTokenFinal) -and (-not [string]::IsNullOrWhiteSpace($apiUserFinal)) -and (-not [string]::IsNullOrWhiteSpace($apiPassFinal))) {
  $apiTokenFinal = "Bearer $(Get-TokenForCredential -user $apiUserFinal -pass $apiPassFinal -frontendUrl $baseFrontendFinal)"
}

$cloudToken = Resolve-NonEmpty $GrafanaToken $env:K6_CLOUD_TOKEN
$cloudProjectId = Resolve-NonEmpty $GrafanaProjectId $env:K6_CLOUD_PROJECT_ID
$k6CantidadFinal = [Math]::Max(1, $K6Cantidad)
$k6Mode = if ($k6CantidadFinal -le 2) { 'smoke' } else { 'fast' }
$k6VusFinal = [Math]::Max(1, $K6Vus)
$k6SleepFinal = [string]$K6SleepSeconds

if ($K6Output -eq 'local' -and -not [string]::IsNullOrWhiteSpace($cloudProjectId) -and -not [string]::IsNullOrWhiteSpace($cloudToken)) {
  $K6Output = 'cloud'
  Write-Host 'Detectado --project/--token: activando K6Output=cloud automaticamente.' -ForegroundColor Yellow
}

if (-not (Test-Path 'reportes')) {
  New-Item -ItemType Directory -Path 'reportes' | Out-Null
}

if (-not [string]::IsNullOrWhiteSpace($cloudToken)) {
  $env:K6_CLOUD_TOKEN = $cloudToken
}
if (-not [string]::IsNullOrWhiteSpace($apiTokenFinal)) {
  $env:K6_AUTH_HEADER = $apiTokenFinal
  $env:TOKEN1 = $apiTokenFinal
}
$env:K6_EXPECT_RATE_LIMIT = $K6ExpectRateLimit
$env:K6_ENFORCE_OK_RATE = $K6EnforceOkRate
$env:K6_RETRY_429_MAX = '0'
$env:K6_CASO03_STRICT_ISOLATION = Resolve-NonEmpty $env:K6_CASO03_STRICT_ISOLATION '1'
$env:K6_HTTP_DETAIL_MODE = Resolve-NonEmpty $env:K6_HTTP_DETAIL_MODE 'guardar_only'
$defaultPublicApiName = Resolve-NonEmpty $env:K6_CASO03_GUARDAR_RECONSIDERACION '/Reconsideracion/GuardarCabecera'
$env:K6_HTTP_PUBLIC_NAME = Resolve-NonEmpty $env:K6_HTTP_PUBLIC_NAME ($defaultPublicApiName.TrimStart('/'))
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
  $env:K6_TRACE_CASE = 'K6-03'
}

$summaryFile = if ($k6Mode -eq 'smoke') { 'reportes/k6-caso03-smoke-summary.json' } else { 'reportes/k6-caso03-fast-summary.json' }

# Keep cloud report focused on business-level names/checks instead of raw URLs.
$k6SystemTagsArg = ' --system-tags=status,method,name,scenario,group,check,error'

$k6Cmd = "k6 run$k6SystemTagsArg tests/performance/k6-grafana/k6_caso_03_reconsiderar_sin_sanciones.js --env BASE_API=$baseApiFinal --env K6_CANTIDAD=$k6CantidadFinal --env K6_MODE=$k6Mode --env K6_VUS=$k6VusFinal --env K6_SLEEP_SECONDS=$k6SleepFinal --env PERF_DURATION=$PerfDuration --summary-export $summaryFile"
if (-not [string]::IsNullOrWhiteSpace($cloudProjectId)) {
  $k6Cmd += " --env K6_CLOUD_PROJECT_ID=$cloudProjectId"
}
if ($K6Output -eq 'cloud') {
  if ([string]::IsNullOrWhiteSpace($cloudToken) -or [string]::IsNullOrWhiteSpace($cloudProjectId)) {
    throw 'K6Output=cloud requiere K6_CLOUD_TOKEN y K6_CLOUD_PROJECT_ID.'
  }
  $k6Cmd = "k6 run$k6SystemTagsArg -o cloud tests/performance/k6-grafana/k6_caso_03_reconsiderar_sin_sanciones.js --env BASE_API=$baseApiFinal --env K6_CANTIDAD=$k6CantidadFinal --env K6_MODE=$k6Mode --env K6_VUS=$k6VusFinal --env K6_SLEEP_SECONDS=$k6SleepFinal --env PERF_DURATION=$PerfDuration --env K6_CLOUD_PROJECT_ID=$cloudProjectId"
}

Write-Host "=== RUN CASO 03 K6 ===" -ForegroundColor Green
Write-Host "Mode=$k6Mode | Cantidad=$k6CantidadFinal | Sleep=$k6SleepFinal | VUs=$k6VusFinal | Output=$K6Output" -ForegroundColor Green
& $invokeOrFail $k6Cmd 'Ejecucion k6 caso 03'
Write-Host "`n[OK] Proceso completado." -ForegroundColor Green
