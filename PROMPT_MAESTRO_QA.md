# PROMPT MAESTRO QA — REGINSA (SUNEDU)
> **Versión:** 2.2 | **Fecha:** 2026-06-10 | **Responsable QA:** Liz Vidal  
> **Uso:** Pega el CONTEXTO + el PROMPT DE TAREA en Codex (VS Code), GitHub Copilot Chat o cualquier IA.

---

## ✅ ESTADO DE IMPLEMENTACIÓN (actualizado al 2026-06-10 08:55)

| # | Componente | Archivo | Estado |
|---|---|---|---|
| 1 | Changelog JSON (fuente única de verdad) | `REGINSA_K6_STRESS/config/release-changelog.json` | ✅ HECHO |
| 2 | Sección Auditoría en Word (.docx) | `tools/generar-word.js` | ✅ HECHO |
| 3 | Sección Auditoría en Excel (.xlsx) | `tools/generar-excel.js` | ✅ HECHO |
| 4 | Sección Auditoría en HTML K6 (sección 13) | `tools/generar-html.js` | ✅ HECHO + VERIFICADO |
| 5 | Anotaciones de auditoría en Playwright + Allure | `helpers/test-run-metadata.ts` | ✅ HECHO (TypeScript OK) |
| 6 | Prompt Maestro QA (este archivo) | `PROMPT_MAESTRO_QA.md` | ✅ HECHO |
| 7 | Verificación Playwright HTML + Allure con anotaciones | `helpers/test-run-metadata.ts` + reportes | ✅ HECHO + VERIFICADO |
| 8 | Wrapper K6 tolerante a logs stderr de k6 | `REGINSA_K6_STRESS/tools/run-k6.ps1` | ✅ HECHO |
| 9 | Modelo `reginsa_apitest` | — | 🔒 DIFERIDO (al final) |
| 10 | Refactorización pruebas de seguridad | — | 🔒 DIFERIDO (siguiente iteración) |

---

## 📋 CONTEXTO DEL PROYECTO (Siempre incluir esto al usar una IA nueva)

```
Proyecto: REGINSA — Sistema de Registro de Infracciones y Sanciones (SUNEDU)
Stack QA:
  - Pruebas Funcionales E2E: Playwright + TypeScript (POM pattern)
  - Pruebas de Rendimiento: k6 (JavaScript)
  - Reportes: Word (docx), Excel (xlsx), HTML nativo, Allure OSS (gratis), Playwright HTML
  - CI/CD futuro: GitHub Actions (gratis)
  - Grafana Cloud: BLOQUEADO por red institucional → se usa K6 HTML nativo con Chart.js

Estructura de carpetas clave:
  d:\SUNEDU\AUTOMATIZACION\REGINSA\
  ├── PROMPT_MAESTRO_QA.md          ← ESTE ARCHIVO (guia de prompts reutilizables)
  ├── REGINSA_K6_STRESS\            ← Pruebas de carga k6
  │   ├── config\
  │   │   └── release-changelog.json   ← FUENTE UNICA DE VERDAD (auditoria QA) [✅ HECHO]
  │   ├── scenarios\                ← Scripts k6 por caso
  │   ├── tools\
  │   │   ├── generar-html.js       ← Seccion 13 de Auditoria [✅ HECHO + VERIFICADO]
  │   │   ├── generar-word.js       ← Seccion 8 de Auditoria [✅ HECHO]
  │   │   └── generar-excel.js      ← Pestana Auditoria [✅ HECHO]
  │   └── reports\                  ← JSON de resultados k6 (entrada para los tools)
  │
  ├── REGINSA_PF\playwright_ui\     ← Pruebas funcionales
  │   ├── POManager.ts              ← Registra las paginas POM
  │   ├── pages\                    ← Page Objects (un archivo por modulo)
  │   │   ├── administrados.page.ts         (Caso 01) [✅ HECHO]
  │   │   ├── sanciones.page.ts             (Caso 02) [✅ HECHO]
  │   │   └── reconsideracion.page.ts       (Caso 04) [✅ locator corregido]
  │   ├── helpers\
  │   │   └── test-run-metadata.ts  ← Inyecta changelog+contexto en anotaciones [✅ HECHO]
  │   ├── tests\                    ← Specs e2e
  │   │   ├── administrados.e2e.spec.ts
  │   │   ├── sanciones.e2e.spec.ts
  │   │   └── reconsideracion.e2e.spec.ts
  │   └── playwright.config.ts      ← Reporters: html, json, allure-playwright [✅ HECHO]
  │
  └── reginsa_apitest\              ← ([🔒 PENDIENTE - NO TOCAR AUN])

Casos de prueba activos:
  - Caso 01 (CP-REG-01): Registrar Administrado — Backend OK [✅], UI locator y persistencia UI/API corregidos [✅]
  - Caso 02 (CP-REG-02): Registrar Infraccion/Sancion — Endpoint fusionado CrearConDetalles [✅]
  - Caso 04 (CP-REG-04): Crear Reconsideracion — Checkbox PrimeNG corregido [✅]

Principio de trabajo:
  NUNCA re-grabar pruebas. SIEMPRE actualizar el POM con el nuevo selector.
  Actualizar release-changelog.json con cualquier cambio detectado.
  Si los resultados muestran datos huerfanos, vacios o inconsistencias transaccionales, la IA debe recomendar cambio de contrato/API o endpoint atomico, no solo reparar el test.
  Si un reporte muestra "tema a corregir", clasificarlo antes de actuar: defecto funcional real, cambio API, cambio UI/POM, ruido tecnico del framework o recomendacion evolutiva.
  Si K6 muestra NativeCommandError pero el texto es level=info o [OK], revisar primero el wrapper PowerShell: K6 escribe logs por stderr y no necesariamente fallo el caso.
  En Codex se pueden usar sub-agentes para trabajo paralelo cuando el alcance esta bien separado; el aprendizaje permanente debe quedar escrito en este prompt, en REGINSA_EVOLUTION_STATE.md y en release-changelog.json.
```

