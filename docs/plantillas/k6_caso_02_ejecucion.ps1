# 1) Limpieza de variables previas
Get-ChildItem Env: | Where-Object { $_.Name -like "K6*" } | ForEach-Object {
    Remove-Item ("Env:\" + $_.Name) -ErrorAction SilentlyContinue
}
"BASE_URL","BASE_API","PERF_DURATION","TEST_DURATION","TOKEN" | ForEach-Object {
    Remove-Item ("Env:\" + $_) -ErrorAction SilentlyContinue
}

# 2) Configuración general (NO expongas tus tokens aquí)
$env:K6_CLOUD_TOKEN = "TU_TOKEN_REAL_SIN_ESPACIOS"
$env:K6_CLOUD_PROJECT_ID = "TU_PROJECT_ID"
$env:TOKEN = "TU_TOKEN_API_SIN_BEARER"
# Puedes cambiar estos valores por los tuyos antes de ejecutar el script.
$env:BASE_API = "https://reginsaapiqa.sunedu.gob.pe/api"
$env:K6_PDF_FOLDER = "test-files/"

# 3) Perfil de ejecución
$env:K6_PROFILE = "fijo"
$env:K6_FIXED_ITERATIONS = "20"
$env:K6_FIXED_VUS = "1"
$env:PERF_DURATION = "1m"
$env:K6_DEBUG_ERRORS = "1"
$env:K6_DEBUG_ERROR_MAX = "20"

# 4) Ejecutar flujo completo caso 2 con reporte en Grafana Cloud
k6 run -o cloud docs/plantillas/k6_caso_02_registrar_sancion_completo.js `
    --env K6_CLOUD_TOKEN=$env:K6_CLOUD_TOKEN `
    --env K6_CLOUD_PROJECT_ID=$env:K6_CLOUD_PROJECT_ID `
    --env BASE_API=$env:BASE_API `
    --env TOKEN=$env:TOKEN `
    --env K6_PROFILE=$env:K6_PROFILE `
    --env K6_FIXED_ITERATIONS=$env:K6_FIXED_ITERATIONS `
    --env K6_FIXED_VUS=$env:K6_FIXED_VUS `
    --env PERF_DURATION=$env:PERF_DURATION `
    --env K6_DEBUG_ERRORS=$env:K6_DEBUG_ERRORS `
    --env K6_DEBUG_ERROR_MAX=$env:K6_DEBUG_ERROR_MAX
