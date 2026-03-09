# Guía K6 Caso 01: escalado, burst y unicidad de datos

## 1) Objetivo

Estandarizar cómo ejecutar rendimiento del Caso 01 en k6 (local/cloud) sin duplicados de `RUC` ni `razón social`, con opción de prueba estable o tipo burst (todos casi a la vez).

## 2) Conceptos clave

### VUs

- `VUs` = usuarios virtuales concurrentes de k6.
- No son usuarios reales de REGINSA por sí mismos.
- Un solo usuario real (token) puede ser usado por varios VUs, o puedes mapear 1 token por VU.

### Tokens por VU

El script `tests/performance/k6/k6_caso_01_agregar_administrado.js` soporta:

1. `K6_AUTH_HEADER` (un token para todos).
2. `K6_AUTH_HEADERS` (lista separada por `;` o `,`, rotada por VU).
3. `TOKEN1...TOKEN20` (rotación por índice de VU).

Si tienes 8 tokens en secrets, usa 8 VUs para mapear 1:1 cuando quieras una simulación más real por cuenta.

### `K6_SLEEP_SECONDS`

- `0`: sin espera entre iteraciones (máxima presión).
- `>0`: introduce think time, reduce ráfagas/429.

### Modo burst

- `K6_BURST_MODE=1` activa `per-vu-iterations`.
- Define `K6_FIXED_VUS` y `K6_BURST_ITER_PER_VU`.
- Iteraciones efectivas = `VUs * BURST_ITER_PER_VU`.

### Unicidad y fail-fast

Generador `scripts/generar-k6-caso01-dataset.js` (fresh):

- RUC exactamente 11 dígitos.
- RUC único.
- Razón social única.
- `--fail-fast=1` aborta si no cumple tamaño/unicidad.

## 3) Preparación mínima (PowerShell)

```powershell
$env:K6_CLOUD_TOKEN="TU_K6_CLOUD_TOKEN"
$env:K6_CLOUD_PROJECT_ID="TU_K6_PROJECT_ID"
$env:BASE_URL="https://reginsaapiqa.sunedu.gob.pe/api"

# Opción A: un token para todos los VUs
$env:K6_AUTH_HEADER="Bearer TU_TOKEN"

# Opción B: múltiples tokens (recomendado para VUs altos)
# $env:K6_AUTH_HEADERS="Bearer TOKEN1;Bearer TOKEN2;Bearer TOKEN3;Bearer TOKEN4"

$env:K6_DEBUG_ERRORS="1"
$env:K6_DEBUG_ERRORS_MAX="20"
```

## 4) Comandos base

### 4.1 Generar dataset fresh con fail-fast

```powershell
npm run pool:k6:dataset:fresh -- --size=N --fail-fast=1
```

### 4.2 Ejecución estable (shared-iterations)

```powershell
k6 run -o cloud tests/performance/k6/k6_caso_01_agregar_administrado.js `
  --env BASE_URL=$env:BASE_URL `
  --env K6_AUTH_HEADER=$env:K6_AUTH_HEADER `
  --env K6_FIXED_ITERATIONS=N `
  --env K6_FIXED_VUS=V `
  --env K6_TOTAL_REGISTROS=N `
  --env K6_STRICT_UNIQUE=1 `
  --env K6_SLEEP_SECONDS=S `
  --env K6_DEBUG_ERRORS=1 `
  --env K6_DEBUG_ERRORS_MAX=20 `
  --summary-export reportes/k6-caso01-summary-cloud.json
```

### 4.3 Ejecución burst (per-vu-iterations)

```powershell
k6 run -o cloud tests/performance/k6/k6_caso_01_agregar_administrado.js `
  --env BASE_URL=$env:BASE_URL `
  --env K6_AUTH_HEADER=$env:K6_AUTH_HEADER `
  --env K6_BURST_MODE=1 `
  --env K6_FIXED_VUS=V `
  --env K6_BURST_ITER_PER_VU=I `
  --env K6_TOTAL_REGISTROS=N `
  --env K6_STRICT_UNIQUE=1 `
  --env K6_SLEEP_SECONDS=0 `
  --env K6_DEBUG_ERRORS=1 `
  --env K6_DEBUG_ERRORS_MAX=20 `
  --summary-export reportes/k6-caso01-summary-cloud.json
