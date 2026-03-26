# Cobertura por Endpoint - Postman Caso 04

## Estado actual de cobertura (coleccion Caso 04)

| Item Postman | Endpoint | Metodo | Validacion actual | Estado |
| --- | --- | --- | --- | --- |
| 1) Auth/Login | /Auth/Login | POST | Status 200/201, token presente, auth_header seteado | Cubierto |
| 2) DetalleInfraccionSancion/Listar | /DetalleInfraccionSancion/Listar | POST | Status 200, listado con datos, setea detalle_id | Cubierto |
| 3) DetalleInfraccionSancion/ActualizarReconsideracion | /DetalleInfraccionSancion/ActualizarReconsideracion | POST | Status 200/201 y bSuccess no falso | Cubierto |
| 4) DetalleInfraccionSancion/Confirmar | /DetalleInfraccionSancion/Confirmar | POST | Status 200/201 y bSuccess no falso | Cubierto |

## Cobertura de reglas de negocio lograda

- Flujo de reconsideracion con sanciones: listar, actualizar y confirmar.
- Trazabilidad por detalle_id capturado del listado.
- Confirmacion funcional basica de respuestas exitosas.

## Brechas para criterio "Listo para comite"

| Brecha | Impacto | Recomendacion |
| --- | --- | --- |
| Falta negativa de auth | Sin evidencia robusta de rechazo de acceso | Agregar pruebas de token ausente/invalido/expirado |
| Falta negativa de detalle inexistente | Riesgo de actualizar/confirmar IDs invalidos | Agregar caso con idDetalleInfraccionSancion no existente |
| Falta negativa de confirmacion sin actualizar | Riesgo de saltar precondiciones del flujo | Agregar test de confirmacion sin paso previo |
| Falta validacion de idempotencia en confirmar | Riesgo de doble confirmacion no controlada | Agregar reintento de confirmar y validar comportamiento esperado |

## Criterio propuesto de cierre Caso 04 API

1. Flujo actual en verde (4 endpoints).
2. Negativas de auth + detalle inexistente + precondicion + idempotencia.
3. Evidencia XML + JSON en `reportes/newman/caso04`.
4. Consolidacion en reporte provisional institucional.

## Referencias del proyecto

- Coleccion: API_TEST/postman/reginsa-caso04-api-test.collection.json
- Environment: API_TEST/postman/reginsa-caso04-api-test.environment.json
- Ejecucion autoauth: scripts/postman/run-postman-autoauth.ps1
