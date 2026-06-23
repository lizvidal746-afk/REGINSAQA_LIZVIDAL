# ============================================================
# tools/run-k6.ps1
# Carga variables del .env al entorno del proceso y ejecuta k6.
# Uso:  powershell -ExecutionPolicy Bypass -File tools/run-k6.ps1 cases/caso02_registrar_sancion.js [args extra]
# ============================================================
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$ScriptPath,

    [switch]$NoOpen,
    [switch]$SkipAI,
    [switch]$SkipReports,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = 'Stop'

# k6 imprime su banner con Unicode. En Windows PowerShell puede verse como
# mojibake si la consola no usa UTF-8.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom

$envFile = Join-Path $PSScriptRoot '..\.env'
$reportsDir = Join-Path $PSScriptRoot '..\reports'
if (!(Test-Path $reportsDir)) { New-Item -ItemType Directory -Path $reportsDir | Out-Null }

if (-not (Test-Path $envFile)) {
    Write-Error ".env no encontrado en $envFile. Copia .env.example y completa valores."
    exit 1
}

# Cargar .env -> variables de entorno del proceso (ignora comentarios y lineas vacias)
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
        $idx = $line.IndexOf('=')
        $name = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim()
        # Quitar comillas envolventes si existen
        if ($value -match '^".*"$' -or $value -match "^'.*'$") {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

# SSO Punku - Ejecutamos la generación de tokens multi-usuario antes del test
$multiTokenScript = Join-Path $PSScriptRoot "get-multi-punku-token.js"
if (Test-Path $multiTokenScript) {
    Write-Host "[run-k6] Refrescando pool de tokens JWT Punku..." -ForegroundColor Cyan
    & node $multiTokenScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Fallo al refrescar el pool de tokens."
        exit $LASTEXITCODE
    }
}

# Detectar IP real del host corporativo
$localIp = $null
$localIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -like '192.168.28.*' } |
    Select-Object -First 1).IPAddress

if (-not $localIp) {
    $localIp = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -like '192.168.*' } |
        Select-Object -First 1).IPAddress
}

if (-not $localIp) { $localIp = 'auto' }
[System.Environment]::SetEnvironmentVariable('K6_SOURCE_IP', $localIp, 'Process')

if ($env:K6_LOCAL_IPS) {
    [System.Environment]::SetEnvironmentVariable('K6_LOCAL_IPS', $env:K6_LOCAL_IPS, 'Process')
    Write-Host "[run-k6] Usando pool de IPs: $($env:K6_LOCAL_IPS)" -ForegroundColor Yellow
}

