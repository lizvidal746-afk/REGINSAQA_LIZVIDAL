# API_TEST Postman

Colecciones API enfocadas en reglas de negocio y contratos backend para casos 01, 02, 03 y 04.

## Contenido

- `reginsa-caso01-api-test.collection.json`
- `reginsa-caso02-api-test.collection.json`
- `reginsa-caso03-api-test.collection.json`
- `reginsa-caso04-api-test.collection.json`
- `reginsa-caso01-api-test.environment.json`
- `GUIA_POSTMAN_OWASP_PRO.md`

## Documentacion completa (separada por dominio)

- Postman/Newman: `docs/GUIA_POSTMAN_NEWMAN_CASOS_01_04.md`
- OWASP ZAP: `docs/GUIA_OWASP_ZAP_REGINSA.md`

## Cobertura

### Caso 01

1. Login y obtencion de token automatica.
2. Alta de entidad.
3. Validacion RUC duplicado.
4. Validacion razon social duplicada.

### Caso 02

1. Login automatico.
2. Infraccion/Listar.
3. CabeceraInfraccionSancion/Crear.
4. MedidaCorrectiva/Crear.
5. DetalleInfraccionSancion/Crear.

### Caso 03

1. Login automatico.
2. CabeceraInfraccionSancion/Listar (sin sanciones).
3. Reconsideracion/GuardarCabecera.
4. DetalleInfraccionSancion/Listar.

### Caso 04

1. Login automatico.
2. DetalleInfraccionSancion/Listar (con sanciones).
3. DetalleInfraccionSancion/ActualizarReconsideracion.
4. DetalleInfraccionSancion/Confirmar.

## Ejecucion con npm + Newman

```powershell
npm run api:test:caso01
npm run api:test:caso02
npm run api:test:caso03
npm run api:test:caso04
npm run api:test:all
```

## Pre requisitos

1. Completar `usuario` y `contrasena` en `reginsa-caso01-api-test.environment.json`.
2. Conectividad a `base_api` de QA.
3. Conexion a internet para `npx` (descarga efimera de `newman` en la primera ejecucion).

## Reportes

- Consola: reporter `cli`.
- JUnit XML: `reportes/newman/caso0X-api-test.xml`.

## Nota

Las colecciones Postman cubren pruebas funcionales y reglas de negocio.
La estrategia de seguridad DAST con OWASP se documenta por separado en `docs/GUIA_OWASP_ZAP_REGINSA.md`.
