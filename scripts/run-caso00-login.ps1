param(
  [ValidateSet('local','cloud')]
  [string]$K6Output = 'cloud',

  [ValidateSet('single','pool')]
  [string]$UserMode = 'single',

  [int]$PoolSize = 8,
  [string]$EnvFile = '',

  [int]$K6Cantidad = 3,
  [double]$K6SleepSeconds = -1,
  [int]$K6Vus = 1,
  [string]$PerfDuration = '2m',

  [string]$BaseApi = '',
  [string]$BaseFrontend = '',

  [string]$ApiUser = '',
  [string]$ApiPass = '',
  [int]$UserSlot = 1,

  [string]$GrafanaProjectId = '',
  [string]$GrafanaToken = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$RawCliArgs = @($args)

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
  if ($null -eq $RawCliArgs) { return '' }
  for ($i = 0; $i -lt $RawCliArgs.Count; $i++) {
    $arg = [string]$RawCliArgs[$i]
    if ([string]::IsNullOrWhiteSpace($arg)) { continue }
    if ($arg -like "--$name=*") {
      $value = $arg.Substring($name.Length + 3).Trim()
      if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
    }
    if ($arg -like "$name=*") {
      $value = $arg.Substring($name.Length + 1).Trim()
      if (-not [string]::IsNullOrWhiteSpace($value)) { return $value }
    }
    if ($arg -eq "--$name" -and $i + 1 -lt $RawCliArgs.Count) {
      $value = [string]$RawCliArgs[$i + 1]
      if (-not [string]::IsNullOrWhiteSpace($value)) { return $value.Trim() }
    }
  }
  return ''
}

