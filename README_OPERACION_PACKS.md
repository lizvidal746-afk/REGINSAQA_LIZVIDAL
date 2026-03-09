# Operacion Packs REGINSA

Guia rapida para ejecutar por `pack_1`, `pack_2`, `pack_3` con workflows self-hosted y mantener la logica acordada de `smoke`, `burst`, `token/auto` y `sleep`.

## 1) Workflows por caso

- Funcional Caso 01: `.github/workflows/reginsa-funcional-pro-caso01-selfhosted.yml`
- Funcional Caso 02: `.github/workflows/reginsa-funcional-pro-caso02-selfhosted.yml`
- Funcional Caso 03: `.github/workflows/reginsa-funcional-pro-caso03-selfhosted.yml`
- Funcional Caso 04: `.github/workflows/reginsa-funcional-pro-caso04-selfhosted.yml`
- K6 Caso 01: `.github/workflows/reginsa-k6-caso01-selfhosted.yml`
- K6 Caso 02: `.github/workflows/reginsa-k6-caso02-selfhosted.yml`
- K6 Caso 03: `.github/workflows/reginsa-k6-caso03-selfhosted.yml`
- K6 Caso 04: `.github/workflows/reginsa-k6-caso04-selfhosted.yml`
- Validaciones Caso 01: `.github/workflows/reginsa-validaciones-caso01-selfhosted.yml`
- Validaciones Caso 02: `.github/workflows/reginsa-validaciones-caso02-selfhosted.yml`
- Validaciones Caso 03: `.github/workflows/reginsa-validaciones-caso03-selfhosted.yml`
- Validaciones Caso 04: `.github/workflows/reginsa-validaciones-caso04-selfhosted.yml`
- Postman Caso 01: `.github/workflows/reginsa-postman-caso01-selfhosted.yml`
- Postman Caso 02: `.github/workflows/reginsa-postman-caso02-selfhosted.yml`
- Postman Caso 03: `.github/workflows/reginsa-postman-caso03-selfhosted.yml`
- Postman Caso 04: `.github/workflows/reginsa-postman-caso04-selfhosted.yml`
- Postman Todos: `.github/workflows/reginsa-postman-selfhosted.yml`
- OWASP ZAP: `.github/workflows/reginsa-owasp-selfhosted.yml`
- SonarQube: `.github/workflows/reginsa-sonarqube-selfhosted.yml`
- Quality Gate: `.github/workflows/reginsa-quality-gate-selfhosted.yml`
- Smoke Caso 01 Cloud: `.github/workflows/reginsa-smoke-caso01-cloud-selfhosted.yml`
- Smoke Caso 02 Cloud: `.github/workflows/reginsa-smoke-caso02-cloud-selfhosted.yml`
- Smoke Caso 03 Cloud: `.github/workflows/reginsa-smoke-caso03-cloud-selfhosted.yml`
- Smoke Caso 04 Cloud: `.github/workflows/reginsa-smoke-caso04-cloud-selfhosted.yml`

## 2) Reglas operativas

- `auth_mode=token` usa `k6_auth_header` (caso01,03,04) o `token1` (caso02).
- `auth_mode=auto` usa `REGINSA_USER/REGINSA_PASS` y habilita `K6_AUTO_LOGIN=1`.
- `sleep_mode=zero|min|custom` controla `K6_SLEEP_SECONDS`.
- `smoke_mode=true` fuerza un perfil conservador (baja carga, alta estabilidad).
- En K6 Caso 01 se mantiene `STRICT_UNIQUE` y dataset fresh por corrida.
- En K6 Caso 02 se mantiene la logica institucional: `1 sancion + 1 medida`, secuencia y RIS rotado.

## 3) Matriz packs Caso 01

