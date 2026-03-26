# GUIA K6 OPERACIONES API (ON-DEMAND)

Objetivo: ejecutar pruebas k6 por operacion API especifica sin romper los casos oficiales 01-04.

## Principio de arquitectura

- Casos oficiales de negocio: 01, 02, 03, 04 (tablero ejecutivo).
- Operaciones API on-demand: suite tecnica para solicitudes puntuales (buscar, eliminar, limpiar, ocultar, etc.).
- Reuso de autenticacion: pool de usuarios REGINSA_USER_1..8 / REGINSA_PASS_1..8.

## Operaciones catalogadas iniciales

Fuente base: colecciones Postman + observaciones operativas de seguridad.

- create_entidad: POST /Entidad/Crear
- search_cabecera: POST /CabeceraInfraccionSancion/Listar
- search_detalle: POST /DetalleInfraccionSancion/Listar
- update_reconsideracion: POST /DetalleInfraccionSancion/ActualizarReconsideracion
- confirm_reconsideracion: POST /DetalleInfraccionSancion/Confirmar
- delete_generic: configurable por K6_OP_PATH (placeholder para Eliminar)
- hide_generic: configurable por K6_OP_PATH (placeholder para Ocultar)
- clean_generic: configurable por K6_OP_PATH (placeholder para Limpiar)

## Comandos

Local:

- npm run k6:op -- --op=search_cabecera --cantidad=20 --slot=1
- npm run k6:op -- --op=delete_generic --method=DELETE --path=/Entidad/Eliminar --cantidad=10 --slot=2
- npm run k6:op -- --op=clean_generic --method=POST --path=/Entidad/Limpiar --body='{"idEntidad":123}' --cantidad=10 --slot=3

Grafana Cloud:

- npm run k6:op:grafana -- --op=search_detalle --cantidad=30 --slot=4 --project=6803756 --token=TU_TOKEN_GRAFANA

## Resultado real obligatorio en reporte

La suite registra y expone status reales por contador:

- status_200_total
- status_201_total
- status_400_total
- status_401_total
- status_403_total
- status_404_total
- status_409_total
- status_429_total
- status_5xx_total
- status_other_total

Y ademas:

- op_ok_rate
- op_latency_ms
- http_req_duration (p95)

## Recomendacion de gobernanza

- Mantener 01-04 como KPI institucional.
- Registrar nuevas APIs puntuales en esta guia antes de promoverlas a caso oficial.
- Definir para cada operacion: owner, payload minimo, status esperados, threshold por perfil (smoke/fast/stress).