---

## PROMPTS DE TAREA (Copiar solo el que necesites)

---

### PROMPT A — Diagnostico de Fallo Playwright [✅ LISTO PARA USAR]

```
Tengo una prueba de Playwright que esta fallando. Necesito que la diagnostiques y repares el POM SIN re-grabar el test.

## Informacion del test fallido
- Caso: [PONER CASO, ej: CP-REG-01 Registrar Administrado]
- Archivo POM: [PONER RUTA, ej: pages/administrados.page.ts]
- Spec file: [PONER RUTA, ej: tests/administrados.e2e.spec.ts]

## Error del log de Playwright (pegar aqui)
[PEGAR EL ERROR COMPLETO DEL TERMINAL O DEL REPORTE HTML]

## Tarea
1. Analiza el error. Es un locator que cambio, un timeout, o un cambio en la API de la UI?
2. Modifica SOLO el archivo POM para corregir el selector. No toques el spec file.
3. Explica que selector usabas y cual estas usando ahora.
4. Dame el texto exacto para actualizar el campo correspondiente en release-changelog.json:
   - estadoPlaywright: "CORREGIDO — descripcion breve del cambio"
   - impacto: "descripcion del cambio de UI que causo el fallo"

Contexto del POM pattern:
- Los locators van en el constructor o como getters privados en la clase Page.
- Para PrimeNG usa selectores tipo: .p-inputtext:not([type="checkbox"]) o [data-testid].
- El POM NO debe tener logica de negocio, solo interacciones de UI.
```

---

### PROMPT B — Diagnostico de Fallo K6 (Cambio de API) [✅ LISTO PARA USAR]

```
Mi prueba de K6 esta fallando por un cambio en la API del backend. Necesito reparar el script SIN cambiar el escenario de carga.

## Informacion
- Caso K6: [PONER CASO, ej: oneshot:caso02]
- Archivo scenario: [PONER RUTA, ej: scenarios/caso02-oneshot.js]
- Endpoint que fallo: [PONER URL, ej: POST /api/CabeceraInfraccionSancion/Crear]

## Error del log K6 (pegar aqui)
[PEGAR EL JSON DE RESULTADOS O EL LOG DE TERMINAL]

## Tarea
1. Identifica si el problema es: metodo HTTP, URL, Content-Type, estructura del body, o headers de auth.
2. Propone el nuevo payload/headers corregidos.
3. Modifica SOLO la seccion de peticion HTTP en el scenario, manteniendo los checks y thresholds.
4. Dame el JSON actualizado para release-changelog.json:
   - endpoints[N].ahora.metodo / url / contentType / body
   - endpoints[N].estadoK6: "CORREGIDO"
   - endpoints[N].impacto: "descripcion del cambio"

Variables de entorno disponibles:
- __ENV.BASE_URL (ej: https://reginsaqa.sunedu.gob.pe)
- __ENV.TOKEN (Bearer token de autenticacion)
```

