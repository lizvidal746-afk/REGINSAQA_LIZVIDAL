# Estrategia QA para REGINSA

## 1. Objetivo

Establecer una estrategia de pruebas confiable, mantenible y auditable para cambios funcionales, no funcionales y de seguridad.

## 2. Pirámide de pruebas

- Unit tests: validación rápida de reglas aisladas.
- Integration tests: contratos y flujos entre componentes.
- E2E Playwright: validación de negocio extremo a extremo.
- Performance K6: comportamiento bajo carga y estrés.

## 3. Criterios de actualización de pruebas

Actualizar pruebas cuando exista:

- Cambio de lógica en PR.
- Nuevo requerimiento.
- Refactorización.
- Hallazgo de bug en producción.

## 4. Cobertura mínima recomendada

- Casos críticos de negocio priorizados.
- Flujos de alta frecuencia de uso.
- Flujos con riesgo regulatorio o reputacional.
- Escenarios negativos y validaciones de input.

## 5. Criterios anti-flakiness

- No usar sleep.
- No depender del orden de ejecución.
- Usar datos por test.
- Aislar usuarios/sesiones por escenario cuando aplique.
- Configurar reintentos solo en fallos transitorios comprobados.

## 6. Trazabilidad

Cada caso debe registrar:

- Id de requerimiento o incidencia.
- Escenario y resultado esperado.
- Evidencia de ejecución.
- Estado de riesgo.

## 7. Criterio de salida por release

- Sin fallos críticos abiertos.
- Quality Gate aprobado.
- Performance dentro de umbrales.
- Hallazgos de seguridad críticos mitigados o con plan aceptado.
