# Cobertura por Endpoint - Postman Caso 03

## Estado actual de cobertura (coleccion Caso 03)

| Item Postman | Endpoint | Metodo | Validacion actual | Estado |
| --- | --- | --- | --- | --- |
| 1) Auth/Login | /Auth/Login | POST | Status 200/201, token presente y auth_header seteado | Cubierto |
| 2) CabeceraInfraccionSancion/Listar | /CabeceraInfraccionSancion/Listar | POST | Status 200, listado con datos, setea cabecera_id | Cubierto |
| 3) Reconsideracion/GuardarCabecera | /Reconsideracion/GuardarCabecera | POST | Status 200/201 y bSuccess no falso | Cubierto |
| 4) DetalleInfraccionSancion/Listar | /DetalleInfraccionSancion/Listar | POST | Status 200 y respuesta controlada | Cubierto |

## Cobertura de reglas de negocio lograda

- Flujo API de reconsideracion sin sanciones completo.
- Seleccion de cabecera elegible previa a guardar.
- Verificacion posterior de detalle/listado para consistencia basica.

## Brechas para criterio "Listo para comite"

| Brecha | Impacto | Recomendacion |
| --- | --- | --- |
| Falta negativa de auth | Sin evidencia de rechazo por acceso invalido | Agregar pruebas de token ausente/invalido/expirado |
| Falta negativa de elegibilidad de cabecera | Riesgo de reconsiderar cabeceras no aptas | Agregar caso con cabecera no elegible y validar rechazo |
| Falta validacion de transicion de estado invalida | Riesgo de inconsistencia de workflow | Agregar caso de transicion no permitida |
| Falta aserciones de contrato en detalle | Riesgo de romper consumidores API | Agregar checks de campos minimos esperados |

## Criterio propuesto de cierre Caso 03 API

1. Flujo actual en verde (4 endpoints).
2. Negativas de auth + elegibilidad + transiciones invalidas.
3. Evidencia XML + JSON en `reportes/newman/caso03`.
4. Consolidacion en reporte provisional institucional.

## Referencias del proyecto

- Coleccion: API_TEST/postman/reginsa-caso03-api-test.collection.json
- Environment: API_TEST/postman/reginsa-caso03-api-test.environment.json
- Ejecucion autoauth: scripts/postman/run-postman-autoauth.ps1