```

Condición: `N = V * I` y dataset `size >= N`.

## 5) Tabla recomendada por volumen

| Volumen (N) | Estable sugerido (V, S) | Burst sugerido (V x I) |
| --- | --- | --- |
| 10 | `V=1-2`, `S=0.5-0.8` | `2 x 5` |
| 50 | `V=3`, `S=0.4-0.6` | `5 x 10` |
| 100 | `V=5`, `S=0.3-0.5` | `10 x 10` |
| 200 | `V=8`, `S=0.2-0.4` | `10 x 20` |
| 300 | `V=10`, `S=0.2-0.3` | `15 x 20` |
| 900 | `V=20-30`, `S=0-0.2` | `30 x 30` |
| 1000 | `V=25-35`, `S=0-0.2` | `25 x 40` |

Notas:

- Si ves muchos `429`, baja VUs o sube `K6_SLEEP_SECONDS`.
- Si ves `200` con `bSuccess=false`, usa logs `[caso01][debug]` para diagnóstico de negocio.

## 6) Copiar/pegar por volumen

### 10 (estable)

```powershell
npm run pool:k6:dataset:fresh -- --size=10 --fail-fast=1
k6 run -o cloud tests/performance/k6/k6_caso_01_agregar_administrado.js --env BASE_URL=$env:BASE_URL --env K6_AUTH_HEADER=$env:K6_AUTH_HEADER --env K6_FIXED_ITERATIONS=10 --env K6_FIXED_VUS=1 --env K6_TOTAL_REGISTROS=10 --env K6_STRICT_UNIQUE=1 --env K6_SLEEP_SECONDS=0.8 --env K6_DEBUG_ERRORS=1 --env K6_DEBUG_ERRORS_MAX=20 --summary-export reportes/k6-caso01-summary-cloud.json
```

### 50 (estable)

```powershell
npm run pool:k6:dataset:fresh -- --size=50 --fail-fast=1
k6 run -o cloud tests/performance/k6/k6_caso_01_agregar_administrado.js --env BASE_URL=$env:BASE_URL --env K6_AUTH_HEADER=$env:K6_AUTH_HEADER --env K6_FIXED_ITERATIONS=50 --env K6_FIXED_VUS=3 --env K6_TOTAL_REGISTROS=50 --env K6_STRICT_UNIQUE=1 --env K6_SLEEP_SECONDS=0.5 --env K6_DEBUG_ERRORS=1 --env K6_DEBUG_ERRORS_MAX=20 --summary-export reportes/k6-caso01-summary-cloud.json
```

### 100 (estable)

```powershell
npm run pool:k6:dataset:fresh -- --size=100 --fail-fast=1
k6 run -o cloud tests/performance/k6/k6_caso_01_agregar_administrado.js --env BASE_URL=$env:BASE_URL --env K6_AUTH_HEADER=$env:K6_AUTH_HEADER --env K6_FIXED_ITERATIONS=100 --env K6_FIXED_VUS=5 --env K6_TOTAL_REGISTROS=100 --env K6_STRICT_UNIQUE=1 --env K6_SLEEP_SECONDS=0.4 --env K6_DEBUG_ERRORS=1 --env K6_DEBUG_ERRORS_MAX=20 --summary-export reportes/k6-caso01-summary-cloud.json
```

### 200 (estable)

```powershell
npm run pool:k6:dataset:fresh -- --size=200 --fail-fast=1
k6 run -o cloud tests/performance/k6/k6_caso_01_agregar_administrado.js --env BASE_URL=$env:BASE_URL --env K6_AUTH_HEADER=$env:K6_AUTH_HEADER --env K6_FIXED_ITERATIONS=200 --env K6_FIXED_VUS=8 --env K6_TOTAL_REGISTROS=200 --env K6_STRICT_UNIQUE=1 --env K6_SLEEP_SECONDS=0.3 --env K6_DEBUG_ERRORS=1 --env K6_DEBUG_ERRORS_MAX=20 --summary-export reportes/k6-caso01-summary-cloud.json
```

### 300 (estable)

```powershell
npm run pool:k6:dataset:fresh -- --size=300 --fail-fast=1
k6 run -o cloud tests/performance/k6/k6_caso_01_agregar_administrado.js --env BASE_URL=$env:BASE_URL --env K6_AUTH_HEADER=$env:K6_AUTH_HEADER --env K6_FIXED_ITERATIONS=300 --env K6_FIXED_VUS=10 --env K6_TOTAL_REGISTROS=300 --env K6_STRICT_UNIQUE=1 --env K6_SLEEP_SECONDS=0.2 --env K6_DEBUG_ERRORS=1 --env K6_DEBUG_ERRORS_MAX=20 --summary-export reportes/k6-caso01-summary-cloud.json
```

### 900 (burst)

```powershell
npm run pool:k6:dataset:fresh -- --size=900 --fail-fast=1
k6 run -o cloud tests/performance/k6/k6_caso_01_agregar_administrado.js --env BASE_URL=$env:BASE_URL --env K6_AUTH_HEADER=$env:K6_AUTH_HEADER --env K6_BURST_MODE=1 --env K6_FIXED_VUS=30 --env K6_BURST_ITER_PER_VU=30 --env K6_TOTAL_REGISTROS=900 --env K6_STRICT_UNIQUE=1 --env K6_SLEEP_SECONDS=0 --env K6_DEBUG_ERRORS=1 --env K6_DEBUG_ERRORS_MAX=20 --summary-export reportes/k6-caso01-summary-cloud.json
```

### 1000 (burst)

```powershell
npm run pool:k6:dataset:fresh -- --size=1000 --fail-fast=1
k6 run -o cloud tests/performance/k6/k6_caso_01_agregar_administrado.js --env BASE_URL=$env:BASE_URL --env K6_AUTH_HEADER=$env:K6_AUTH_HEADER --env K6_BURST_MODE=1 --env K6_FIXED_VUS=25 --env K6_BURST_ITER_PER_VU=40 --env K6_TOTAL_REGISTROS=1000 --env K6_STRICT_UNIQUE=1 --env K6_SLEEP_SECONDS=0 --env K6_DEBUG_ERRORS=1 --env K6_DEBUG_ERRORS_MAX=20 --summary-export reportes/k6-caso01-summary-cloud.json
```

## 7) Buenas prácticas para 8 usuarios reales

Si tienes 8 tokens en GitHub Secrets:

- Define `TOKEN1...TOKEN8`.
- Ejecuta con `VUs <= 8` para mapeo 1:1.
- Para VUs > 8, los tokens se reciclan por índice de VU.

### Alternativa: generar tokens automáticamente en pipeline

El workflow `reginsa-performance-caso01-selfhosted.yml` ahora tiene fallback automático:

1. Usa `REGINSA_API_AUTH_HEADERS` (si existe).
2. Si no existe, usa `TOKEN1...TOKEN8` (si existen).
3. Si tampoco existen, hace login API con credenciales y construye `K6_AUTH_HEADERS` dinámico.

Secrets mínimos para este fallback por login:

- `REGINSA_API_BASE` (ej: `https://reginsaapiqa.sunedu.gob.pe/api`)
- `REGINSA_USER` y `REGINSA_PASS` (usuario único), o pares `REGINSA_USER_1...8` + `REGINSA_PASS_1...8`

Secrets opcionales de ajuste (si tu API difiere):

- `REGINSA_AUTH_ENDPOINT` (default: `/Auth/Login`)
- `REGINSA_AUTH_USER_FIELD` (default: `usuario`)
- `REGINSA_AUTH_PASS_FIELD` (default: `contrasena`)
- `REGINSA_AUTH_TOKEN_PATH` (ej: `oData.token`)
- `REGINSA_AUTH_TIMEOUT_MS` (default script: `20000`)

Recomendación: si ya cuentas con `TOKEN1...TOKEN8` válidos, mantenlos en secrets y evita la latencia extra del login bootstrap.

## 8) Validación posterior recomendada

Después de cada corrida:

```powershell
npm run k6:caso01:auditar
```

Genera:

- `reportes/k6-caso01-persistencia.json`

Con esto validas persistencia real y no solo estatus HTTP.
