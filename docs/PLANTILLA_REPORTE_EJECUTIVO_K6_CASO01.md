# Plantilla Ejecutiva K6 Caso 01 (1 página)

## 1) Datos de corrida

- Fecha/Hora:
- Responsable:
- Entorno (`BASE_URL`):
- Tipo (`smoke` / `burst`):
- Perfil (`baseline`, `soft-10`, `medium-50`, etc.):
- Tamaño (`size`):
- Run URL Grafana:
- Commit/Branch:

## 2) Configuración usada

- `K6_BURST_MODE`:
- `K6_FIXED_VUS`:
- `K6_FIXED_ITERATIONS` o `K6_BURST_ITER_PER_VU`:
- `K6_TOTAL_REGISTROS`:
- `K6_SLEEP_SECONDS`:
- `K6_STRICT_UNIQUE`:
- `K6_CASO01_COMPAT_PAYLOAD`:

## 3) KPIs ejecutivos (semáforo)

- `create_business_ok_rate`:
  - Resultado:
  - Umbral: `>= 95%` smoke / `>= 70%` burst
  - Estado: 🟢 / 🟡 / 🔴
- `http_req_failed`:
  - Resultado:
  - Umbral: `< 5%` smoke / `< 20%` burst
  - Estado: 🟢 / 🟡 / 🔴
- `http_req_duration p(95)`:
  - Resultado:
  - Umbral: `< 1000ms` smoke / `< 3000ms` burst
  - Estado: 🟢 / 🟡 / 🔴
- `%429` (`http_429_total / http_reqs`):
  - Resultado:
  - Umbral: `<= 5%` smoke / `<= 30%` burst
  - Estado: 🟢 / 🟡 / 🔴
- `%5xx`:
  - Resultado:
  - Umbral: `0%` smoke / `<= 2%` burst
  - Estado: 🟢 / 🟡 / 🔴
- `create_http_409_total` (si `STRICT_UNIQUE=1`):
  - Resultado:
  - Umbral: `0`
  - Estado: 🟢 / 🔴

## 4) Evidencia de resultados

- `http_reqs`:
- `http_429_total`:
- `create_http_4xx_total`:
- `create_http_5xx_total`:
- `create_http_401_total`:
- `create_http_409_total`:
- `create_business_ok_total`:
- `checks_succeeded`:
- `thresholds` (pass/fail):

## 5) Lectura técnica breve

### Desarrollo

- ¿Hubo errores de negocio (`bSuccess=false`)?
- ¿Qué mensajes dominan? (`create_msg_*`)
- ¿Hay evidencia de validaciones funcionales fallando?

### Arquitectura

- ¿El `p95` se mantiene estable al subir perfil/tamaño?
- ¿Hay degradación abrupta entre perfiles?

### Infraestructura

- ¿Hay rate limiting alto (`429`) o saturación?
- ¿Se observan fallas de autenticación (`401/403`)?

## 6) Decisión de release / siguiente acción

- Estado final: **GO / GO con observaciones / NO-GO**
- Justificación (máximo 3 líneas):
- Acciones acordadas:

  1.
  2.
  3.

- Fecha objetivo de re-prueba:

## 7) Comparativo entre perfiles (mismo día)

- `smoke`
  - Size:
  - `p95`:
  - `http_failed`:
  - `business_ok_rate`:
  - `%429`:
  - Decisión:
- `burst-soft`
  - Size:
  - `p95`:
  - `http_failed`:
  - `business_ok_rate`:
  - `%429`:
  - Decisión:
- `burst-medium`
  - Size:
  - `p95`:
  - `http_failed`:
  - `business_ok_rate`:
  - `%429`:
  - Decisión:

## 8) Comandos base (referencia rápida)

### Terminal (igual formato actual)

```powershell
k6 run tests/performance/k6-grafana/k6_caso_01_agregar_administrado.js `
  --tag test_type=smoke `
  --tag profile=baseline `
  --tag case=caso01 `
  --tag mode=no-burst `
  --tag size=3 `
  --env BASE_URL=$env:BASE_URL `
  --env K6_AUTH_HEADER=$env:K6_AUTH_HEADER `
  --env K6_CASO01_COMPAT_PAYLOAD=1 `
  --env K6_BURST_MODE=0 `
  --env K6_FIXED_VUS=1 `
  --env K6_FIXED_ITERATIONS=3 `
  --env K6_TOTAL_REGISTROS=3 `
  --env K6_STRICT_UNIQUE=1 `
  --env K6_SLEEP_SECONDS=0.8 `
  --summary-export reportes/k6-caso01-smoke-summary-cloud.json
```

### Pipeline (self-hosted)

- Azure: `pipelines/azure/azure-pipelines-enterprise.yml` (stage k6)
- Jenkins: `pipelines/jenkins/Jenkinsfile` (`TEST_TYPE=performance`)
- Inputs de reporte habilitados:
  - `report_test_type`
  - `report_profile`
  - `report_case`
  - `report_mode` (`auto` recomendado)
  - `report_size`

> Nota: las ejecuciones siguen siendo las mismas; solo se agregó etiquetado para mejorar comparación y reporte ejecutivo.