# Preparar carpeta de resultados
$ScriptBasename = [System.IO.Path]::GetFileNameWithoutExtension($ScriptPath)
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$RUN_SEED = Get-Date -Format "yyyyMMddHHmmssfff"
$sequencePath = Join-Path $reportsDir "k6-global-secuencia.json"
$forcedSequence = 0
if ($env:K6_PREFIX_SEQUENCE) {
    [void][int]::TryParse($env:K6_PREFIX_SEQUENCE, [ref]$forcedSequence)
}
$lastSequence = 0
if (Test-Path $sequencePath) {
    try {
        $sequenceJson = Get-Content -Raw -Path $sequencePath | ConvertFrom-Json
        $lastSequence = [int]$sequenceJson.last
    } catch {
        $lastSequence = 0
    }
}
$RUN_SEQUENCE = if ($forcedSequence -gt 0) { $forcedSequence } else { $lastSequence + 1 }
$RUN_LABEL = "K6 {0:D2}" -f $RUN_SEQUENCE
$RUN_SLUG = "K6-{0:D2}" -f $RUN_SEQUENCE
[System.Environment]::SetEnvironmentVariable('K6_RUN_ID', $TIMESTAMP, 'Process')
[System.Environment]::SetEnvironmentVariable('K6_RUN_SEED', $RUN_SEED, 'Process')
[System.Environment]::SetEnvironmentVariable('K6_RUN_SEQUENCE', [string]$RUN_SEQUENCE, 'Process')
[System.Environment]::SetEnvironmentVariable('K6_RUN_LABEL', $RUN_LABEL, 'Process')
[System.Environment]::SetEnvironmentVariable('K6_RUN_SLUG', $RUN_SLUG, 'Process')
[ordered]@{
    last = $RUN_SEQUENCE
    label = $RUN_LABEL
    slug = $RUN_SLUG
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json | Set-Content -Path $sequencePath -Encoding UTF8

$RUN_DIR_NAME = if ($env:TEST_CASE_ID) { "$($env:TEST_CASE_ID)_$($ScriptBasename.ToUpper())_RUN_$TIMESTAMP" } else { "$($ScriptBasename.ToUpper())_RUN_$TIMESTAMP" }
$RUN_DIR = Join-Path $reportsDir $RUN_DIR_NAME
if (!(Test-Path $RUN_DIR)) { New-Item -ItemType Directory -Path $RUN_DIR | Out-Null }

$SCENARIO_NAME = if ($env:SCENARIO) { $env:SCENARIO } else { "smoke" }
[System.Environment]::SetEnvironmentVariable('SCENARIO', $SCENARIO_NAME, 'Process')
$REPORT_BASE = "perf-$SCENARIO_NAME-$TIMESTAMP"
$JSON_OUT = Join-Path $RUN_DIR "$REPORT_BASE.json"
$K6_LOG_OUT = Join-Path $RUN_DIR "k6-console.log"

Write-Host "[run-k6] Escenario: $SCENARIO_NAME | Script: $ScriptPath" -ForegroundColor Cyan
Write-Host "[run-k6] Identificador de corrida: $RUN_SLUG" -ForegroundColor Cyan

if ($ScriptBasename -match 'caso01') {
    $caso01PoolFile = if ($env:K6_CASO01_POOL_FILE) { $env:K6_CASO01_POOL_FILE } else { "reginsa-caso01-administrados-pool.json" }
    $caso01PoolPath = Join-Path $reportsDir $caso01PoolFile
    if (-not (Test-Path $caso01PoolPath)) {
        Write-Host "[run-k6] Pool propio Caso 01 no existe. Generando $caso01PoolFile..." -ForegroundColor Cyan
        & node (Join-Path $PSScriptRoot 'generar-caso01-pool-reginsa.js')
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Fallo al generar pool propio de Caso 01."
            exit $LASTEXITCODE
        }
    }
    Write-Host "[run-k6] Preparando dataset reservado para Caso 01..." -ForegroundColor Cyan
    & node (Join-Path $PSScriptRoot 'generar-k6-caso01-dataset.js')
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Fallo al generar dataset de Caso 01."
        exit $LASTEXITCODE
    }
}

# Ejecutar K6
$k6EnvArgs = @('-e', "SCENARIO=$SCENARIO_NAME", '-e', "K6_SOURCE_IP=$localIp", '-e', "K6_RUN_ID=$TIMESTAMP", '-e', "K6_RUN_SEED=$RUN_SEED", '-e', "K6_RUN_SEQUENCE=$RUN_SEQUENCE", '-e', "K6_RUN_LABEL=$RUN_LABEL", '-e', "K6_RUN_SLUG=$RUN_SLUG")
if ($env:K6_LOCAL_IPS) { $k6EnvArgs += @('-e', "K6_LOCAL_IPS=$($env:K6_LOCAL_IPS)") }
if ($env:TEST_CASE_ID) { $k6EnvArgs += @('-e', "TEST_CASE_ID=$($env:TEST_CASE_ID)") }

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    & k6 run @k6EnvArgs --summary-export=$JSON_OUT $ScriptPath @ExtraArgs 2>&1 |
        ForEach-Object {
            if ($_ -is [System.Management.Automation.ErrorRecord]) {
                $_.ToString()
            } else {
                $_
            }
        } |
        Tee-Object -FilePath $K6_LOG_OUT
    $k6ExitCode = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousErrorActionPreference
}