- `pack_1`:
- Paso `1`: size `3`, vus `1`, mode `no-burst`, sleep `0.8`
- Paso `2`: size `10`, vus `2`, mode `burst`, sleep `0.8`
- Paso `3`: size `50`, vus `5`, mode `burst`, sleep `0.5`
- `pack_2`:
- Paso `1`: size `20`, vus `3`, mode `burst`, sleep `0.5`
- Paso `2`: size `100`, vus `8`, mode `burst`, sleep `0.3`
- Paso `3`: size `200`, vus `12`, mode `burst`, sleep `0.2`
- `pack_3`:
- Paso `1`: size `20`, vus `3`, mode `burst`, sleep `0.5`
- Paso `2`: size `500`, vus `20`, mode `burst`, sleep `0.1`
- Paso `3`: size `1000`, vus `30`, mode `burst`, sleep `0`

## 4) Matriz packs Caso 02

- `pack_1`:
- Paso `1`: size `3`, vus `1`, mode `no-burst`, sleep `0.8`
- Paso `2`: size `10`, vus `2`, mode `burst`, sleep `0.8`
- Paso `3`: size `50`, vus `5`, mode `burst`, sleep `0.5`
- `pack_2`:
- Paso `1`: size `20`, vus `3`, mode `burst`, sleep `0.5`
- Paso `2`: size `100`, vus `8`, mode `burst`, sleep `0.3`
- Paso `3`: size `200`, vus `12`, mode `burst`, sleep `0.2`
- `pack_3`:
- Paso `1`: size `20`, vus `3`, mode `burst`, sleep `0.5`
- Paso `2`: size `500`, vus `20`, mode `burst`, sleep `0.1`
- Paso `3`: size `1000`, vus `30`, mode `burst`, sleep `0`

## 5) Ejemplo workflow dispatch (K6 Caso 01)

- `pack=pack_2`
- `pack_step=2`
- `auth_mode=token`
- `k6_auth_header=Bearer <token>`
- `sleep_mode=min`
- `smoke_mode=false`

Resultado esperado del preset:

- `size=100`
- `vus=8`
- `burst=true`
- `sleep=0.3`

## 6) Ejemplo workflow dispatch (K6 Caso 02)

- `pack=pack_3`
- `pack_step=3`
- `auth_mode=auto`
- `sleep_mode=zero`
- `smoke_mode=false`

Resultado esperado del preset:

- `size=1000`
- `vus=30`
- `burst=true`
- `sleep=0`

## 7) Smoke funcional por caso

En workflows funcionales por caso:

- `smoke_mode=true` ejecuta variante rapida (`fast` o grep directo) con `workers=2` y `repeat-each=1`.
- `smoke_mode=false` usa modo `scale` con los parametros indicados.

## 8) Validaciones equivalentes

- Caso 01 UI validaciones: `tests/casos-prueba/01-agregar-administrado-validaciones.plantilla.spec.ts`
- Caso 02 UI validaciones: `tests/casos-prueba/02-registrar-sancion-validaciones.plantilla.spec.ts`
- Caso 03 UI validaciones: `tests/casos-prueba/03-reconsiderar-sin-sanciones-validaciones.plantilla.spec.ts`
- Caso 04 UI validaciones: `tests/casos-prueba/04-reconsiderar-con-sanciones-validaciones.plantilla.spec.ts`

Se ejecutan por workflows dedicados:

- `.github/workflows/reginsa-validaciones-caso01-selfhosted.yml`
- `.github/workflows/reginsa-validaciones-caso02-selfhosted.yml`
- `.github/workflows/reginsa-validaciones-caso03-selfhosted.yml`
- `.github/workflows/reginsa-validaciones-caso04-selfhosted.yml`

## 9) Recomendacion de operacion

- Arrancar por smoke (`smoke_mode=true`) para validar entorno.
- Luego correr pack por pasos (`1 -> 2 -> 3`) con el mismo `campaign`.
- Mantener `auth_mode=auto` en corridas largas para no depender de renovacion manual de token.
- Usar `auth_mode=token` cuando se requiera latencia minima o control manual del bearer.
