# Guía operativa: Casos funcionales 02/03/04 + K6

## 1) Pipeline funcional self-hosted (casos 02/03/04)

Workflow:

- `.github/workflows/reginsa-funcional-selfhosted.yml`

Input clave nuevo:

- `case_target`: `caso01|caso02|caso03|caso04|suite_01_04`

Configuración recomendada por caso (estable):

- `workers=4`
- `repeat_each=10`
- `pool_target=1200`
- `case_target=caso02` (o `caso03` / `caso04`)
- `install_browser=false`
- `prepare_data=false` (en casos 02-04 normalmente no aplica prewarm del caso 01)
- `generate_reports=false`
- `pw_retries=1`
- `minimal_evidence=false`
- `install_dependencies=true`
- `evaluate_outcomes=true`
- `upload_artifacts=true`
- `gate_mode=strict`
- `max_failed_allowed=0`

Pool de usuarios recomendado para paralelismo estable:

- Configurar `REGINSA_USER_1..8` y `REGINSA_PASS_1..8` en Secrets/.env.

Para modo tolerante en campañas largas:

- `gate_mode=tolerant`
- `max_failed_allowed=1`

## 2) Scripts funcionales locales

`package.json` incluye:

- `test:02`
- `test:03`
- `test:04`
- `test:functional:suite`

Ejemplos:

```bash
npm run test:02 -- --workers=2 --repeat-each=5 --project=chromium
npm run test:03 -- --workers=2 --repeat-each=5 --project=chromium
npm run test:04 -- --workers=2 --repeat-each=5 --project=chromium

Modo demo (abre reportes automáticamente como Caso 01):

```bash
npm run test:02:demo -- --headed
npm run test:03:demo -- --headed
npm run test:04:demo -- --headed
```

## 3) K6 por caso (self-hosted)

Workflow:

- `.github/workflows/reginsa-performance-selfhosted.yml`

Inputs:

- `scenario`: `caso02|caso03|caso04`
- `vus`
- `duration`
- `upload_artifacts`

Scripts K6:

- `docs/plantillas/k6_caso_02_registrar_sancion.js`
- `docs/plantillas/k6_caso_03_reconsiderar_sin_sanciones.js`
- `docs/plantillas/k6_caso_04_reconsiderar_con_sanciones.js`

Variables recomendadas en Secrets/Variables:

- `REGINSA_URL`
- `K6_AUTH_HEADER` (si API requiere token Bearer)

Variables opcionales por endpoint (según API real):

- Caso 02:
  - `K6_CASO02_LISTAR_INFRACCION`
  - `K6_CASO02_CREAR_CABECERA`
  - `K6_CASO02_CREAR_MEDIDA`
  - `K6_CASO02_CREAR_DETALLE`
- Caso 03:
  - `K6_CASO03_LISTAR_CABECERA`
  - `K6_CASO03_GUARDAR_RECONSIDERACION`
  - `K6_CASO03_LISTAR_DETALLE`
- Caso 04:
  - `K6_CASO04_LISTAR_DETALLE`
  - `K6_CASO04_ACTUALIZAR_RECONSIDERACION`
  - `K6_CASO04_CONFIRMAR_DETALLE`

## 4) Criterio de escalado (antes de OWASP/Sonar)

1. Estabilizar funcional 02/03/04 con `gate_mode=strict` en smoke.
2. Ejecutar campañas controladas con `gate_mode=tolerant` solo para volumen.
3. Ajustar payloads/endpoints K6 con las APIs reales del entorno.
4. Recién después habilitar fase OWASP y SonarQube en pipeline de gobierno.
