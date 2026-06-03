Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
# Wrapper para ejecutar el caso 01 de creación de entidad
# Usa el mismo token generado por el wrapper de login (run-caso00-login.ps1)
.
# Parámetros opcionales
param(
    [ValidateSet('local','cloud')] [string] $K6Output = 'local',
    [int] $K6Vus = 1,
    [int] $K6Cantidad = 1,
    [int] $K6SleepSeconds = 0
)
# Cargar variables de entorno y token (login)
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Write-Output '=== RUN CASO 01 CREAR ENTIDAD K6 ==='
# Ejecutar login para obtener token (usa el wrapper oficial)
& "$PSScriptRoot\..\scripts\run-caso00-login.ps1" -K6Output $K6Output
# Ahora K6 tiene K6_AUTH_HEADER en el entorno
Write-Output '=== INICIANDO K6 CASO 01 ==='
# Ejecutar K6 con el caso 01
$env:K6_OUTPUT = $K6Output
$env:K6_VUS = $K6Vus
$env:K6_CANTIDAD = $K6Cantidad
$env:K6_SLEEP_SECONDS = $K6SleepSeconds
k6 run REGINSA_K6_STRESS/cases/caso01_crear.js --env BASE_URL=$env:BASE_URL --env K6_AUTH_HEADER=$env:K6_AUTH_HEADER --summary-export reportes/k6-caso01-crear-summary.json