---

### PROMPT C — Generar Nuevo Caso de Prueba en POM [✅ LISTO PARA USAR]

```
Necesito crear un nuevo caso de prueba E2E en Playwright para el modulo [NOMBRE DEL MODULO].

## Informacion del modulo
- URL del modulo: [PONER URL relativa, ej: /registro/expedientes]
- Accion principal: [PONER ACCION, ej: Crear nuevo expediente con adjunto PDF]
- Campos del formulario: [LISTAR CAMPOS, ej: Numero, Fecha, Tipo, archivo PDF]
- Endpoint API que se llama al guardar: [PONER ENDPOINT]
- Estructura de respuesta esperada: [PONER ESTRUCTURA JSON]

## Tarea
1. Crea el archivo POM en pages/[nombre].page.ts con:
   - Locators tipados en el constructor
   - Metodos: navegarAlModulo(), validarModuloCargado(), llenarFormulario(data), guardar()
   - Validacion post-guardado que verifique el ID devuelto por la API
2. Crea el spec file en tests/[nombre].e2e.spec.ts con:
   - import de configurarContextoReginsa desde helpers/test-run-metadata.ts
   - test.describe con el codigo de caso CP-REG-XX
   - test.step para cada accion
   - testInfo.annotations.push() con los datos del test
3. Registra la pagina en POManager.ts
4. Anade el entry al release-changelog.json en la seccion "endpoints"

Sigue exactamente el patron del archivo administrados.page.ts y administrados.e2e.spec.ts.
```

---

### PROMPT D — Actualizar Reportes Word/Excel/HTML despues de una correccion [✅ LISTO PARA USAR]

```
Acabo de corregir [DESCRIBIR QUE SE CORRIGIO]. Necesito regenerar los reportes y verificar que el changelog aparece.

## Pasos a ejecutar en PowerShell (directorio: d:\SUNEDU\AUTOMATIZACION\REGINSA\REGINSA_K6_STRESS)

1. Regenerar HTML del ultimo resultado K6:
   node tools/generar-html.js "reports\[CARPETA-DEL-RUN]\[NOMBRE].json"

2. Regenerar Word y Excel (misma ruta del JSON):
   node tools/generar-word.js "reports\[CARPETA-DEL-RUN]\[NOMBRE].json"
   node tools/generar-excel.js "reports\[CARPETA-DEL-RUN]\[NOMBRE].json"

## Tarea
1. Ejecuta los comandos anteriores.
2. Confirma que la seccion "13. Registro de Auditoria" aparece en el HTML con las tablas de endpoints y defectos.
3. Si hay algun error en la ejecucion, muestrame el stack trace completo y corrigelo.

NOTA: Los JSONs estan en subcarpetas del tipo:
  reports\CP-REG-XX_CASO0X_..._RUN_YYYY-MM-DD_HH-MM-SS\nombre-del-archivo.json
```

---

### PROMPT E — Recomendaciones de Seguridad QA [🔒 PARA DESPUES — cuando termines los 3 casos]

```
Ya tenemos automatizadas las pruebas funcionales (Playwright) y de rendimiento (k6) para los casos CP-REG-01, 02 y 04 del sistema REGINSA de SUNEDU.

Tengo una seccion pendiente de pruebas de seguridad que aun no he refactorizado.

## Contexto de seguridad
- Sistema: API REST sobre HTTPS (reginsaqa.sunedu.gob.pe)
- Auth: Bearer Token (JWT)
- Roles: Admin SUNEDU, Administrado (externo)
- Modulos sensibles: Crear Sanciones, Subir documentos PDF, Listar Infracciones

## Tarea
Dame las pruebas de seguridad que deberia implementar con herramientas GRATUITAS:
1. Que pruebas puedo hacer con k6 para validar autenticacion y autorizacion?
2. Como agrego validaciones de seguridad en los checks de k6 (status 401, 403)?
3. Que casos negativos debo agregar en Playwright para roles incorrectos?
4. Puedo usar OWASP ZAP (gratis) integrado con el pipeline de GitHub Actions?
5. Dame el esqueleto de un spec de seguridad en Playwright para probar acceso no autorizado.
```

---

## PROMPT DE CONTINUACION — Para Codex/VS Code cuando se agote el chat

> Copia TODO el bloque de abajo y pegalo en Codex o GitHub Copilot Chat