function Get-SlotCredential([int]$slot) {
  $u = (Get-Item -Path "Env:REGINSA_USER_$($slot)" -ErrorAction SilentlyContinue).Value
  $p = (Get-Item -Path "Env:REGINSA_PASS_$($slot)" -ErrorAction SilentlyContinue).Value
  if ([string]::IsNullOrWhiteSpace($u) -or [string]::IsNullOrWhiteSpace($p)) {
    return $null
  }
  return @{ user = $u; pass = $p; slot = $slot }
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

$cantidadRaw = Resolve-NonEmpty (Get-CliOption 'cantidad') $env:npm_config_cantidad
if (-not [string]::IsNullOrWhiteSpace($cantidadRaw)) {
  $parsed = 0
  if ([int]::TryParse($cantidadRaw, [ref]$parsed) -and $parsed -gt 0) {
    $K6Cantidad = $parsed
  }
}

$slotRaw = Resolve-NonEmpty (Get-CliOption 'slot') $env:npm_config_slot
if (-not [string]::IsNullOrWhiteSpace($slotRaw)) {
  $parsedSlot = 0
  if ([int]::TryParse($slotRaw, [ref]$parsedSlot) -and $parsedSlot -gt 0) {
    $UserSlot = $parsedSlot
  }
}

$UserMode = Resolve-NonEmpty (Get-CliOption 'usermode') $UserMode
$EnvFile = Resolve-NonEmpty (Get-CliOption 'envfile') $EnvFile

$outputRaw = Resolve-NonEmpty (Get-CliOption 'k6output') (Resolve-NonEmpty (Get-CliOption 'output') $env:npm_config_output)
if (-not [string]::IsNullOrWhiteSpace($outputRaw)) {
  $normalizedOutput = $outputRaw.Trim().ToLowerInvariant()
  if ($normalizedOutput -in @('local', 'cloud')) {
    $K6Output = $normalizedOutput
  }
}

$poolSizeRaw = Get-CliOption 'poolsize'
if (-not [string]::IsNullOrWhiteSpace($poolSizeRaw)) {
  $parsedPool = 0
  if ([int]::TryParse($poolSizeRaw, [ref]$parsedPool) -and $parsedPool -gt 0) {
    $PoolSize = $parsedPool
  }
}

$GrafanaProjectId = Resolve-NonEmpty $GrafanaProjectId (Resolve-NonEmpty (Get-CliOption 'project') $env:npm_config_project)
$GrafanaToken = Resolve-NonEmpty $GrafanaToken (Resolve-NonEmpty (Get-CliOption 'token') $env:npm_config_token)

if (Get-Command Resolve-GrafanaCloudSecrets -ErrorAction SilentlyContinue) {
  $resolvedGrafanaSecrets = Resolve-GrafanaCloudSecrets -GrafanaProjectId $GrafanaProjectId -GrafanaToken $GrafanaToken -PersistProvided
  $GrafanaProjectId = [string]$resolvedGrafanaSecrets.ProjectId
  $GrafanaToken = [string]$resolvedGrafanaSecrets.Token
}

$ApiUser = Resolve-NonEmpty $ApiUser (Resolve-NonEmpty (Get-CliOption 'user') $env:npm_config_user)
$ApiPass = Resolve-NonEmpty $ApiPass (Resolve-NonEmpty (Get-CliOption 'pass') $env:npm_config_pass)

if ($K6Output -eq 'local' -and -not [string]::IsNullOrWhiteSpace($GrafanaProjectId) -and -not [string]::IsNullOrWhiteSpace($GrafanaToken)) {
  $K6Output = 'cloud'
  Write-Output 'Detectado --project/--token: activando K6Output=cloud automaticamente.'
}

$baseApiFinal = Resolve-NonEmpty $BaseApi $env:REGINSA_API_BASE
if ([string]::IsNullOrWhiteSpace($baseApiFinal)) {
  $baseApiFinal = 'https://reginsaapiqa.sunedu.gob.pe/api'
}

$baseFrontendFinal = Resolve-NonEmpty $BaseFrontend (Resolve-NonEmpty $env:REGINSA_BASE_URL $env:REGINSA_URL)
if ([string]::IsNullOrWhiteSpace($baseFrontendFinal)) {
  $baseFrontendFinal = 'https://reginsaqa.sunedu.gob.pe'
}

$apiUserFinal = ''
$apiPassFinal = ''
$tokenPoolHeader = ''

$cloudToken = Resolve-NonEmpty $GrafanaToken $env:K6_CLOUD_TOKEN
$cloudProjectId = Resolve-NonEmpty $GrafanaProjectId $env:K6_CLOUD_PROJECT_ID
$k6CantidadFinal = [Math]::Max(1, $K6Cantidad)
$k6VusFinal = [Math]::Max(1, $K6Vus)
$k6SleepFinal = if ($K6SleepSeconds -ge 0) { [string]$K6SleepSeconds } else { '0' }

Write-Output '=== RUN CASO 00 LOGIN K6 ==='

$tokenJwt = ''
if ($UserMode -eq 'pool') {
  $tokens = @()
  for ($slot = 1; $slot -le [Math]::Max(1, $PoolSize); $slot++) {
    $cred = Get-SlotCredential $slot
    if ($null -eq $cred) { continue }
    $tok = Get-TokenForCredential -user $cred.user -pass $cred.pass -frontendUrl $baseFrontendFinal
    $tokens += "Bearer $tok"
  }
  if ($tokens.Count -eq 0) {
    throw 'UserMode=pool no encontró credenciales REGINSA_USER_n/REGINSA_PASS_n válidas.'
  }
  $tokenPoolHeader = ($tokens -join ',')
  $tokenJwt = $tokens[0].Substring(7)
  Write-Output "UserMode=pool | Tokens=$($tokens.Count) | Cantidad=$k6CantidadFinal | VUs=$k6VusFinal | Output=$K6Output"
} else {
  $slotUser = (Get-Item -Path "Env:REGINSA_USER_$($UserSlot)" -ErrorAction SilentlyContinue).Value
  $slotPass = (Get-Item -Path "Env:REGINSA_PASS_$($UserSlot)" -ErrorAction SilentlyContinue).Value
  $apiUserFinal = Resolve-NonEmpty $ApiUser (Resolve-NonEmpty $env:REGINSA_USER $slotUser)
  $apiPassFinal = Resolve-NonEmpty $ApiPass (Resolve-NonEmpty $env:REGINSA_PASS $slotPass)
  if ([string]::IsNullOrWhiteSpace($apiUserFinal) -or [string]::IsNullOrWhiteSpace($apiPassFinal)) {
    throw 'Faltan credenciales para caso00 login. Usa --user/--pass o define REGINSA_USER/REGINSA_PASS o REGINSA_USER_SLOT/REGINSA_PASS_SLOT.'
  }
  Write-Output "UserMode=single | UserSlot=$UserSlot | User=$apiUserFinal | Cantidad=$k6CantidadFinal | VUs=$k6VusFinal | Output=$K6Output"
  $tokenJwt = Get-TokenForCredential -user $apiUserFinal -pass $apiPassFinal -frontendUrl $baseFrontendFinal
}

$env:K6_AUTH_HEADER = "Bearer $tokenJwt"
$env:TOKEN = $tokenJwt
$env:BASE_URL = $baseApiFinal
$env:K6_CANTIDAD = [string]$k6CantidadFinal
$env:K6_VUS = [string]$k6VusFinal
$env:K6_SLEEP_SECONDS = $k6SleepFinal
$env:K6_LOGIN_CHECK_ENDPOINT = Resolve-NonEmpty $env:K6_LOGIN_CHECK_ENDPOINT '/Entidad/Listar'
$env:K6_LOGIN_CHECK_METHOD = Resolve-NonEmpty $env:K6_LOGIN_CHECK_METHOD 'GET'
$env:K6_EXPECT_RATE_LIMIT = Resolve-NonEmpty $env:K6_EXPECT_RATE_LIMIT '0'
$env:K6_ENFORCE_OK_RATE = Resolve-NonEmpty $env:K6_ENFORCE_OK_RATE '1'
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
  $env:K6_TRACE_CASE = 'K6-00'
}
$env:PERF_DURATION = $PerfDuration
if (-not [string]::IsNullOrWhiteSpace($cloudProjectId)) {
  $env:K6_CLOUD_PROJECT_ID = $cloudProjectId
}
if (-not [string]::IsNullOrWhiteSpace($cloudToken)) {
  $env:K6_CLOUD_TOKEN = $cloudToken
}

