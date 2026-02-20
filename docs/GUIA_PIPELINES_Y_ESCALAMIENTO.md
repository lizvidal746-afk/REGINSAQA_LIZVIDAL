# Guía de pipelines y escalamiento (REGINSA)

## 1) ¿Se reemplaza `test:01:fast` por `test:01:scale`?

No.

- `test:01:fast`: validación rápida y corridas pequeñas/medias.
- `test:01:scale`: corridas funcionales masivas con precalentamiento de pool y foco en estabilidad.

Puedes conservar ambos:

- `npm run test:01:fast -- --workers=2 --repeat-each=2 --project=chromium`
- `npm run test:01:scale -- --workers=6 --repeat-each=10 --project=chromium`

## 2) Pool de data preestablecida y refresco continuo

### Archivos usados

- `reportes/administrados-pool.json`: cola de candidatos disponibles.
- `reportes/administrados-reservados.json`: datos reservados en ejecución.
- `reportes/registros-administrados.json`: creados por la prueba.
- `reportes/historico/administrados-historico.json`: histórico consolidado.

### Comandos de operación

- Ver estado del pool:
  - `npm run pool:status`
- Precalentar/refrescar pool:
  - `set REGINSA_POOL_TARGET=600`
  - `npm run pool:prewarm`

En PowerShell:

- `$env:REGINSA_POOL_TARGET="600"`
- `npm run pool:prewarm`

### Regla recomendada de sizing

Para funcionales masivas:

`POOL_TARGET = workers * repeatEach * 6`

Ejemplo:

- `workers=6`, `repeatEach=10` → mínimo recomendado: `360`.
- Operativo sugerido: `600` para colchón.

## 3) Flujo recomendado para funcionales masivas

1. Reiniciar iteración operativa:
   - `npm run iteracion:reiniciar`
2. Definir tamaño del pool:
   - `set REGINSA_POOL_TARGET=600`
3. Ejecutar escala:
   - `npm run test:01:scale -- --workers=6 --repeat-each=10 --project=chromium`

Nota de consistencia:

- Por defecto `test:01:scale` usa `REGINSA_STRICT_VERIFY=1`.
- Si un registro no se confirma en listado, el test falla (evita “pasó pero no creó”).
- Si quieres modo tolerante para carga experimental, define `REGINSA_STRICT_VERIFY=0`.
- En escala, la verificación por defecto es por API (`REGINSA_VERIFY_API=1`, `REGINSA_VERIFY_UI=0`).
- Endpoint de verificación: `GET /api/Entidad/Listar`.
- En modo escala, si `POST /api/Entidad/Crear` confirma creación, se evita reintento duplicado aunque el listado tarde en reflejarse.

## 4) Reutilización del pool para rendimiento

Sí, se puede reutilizar la misma base de candidatos para rendimiento cuando el flujo de carga también crea administrados.

- Funcionales UI (Playwright): consume y registra en sistema.
- Rendimiento (k6): usar dataset derivado del pool para payloads únicos.

Recomendación:

- Mantener una fuente común de datos (`administrados-pool.json`) y transformar a CSV/JSON para k6 según endpoint.

APIs del caso 01:

- `POST /api/Entidad/Crear`
- `GET /api/Entidad/Listar`

## 5) Pipeline en GitHub Actions

### 5.1 Crear estructura

En el repositorio, crear:

- `.github/workflows/reginsa-funcional.yml`
- `.github/workflows/reginsa-performance.yml`

### 5.2 Variables/secretos (Settings > Secrets and variables > Actions)

Configurar:

- `REGINSA_URL`
- `REGINSA_USER_1` ... `REGINSA_USER_6`
- `REGINSA_PASS_1` ... `REGINSA_PASS_6`

Variables no secretas sugeridas:

- `POOL_TARGET` (ej. `600`)
- `PW_WORKERS` (ej. `6`)
- `PW_REPEAT_EACH` (ej. `10`)

### 5.3 Flujo funcional (resumen)

Pasos mínimos del job:

1. Checkout
2. Node setup
3. `npm ci`
4. `npx playwright install --with-deps`
5. `npm run iteracion:reiniciar`
6. `npm run pool:prewarm`
7. `npm run test:01:scale -- --workers=${{ vars.PW_WORKERS }} --repeat-each=${{ vars.PW_REPEAT_EACH }} --project=chromium`
8. Publicar artifacts (`playwright-report`, `allure-report`, `allure-results`, `test-results`, `reportes`)

Política CI recomendada:

- `failed > 0`: el pipeline falla.
- `flaky > 0` y `failed = 0`: solo advertencia (warning), no bloquea el pipeline.
- Evaluación automática con: `node scripts/evaluate-playwright-results.js`.

## 6) Pipeline en Azure DevOps

### 6.1 Crear pipeline

1. Azure DevOps > Pipelines > New pipeline.
2. Seleccionar repositorio.
3. Elegir YAML existente o crear `azure-pipelines.yml`.

### 6.2 Variable Group

Crear Variable Group con:

- `REGINSA_URL`
- `REGINSA_USER_1...6`
- `REGINSA_PASS_1...6`
- `POOL_TARGET`
- `PW_WORKERS`
- `PW_REPEAT_EACH`

Marcar passwords como secretos.

### 6.3 Etapas sugeridas

- `FunctionalScale`
  - `npm ci`
  - `npx playwright install --with-deps`
  - `npm run iteracion:reiniciar`
  - `npm run pool:prewarm`
  - `npm run test:01:scale -- --workers=$(PW_WORKERS) --repeat-each=$(PW_REPEAT_EACH) --project=chromium`
  - `node scripts/evaluate-playwright-results.js` (warning por flaky, fail por failed)
  - Publicar artifacts/reportes
- `PerformanceK6` (siguiente fase)
  - Ejecutar k6 con dataset transformado desde pool.

## 7) k6 + Grafana + InfluxDB

El nombre correcto es **InfluxDB**.

Arquitectura recomendada:

- k6 ejecuta pruebas y envía métricas a InfluxDB.
- Grafana consulta InfluxDB y muestra dashboards.

Flujo:

1. Preparar dataset desde `administrados-pool.json`.
2. Ejecutar k6 (`k6 run ...`) con variables (`BASE_URL`, dataset).
3. Guardar resultados en InfluxDB.
4. Visualizar en Grafana (latencias, tasa error, throughput, percentiles).

## 8) Parámetros que debes ajustar primero

Para funcionales:

- `PW_WORKERS` (paralelismo)
- `PW_REPEAT_EACH` (volumen)
- `POOL_TARGET` (capacidad de datos)

Para performance k6:

- `VUs` (usuarios virtuales)
- `duration` / `stages`
- dataset input (desde pool)

## 9) Comandos de referencia rápida

## 10) Modo demo vs modo profesional

### `test:01:demo` (rápido para demostración)

Úsalo cuando necesitas mostrar que la automatización reduce tiempos frente a ejecución manual.

- Prioriza velocidad.
- Reduce evidencias pesadas (`trace/video/screenshot` en `off`).
- Mantiene validación funcional mínima para demo.

Comando:

- `npm run test:01:demo -- --workers=6 --repeat-each=10 --project=chromium`

### `test:01:scale` (profesional / operación)

Úsalo para corridas operativas, auditoría y seguimiento con evidencia completa.

- Prioriza robustez y trazabilidad.
- Conserva validaciones y reportes de operación.
- Adecuado para pipeline y ejecución recurrente.

Comando:

- `npm run test:01:scale -- --workers=6 --repeat-each=10 --project=chromium`

CMD:

- `npm run iteracion:reiniciar`
- `set REGINSA_POOL_TARGET=600`
- `set REGINSA_STRICT_VERIFY=1`
- `npm run pool:prewarm`
- `npm run test:01:scale -- --workers=6 --repeat-each=10 --project=chromium`

PowerShell:

- `npm run iteracion:reiniciar`
- `$env:REGINSA_POOL_TARGET="600"`
- `$env:REGINSA_STRICT_VERIFY="1"`
- `npm run pool:prewarm`
- `npm run test:01:scale -- --workers=6 --repeat-each=10 --project=chromium`
