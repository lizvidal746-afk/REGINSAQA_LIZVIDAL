# RUNBOOK K6 Casos 01-04

Guia operativa unificada para ejecutar performance en REGINSA con k6 en:

- Terminal manual
- Azure DevOps y Jenkins

Incluye modos:

- `auth_mode=token`
- `auth_mode=auto`
- `sleep_mode=zero|min|custom`

## 1. Scripts k6 oficiales

- `tests/performance/k6-grafana/k6_caso_01_agregar_administrado.js`
- `tests/performance/k6-grafana/k6_caso_02_registrar_sancion.js`
- `tests/performance/k6-grafana/k6_caso_03_reconsiderar_sin_sanciones.js`
- `tests/performance/k6-grafana/k6_caso_04_reconsiderar_con_sanciones.js`

## 2. Pipelines performance

- Azure DevOps: `pipelines/azure/azure-pipelines-enterprise.yml` (activar `RUN_K6=true`)
- Jenkins: `pipelines/jenkins/Jenkinsfile` con `TEST_TYPE=performance`

## 3. Modos de autenticacion

### 3.1 Token

Usa uno de estos:

- `K6_AUTH_HEADER`
- `TOKEN1`, `TOKEN2`, `TOKEN`

Ventaja:

- Menos latencia (no login extra).

Riesgo:

- Si token expira, falla hasta renovar.

### 3.2 Auto

Usa credenciales:

- `REGINSA_USER` + `REGINSA_PASS`
- o pool: `REGINSA_USER_1..20` + `REGINSA_PASS_1..20`

Y habilita:

- `K6_AUTO_LOGIN=1`

Comportamiento:

- Si no hay token estatico, el script hace login runtime.
- Ante `401`, invalida token runtime y renueva.

## 4. Modos de sleep

- `zero`: `K6_SLEEP_SECONDS=0`
- `min`: `K6_SLEEP_SECONDS=0.2`
- `custom`: valor configurable (ej. `0.5`)

Recomendacion:

- Smoke/baseline: `0.2` a `0.8`
- Burst/agresivo: `0` o `0.1`

## 5. Variables base (terminal)

```powershell
$env:BASE_API="https://reginsaapiqa.sunedu.gob.pe/api"
$env:BASE_URL=$env:BASE_API
```

## 6. Operacion por campana y packs (prellenado)

Usa este bloque base para cada campana:

```powershell
# Campana y correlativo
$env:RUNID="0002"
$env:CAMPAIGN="campana-caso02-pack1"
```

Packs institucionales acordados:

- Caso 02:
- `Pack 1`: `3 / 10 / 50`
- `Pack 2`: `20 / 100 / 200`
- `Pack 3`: `20 / 500 / 1000`

- Caso 01:
- `Pack 1`: `3 / 10 / 50`
- `Pack 2`: `20 / 100 / 200`
- `Pack 3`: `20 / 500 / 1000`

Sugerencia de perfiles por tamano:

- `3`: `smoke`, `baseline`, `mode=no-burst`, `vus=1`
- `10`: `burst`, `soft-10`, `vus=2`
- `20`: `burst`, `soft-20`, `vus=3`
- `50`: `burst`, `medium-50`, `vus=5`
- `100`: `burst`, `high-100`, `vus=8`
- `200`: `burst`, `heavy-200`, `vus=12`
- `500`: `burst`, `ultra-500`, `vus=20`
- `1000`: `burst`, `extreme-1000`, `vus=30`

### 6.1 Bloque rapido copiado/pegado (Caso 02)

Este bloque te permite cambiar solo 5 variables por corrida: `RUNID`, `CAMPAIGN`, `SIZE`, `VUS`, `SLEEP`.

```powershell
# Edita solo estas variables
$env:RUNID="1002"
$env:CAMPAIGN="campana-caso02-pack2"
$env:SIZE="100"
$env:VUS="8"
$env:SLEEP="0.2"

k6 run tests/performance/k6-grafana/k6_caso_02_registrar_sancion.js `
  --tag test_type=burst --tag profile=operativo --tag case=caso02 --tag mode=burst --tag size=$env:SIZE `
  --env BASE_API=$env:BASE_API --env TOKEN1=$env:TOKEN1 `
  --env K6_RUN_ID=$env:RUNID --env K6_BURST_MODE=1 --env K6_FIXED_VUS=$env:VUS `
  --env K6_FIXED_ITERATIONS=$env:SIZE --env K6_TOTAL_REGISTROS=$env:SIZE `
  --env K6_SANCIONES_POR_REGISTRO=1 --env K6_MEDIDAS_POR_REGISTRO=1 `
  --env K6_FORCE_SINGLE_SANCION=1 --env K6_FORCE_SINGLE_MEDIDA=1 `
  --env K6_SANCION_MODE=sequence --env K6_RIS_MODE=rotate_1_2 `
  --env K6_ADMIN_SELECTION_MODE=random --env K6_ADMIN_POOL_SIZE=20 `
  --env K6_SLEEP_SECONDS=$env:SLEEP `
  --summary-export reportes/k6-caso02-$env:CAMPAIGN-$env:SIZE.json
```