$k6Args = @(
  'run',
  'tests/performance/k6-grafana/k6_caso_00_login.js',
  '--env', "BASE_URL=$baseApiFinal",
  '--env', "K6_CANTIDAD=$k6CantidadFinal",
  '--env', "K6_VUS=$k6VusFinal",
  '--env', "K6_SLEEP_SECONDS=$k6SleepFinal",
  '--env', "PERF_DURATION=$PerfDuration",
  '--env', "K6_LOGIN_CHECK_ENDPOINT=$($env:K6_LOGIN_CHECK_ENDPOINT)",
  '--env', "K6_LOGIN_CHECK_METHOD=$($env:K6_LOGIN_CHECK_METHOD)",
  '--env', "K6_EXPECT_RATE_LIMIT=$($env:K6_EXPECT_RATE_LIMIT)",
  '--env', "K6_ENFORCE_OK_RATE=$($env:K6_ENFORCE_OK_RATE)",
  '--env', "K6_AUTH_HEADER=Bearer $tokenJwt",
  '--summary-export', 'reportes/k6-caso00-login-summary.json'
)
if (-not [string]::IsNullOrWhiteSpace($tokenPoolHeader)) {
  $k6Args += @('--env', "K6_AUTH_HEADERS=$tokenPoolHeader")
}

if ($K6Output -eq 'cloud') {
  if ([string]::IsNullOrWhiteSpace($cloudToken) -or [string]::IsNullOrWhiteSpace($cloudProjectId)) {
    throw 'K6Output=cloud requiere K6_CLOUD_TOKEN y K6_CLOUD_PROJECT_ID.'
  }
  $k6Args = @(
    'run', '-o', 'cloud',
    'tests/performance/k6-grafana/k6_caso_00_login.js',
    '--env', "BASE_URL=$baseApiFinal",
    '--env', "K6_CANTIDAD=$k6CantidadFinal",
    '--env', "K6_VUS=$k6VusFinal",
    '--env', "K6_SLEEP_SECONDS=$k6SleepFinal",
    '--env', "PERF_DURATION=$PerfDuration",
    '--env', "K6_CLOUD_PROJECT_ID=$cloudProjectId",
    '--env', "K6_LOGIN_CHECK_ENDPOINT=$($env:K6_LOGIN_CHECK_ENDPOINT)",
    '--env', "K6_LOGIN_CHECK_METHOD=$($env:K6_LOGIN_CHECK_METHOD)",
    '--env', "K6_EXPECT_RATE_LIMIT=$($env:K6_EXPECT_RATE_LIMIT)",
    '--env', "K6_ENFORCE_OK_RATE=$($env:K6_ENFORCE_OK_RATE)",
    '--env', "K6_AUTH_HEADER=Bearer $tokenJwt",
    '--summary-export', 'reportes/k6-caso00-login-summary.json'
  )
  if (-not [string]::IsNullOrWhiteSpace($tokenPoolHeader)) {
    $k6Args += @('--env', "K6_AUTH_HEADERS=$tokenPoolHeader")
  }
}

$displayArgs = @($k6Args | ForEach-Object {
  $argText = [string]$_
  if ($argText -like 'K6_AUTH_HEADER=*') { return 'K6_AUTH_HEADER=***' }
  if ($argText -like 'K6_AUTH_HEADERS=*') { return 'K6_AUTH_HEADERS=***' }
  return $argText
})
Write-Output "`n> k6 $($displayArgs -join ' ')"
& k6 @k6Args
if ($LASTEXITCODE -ne 0) {
  throw "Fallo: Caso 00 login k6 (exit=$LASTEXITCODE)"
}

Write-Output '`nProceso completado.'
