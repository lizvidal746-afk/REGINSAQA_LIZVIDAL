# Guía K6 Caso 02: perfiles, campañas y reporte automático

## Variables base (una sola vez por sesión)

```powershell
$env:K6_CLOUD_TOKEN="TU_TOKEN_GRAFANA"
$env:K6_CLOUD_PROJECT_ID="6803756"
$env:BASE_API="https://reginsaapiqa.sunedu.gob.pe/api"
$env:TOKEN1="Bearer TU_TOKEN_REGINSA"
```

> Si no usas `TOKEN1`, puedes usar `TOKEN` o `TOKEN2` según tu configuración.

## Pack 1: smoke / burst medio / burst alto (3 / 10 / 50)

### Smoke 3

```powershell
k6 run -o cloud tests/performance/k6/k6_caso_02_registrar_sancion.js `
  --tag test_type=smoke --tag profile=baseline --tag case=caso02 --tag mode=no-burst --tag size=3 `
  --env BASE_API=$env:BASE_API --env TOKEN1=$env:TOKEN1 --env K6_BURST_MODE=0 `
  --env K6_FIXED_VUS=1 --env K6_FIXED_ITERATIONS=3 --env K6_TOTAL_REGISTROS=3 `
  --env K6_SLEEP_SECONDS=0.8 --summary-export reportes/k6-caso02-smoke-3-summary-cloud.json

npm run k6:caso02:reporte:auto -- --summary=reportes/k6-caso02-smoke-3-summary-cloud.json --campaign=campana-caso02-1 --test-type=smoke --profile=baseline --mode=no-burst --size=3
```

### Burst medio 10

```powershell
k6 run -o cloud tests/performance/k6/k6_caso_02_registrar_sancion.js `
  --tag test_type=burst --tag profile=soft-10 --tag case=caso02 --tag mode=burst --tag size=10 `
  --env BASE_API=$env:BASE_API --env TOKEN1=$env:TOKEN1 --env K6_BURST_MODE=1 `
  --env K6_FIXED_VUS=2 --env K6_BURST_ITER_PER_VU=5 --env K6_FIXED_ITERATIONS=10 --env K6_TOTAL_REGISTROS=10 `
  --env K6_SLEEP_SECONDS=0.2 --summary-export reportes/k6-caso02-burst-10-summary-cloud.json

npm run k6:caso02:reporte:auto -- --summary=reportes/k6-caso02-burst-10-summary-cloud.json --campaign=campana-caso02-1 --test-type=burst --profile=soft-10 --mode=burst --size=10
```

### Burst alto 50

```powershell
k6 run -o cloud tests/performance/k6/k6_caso_02_registrar_sancion.js `
  --tag test_type=burst --tag profile=medium-50 --tag case=caso02 --tag mode=burst --tag size=50 `
  --env BASE_API=$env:BASE_API --env TOKEN1=$env:TOKEN1 --env K6_BURST_MODE=1 `
  --env K6_FIXED_VUS=5 --env K6_BURST_ITER_PER_VU=10 --env K6_FIXED_ITERATIONS=50 --env K6_TOTAL_REGISTROS=50 `
  --env K6_SLEEP_SECONDS=0.1 --summary-export reportes/k6-caso02-burst-50-summary-cloud.json

npm run k6:caso02:reporte:auto -- --summary=reportes/k6-caso02-burst-50-summary-cloud.json --campaign=campana-caso02-1 --test-type=burst --profile=medium-50 --mode=burst --size=50
```

## Pack 2: smoke / burst medio / burst alto (20 / 100 / 200)

- Smoke: `VUS=1`, `ITER=20`, `sleep=0.5`
- Burst medio: `VUS=5`, `ITER/VU=20` (`100` total), `sleep=0.1`
- Burst alto: `VUS=8`, `ITER/VU=25` (`200` total), `sleep=0.1`

## Pack 3: smoke / burst medio / burst alto (20 / 500 / 1000)

- Smoke: `VUS=1`, `ITER=20`, `sleep=0.5`
- Burst medio: `VUS=10`, `ITER/VU=50` (`500` total), `sleep=0.1`
- Burst alto: `VUS=20`, `ITER/VU=50` (`1000` total), `sleep=0.05`

## Dónde quedan los reportes ejecutivos

- Carpeta base: `reportes/ejecutivo/k6-caso02/`
- Por campaña: `reportes/ejecutivo/k6-caso02/<campaign>/`
- Índice de campaña: `reportes/ejecutivo/k6-caso02/<campaign>/index.md`

## Pipeline (self-hosted)

Pipelines recomendados:

- Azure DevOps: `pipelines/azure/azure-pipelines-enterprise.yml` (usar stage k6)
- Jenkins: `pipelines/jenkins/Jenkinsfile` con `TEST_TYPE=performance`

Nuevos inputs útiles:

- `burst_mode`
- `burst_iter_per_vu`
- `report_test_type`
- `report_profile`
- `report_case`
- `report_mode` (`auto` recomendado)
- `report_size`
- `report_campaign`

> El pipeline ya genera reporte ejecutivo automático de caso 02 al finalizar.