### 6.2 Bloque rapido copiado/pegado (Caso 01)

Para caso01, recuerda generar dataset al menos del tamano `SIZE` antes de correr.

```powershell
# Edita solo estas variables
$env:RUNID="2002"
$env:CAMPAIGN="campana-caso01-pack2"
$env:SIZE="100"
$env:VUS="8"
$env:SLEEP="0.2"

# Dataset requerido por STRICT_UNIQUE
node scripts/generar-k6-caso01-dataset.js --strategy=fresh --size=$env:SIZE --fail-fast=1

k6 run tests/performance/k6-grafana/k6_caso_01_agregar_administrado.js `
  --tag test_type=burst --tag profile=operativo --tag case=caso01 --tag mode=burst --tag size=$env:SIZE `
  --env BASE_URL=$env:BASE_URL --env K6_AUTH_HEADER=$env:K6_AUTH_HEADER `
  --env REGINSA_USER=$env:REGINSA_USER --env REGINSA_PASS=$env:REGINSA_PASS --env K6_AUTO_LOGIN=1 `
  --env K6_BURST_MODE=1 --env K6_FIXED_VUS=$env:VUS `
  --env K6_FIXED_ITERATIONS=$env:SIZE --env K6_TOTAL_REGISTROS=$env:SIZE `
  --env K6_STRICT_UNIQUE=1 --env K6_SLEEP_SECONDS=$env:SLEEP `
  --summary-export reportes/k6-caso01-$env:CAMPAIGN-$env:SIZE.json
