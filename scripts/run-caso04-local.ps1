param(
  [string]$BaseApi = "",
  [string]$Mode = "fast",
  [int]$K6Cantidad = 0,
  [int]$K6Vus = 0,
  [double]$K6Sleep = 0,
  [ValidateSet('local','cloud')]
  [string]$K6Output = "local",
  [int]$K6Debug = 1,
  [string]$PerfDuration = "10m",
  [string]$CloudToken = "",
  [string]$CloudProjectId = ""
)

$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $PSNativeCommandUseErrorActionPreference = $false
}

# 1. CARGAR VARIABLES DE ENTORNO
$root = Split-Path -Path $PSScriptRoot -Parent
$envLoader = Join-Path $PSScriptRoot "shared/import-env-file.ps1"
if (Test-Path $envLoader) {
  & $envLoader -Path (Join-Path $root ".env")
  & $envLoader -Path (Join-Path $root ".env.k6")
  & $envLoader -Path (Join-Path $root ".env.k6.local")
}

$grafanaSecretsHelper = Join-Path $PSScriptRoot "shared/grafana-secrets.ps1"
if (Test-Path $grafanaSecretsHelper) { . $grafanaSecretsHelper }

if ([string]::IsNullOrWhiteSpace($env:K6_LOCAL_IPS)) {
  $ipDetector = Join-Path $PSScriptRoot 'shared/detect-k6-ips.ps1'
  if (Test-Path $ipDetector) { & $ipDetector }
}

function Get-ResolvedValue {
  param($val, $fallback)
  if ($null -eq $val -or $val -eq "") { return $fallback }
  return $val
}

# Capturamos los argumentos del script de forma global para la función de resolución
$globalArgs = $args
if ($MyInvocation.UnboundArguments) { $globalArgs = $MyInvocation.UnboundArguments }

function Resolve-K6Value {
  param([string]$cliName, $paramValue, $defaultValue)
  
  # 1. Prioridad: Argumentos CLI (--cantidad=5)
  if ($null -ne $globalArgs) {
    for ($i = 0; $i -lt $globalArgs.Count; $i++) {
      $arg = [string]$globalArgs[$i]
      if ($arg -eq "--$cliName" -and ($i + 1) -lt $globalArgs.Count) { return $globalArgs[$i + 1] }
      if ($arg -like "--$cliName=*") { return $arg.Substring($cliName.Length + 3) }
    }
  }
  
  # 2. Prioridad: Variables de entorno NPM
  $npmVarName = "npm_config_$cliName"
  $npmVar = Get-ChildItem "Env:$npmVarName" -ErrorAction SilentlyContinue
  if ($null -ne $npmVar -and $npmVar.Value -ne "") { return $npmVar.Value }

  # 3. Prioridad: Parámetro del script (si no es el default 0 o vacío)
  if ($paramValue -ne 0 -and $null -ne $paramValue -and $paramValue -ne "") { return $paramValue }
  
  # 4. Default final
  return $defaultValue
}

# 2. RESOLVER CREDENCIALES
$user = Get-ResolvedValue -val $env:REGINSA_USER -fallback $env:REGINSA_USER_1
$pass = Get-ResolvedValue -val $env:REGINSA_PASS -fallback $env:REGINSA_PASS_1
$url = Get-ResolvedValue -val $env:REGINSA_URL -fallback $env:REGINSA_BASE_URL
$url = $url -replace "/#.*$", ""

# 3. RESOLVER GRAFANA
$pCli = Resolve-K6Value -cliName "project" -paramValue $CloudProjectId -defaultValue ""
$tCli = Resolve-K6Value -cliName "token" -paramValue $CloudToken -defaultValue ""

# Compatibilidad: permitir variables de entorno K6_CLOUD_* definidas en la sesion.
if ([string]::IsNullOrWhiteSpace($pCli)) { $pCli = [string]$env:K6_CLOUD_PROJECT_ID }
if ([string]::IsNullOrWhiteSpace($tCli)) { $tCli = [string]$env:K6_CLOUD_TOKEN }

if (Get-Command Resolve-GrafanaCloudSecrets -ErrorAction SilentlyContinue) {
  $secrets = Resolve-GrafanaCloudSecrets -GrafanaProjectId $pCli -GrafanaToken $tCli -PersistProvided -Interactive:($K6Output -eq 'cloud')
  $grafanaProjectIdFinal = $secrets.ProjectId
  $grafanaTokenFinal = $secrets.Token
} else {
  $grafanaProjectIdFinal = $pCli
  $grafanaTokenFinal = $tCli
}

# 4. CONFIGURAR K6 Y CONTADOR DE CORRIDAS
$api = Get-ResolvedValue -val $BaseApi -fallback $env:REGINSA_API_BASE
if ($null -eq $api -or $api -eq "") { $api = "https://reginsaapiqa.sunedu.gob.pe/api" }

