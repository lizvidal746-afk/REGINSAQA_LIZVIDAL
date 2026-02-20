# Guía maestra QA Automation + DevSecOps para REGINSA

## 1. Contexto institucional

### Repositorios oficiales SUNEDU (Azure DevOps)

- Azure Backend (SonarQube/Contexto):
  - [SI091_REGINSA_BACKEND](https://azuredevops.sunedu.gob.pe/MyCollection/SI091_REGINSA/_git/SI091_REGINSA_BACKEND)

- Azure Frontend (SonarQube/Contexto):
  - [SI091_REGINSA_FRONTEND](https://azuredevops.sunedu.gob.pe/MyCollection/SI091_REGINSA/_git/SI091_REGINSA_FRONTEND)

Uso actual de estos repositorios:

- Referencia institucional y trazabilidad de SonarQube.
- No se copia código sensible al repositorio personal.

### Repositorio de trabajo actual (GitHub)

- Repositorio actual de trabajo:
  - [REGINSAQA_LIZVIDAL](https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL.git)

Modelo temporal por falta de permisos Azure:

- Mismo repositorio GitHub para entorno personal y simulación entorno SUNEDU.
- Separación lógica mediante carpetas de documentación (`docs/personal` y `docs/sunedu`) y reglas de seguridad.
- Al habilitar permisos Azure, se migra el flujo de simulación a Azure DevOps.

Uso del repositorio personal:

- Pruebas Playwright
- Pruebas K6
- Scripts QA
- Documentación
- Experimentación controlada

## 2. Regla crítica de seguridad

- Prohibido copiar lógica de negocio real al repo personal.
- Prohibido exponer credenciales, endpoints internos o datos sensibles.
- Permitidos solo ejemplos genéricos, estructuras y código anonimizado.

## 3. Objetivo operativo

Garantizar calidad, trazabilidad, seguridad y mantenibilidad, sin interferir directamente en el desarrollo productivo.

## 4. Flujo de trabajo recomendado

### Paso 1: Gobernanza base

1. Definir alcance del cambio en una tarjeta técnica.
2. Clasificar riesgo: bajo, medio, alto, crítico.
3. Definir evidencia mínima requerida para aprobar.

### Paso 2: Pruebas funcionales Playwright

1. Diseñar por Page Object Model.
2. Usar selectores robustos y estables.
3. Evitar sleep y tiempos fijos.
4. Usar datos dinámicos en JSON y variables de entorno.
5. Asegurar tests independientes y re-ejecutables.

### Paso 3: Paralelismo y estabilidad

1. Ejecutar smoke con workers 1.
2. Escalar progresivamente a workers 2 o 4.
3. Detectar colisiones por datos compartidos.
4. Aplicar retries solo cuando exista causa técnica documentada.

### Paso 4: Performance con K6

1. Ejecutar smoke de API/flujo crítico.
2. Medir p95, promedio y error rate.
3. Reportar cuellos de botella y degradaciones.

### Paso 5: Seguridad OWASP

1. Revisar SQL Injection.
2. Revisar XSS.
3. Revisar CSRF.
4. Revisar validación de inputs y exposición de datos.

Frecuencia:

- Auditoría cada 3 a 6 meses.
- Validación adicional ante cambios críticos.

### Paso 6: SonarQube

1. Analizar resultados de calidad y seguridad.
2. Priorizar por severidad.
3. Registrar recomendaciones técnicas.

Importante:

- SonarQube no modifica el código.
- Solo analiza, reporta y puede bloquear por Quality Gate.

### Paso 7: CI/CD Azure DevOps

Etapas estándar:

1. Build
2. Unit Tests
3. Playwright Tests
4. K6 Tests
5. SonarQube Analysis
6. Quality Gate

El pipeline debe:

- Fallar ante incumplimiento de calidad.
- Publicar reportes.
- Ser reproducible.

### Paso 8: Gestión de cambios por evento

#### Commit

- Validar impacto inmediato en pruebas.

#### Pull Request

- Revisar calidad, seguridad y cobertura.
- Usar checklist QA/Seguridad.

#### Release

- Ejecutar regresión completa funcional y no funcional.

## 5. Regla de datos de prueba

- RUC con 11 dígitos, completar con ceros a la izquierda.
- Estados institucionales:
  - Licenciada = 2
  - Ley de creación = 4
  - Denegada = 3

Mantener consistencia histórica de datos.

## 6. Entregables obligatorios por ciclo

- Resultado de Playwright.
- Resultado de K6.
- Resultado de SonarQube.
- Checklist PR QA/Seguridad.
- Bitácora de hallazgos y plan de mejora.

## 7. Criterios de madurez

- Pruebas estables en paralelo.
- Cobertura funcional trazable.
- Calidad estática bajo control.
- Riesgos OWASP monitoreados.
- Pipeline con quality gate activo.

## 8. Plan de transición cuando habiliten permisos Azure

1. Mantener rama estable validada en GitHub.
2. Crear pipeline equivalente en Azure DevOps con SonarQube y Quality Gate.
3. Migrar solo framework QA y documentación aprobada (sin lógica sensible).
4. Ejecutar corrida de validación comparativa GitHub vs Azure.
5. Formalizar operación en Azure y dejar GitHub como laboratorio controlado.