$CASO04_EVIDENCE_OUT = Join-Path $RUN_DIR "caso04-evidencia-jsonl.txt"
$evidenceLines = @()
if (Test-Path $K6_LOG_OUT) {
    Get-Content -Path $K6_LOG_OUT | ForEach-Object {
        if ($_ -match '\[CASO04_EVIDENCE\]\s+(\{.*\})') {
            $evidenceLines += $Matches[1]
        }
    }
}
if ($evidenceLines.Count -gt 0) {
    $evidenceLines | Set-Content -Path $CASO04_EVIDENCE_OUT -Encoding UTF8
    Write-Host "[run-k6] Evidencia Caso 04 guardada: $CASO04_EVIDENCE_OUT" -ForegroundColor Cyan
}

if (-not (Test-Path $JSON_OUT)) {
    Write-Warning "[run-k6] k6 termino con codigo $k6ExitCode y no genero JSON. Se omite reportes."
    exit $k6ExitCode
}

# Mover archivos generados recientes a la carpeta organizada
$stateFiles = @(
    'reginsa-caso01-administrados-pool.json',
    'k6-caso01-dataset.json',
    'k6-caso01-usados.json',
    'k6-global-secuencia.json'
)
Get-ChildItem -Path $reportsDir | Where-Object { 
    $_.Name -notmatch ".*RUN_.*" -and
    ($stateFiles -notcontains $_.Name) -and
    ($_.LastWriteTime -gt (Get-Date).AddMinutes(-2)) -and
    ($_.Attributes -ne "Directory")
} | Move-Item -Destination $RUN_DIR -Force

# Localizar y abrir HTML de plantilla apenas termina k6. Excel/Word pueden seguir demorando luego.
$lastHtml = Get-ChildItem -Path $RUN_DIR -Filter "*.html" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($lastHtml) {
    $absolutePath = $lastHtml.FullName
    Write-Host ''
    Write-Host '  ============================================================' -ForegroundColor DarkCyan
    Write-Host '  REPORTE HTML GENERADO (Organizado)' -ForegroundColor Cyan
    Write-Host "  Archivo : $absolutePath" -ForegroundColor Green
    Write-Host "  URL     : file:///$($absolutePath.Replace('\','/'))" -ForegroundColor Yellow
    Write-Host '  ============================================================' -ForegroundColor DarkCyan
    Write-Host ''
    if (-not $NoOpen -and $env:CI -ne 'true') {
        Start-Process $absolutePath
    }
}

# Generar Análisis IA
if (-not $SkipAI) {
    if (Test-Path (Join-Path $PSScriptRoot 'extract-k6-metrics.js')) {
        Write-Host "  [run-k6] Extrayendo métricas e invocando IA Local (Ollama)..." -ForegroundColor Cyan
        & node (Join-Path $PSScriptRoot 'extract-k6-metrics.js') $JSON_OUT
        & node (Join-Path $PSScriptRoot 'generate-ai-insights.js')
    }
}

# Generar reportes Excel y Word desde el mismo JSON usado por el HTML de plantilla
if (-not $SkipReports) {
    Write-Host "  [run-k6] Generando reportes Excel y Word en subcarpeta..." -ForegroundColor Cyan
    & node (Join-Path $PSScriptRoot 'generar-excel.js') $JSON_OUT
    & node (Join-Path $PSScriptRoot 'generar-word.js')  $JSON_OUT
}

# Limpieza y organización de subcarpeta
if (Test-Path (Join-Path $reportsDir "metrics_for_ai.json")) { Move-Item (Join-Path $reportsDir "metrics_for_ai.json") $RUN_DIR -Force }
if (Test-Path (Join-Path $reportsDir "ai-insights.json")) { Move-Item (Join-Path $reportsDir "ai-insights.json") $RUN_DIR -Force }

Write-Host "  RESULTADOS ORGANIZADOS EN:" -ForegroundColor Cyan
Write-Host "  $RUN_DIR`n" -ForegroundColor Green

exit $k6ExitCode
