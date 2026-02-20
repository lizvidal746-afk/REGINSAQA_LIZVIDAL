# Plan de migración a Azure DevOps (cuando habiliten permisos)

## 1. Objetivo

Trasladar el framework QA desde GitHub (simulación actual) a Azure DevOps institucional sin exponer información sensible y manteniendo trazabilidad de calidad.

## 2. Repositorios de referencia

- Azure Backend (SonarQube/Contexto):
  - [SI091_REGINSA_BACKEND](https://azuredevops.sunedu.gob.pe/MyCollection/SI091_REGINSA/_git/SI091_REGINSA_BACKEND)

- Azure Frontend (SonarQube/Contexto):
  - [SI091_REGINSA_FRONTEND](https://azuredevops.sunedu.gob.pe/MyCollection/SI091_REGINSA/_git/SI091_REGINSA_FRONTEND)

- Repositorio actual de trabajo:
  - [REGINSAQA_LIZVIDAL](https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL.git)

Línea base de auditoría:

- [INSUMOS_AUDITORIA_2026-02-12.md](INSUMOS_AUDITORIA_2026-02-12.md)

## 3. Alcance de migración permitido

Se migra:

- Estructura de pruebas Playwright/K6.
- Scripts QA.
- Plantillas de pipeline/documentación.

No se migra:

- Lógica de negocio productiva.
- Credenciales.
- Endpoints internos no autorizados.
- Datos sensibles reales.

## 4. Pre-requisitos

1. Permisos de lectura/escritura en Azure Repos.
2. Service connections (SonarQube y agentes).
3. Variable groups seguros creados.
4. Revisión de seguridad aprobada (checklist PR QA/Seguridad).

## 5. Procedimiento técnico

### Fase A: Congelamiento y baseline

1. Crear tag estable en GitHub (`qa-baseline-YYYYMMDD`).
2. Ejecutar baseline:
   - Playwright
   - K6
   - SonarQube
3. Guardar evidencias de baseline.

### Fase B: Traslado de contenido permitido

1. Crear repositorio destino Azure (o rama dedicada QA).
2. Copiar solo framework QA y docs aprobadas.
3. Configurar `.env` y secretos desde variable group Azure (no en código).

### Fase C: Pipeline en Azure

1. Publicar YAML con etapas:
   - Build
   - Unit Tests
   - Playwright Tests
   - K6 Tests
   - SonarQube Analysis
   - Quality Gate
2. Ejecutar pipeline en rama de validación.

### Fase D: Comparativa y cierre

1. Comparar resultados GitHub vs Azure (misma versión).
2. Resolver desviaciones.
3. Emitir acta de aceptación de migración.

## 6. Criterios de aceptación

- Sin credenciales hardcodeadas.
- Sin datos sensibles expuestos.
- Pipeline Azure estable en al menos 3 ejecuciones consecutivas.
- Quality Gate en estado aprobado.
- Evidencias documentadas en carpeta de auditoría.

## 7. Riesgos y mitigaciones

- Riesgo: diferencias de entorno.
  - Mitigación: estandarizar variables y versiones Node/Playwright.
- Riesgo: fuga de información sensible.
  - Mitigación: revisión de seguridad previa + checklist obligatorio.
- Riesgo: inestabilidad en paralelo.
  - Mitigación: validar `workers=1`, luego escalar a `workers=2/4`.