$counterFile = Join-Path $root "reportes/.run-caso04-counter"
if (-not (Test-Path (Join-Path $root "reportes"))) { New-Item -ItemType Directory -Path (Join-Path $root "reportes") | Out-Null }
$currentCount = 1
if (Test-Path $counterFile) {
  $currentCount = [int](Get-Content $counterFile) + 1
}
$currentCount | Out-File $counterFile -Encoding ascii
$runId = $currentCount.ToString("00")

$cant = [int](Resolve-K6Value -cliName "cantidad" -paramValue $K6Cantidad -defaultValue 1)
$vusFinal = [int](Resolve-K6Value -cliName "vus" -paramValue $K6Vus -defaultValue 1)
$sleepFinal = [double](Resolve-K6Value -cliName "sleep" -paramValue $K6Sleep -defaultValue 0)
$debugFinal = [int](Resolve-K6Value -cliName "debug" -paramValue $K6Debug -defaultValue 1)
$modeFinal = Get-ResolvedValue -val $Mode -fallback "fast"
$outputFinal = Resolve-K6Value -cliName "output" -paramValue $K6Output -defaultValue "local"
$outputFinal = [string]$outputFinal

try {
  Write-Host "[Playwright] Obteniendo Token para $user..." -ForegroundColor Cyan
  $prevErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $tokenOutput = & node "$PSScriptRoot/postman/get-punku-token.js" $user $pass $url 2>&1
  $nodeExit = $LASTEXITCODE
  $ErrorActionPreference = $prevErrorActionPreference

  if ($nodeExit -ne 0) {
    throw "No se pudo obtener TOKEN_JWT (exit=$nodeExit)."
  }

  $tokenLines = @($tokenOutput | ForEach-Object { [string]$_ })
  $token = $tokenLines |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -match '^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$' } |
    Select-Object -Last 1

  if ([string]::IsNullOrWhiteSpace($token)) {
    $token = [string]$env:K6_TOKEN_JWT
  }
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw "TOKEN_JWT vacío o no detectable en salida del generador de token."
  }

  $env:K6_TOKEN_JWT = $token

  $isCloudOutput = $outputFinal -eq "cloud"
  $argsList = @("run")
  $k6Script = "tests/performance/k6-grafana/k6_caso_04_reconsiderar_con_sanciones.js"

  if ($isCloudOutput) {
    if ($grafanaTokenFinal -eq "" -or $grafanaProjectIdFinal -eq "") {
      throw "K6Output=cloud requiere Grafana token y project id (usa --token y --project o variables de entorno)."
    }
    $argsList += "-o"; $argsList += "cloud"
    $env:K6_CLOUD_TOKEN = $grafanaTokenFinal
    $env:K6_CLOUD_PROJECT_ID = $grafanaProjectIdFinal
  }

  $argsList += $k6Script
  $argsList += "--env"; $argsList += "TOKEN=$token"
  $argsList += "--env"; $argsList += "BASE_API=$api"
  $argsList += "--env"; $argsList += "K6_CANTIDAD=$cant"
  $argsList += "--env"; $argsList += "K6_TOTAL_ITERATIONS=$cant"
  $argsList += "--env"; $argsList += "K6_MODE=$modeFinal"
  $argsList += "--env"; $argsList += "K6_VUS=$vusFinal"
  $argsList += "--env"; $argsList += "K6_RUN_ID=$runId"
  $argsList += "--env"; $argsList += "K6_SLEEP_SECONDS=$sleepFinal"
  $argsList += "--env"; $argsList += "K6_DEBUG_ERRORS=$debugFinal"
  $argsList += "--env"; $argsList += "K6_HTTP_DETAIL_MODE=all"
  $argsList += "--summary-export"; $argsList += "reportes/k6-caso04-summary.json"

  $logsDir = Join-Path $root "reportes/logs"
  if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }
  $logPath = Join-Path $logsDir ("k6-caso04-run-{0}.log" -f $runId)

  Write-Host "=== EJECUTANDO CASO 04 (Corrida K6 $runId) ===" -ForegroundColor Cyan
  Write-Host "[K6] output: $outputFinal | script: $k6Script | cantidad: $cant" -ForegroundColor DarkCyan
  Write-Host "[K6] log: $logPath" -ForegroundColor DarkCyan
  if ($isCloudOutput) {
    Write-Host "[K6] grafana project: $grafanaProjectIdFinal" -ForegroundColor DarkCyan
  }
  # Forzar UTF-8 para que k6 renderice correctamente sus caracteres (checkmarks, barras)
  $prevEncoding = [Console]::OutputEncoding
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

  $prevErrorActionPreferenceK6 = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  # Ejecutar k6 de forma nativa para preservar exactamente el render ANSI (naranja/celeste/verde).
  k6 @argsList
  $k6Exit = $LASTEXITCODE
  $ErrorActionPreference = $prevErrorActionPreferenceK6

  [Console]::OutputEncoding = $prevEncoding

  if ($k6Exit -ne 0) {
    throw "k6 finalizó con código $k6Exit. Revisa: $logPath"
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
