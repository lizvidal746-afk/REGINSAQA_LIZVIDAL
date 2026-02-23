# FRAMEWORK CORE DESIGN (CLEAN)

## 1) Objetivo

Diseñar un framework QA enterprise reusable para entidades públicas, desacoplando core técnico, capas de prueba y ejecución DevOps.

## 2) Estructura objetivo

```text
/core
  /config
  /drivers
  /services
  /utils
  /security
/tests
  /functional
  /regression
  /smoke
  /performance
  /security
/data
/reports
/pipelines
```

## 3) Principios SOLID aplicados

- **S**: cada módulo tiene responsabilidad única (`core/config`, `core/security`, etc.).
- **O**: nuevas suites o drivers se agregan sin modificar el núcleo.
- **L**: adaptadores de navegador/API intercambiables.
- **I**: contratos separados por capa (UI, API, seguridad, performance).
- **D**: specs dependen de servicios/core, no de detalles de framework.

## 4) Capas

### 4.1 Driver Layer

- Encapsula Playwright y clientes HTTP.
- Controla timeouts, tracing, screenshots y políticas de retry.

### 4.2 Service Layer

- Casos de uso de negocio (registrar administrado, registrar sanción, reconsiderar).
- Reglas de verificación de persistencia (UI + API).

### 4.3 Test Layer

- Specs minimalistas por intención (`smoke`, `functional`, `regression`).
- Sin lógica compleja incrustada en test body.

## 5) Patrón POM

- Page Objects por módulo funcional:
  - `InfractorSancionPage`
  - `AdministradoPage`
  - `ReconsideracionPage`
- Métodos atómicos y semánticos: `openForm()`, `fillBasicData()`, `saveAndVerify()`.

## 6) Manejo de datos de prueba

- Separar `data/seeds`, `data/factories`, `data/contracts`.
- Reglas anti-colisión para RUC/razón social.
- Trazabilidad por `runId`, `workerIndex`, `suiteType`.

## 7) Estrategia de paralelismo

- Pool de credenciales por slots (`REGINSA_USER_1..8`).
- Asignación determinística: `workerIndex % availableSlots`.
- Validación previa de slots y telemetría de asignación.
- Política por suite:
  - smoke: 1-2 workers
  - functional: 2-5 workers
  - regression: 4-8 workers
  - performance/security: runner dedicado

## 8) Seguridad OWASP

- Secret management por variables de entorno y vault del pipeline.
- DAST baseline con OWASP ZAP.
- Bloqueo de credenciales hardcoded en PR checks.

## 9) Performance (k6)

- Scripts en `tests/performance/k6` parametrizados por:
  - VUs
  - iteraciones
  - duración
- Integración de reporte JSON para trend analysis.

## 10) Compatibilidad y migración

- Mantener `tests/casos-prueba` operativo durante transición.
- Migrar caso por caso a `tests/functional/<dominio>`.
- Criterio de salida: no degradar tasas de éxito ni tiempo total.