```
## CONTEXTO COMPLETO — REGINSA QA Automation Framework (Estado al 2026-06-09)
Soy QA Engineer del proyecto REGINSA de SUNEDU (sistema de infracciones y sanciones educativas).
Framework de automatizacion en: d:\SUNEDU\AUTOMATIZACION\REGINSA\

=== YA IMPLEMENTADO Y VERIFICADO ===
[HECHO] 1. K6 performance tests para 3 casos (oneshot + multi-ip) — Casos 01, 02, 04
[HECHO] 2. Playwright E2E tests con Page Object Model — pages/administrados.page.ts, sanciones.page.ts, reconsideracion.page.ts
[HECHO] 3. Generadores de reportes: Word (.docx), Excel (.xlsx), HTML interactivo con Chart.js
[HECHO] 4. Changelog unificado de auditoria: REGINSA_K6_STRESS\config\release-changelog.json
[HECHO] 5. Seccion "13. Registro de Auditoria" en el HTML de K6 — VERIFICADO, renderiza DEF-001 y endpoints
[HECHO] 6. Seccion de auditoria en Word (seccion 8) y Excel (pestana) — IMPLEMENTADO
[HECHO] 7. Anotaciones de auditoria en Playwright/Allure via helpers/test-run-metadata.ts — TypeScript compila OK
[HECHO] 8. Allure reporter configurado (allure-playwright) — FREE, sin cuenta cloud

=== YA IMPLEMENTADO Y VERIFICADO EN ESTA CONTINUACION ===
[HECHO] 9. Playwright HTML/JSON muestra anotaciones del changelog, incluyendo QA Audit y estado Playwright corregido para Crear Administrado
[HECHO] 10. Allure OSS muestra el changelog como attachment y los datos de auditoria como parametros QA Audit / QA API

=== DIFERIDO (NO TOCAR AUN) ===
[DIFERIDO] 11. Modelar reginsa_apitest (postergado al final del proyecto)
[DIFERIDO] 12. Refactorizar pruebas de seguridad (siguiente iteracion)

=== COMANDOS CLAVE ===
# Regenerar HTML K6 (desde REGINSA_K6_STRESS):
  node tools/generar-html.js "reports\[CARPETA]\[ARCHIVO].json"

# Regenerar Word y Excel:
  node tools/generar-word.js "reports\[CARPETA]\[ARCHIVO].json"
  node tools/generar-excel.js "reports\[CARPETA]\[ARCHIVO].json"

# Ver reporte Allure (desde REGINSA_PF\playwright_ui):
  npx allure generate allure-results --clean -o allure-report
  npx allure open allure-report

# Compilar TypeScript sin errores:
  npx tsc --noEmit

=== PRINCIPIOS QA DEL PROYECTO ===
- NUNCA re-grabar pruebas. SIEMPRE actualizar el POM con el nuevo selector.
- Grafana Cloud bloqueado por red institucional. Se usa K6 HTML nativo con Chart.js (gratis).
- release-changelog.json es la FUENTE UNICA DE VERDAD para todos los reportes.
- Allure OSS y Playwright HTML son las unicas herramientas de reporte web (100% gratis).
- La IA debe proponer decisiones tecnicas cuando los resultados indiquen problemas de diseno: endpoints atomicos, rollback, validaciones de contrato o mejoras de arquitectura.
- Los agentes/sub-agentes pueden ayudar en paralelo, pero no reemplazan la bitacora: todo aprendizaje debe persistirse en documentos del repo.

=== SIGUIENTE TAREA ===
[DESCRIBIR QUE NECESITAS HACER]
```

---

## STACK DE HERRAMIENTAS GRATUITAS

| Herramienta | Uso | Estado |
|---|---|---|
| k6 OSS | Pruebas de carga locales | [✅ En uso] |
| Playwright | E2E + HTML Reporter | [✅ En uso] |
| Allure OSS (npm) | Reporter enriquecido con adjuntos | [✅ Configurado] |
| GitHub Actions | CI/CD futuro | [⏳ Planificado] |
| VS Code + Copilot | Asistencia de codigo | [✅ En uso] |
| Chart.js (CDN) | Graficos en reportes HTML | [✅ En uso] |
| docx + xlsx (npm) | Generacion de reportes Office | [✅ En uso] |
| OWASP ZAP | Pruebas de seguridad | [🔒 Pendiente] |

> NOTA: Grafana Cloud bloqueado por red institucional. Reemplazado por K6 HTML nativo con Chart.js.
> Alternativa offline futura: Grafana OSS en Docker (requiere servidor propio).
