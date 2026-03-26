# Matriz de Cobertura Institucional (Playwright + Postman/Newman + k6)

## Objetivo

Evitar duplicidad de esfuerzo, ordenar responsabilidades por herramienta y asegurar cobertura funcional, de negocio, seguridad y rendimiento.

## Principio rector

- Playwright valida experiencia y flujo de negocio en UI.
- Postman/Newman valida contratos y reglas de negocio en API.
- k6 valida comportamiento no funcional (carga, concurrencia, estabilidad).

## Matriz por tipo de prueba

| Tipo de validacion | Playwright | Postman/Newman | k6 | Fuente de verdad |
|--------------------|------------|----------------|----|------------------|

| Flujo E2E UI (login, navegacion, formulario) | Si (principal) | No | No | Frontend + Backend |
| Reglas de negocio visibles en UI | Si | Si (obligatorio en API) | No | Backend |
| Contrato API (request/response) | No | Si (principal) | Parcial | Backend/API spec |
| Casos negativos de API (campos obligatorios, estados invalidos) | No | Si (principal) | No | Backend |
| Coherencia Frontend vs Backend | Si (deteccion) | Si (confirmacion) | No | Backend |
| Seguridad DAST (headers, exposicion, rutas) | No | Parcial | No | ZAP |
| Seguridad logica de negocio por API | Parcial | Si (principal) | Parcial | Backend |
| Rendimiento de endpoints | No | No | Si (principal) | Backend + infraestructura |
| Concurrencia masiva y race conditions | No | No | Si (principal) | Backend + base de datos |
| Evidencia visual para comite | Si | Parcial | No | QA |

## Asignacion recomendada por caso REGINSA

| Caso | Playwright | Postman/Newman | k6 |
|------|------------|----------------|----|

| Caso 01 Agregar administrado | Flujo UI completo + validaciones visuales | Contrato de alta + negativas | Carga de altas y unicidad |
| Caso 02 Registrar sancion | Flujo UI + validacion de campos y detalle | Reglas obligatorias (sancion/infraccion) + negativas + idempotencia | Carga y concurrencia de registro |
| Caso 03 Reconsiderar sin sanciones | Flujo UI + transicion de estados | Contrato de transicion + autorizacion por rol | Carga de transiciones |
| Caso 04 Reconsiderar con sanciones | Flujo UI + consistencia entre tabs | Contrato de detalle y negocio + negativas | Carga con concurrencia y consistencia |

## Politica anti-duplicidad

- No repetir en Playwright lo que ya esta cubierto por contrato API en Newman, salvo validaciones visuales o de UX.
- No usar k6 para validar reglas de negocio complejas; usar k6 para resistencia y estabilidad.
- Toda regla de negocio critica debe tener:
  1) evidencia UI (Playwright) y
  2) evidencia API negativa (Postman/Newman).

## Ejecucion por periodicidad

| Etapa | Playwright | Postman/Newman | k6 |
|-------|------------|----------------|----|

| PR | Smoke UI critico | Contratos criticos + negativas esenciales | No |
| Nightly | Regresion funcional priorizada | Regresion API completa | Smoke/perf corto |
| Weekly | Flujos completos + validaciones especiales | Suite negativa ampliada + abuso de negocio | Stress y concurrencia por packs |
| Release | Suite aprobacion y evidencia final | Contratos + negativas bloqueantes | Baseline de capacidad |

## Criterios de salida (gates)

- Bloqueante: violacion de regla de negocio en backend/API.
- Bloqueante: falla de contrato en endpoint critico.
- Bloqueante: error de concurrencia reproducible (deadlock no controlado).
- Advertencia: degradacion no bloqueante de rendimiento.

## KPI minimos

- Porcentaje de reglas criticas con prueba API negativa.
- Tasa de falla por regla de negocio en backend.
- MTTR por severidad.
- Reincidencia de hallazgos por tipo.
