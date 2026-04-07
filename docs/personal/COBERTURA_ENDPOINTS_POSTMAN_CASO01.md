# Cobertura por Endpoint - Postman Caso 01

## Estado actual de cobertura (coleccion Caso 01)

| Item Postman | Endpoint | Metodo | Validacion actual | Estado |
| -------------- | ---------- | -------- | ------------------- | -------- |

| 1) Auth/Login | /Auth/Login | POST | Status 200/201 y token presente; guarda token/auth_header para siguientes requests | Cubierto |
| 2) Entidad/Crear - Exito | /Entidad/Crear | POST | Status 200/201/409 y control de exito (bSuccess) o conflicto esperado | Cubierto |
| 3) Entidad/Crear - RUC duplicado | /Entidad/Crear | POST | Verifica status controlado y mensaje/estado de duplicidad por RUC | Cubierto |
| 4) Entidad/Crear - Razon social duplicada | /Entidad/Crear | POST | Verifica status controlado y mensaje/estado de duplicidad por razon social | Cubierto |

## Cobertura de reglas de negocio lograda

- Login funcional con token reutilizable.
- Alta de entidad valida.
- Reglas de unicidad para RUC.
- Reglas de unicidad para razon social.

## Brechas para criterio "Listo para comite"

| Brecha | Impacto | Recomendacion |
| -------- | --------- | --------------- |

| Falta caso negativo de autorizacion (token ausente/invalido/expirado) | No evidencia de control de acceso robusto | Agregar 3 requests negativas de auth en la misma coleccion |
| Falta validacion de campos obligatorios (payload incompleto) | Riesgo de aceptar datos invalidos | Agregar casos 400/422 por campos obligatorios |
| Falta validacion de formato (RUC longitud/caracteres) | Riesgo de inconsistencia de datos | Agregar matriz de formato con data-driven |
| Falta idempotencia/reintento controlado | Riesgo de duplicidad por reenvio | Agregar prueba de reintento con mismo payload y correlacion |
| Falta asercion de esquema minimo de respuesta | Posibles regresiones silenciosas | Agregar checks de contrato JSON basico en tests |
| Falta evidencia de performance API basica del endpoint | Sin linea base para degradaciones | Medir tiempos de respuesta en Newman y fijar umbrales iniciales |

## Criterio propuesto de cierre Caso 01 API

Se considera "Listo para comite" cuando:

1. Todas las pruebas actuales pasan (exito + duplicidad).
2. Se agregan al menos 5 negativas: auth ausente, auth invalido, payload incompleto, RUC invalido, idempotencia.
3. Reporte Newman genera XML + JSON y evidencia reproducible en `reportes/newman`.
4. Resultado se consolida en reporte provisional de seguridad/calidad.

## Referencias del proyecto

- Coleccion: API_TEST/postman/reginsa-caso01-api-test.collection.json
- Environment: API_TEST/postman/reginsa-caso01-api-test.environment.json
- Ejecucion unificada autoauth: scripts/postman/run-postman-autoauth.ps1
