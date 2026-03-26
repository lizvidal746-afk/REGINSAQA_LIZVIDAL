# Cobertura por Endpoint - Postman Caso 02

## Estado actual de cobertura (coleccion Caso 02)

| Item Postman | Endpoint | Metodo | Validacion actual | Estado |
| --- | --- | --- | --- | --- |
| 1) Auth/Login | /Auth/Login | POST | Status 200/201 y token presente; setea token/auth_header | Cubierto |
| 2) Infraccion/Listar | /Infraccion/Listar | POST | Status 200, lista no vacia, setea id_infraccion/display_infraccion | Cubierto |
| 3) CabeceraInfraccionSancion/Crear | /CabeceraInfraccionSancion/Crear | POST | Status 200/201 y cabecera_id presente | Cubierto |
| 4) MedidaCorrectiva/Crear | /MedidaCorrectiva/Crear | POST | Status 200/201 | Cubierto |
| 5) DetalleInfraccionSancion/Crear | /DetalleInfraccionSancion/Crear | POST | Status 200/201 y bSuccess no falso | Cubierto |

## Cobertura de reglas de negocio lograda

- Flujo API sancionador completo (cabecera, medida y detalle).
- Dependencia por RIS/infraccion controlada.
- Relacion entre entidades de flujo mantenida con variables de coleccion.

## Brechas para criterio "Listo para comite"

| Brecha | Impacto | Recomendacion |
| --- | --- | --- |
| Falta negativa de auth (sin token, token invalido, token expirado) | No evidencia de endurecimiento de acceso | Agregar 3 pruebas de autorizacion negativas |
| Falta negativa de obligatoriedad (cabecera sin campos criticos) | Riesgo de aceptar datos incompletos | Agregar casos 400/422 por payload incompleto |
| Falta validacion de limites de negocio (cantidad de sanciones por registro) | Riesgo de inconsistencia con regla de dominio | Agregar test negativo de limite maximo esperado |
| Falta idempotencia/reintento en crear detalle | Riesgo de duplicidad por reenvio | Agregar caso de reintento controlado con mismo payload |
| Falta asercion de esquema de respuesta | Riesgo de regresion silenciosa de contrato | Incluir checks de campos minimos en JSON |

## Criterio propuesto de cierre Caso 02 API

1. Flujo actual en verde (5 endpoints).
2. Negativas obligatorias: auth, payload incompleto, limites de negocio e idempotencia.
3. Evidencia XML + JSON en `reportes/newman/caso02`.
4. Resultado consolidado en reporte provisional institucional.

## Referencias del proyecto

- Coleccion: API_TEST/postman/reginsa-caso02-api-test.collection.json
- Environment: API_TEST/postman/reginsa-caso02-api-test.environment.json
- Ejecucion autoauth: scripts/postman/run-postman-autoauth.ps1
