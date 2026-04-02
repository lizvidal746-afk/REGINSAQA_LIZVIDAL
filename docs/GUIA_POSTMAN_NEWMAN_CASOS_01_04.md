# GUIA POSTMAN + NEWMAN Casos 01-04

Documento exclusivo para API functional testing con Postman y Newman.

Nota operativa:

- Los scripts `api:test:*` usan `npx` con `newman`, por lo que no requieren `newman` en `devDependencies`.

Documentos relacionados (separados):

- `docs/GUIA_OWASP_ZAP_REGINSA.md`
- `docs/GUIA_SONARQUBE_REGINSA.md`

## 1. Alcance

- Caso 01: Entidad/Crear y validaciones de duplicidad.
- Caso 02: Registro de sancion (infraccion, cabecera, medida, detalle).
- Caso 03: Reconsideracion sin sanciones.
- Caso 04: Reconsideracion con sanciones.

## 2. Archivos

- `API_TEST/postman/reginsa-caso01-api-test.collection.json`
- `API_TEST/postman/reginsa-caso02-api-test.collection.json`
- `API_TEST/postman/reginsa-caso03-api-test.collection.json`
- `API_TEST/postman/reginsa-caso04-api-test.collection.json`
- `API_TEST/postman/reginsa-caso01-api-test.environment.json`

## 3. Importacion en Postman

1. Abrir `Import` en Postman.
2. Importar las 4 colecciones y 1 environment.
3. Seleccionar environment: `REGINSA API Test - Caso01 QA`.
4. Completar `base_api`, `usuario`, `contrasena`.

## 4. Variables y uso

Variables de environment:

- `base_api`: URL base de API.
- `usuario`: usuario QA.
- `contrasena`: password QA.
- `token`: token extraido de login.
- `auth_header`: formato `Bearer <token>`.

Variables de collection:

- Caso 01: `ruc_nuevo`, `razon_social_nueva`, `nombre_comercial_nuevo`.
- Caso 02: `id_ris`, `id_entidad`, `cabecera_id`, `id_infraccion`, `display_infraccion`.
- Caso 03: `cabecera_id`.
- Caso 04: `detalle_id`.

## 5. Flujos de ejecucion (Runner)

1. Ejecutar coleccion por caso.
2. Verificar `Test Results`.
3. Confirmar reglas de negocio en assertions.
4. Guardar evidencia (capturas, export run si aplica).

## 6. Reglas de negocio y exito

## Caso 01

- No duplicar RUC.
- No duplicar razon social.
- Exito: alta valida o rechazo controlado de duplicidad.

## Caso 02

- RIS debe listar infracciones validas.
- Cabecera valida antes de medida/detalle.
- Exito: flujo completo con respuestas 200/201 y `bSuccess != false`.

## Caso 03

- Cabecera elegible para reconsideracion sin sanciones.
- Endpoint alineado a Swagger QA: `POST /api/CabeceraInfraccionSancion/ListarPaginado`.
- Exito: guardar reconsideracion y listar detalle sin error funcional.

## Caso 04

- Detalle con sanciones existente.
- Endpoint alineado a Swagger QA: `POST /api/DetalleInfraccionSancion/ListarPaginado`.
- Actualizar reconsideracion antes de confirmar.
- Exito: actualizar + confirmar con 200/201 y `bSuccess != false`.

## 7. Ejecucion Newman

```powershell
npm run api:test:caso01
npm run api:test:caso02
npm run api:test:caso03
npm run api:test:caso04
npm run api:test:all
```

Resultados:

- `reportes/newman/caso01-api-test.xml`
- `reportes/newman/caso02-api-test.xml`
- `reportes/newman/caso03-api-test.xml`
- `reportes/newman/caso04-api-test.xml`

## 8. Evidencia para Jira/Confluence

1. Endpoint y request body usado.
2. Respuesta real y status code.
3. Assertion que valida regla de negocio.
4. XML Newman del caso.
5. Conclusiones y criterio de cierre.

## 9. Estandar de documentacion dentro de Postman

Todas las colecciones y requests usan el mismo formato de descripcion:

- `Objetivo: ... | Reglas: ... | Exito: ... | Evidencia: ...`

Uso recomendado:

1. `Objetivo`: que valida ese request o flujo.
2. `Reglas`: regla de negocio o control que debe cumplirse.
3. `Exito`: condicion de aprobacion (status y/o campos esperados).
4. `Evidencia`: test/variable/archivo que demuestra cumplimiento.

Este formato permite que la documentacion sea legible en Postman Runner, exportable por Newman y util en auditoria.
