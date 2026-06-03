param(
    [ValidateSet('local','cloud')] [string] $K6Output,
    [int] $K6Vus,
    [int] $K6Cantidad,
    [int] $K6SleepSeconds
)

# Set defaults if not provided
if (-not $K6Output) { $K6Output = 'local' }
if (-not $K6Vus) { $K6Vus = 9 }
if (-not $K6Cantidad) { $K6Cantidad = 9 }
if (-not $K6SleepSeconds) { $K6SleepSeconds = 0 }

# Execution policy must be set after param block
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# -------------------------------------------------
# 1️⃣ Preparar entorno – ir a la raíz del proyecto
# -------------------------------------------------
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Output "=== RUN CASO 02 REGISTRAR SANCION (9 usuarios / 9 IPs) ==="

# -------------------------------------------------
# 2️⃣ Ejecutar login (caso 00) – genera token JWT
# -------------------------------------------------
. "$PSScriptRoot\..\scripts\run-caso00-login.ps1" -K6Output $K6Output --usermode pool --poolsize $K6Vus

Write-Output "=== TOKEN obtenido, iniciando K6 ==="

# -------------------------------------------------
# 3️⃣ Exportar variables para K6 (after login to avoid overwrite)
# -------------------------------------------------

$env:K6_OUTPUT        = $K6Output
$env:K6_VUS           = $K6Vus
$env:K6_CANTIDAD      = $K6Cantidad
$env:K6_SLEEP_SECONDS = $K6SleepSeconds

# Si no hay IPs definidas en .env, usamos un rango por defecto
if (-not $env:K6_LOCAL_IPS) {
    $env:K6_LOCAL_IPS = '10.0.0.1,10.0.0.2,10.0.0.3,10.0.0.4,10.0.0.5,10.0.0.6,10.0.0.7,10.0.0.8,10.0.0.9'
}

# -------------------------------------------------
# 4️⃣ Ejecutar K6 con el caso 02
# -------------------------------------------------
k6 run REGINSA_K6_STRESS/cases/caso02_registrar_sancion.js `
    --env BASE_URL=$env:BASE_URL `
    --env K6_AUTH_HEADER=$env:K6_AUTH_HEADER `
    --env K6_AUTH_HEADERS=$env:K6_AUTH_HEADERS `
    --env K6_AUTH_HEADERS=$env:K6_AUTH_HEADERS `
    --iterations $K6Cantidad `
    --summary-export reportes/k6-caso02-multi-summary.json
