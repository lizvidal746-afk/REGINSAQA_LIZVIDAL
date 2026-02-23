# PLAN DE REFACTORIZACIÓN

## Estrategia de migración sin romper tests

- Modelo: **Strangler Pattern** sobre test automation.
- Regla: nunca mover todo de una vez; migración incremental con doble ruta temporal.

## Backlog priorizado

| Prioridad | Tarea | Impacto | Archivos afectados |
|-----------|-------|---------|--------------------|

| Alta | Centralizar configuración en `core/config` y `.env.example` | Consistencia runtime/CI | `core/config/env.ts`, `.env.example`, `playwright.config.ts` |
| Alta | Hardening de guardado Caso 02 por señales de persistencia | Reduce falsos positivos/flakies | `tests/casos-prueba/02-registrar-sancion.spec.ts` |
| Alta | Validación de pool de credenciales por slots | Escalamiento confiable 8 workers | `tests/utilidades/reginsa-actions.ts`, `core/security/secret-manager.ts` |
| Alta | Crear pipelines enterprise parametrizables | Operación multi-entorno | `pipelines/github-actions/*`, `pipelines/azure/*`, `pipelines/jenkins/*` |
| Media | Introducir POM + Service Layer para Caso 01 y 02 | Mantenibilidad | `core/services/*`, `tests/functional/*` |
| Media | Integrar DAST (ZAP) en pipeline | Seguridad continua | `tests/security/zap/*`, `package.json`, pipelines |
| Media | Estandarizar performance k6 | Capacidad y SLO | `tests/performance/k6/*`, `package.json` |
| Baja | Consolidar documentación institucional mínima | Transferencia operativa | `docs/*.md` |
| Baja | Retirar carpeta `playwrigth/` tras cierre de migración | Evita duplicidad | Árbol `playwrigth/*` |

## Fases

### Fase A (0-2 semanas)

- Config core + seguridad de secretos.
- Fixes flakies críticos (Caso 01/02).
- Pipeline GitHub enterprise base.

### Fase B (2-4 semanas)

- Migración funcional a `tests/functional` por dominio.
- Smoke/regression formal.
- Métricas de estabilidad y tiempo medio por suite.

### Fase C (4-6 semanas)

- Performance y security gates obligatorios.
- Homologación Azure/Jenkins.
- Cierre de legado y limpieza final.

## Criterios de aceptación

- Tasa de éxito funcional >= 98% en corrida repetida.
- Cero secretos en código fuente.
- Suites ejecutables por parámetros (`workers`, `headless`, `environment`, `registros`).
- Evidencias y reportes publicables por pipeline.
