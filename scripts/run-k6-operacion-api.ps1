param(
  [ValidateSet('local','cloud')]
  [string]$K6Output = 'local',

  [ValidateSet('single','pool')]
  [string]$UserMode = 'single',

  [int]$PoolSize = 8,
  [string]$EnvFile = '',

  [string]$Operacion = 'create_entidad',
  [int]$K6Cantidad = 3,
  [int]$K6Vus = 1,
  [string]$PerfDuration = '5m',

  [string]$Metodo = '',
  [string]$Ruta = '',
  [string]$BodyJson = '{}',

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
  & $envLoader -Path $EnvFile
}

function Resolve-NonEmpty([string]$primary, [string]$fallback) {
  if (-not [string]::IsNullOrWhiteSpace($primary)) { return $primary }
  return $fallback
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

$Operacion = Resolve-NonEmpty (Resolve-NonEmpty (Get-CliOption 'op') (Get-CliOption 'operacion')) $Operacion
$UserMode = Resolve-NonEmpty (Get-CliOption 'usermode') $UserMode
$Metodo = Resolve-NonEmpty (Get-CliOption 'method') $Metodo
$Ruta = Resolve-NonEmpty (Resolve-NonEmpty (Get-CliOption 'path') (Get-CliOption 'ruta')) $Ruta
$BodyJson = Resolve-NonEmpty (Resolve-NonEmpty (Get-CliOption 'body') (Get-CliOption 'bodyjson')) $BodyJson
$ApiUser = Resolve-NonEmpty (Get-CliOption 'user') $ApiUser
$ApiPass = Resolve-NonEmpty (Get-CliOption 'pass') $ApiPass
$GrafanaProjectId = Resolve-NonEmpty (Get-CliOption 'project') $GrafanaProjectId
$GrafanaToken = Resolve-NonEmpty (Get-CliOption 'token') $GrafanaToken
$EnvFile = Resolve-NonEmpty (Get-CliOption 'envfile') $EnvFile

$cantidadRaw = Get-CliOption 'cantidad'
if (-not [string]::IsNullOrWhiteSpace($cantidadRaw)) {
  $n = 0
  if ([int]::TryParse($cantidadRaw, [ref]$n) -and $n -gt 0) { $K6Cantidad = $n }
}

$slotRaw = Get-CliOption 'slot'
if (-not [string]::IsNullOrWhiteSpace($slotRaw)) {
  $s = 0
  if ([int]::TryParse($slotRaw, [ref]$s) -and $s -gt 0) { $UserSlot = $s }
}

$poolSizeRaw = Get-CliOption 'poolsize'
if (-not [string]::IsNullOrWhiteSpace($poolSizeRaw)) {
  $p = 0
  if ([int]::TryParse($poolSizeRaw, [ref]$p) -and $p -gt 0) { $PoolSize = $p }
}

$baseApiFinal = Resolve-NonEmpty $BaseApi $env:REGINSA_API_BASE
if ([string]::IsNullOrWhiteSpace($baseApiFinal)) { $baseApiFinal = 'https://reginsaapiqa.sunedu.gob.pe/api' }

$baseFrontendFinal = Resolve-NonEmpty $BaseFrontend (Resolve-NonEmpty $env:REGINSA_BASE_URL $env:REGINSA_URL)
if ([string]::IsNullOrWhiteSpace($baseFrontendFinal)) { $baseFrontendFinal = 'https://reginsaqa.sunedu.gob.pe' }

$tokenJwt = ''
$tokenPoolHeader = ''

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
} else {
  $slotUser = (Get-Item -Path "Env:REGINSA_USER_$($UserSlot)" -ErrorAction SilentlyContinue).Value
  $slotPass = (Get-Item -Path "Env:REGINSA_PASS_$($UserSlot)" -ErrorAction SilentlyContinue).Value
  $apiUserFinal = Resolve-NonEmpty $ApiUser (Resolve-NonEmpty $env:REGINSA_USER $slotUser)
  $apiPassFinal = Resolve-NonEmpty $ApiPass (Resolve-NonEmpty $env:REGINSA_PASS $slotPass)
  if ([string]::IsNullOrWhiteSpace($apiUserFinal) -or [string]::IsNullOrWhiteSpace($apiPassFinal)) {
    throw 'Faltan credenciales API. Usa --user/--pass o define REGINSA_USER_n/REGINSA_PASS_n.'
  }
  $tokenJwt = Get-TokenForCredential -user $apiUserFinal -pass $apiPassFinal -frontendUrl $baseFrontendFinal
}

