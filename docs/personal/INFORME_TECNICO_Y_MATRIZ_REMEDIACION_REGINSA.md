# Informe Tecnico y Matriz de Remediacion Semanal REGINSA

## 1. Resumen tecnico

Se identifican hallazgos en cuatro frentes:

- Seguridad dinamica (DAST).
- Integridad de reglas de negocio en API.
- Concurrencia y estabilidad transaccional.
- Gobernanza de cobertura y evidencia.

## 2. Hallazgos tecnicos priorizados

| ID | Hallazgo | Tipo | Evidencia | Impacto | Severidad | Responsable |
| ---- | ---------- | ------ | ----------- | --------- | ----------- | ------------- |

| H-001 | Regla de negocio validada en UI pero no exigida en backend | API/Negocio | Creacion por API en escenarios que UI bloquea | Integridad de datos y cumplimiento | Critica | Backend + QA API |
| H-002 | Errores 500/deadlock en concurrencia alta | Performance/Confiabilidad | Pruebas masivas con respuestas de error y registros incompletos | Disponibilidad y consistencia | Alta | Backend + DBA + DevOps |
| H-003 | Hallazgos DAST sin ciclo formal de cierre | Seguridad DAST | Resultados de escaneo con evidencia parcial | Exposicion tecnica acumulada | Alta | AppSec + Backend |
| H-004 | Duplicidad de pruebas y trazabilidad incompleta | Gobernanza QA | Suites sin delimitacion formal por herramienta | Sobre-esfuerzo y brechas de cobertura | Media | QA Lead |

## 3. Acciones tecnicas inmediatas

### 1. Backend como fuente de verdad

- Validar reglas criticas en capa de dominio/comando, no solo en frontend.
- Respuestas de error de negocio estandarizadas y auditables.

### 2. Contratos y negativas en Postman/Newman

- Crear suite obligatoria de negativas por endpoint critico.
- Incluir idempotencia, limite de tasa y estados invalidos.

### 3. Concurrencia

- Revisar transacciones, bloqueos y reintentos controlados.
- Definir limites por endpoint y politicas de backpressure.

### 4. Seguridad continua

- ZAP baseline en nightly y ZAP profundo en ventana controlada semanal/quincenal.
- Sonar en PR y gate por severidad critica/alta.

## 4. Matriz de remediacion semanal

| Semana | ID | Accion | Responsable | Estado | Fecha objetivo | Evidencia de cierre |
| -------- | ---- | -------- | ------------- | -------- | ---------------- | --------------------- |

| S1 | H-001 | Inventario de reglas de negocio criticas API | Backend Lead + QA API | Pendiente | AAAA-MM-DD | Catalogo versionado |
| S1 | H-001 | Casos negativos en Newman para reglas criticas | QA API | Pendiente | AAAA-MM-DD | Reporte Newman JSON/JUnit |
| S2 | H-002 | Analisis de deadlock y tuning transaccional | Backend + DBA | Pendiente | AAAA-MM-DD | Informe tecnico + PR |
| S2 | H-002 | Escenario k6 de reproduccion controlada | QA Perf | Pendiente | AAAA-MM-DD | Reporte k6 + metricas |
| S3 | H-003 | Triaging de hallazgos ZAP por severidad y explotabilidad | AppSec | Pendiente | AAAA-MM-DD | Matriz de riesgo aprobada |
| S3 | H-003 | Remediacion de hallazgos prioritarios | Backend | Pendiente | AAAA-MM-DD | Evidencia de fix + re-scan |
| S4 | H-004 | Publicar matriz institucional de cobertura | QA Lead | Pendiente | AAAA-MM-DD | Documento aprobado |
| S4 | H-004 | Gate unificado por severidad y tipo | DevOps + QA | Pendiente | AAAA-MM-DD | Pipeline actualizado |

## 5. Criterios de cierre por hallazgo

- Hallazgo de negocio: cerrado solo con prueba API negativa aprobada + evidencia UI consistente.
- Hallazgo de concurrencia: cerrado solo con prueba k6 reproducible sin errores criticos.
- Hallazgo DAST: cerrado solo con re-escaneo limpio o riesgo aceptado formalmente.

## 6. Frecuencia operativa recomendada

- PR: Sonar + smoke Playwright + contratos criticos Newman.
- Nightly: regresion API/Newman + ZAP baseline + smoke k6.
- Weekly: k6 stress/concurrencia + ZAP profundo + revision AppSec.
- Release: check integral de evidencia y aprobacion de riesgos.