```

## 7. Ejecuciones manuales rapidas

### 6.1 Caso 02 - token + sleep 0

```powershell
k6 run tests/performance/k6-grafana/k6_caso_02_registrar_sancion.js --tag case=caso02 --tag mode=burst --env BASE_API=$env:BASE_API --env TOKEN1=$env:TOKEN1 --env K6_BURST_MODE=1 --env K6_FIXED_VUS=20 --env K6_FIXED_ITERATIONS=500 --env K6_TOTAL_REGISTROS=500 --env K6_SLEEP_SECONDS=0 --summary-export reportes/k6-caso02-zero-token.json
```

### 6.2 Caso 02 - auto + sleep minimo

```powershell
k6 run tests/performance/k6-grafana/k6_caso_02_registrar_sancion.js --tag case=caso02 --tag mode=burst --env BASE_API=$env:BASE_API --env REGINSA_USER=$env:REGINSA_USER --env REGINSA_PASS=$env:REGINSA_PASS --env K6_AUTO_LOGIN=1 --env K6_BURST_MODE=1 --env K6_FIXED_VUS=8 --env K6_FIXED_ITERATIONS=100 --env K6_TOTAL_REGISTROS=100 --env K6_SLEEP_SECONDS=0.2 --summary-export reportes/k6-caso02-min-auto.json
```

### 6.3 Caso 03 - auto + sleep minimo

```powershell
k6 run tests/performance/k6-grafana/k6_caso_03_reconsiderar_sin_sanciones.js --tag case=caso03 --tag mode=burst --env BASE_API=$env:BASE_API --env REGINSA_USER=$env:REGINSA_USER --env REGINSA_PASS=$env:REGINSA_PASS --env K6_AUTO_LOGIN=1 --env K6_BURST_MODE=1 --env K6_FIXED_VUS=8 --env K6_FIXED_ITERATIONS=100 --env K6_TOTAL_REGISTROS=100 --env K6_SLEEP_SECONDS=0.2 --summary-export reportes/k6-caso03-min-auto.json
```

### 6.4 Caso 04 - token + sleep 0

```powershell
k6 run tests/performance/k6-grafana/k6_caso_04_reconsiderar_con_sanciones.js --tag case=caso04 --tag mode=burst --env BASE_API=$env:BASE_API --env TOKEN1=$env:TOKEN1 --env K6_BURST_MODE=1 --env K6_FIXED_VUS=10 --env K6_FIXED_ITERATIONS=200 --env K6_TOTAL_REGISTROS=200 --env K6_SLEEP_SECONDS=0 --summary-export reportes/k6-caso04-zero-token.json
```

## 8. Pipeline: parametros recomendados

Para `caso02`, `caso03`, `caso04`:

- `auth_mode=token|auto`
- `sleep_mode=zero|min|custom`
- `sleep_seconds` (solo si `custom`)
- `total_registros`, `vus`, `burst_mode`, `duration`

Mapeo:

- `auth_mode=token` -> usa `TOKEN1/TOKEN2/TOKEN` o `REGINSA_API_AUTH_HEADER`
- `auth_mode=auto` -> usa `REGINSA_USER/PASS` o pool `REGINSA_USER_n/PASS_n`

## 9. Reglas de operacion recomendadas

- Smoke: baja concurrencia, `sleep 0.2-0.8`
- Burst: subir VUs de forma progresiva
- Mantener `K6_DEBUG_ERRORS=1` en validaciones iniciales
- Para caso02 institucional, mantener:
  - `K6_SANCIONES_POR_REGISTRO=1`
  - `K6_MEDIDAS_POR_REGISTRO=1`
  - `K6_FORCE_SINGLE_SANCION=1`
  - `K6_FORCE_SINGLE_MEDIDA=1`

## 10. Checklist de diagnostico rapido

### 1. `401` persistente

- Revisar token vigente o credenciales correctas
- Revisar endpoint login (`REGINSA_AUTH_ENDPOINT`)
- Revisar path token (`REGINSA_AUTH_TOKEN_PATH`)

### 2. `429` masivo

- Bajar VUs/iteraciones
- Subir `K6_SLEEP_SECONDS`

### 3. `500` de negocio

- Revisar payload y reglas de dominio
- Activar debug (`K6_DEBUG_ERRORS=1`)

### 4. Sin datos en reporte

- Verificar `--summary-export`
- Validar salida de summary local en carpeta `reportes/`

## 11. Version ultra-corta (operacion diaria)

Usa esta matriz para no pensar en parametros en cada corrida.

### 11.1 Caso 02 presets por pack

| Pack | Paso | SIZE | VUS | SLEEP recomendado |
|------|------|-----:|----:|------------------:|

| pack1 | 1 | 3 | 1 | 0.8 |
| pack1 | 2 | 10 | 2 | 0.8 |
| pack1 | 3 | 50 | 5 | 0.5 |
| pack2 | 1 | 20 | 3 | 0.5 |
| pack2 | 2 | 100 | 8 | 0.3 |
| pack2 | 3 | 200 | 12 | 0.2 |
| pack3 | 1 | 20 | 3 | 0.5 |
| pack3 | 2 | 500 | 20 | 0.1 |
| pack3 | 3 | 1000 | 30 | 0 |

### 11.2 Caso 01 presets por pack

| Pack | Paso | SIZE | VUS | SLEEP recomendado |
|------|------|-----:|----:|------------------:|

| pack1 | 1 | 3 | 1 | 0.8 |
| pack1 | 2 | 10 | 2 | 0.8 |
| pack1 | 3 | 50 | 5 | 0.5 |
| pack2 | 1 | 20 | 3 | 0.5 |
| pack2 | 2 | 100 | 8 | 0.3 |
| pack2 | 3 | 200 | 12 | 0.2 |
| pack3 | 1 | 20 | 3 | 0.5 |
| pack3 | 2 | 500 | 20 | 0.1 |
| pack3 | 3 | 1000 | 30 | 0 |

### 11.3 Regla de uso rapida

1. Define `RUNID` y `CAMPAIGN`.
2. Elige fila de la tabla y copia `SIZE`, `VUS`, `SLEEP`.
3. Pega en bloque rapido `6.1` (caso02) o `6.2` (caso01).
4. Si operacion pide maximo estres, usa `SLEEP=0`.
5. Si operacion pide estabilidad, usa `SLEEP` recomendado de tabla.

## 12. Documentacion relacionada (separada)

Este runbook se mantiene exclusivo para K6/performance.

Documentos complementarios:

- Postman/Newman: `docs/GUIA_POSTMAN_NEWMAN_CASOS_01_04.md`
- OWASP ZAP: `docs/GUIA_OWASP_ZAP_REGINSA.md`