$cloudToken = Resolve-NonEmpty $GrafanaToken $env:K6_CLOUD_TOKEN
$cloudProjectId = Resolve-NonEmpty $GrafanaProjectId $env:K6_CLOUD_PROJECT_ID

$k6Args = @(
  'run',
  'tests/performance/k6-grafana/k6_operaciones_api.js',
  '--env', "BASE_URL=$baseApiFinal",
  '--env', "K6_OP_NAME=$Operacion",
  '--env', "K6_CANTIDAD=$([Math]::Max(1, $K6Cantidad))",
  '--env', "K6_VUS=$([Math]::Max(1, $K6Vus))",
  '--env', "PERF_DURATION=$PerfDuration",
  '--env', "K6_AUTH_HEADER=Bearer $tokenJwt",
  '--env', "K6_OP_BODY_JSON=$BodyJson",
  '--summary-export', 'reportes/k6-operaciones-summary.json'
)
if (-not [string]::IsNullOrWhiteSpace($tokenPoolHeader)) {
  $k6Args += @('--env', "K6_AUTH_HEADERS=$tokenPoolHeader")
}
if (-not [string]::IsNullOrWhiteSpace($Metodo)) { $k6Args += @('--env', "K6_OP_METHOD=$Metodo") }
if (-not [string]::IsNullOrWhiteSpace($Ruta)) { $k6Args += @('--env', "K6_OP_PATH=$Ruta") }

if ($K6Output -eq 'cloud') {
  if ([string]::IsNullOrWhiteSpace($cloudToken) -or [string]::IsNullOrWhiteSpace($cloudProjectId)) {
    throw 'K6Output=cloud requiere K6_CLOUD_TOKEN y K6_CLOUD_PROJECT_ID.'
  }
  $k6Args = @(
    'run', '-o', 'cloud',
    'tests/performance/k6-grafana/k6_operaciones_api.js',
    '--env', "BASE_URL=$baseApiFinal",
    '--env', "K6_OP_NAME=$Operacion",
    '--env', "K6_CANTIDAD=$([Math]::Max(1, $K6Cantidad))",
    '--env', "K6_VUS=$([Math]::Max(1, $K6Vus))",
    '--env', "PERF_DURATION=$PerfDuration",
    '--env', "K6_CLOUD_PROJECT_ID=$cloudProjectId",
    '--env', "K6_AUTH_HEADER=Bearer $tokenJwt",
    '--env', "K6_OP_BODY_JSON=$BodyJson",
    '--summary-export', 'reportes/k6-operaciones-summary.json'
  )
  if (-not [string]::IsNullOrWhiteSpace($tokenPoolHeader)) {
    $k6Args += @('--env', "K6_AUTH_HEADERS=$tokenPoolHeader")
  }
  if (-not [string]::IsNullOrWhiteSpace($Metodo)) { $k6Args += @('--env', "K6_OP_METHOD=$Metodo") }
  if (-not [string]::IsNullOrWhiteSpace($Ruta)) { $k6Args += @('--env', "K6_OP_PATH=$Ruta") }
}

Write-Output "=== RUN K6 OPERACION API ==="
Write-Output "Operacion=$Operacion | UserMode=$UserMode | Cantidad=$K6Cantidad | VUs=$K6Vus | Output=$K6Output"
Write-Output "> k6 $($k6Args -join ' ')"
& k6 @k6Args
if ($LASTEXITCODE -ne 0) { throw "Fallo: k6 operacion api (exit=$LASTEXITCODE)" }
Write-Output 'Proceso completado.'
