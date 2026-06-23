# Plan Maestro de Automatización de Pruebas — REGINSA QA
**Proyecto:** REGINSA — Registro de Infracciones y Sanciones (SUNEDU)  
**Responsable QA:** Liz Vidal  
**Fecha de Creación:** 2026-06-04  
**Estado:** En Ejecución Activa  

---

## ÍNDICE

1. [Justificación de Tipos de Prueba](#1-justificación-de-tipos-de-prueba)
2. [Cuadros Comparativos de Herramientas](#2-cuadros-comparativos-de-herramientas)
3. [Mapeo de Estándares por Tipo de Prueba](#3-mapeo-de-estándares-por-tipo-de-prueba)
4. [Configuración de VS Code — Extensiones y MCP](#4-configuración-de-vs-code--extensiones-y-mcp)
5. [Plan de Implementación por Fases](#5-plan-de-implementación-por-fases)
6. [Estado Actual del Proyecto](#6-estado-actual-del-proyecto)
7. [Checklist de Retoma (Para Nueva Sesión)](#7-checklist-de-retoma-para-nueva-sesión)

---

## 1. Justificación de Tipos de Prueba

### 1.1 ¿Por qué necesitamos diferentes tipos de prueba?

> [!IMPORTANT]
> Ningún tipo de prueba por sí solo cubre todos los riesgos del sistema. REGINSA, al ser un sistema crítico del sector público (SUNEDU), requiere una estrategia multicapa: funcional, de rendimiento, de seguridad y de accesibilidad.

### 1.2 Pirámide de Pruebas — REGINSA

```
                    ┌─────────────────┐
                    │   SEGURIDAD     │  ← SAST/SCA/DAST (menos frecuente)
                    │  (TruffleHog,   │
                    │   Retire.js)    │
                   ┌┴─────────────────┴┐
                   │   RENDIMIENTO     │  ← K6 Stress (por escenario)
                   │   (K6 Stress)     │
                  ┌┴───────────────────┴┐
                  │  FUNCIONAL UI E2E  │  ← Playwright (por caso)
                  │    (Playwright)    │
                 ┌┴─────────────────────┴┐
                 │  FUNCIONAL API/INT.   │  ← Playwright API Test
                 │  (Playwright API)     │
                └───────────────────────┘
           Base: Pruebas más frecuentes, más rápidas, más baratas
           Punta: Pruebas más costosas, menos frecuentes, más críticas
```

---

### 1.3 Tipo 1: Pruebas Funcionales UI E2E — Playwright

**¿Qué valida?**  
Que el usuario final puede completar los flujos de negocio críticos de principio a fin, usando el navegador como lo haría un ser humano real.

**¿Por qué es importante para REGINSA?**  
REGINSA gestiona sanciones a instituciones educativas. Un fallo en el flujo de "Registrar Sanción" significa que un proceso legal queda incompleto, con consecuencias legales y operativas para SUNEDU.

| Escenario | Fase | Workers | Registros | Propósito |
|---|---|---|---|---|
| CP-REG-01 Agregar administrado | Smoke | 1 | 1 | Verificar que el flujo mínimo funciona |
| CP-REG-01 Agregar administrado | Fase 1 | 9 | 9 | Verificar aislamiento de 9 usuarios paralelos |
| CP-REG-02 Registrar sanción | Smoke | 1 | 1 | Flujo crítico individual |
| CP-REG-02 Registrar sanción | Fase 1 | 9 | 9 | 9 sanciones paralelas sin colisión |
| CP-REG-02 Registrar sanción | Fase 2 | 9 | 36 | Carga sostenida: 4 registros/worker |
| CP-REG-02 Registrar sanción | Regresión | 9 | 9 | Verificar que no hay regresiones tras un cambio |
| CP-REG-02 Registrar sanción | Cross-Browser | 9 | 9 | Funciona igual en Chrome, Firefox, Edge |
| CP-REG-02 Registrar sanción | Accesibilidad | 1 | 0 | Cumple WCAG 2.1 AA (acceso universal) |
| CP-REG-02 Registrar sanción | Seguridad UI | 1 | 0 | No vulnerable a XSS en campos del formulario |
| CP-REG-04 Reconsiderar | Smoke | 1 | 1 | Flujo de reconsideración funciona |
| CP-REG-04 Reconsiderar | Fase 1 | 9 | 9 | 9 reconsideraciones paralelas |

**Justificación normativa:**
- **ISTQB CTFL** — Pruebas de sistema, pruebas de aceptación
- **ISO/IEC 25010** — Functional Suitability (correctness, completeness, appropriateness)
- **IEEE 829-2008** — Test Design Specification, Test Case Specification
- **ISO/IEC/IEEE 29119** — Test execution process

---

### 1.4 Tipo 2: Pruebas de Rendimiento — K6 Stress

**¿Qué valida?**  
Que el servidor/API puede manejar la carga esperada de usuarios simultáneos sin degradarse.

**¿Por qué es importante para REGINSA?**  
En campañas de registro masivo, múltiples instituciones educativas acceden simultáneamente. El servidor debe responder en tiempos aceptables sin caerse.

| Escenario K6 | VUs | Duración | Métrica Clave | Umbral |
|---|---|---|---|---|
| Smoke | 1 | 1 min | Tiempo respuesta base | < 2s |
| Load (Carga Normal) | 50 | 10 min | P95 tiempo respuesta | < 3s |
| Stress (Estrés) | 200 | 15 min | Tasa de errores | < 1% |
| Spike (Pico) | 0→500→0 | 5 min | Tiempo recuperación | < 30s |
| Multi-IP | 9 IPs × N VUs | Variable | Aislamiento por IP | 0 colisiones |

**Justificación normativa:**
- **ISO/IEC 25010** — Performance Efficiency (time behaviour, resource utilization, capacity)
- **ISTQB CTAL-PT** — Performance Testing (certificación avanzada)
- **SRE Workbook (Google)** — SLOs, Error Budget, APDEX

---

### 1.5 Tipo 3: Pruebas Funcionales de API — Playwright API

**¿Qué valida?**  
Que los endpoints REST devuelven las respuestas correctas, con los códigos HTTP apropiados y la estructura de datos esperada.

**¿Por qué es importante?**  
Permite detectar bugs en la capa de backend antes de ejecutar las pruebas UI (más rápidas y baratas que E2E).

| Aspecto | Valor |
|---|---|
| Velocidad | 10-50x más rápido que E2E UI |
| Requiere navegador | No |
| Detecta bugs de contrato API | Sí |
| Costo de mantenimiento | Bajo |

**Justificación normativa:**
- **ISTQB CTFL** — Integration Testing
- **ISO/IEC 25010** — Functional Suitability, Interoperability

---

### 1.6 Tipo 4: Pruebas de Accesibilidad — axe-core + Playwright

**¿Qué valida?**  
Que la aplicación cumple con WCAG 2.1 AA — es decir, que personas con discapacidades visuales, motoras o cognitivas pueden usarla.

**¿Por qué es importante para REGINSA/SUNEDU?**  
El Estado Peruano está obligado por la **Ley 29973 (Ley General de la Persona con Discapacidad)** y lineamientos de la **PCM** a que sus sistemas digitales sean accesibles.

| Criterio WCAG | Descripción | Ejemplo en REGINSA |
|---|---|---|
| 1.1.1 Non-text Content | Imágenes con alt text | Logo SUNEDU, iconos del formulario |
| 1.3.1 Info and Relationships | Etiquetas en formularios | Campos del modal "Agregar Sanción" |
| 2.1.1 Keyboard | Navegable por teclado | Modal, botones, dropdowns |
| 4.1.3 Status Messages | Mensajes de éxito/error | SweetAlert2 después de guardar |

**Justificación normativa:**
- **WCAG 2.1 AA** — Web Content Accessibility Guidelines
- **Ley 29973** — Ley General de la Persona con Discapacidad (Perú)
- **ISO/IEC 25010** — Usability (Accessibility)

---

### 1.7 Tipo 5: Pruebas de Seguridad — SAST/SCA/DAST

**¿Qué valida?** Que el código y sus dependencias no tienen vulnerabilidades conocidas.

| Herramienta | Tipo | ¿Qué detecta? |
|---|---|---|
| TruffleHog | SAST (Secretos) | Credenciales hardcodeadas en el código |
| OSV Scanner | SCA | Dependencias con CVEs conocidos |
| Retire.js | SCA (JS) | Librerías JavaScript obsoletas/vulnerables |
| Syft + Grype | SBOM + SCA | Inventario completo de dependencias |

**Justificación normativa:**
- **OWASP Top 10** — A02: Cryptographic Failures, A06: Vulnerable Components
- **ISO/IEC 27001** — Information Security Management
- **NIST SP 800-53** — Security Controls

---

### 1.8 Tipo 6: Pruebas de Regresión

**¿Qué valida?**  
Que los cambios nuevos no rompieron funcionalidades que antes funcionaban.

**¿Cuándo ejecutar?**  
Después de cada merge a la rama principal, antes de cada deploy a producción.

**Justificación normativa:**
- **ISTQB CTFL** — Regression Testing, Confirmation Testing
- **ISO/IEC/IEEE 29119** — Test monitoring and control

---

### 1.9 Tipo 7: Pruebas Cross-Browser

**¿Qué valida?**  
Que la UI se comporta igual en Chrome, Firefox y Edge — navegadores usados por los funcionarios de SUNEDU.

| Navegador | Motor | Cobertura recomendada |
|---|---|---|
| Chrome (Chromium) | Blink | Primario — mayoría de usuarios |
| Firefox | Gecko | Secundario — usuarios institucionales |
| Edge | Blink | Terciario — equipos corporativos Windows |
| Safari | WebKit | Opcional — pocos usuarios en Perú |

**Justificación normativa:**
- **ISO/IEC 25010** — Portability (Adaptability)
- **ISTQB CTFL** — Compatibility Testing

---

## 2. Cuadros Comparativos de Herramientas

### 2.1 Playwright vs K6 — Comparativa Detallada

| Dimensión | Playwright | K6 |
|---|---|---|
| **Tipo de prueba** | Funcional UI E2E | Rendimiento / Carga |
| **Capa del sistema** | Navegador (Frontend) | API HTTP (Backend) |
| **Simula** | Usuario humano haciendo clics | Miles de peticiones HTTP |
| **Usuarios simultáneos** | 5–20 workers (pesado) | 100–10,000 VUs (ligero) |
| **Requiere navegador** | Sí (Chromium/Firefox/WebKit) | No |
| **Velocidad por test** | Segundos a minutos | Milisegundos |
| **Detecta** | Bugs de UI, flujos rotos, timing | Cuellos de botella, latencia |
| **Evidencia** | Screenshots, videos, trazas | Métricas JSON, gráficas HTML |
| **Costo computacional** | Alto (~500MB RAM/worker) | Muy bajo (~5MB RAM/VU) |
| **Lenguaje** | TypeScript/JavaScript | JavaScript (DSL propio) |
| **Headless** | Sí (recomendado para CI) | Siempre (sin UI) |
| **Reportes** | Allure, HTML nativo, Excel | HTML nativo K6, Grafana |
| **Uso en REGINSA** | CP-REG-01, 02, 04 | REGINSA_K6_STRESS |
| **¿Cuándo ejecutar?** | Por cada deploy / PR | Por campaña de carga |

---

### 2.2 Playwright vs Selenium vs Cypress

| Dimensión | Playwright (tu elección ✅) | Selenium | Cypress |
|---|---|---|---|
| **Multi-browser** | Chromium, Firefox, WebKit | Todos | Solo Chromium/Electron |
| **Multi-tab/ventana** | ✅ Sí | ✅ Sí | ❌ Limitado |
| **Velocidad** | Rápido | Lento | Muy rápido |
| **Modo headless** | ✅ Nativo | ✅ Con configuración | ✅ Nativo |
| **Paralelismo** | ✅ Workers nativo | Manual | ✅ Con plugins |
| **API testing** | ✅ Nativo | ❌ No | ✅ Con plugins |
| **Trace Viewer** | ✅ Nativo | ❌ No | ✅ Time Travel |
| **Allure** | ✅ Plugin | ✅ Plugin | ✅ Plugin |
| **TypeScript** | ✅ Nativo | Parcial | ✅ Nativo |
| **Para REGINSA** | ✅ Ideal (concurrencia + multi-IP) | No recomendado | No recomendado |

---

### 2.3 Headed vs Headless — Cuándo usar cada uno

| Criterio | Headless (Sin UI) | Headed (Con UI visible) |
|---|---|---|
| **Velocidad** | ✅ Más rápido | ❌ Más lento |
| **Recursos** | ✅ Menos RAM/CPU | ❌ Más consumo |
| **Paralelismo** | ✅ Hasta 9+ workers | ❌ Máx 3–4 antes de saturar |
| **Debug visual** | ❌ Sin visibilidad | ✅ Ves cada acción |
| **CI/CD** | ✅ Obligatorio | ❌ No aplica |
| **Smoke** | Opcional | ✅ Recomendado |
| **Phase1/Phase2** | ✅ Recomendado | ❌ No recomendado |
| **Regresión** | ✅ Siempre | ❌ Nunca en CI |
| **GPU error** | Posible con 9+ workers | Posible con 4+ ventanas |

**Regla de oro REGINSA:**
```
Smoke → headed opcional (-Headed flag)  
Phase1/2 → headless siempre  
Debug de fallo específico → headed + 1 worker + test.only  
CI/CD → headless siempre  
```

---

### 2.4 Extensiones VS Code — Comparativa

| Extensión | Publisher | Para qué sirve | Prioridad |
|---|---|---|---|
| **Playwright Test for VSCode** | ms-playwright | Ejecutar tests con click, selector picker, trace viewer | 🔴 ALTA |
| **Allure Report** | alexkrechik | Ver reportes Allure desde VS Code | 🟡 MEDIA |
| **ESLint** | Microsoft | Linting de TypeScript/JS | 🔴 ALTA |
| **Prettier** | Prettier | Formateo de código | 🟡 MEDIA |
| **GitLens** | GitKraken | Historial de git por línea | 🟡 MEDIA |
| **Thunder Client** | Thunder Client | Probar APIs manualmente | 🟡 MEDIA |
| **Todo Tree** | Gruntfuggly | Marcadores TODO/FIXME en código | 🟢 BAJA |
| **Error Lens** | Alexander | Errores inline en el editor | 🔴 ALTA |

---

## 3. Mapeo de Estándares por Tipo de Prueba

### 3.1 Tabla Maestra de Estándares

| Tipo de Prueba | ISTQB | ISO/IEC 25010 | IEEE 829 | ISO 29119 | Otra norma |
|---|---|---|---|---|---|
| Funcional E2E (Playwright) | CTFL - System Testing | Functional Suitability | Sec. 4 Test Design | Part 3 - Test Execution | — |
| Rendimiento (K6) | CTAL-PT | Performance Efficiency | Sec. 5 Test Summary | Part 4 - Test Techniques | SRE Workbook |
| Accesibilidad (axe) | — | Usability (Accessibility) | — | — | WCAG 2.1, Ley 29973 |
| Seguridad (SAST/SCA) | — | Security | — | — | OWASP Top 10, ISO 27001 |
| API (Playwright API) | CTFL - Integration | Functional Suitability | Sec. 3 Test Plan | Part 2 - Test Processes | OpenAPI |
| Regresión | CTFL - Regression | Maintainability | Sec. 4 Test Design | Part 3 - Test Execution | — |
| Cross-Browser | CTFL - Compatibility | Portability | — | — | — |
| Smoke | CTFL - Smoke | Reliability | — | — | — |

### 3.2 KPIs por Estándar

| Estándar | KPI | Umbral REGINSA |
|---|---|---|
| **ISTQB CTFL** | Tasa de éxito funcional | ≥ 95% |
| **ISTQB CTFL** | Tasa de flakiness | ≤ 5% |
| **ISTQB CTFL** | Completitud de evidencia | 100% en fallos |
| **ISO/IEC 25010** | Completitud de registros (N workers = N registros) | 100% |
| **ISO/IEC 25010** | Aislamiento de sesiones (0 colisiones) | 0 |
| **SRE / K6** | P95 tiempo de respuesta | < 3s (carga normal) |
| **SRE / K6** | Error budget consumido | < 80% |
| **SRE / K6** | Tasa de errores HTTP | < 1% |
| **WCAG 2.1 AA** | Violaciones críticas de accesibilidad | 0 |
| **OWASP** | Vulnerabilidades críticas (CVE) | 0 |

---

## 4. Configuración de VS Code — Extensiones y MCP

### 4.1 Extensiones a instalar (en orden de prioridad)

```bash
# Instalar desde terminal en VS Code:
code --install-extension ms-playwright.playwright
code --install-extension dbaeumer.vscode-eslint
code --install-extension usernamehw.errorlens
code --install-extension esbenp.prettier-vscode
code --install-extension eamodio.gitlens
code --install-extension rangav.vscode-thunder-client
code --install-extension alexkrechik.cucumberautocomplete
```

### 4.2 Playwright MCP — Instalación y uso

**¿Qué es?**  
Un servidor MCP (Model Context Protocol) que permite que Antigravity (el agente IA) controle un navegador Playwright en tiempo real para inspeccionar la UI, hacer debug visual, y tomar decisiones basadas en lo que ve en pantalla.

**¿Para qué sirve en REGINSA?**
- Cuando un test falla, el agente puede abrir el navegador, navegar a la pantalla y ver qué está pasando
- Inspeccionar selectores en vivo sin que tú tengas que describirlos
- Automatizar la investigación de fallos sin intervención manual

### 4.2.1 Uso de agentes IA en REGINSA

**Estado real al 2026-06-09:** sí se pueden usar agentes/sub-agentes en Codex cuando la tarea requiere trabajo paralelo. No se ejecutan solos ni "aprenden" de forma permanente si no se documenta el aprendizaje.

**Regla operativa:**
- Usar agente explorador para revisar una zona concreta del código o un reporte mientras Codex implementa otra corrección.
- Usar agente worker solo si el alcance de archivos es separado y no choca con cambios activos.
- No usar agentes para decisiones críticas sin dejar evidencia en `PROMPT_MAESTRO_QA.md`, `REGINSA_EVOLUTION_STATE.md` o `release-changelog.json`.

**Aprendizaje persistente del proyecto:**
- La memoria durable no es el chat: son los planes, el changelog, los prompts y los reportes.
- Si K6/Playwright detectan patrones como registros huerfanos, inconsistencias transaccionales o validaciones vacias, la IA debe recomendar cambios de diseño/API, no solo "hacer pasar la prueba".
- Ejemplo ya validado: el defecto de expedientes sin sanciones se resolvio por decision de desarrollo al unificar endpoints en `CrearConDetalles`; desde ahora, hallazgos similares deben escalarse como recomendacion arquitectonica.

**Instalación:**
```bash
# Desde la carpeta del proyecto:
cd D:\SUNEDU\AUTOMATIZACION\REGINSA\REGINSA_PF\playwright_ui
npm install --save-dev @playwright/mcp
```

**Configuración en `.vscode/mcp.json`:**
```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"],
      "env": {
        "PLAYWRIGHT_BROWSERS_PATH": "0"
      }
    }
  }
}
```

### 4.3 axe-core/playwright — Accesibilidad

**Instalación:**
```bash
npm install --save-dev @axe-core/playwright
```

**Uso en tests:**
```typescript
import { checkA11y, injectAxe } from 'axe-playwright';

test('Formulario sanción cumple WCAG 2.1 AA', async ({ page }) => {
  await page.goto('/sanciones');
  await injectAxe(page);
  await checkA11y(page, null, {
    axeOptions: { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }
  });
});
```

### 4.4 Configuración `.vscode/settings.json` recomendada

```json
{
  "playwright.reuseBrowser": false,
  "playwright.showTrace": true,
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.preferences.importModuleSpecifier": "relative",
  "files.exclude": {
    "**/node_modules": true,
    "**/.tmp": true,
    "**/allure-results": true
  }
}
```

---

## 5. Plan de Implementación por Fases

> [!IMPORTANT]
> Esta sección es el mapa de ruta completo. Si se interrumpe el trabajo, iniciar siempre desde el **Estado Actual** (Sección 6) y retomar la fase correspondiente.

### FASE 0 — Base (COMPLETADA ✅)
- [x] Estructura de proyecto Playwright
- [x] Auth setup con storageState
- [x] Page Objects: SancionesPage, FormularioSancionPage, ModalAgregarSancionPage
- [x] Tests: sanciones.e2e.spec.ts (CP-REG-02)
- [x] Scripts de generación: generar-html.js, generar-excel.js, generar-word.js
- [x] Runner: run-pf.ps1 con escenarios smoke/phase1/phase2
- [x] Reportes: Playwright HTML + Allure + Excel + Word
- [x] Pool de usuarios por worker (.env)

### FASE 1 — Estabilización y Corrección (EN CURSO 🔄)
- [x] Fix SyntaxError en generar-html.js (función esc)
- [x] Fix TypeError en generar-word.js (reader.data → reader._raw)
- [x] Timeout global Playwright configurado en 120000ms.
- [x] Retry configurado: 1 retry local, 2 en CI.
- [x] Verificar Playwright HTML/JSON con anotaciones del changelog.
- [x] Verificar Allure con attachment `qa-audit-changelog` y parametros `QA Audit` / `QA API`.
- [x] Corregir CP-REG-01: boton iconografico Nuevo Administrado y persistencia `Entidad/ListarPaginado`.
- [x] Limpiar ruido tecnico de `esperarCapaCarga()` para evitar falsos pasos fallidos por strict mode.
- [ ] Fix waitForTimeout → waitForSelector en formulario-sancion.page.ts.

### FASE 2 — Extensiones y Herramientas (PENDIENTE ⏳)
- [ ] Instalar Playwright Test for VSCode
- [ ] Instalar Error Lens, ESLint, Prettier
- [ ] Instalar @axe-core/playwright
- [ ] Configurar .vscode/settings.json
- [ ] Configurar .vscode/mcp.json para Playwright MCP
- [ ] Instalar @playwright/mcp

### FASE 3 — Completar Casos de Prueba (PENDIENTE ⏳)
- [ ] CP-REG-01: Agregar Administrado — spec completo (smoke + phase1)
- [ ] CP-REG-04: Reconsiderar con Sanciones — spec completo
- [ ] CP-REG-02: Accesibilidad (a11y) — axe-core integration
- [ ] CP-REG-02: Seguridad UI (XSS) — validación de inputs
- [ ] CP-REG-02: Cross-Browser — configurar Firefox + Edge en playwright.config.ts

### FASE 4 — Variedad de Datos y Selecciones (PENDIENTE ⏳)
- [ ] Ampliar pool de administrados en fixtures/
- [ ] Parametrización de datos de prueba por escenario (faker.js)
- [ ] Selección aleatoria de combos/dropdowns por worker
- [ ] Datos únicos por ejecución (runSeed → datos únicos)

### FASE 5 — Integración CI/CD (PENDIENTE ⏳)
- [ ] GitHub Actions: workflow para smoke en cada PR
- [ ] GitHub Actions: workflow para phase1 en merge a main
- [ ] Notificaciones a n8n/Teams al terminar ejecución
- [ ] Quality Gate: bloquear merge si tasa < 95%

### FASE 6 — Reportes Avanzados (PARCIALMENTE COMPLETADA 🔄)
- [x] HTML report profesional (K6-style)
- [x] Excel con KPIs
- [x] Word con resumen ejecutivo
- [ ] Gráficas Chart.js automáticas en HTML
- [ ] Tabla IP × Métricas en reporte HTML
- [ ] Plan de pruebas Excel actualizado automáticamente por ejecución
- [ ] Dashboard consolidado (todas las ejecuciones históricas)

### FASE 7 — Aprendizaje QA y Recomendaciones Evolutivas (EN CURSO 🔄)
- [x] Consolidar `release-changelog.json` como fuente unica de verdad para endpoints, defectos y estado Playwright/K6.
- [x] Cerrar `DEF-UI-01` despues de verificar CP-REG-01 en Playwright.
- [x] Registrar en Allure los datos de auditoria como parametros visibles.
- [x] Corregir wrapper K6 para que logs informativos por stderr no se reporten como `NativeCommandError` ni corten la corrida.
- [x] Documentar criterio: un hallazgo repetido de datos vacios/huerfanos debe generar recomendacion de contrato/API transaccional.
- [ ] Crear matriz de "tipo de hallazgo → decision recomendada" para que futuros prompts/agentes clasifiquen mejor cambios de UI, API, datos, seguridad y arquitectura.
- [ ] Agregar recomendaciones automaticas en HTML REGINSA cuando un defecto este abierto o un endpoint cambie de contrato.

---

## 6. Estado Actual del Proyecto

### Estructura de archivos clave

```
D:\SUNEDU\AUTOMATIZACION\REGINSA\REGINSA_PF\playwright_ui\
│
├── tests\
│   ├── auth.setup.ts              ✅ Login y storageState
│   ├── sanciones.e2e.spec.ts      ✅ CP-REG-02 (9 workers)
│   └── legacy_tests\              📦 Tests anteriores
│
├── pages\
│   ├── administrados.page.ts       ✅ CP-REG-01 corregido: boton iconografico + ListarPaginado
│   ├── base.page.ts                ✅ Espera de loader sin strict mode
│   ├── sanciones.page.ts          ✅ Page Object - Lista Sanciones
│   ├── formulario-sancion.page.ts ⚠️  Tiene waitForTimeout → pendiente fix
│   └── modal-agregar-sancion.page.ts ✅ Page Object - Modal
│
├── tools\
│   ├── generar-html.js            ✅ Reparado (fix esc + encoding)
│   ├── generar-excel.js           ✅ Funciona
│   ├── generar-word.js            ✅ Reparado (fix reader._raw)
│   ├── run-pf.ps1                 ✅ Runner completo
│   ├── ai-prompts.js              ✅ buildFallback funciona
│   ├── update-plan.js             ✅ Actualiza Excel del plan
│   └── lib\
│       └── playwright-reader.js   ✅ Lee results.json
│
├── fixtures\                      ⚠️  Pool de datos a ampliar
├── playwright.config.ts           ✅ Timeout 120s y retries configurados
├── package.json                   ✅ Scripts completos
└── .env                           ✅ Variables de entorno (IPs, usuarios)
```

### Comandos de uso frecuente

```powershell
# Smoke (1 worker, rápido, con o sin headed)
npm run pf:smoke:caso02
npm run pf:smoke:caso02 -- -Headed   # Con navegador visible

# Phase 1 (9 workers, headless)
npm run pf:phase1:caso02

# Phase 2 (9 workers, 4 repeticiones = 36 registros)
npm run pf:phase2:caso02

# Solo generar reportes (sin ejecutar tests)
npm run report:all

# Ver reporte Allure
npm run allure:generate
npm run allure:open

# Actualizar plan Excel
node tools/update-plan.js
```

---

## 7. Checklist de Retoma (Para Nueva Sesión)

> [!NOTE]
> Esta sección está diseñada para que cualquier persona (o el agente IA en una nueva sesión) pueda retomar el trabajo exactamente donde se dejó.

### Al iniciar una nueva sesión, verificar:

**1. Estado del código:**
```powershell
# Ver últimos cambios en git
cd D:\SUNEDU\AUTOMATIZACION\REGINSA
git log --oneline -10

# Verificar que los generadores funcionan
cd D:\SUNEDU\AUTOMATIZACION\REGINSA\REGINSA_PF\playwright_ui
node tools/generar-html.js ..\playwright-report\results.json reportes\
node tools/generar-word.js ..\playwright-report\results.json reportes\
node tools/generar-excel.js ..\playwright-report\results.json reportes\
```

**2. Próxima tarea pendiente (Fase 1):**
- Corregir `waitForTimeout(5000)` en `formulario-sancion.page.ts:59` → reemplazar por `waitForResponse` o selector de confirmación
- Corregir `waitForTimeout(1000)` en `formulario-sancion.page.ts:108` → igual
- Revisar si los reportes muestran "temas a corregir": si vienen de `release-changelog.json` son hallazgos reales; si vienen de pasos internos atrapados, clasificarlos como ruido tecnico del framework y corregir el helper.
- En K6, si PowerShell muestra `NativeCommandError` junto a `level=info` o `[OK]`, tratarlo primero como ruido del wrapper antes de abrir defecto funcional.

**3. Archivos a no modificar sin revisar primero:**
- `tools/lib/playwright-reader.js` — lógica de parsing del JSON, muy sensible
- `playwright.config.ts` — cambios aquí afectan todos los proyectos
- `tests/auth.setup.ts` — si se rompe, todos los tests fallan

**4. Variables de entorno importantes (`.env`):**
```
REGINSA_UI_BASE_URL=https://reginsaqa.sunedu.gob.pe
REGINSA_USER_1=...  (pool de usuarios)
REGINSA_IP_1=...    (IPs dedicadas, si aplica)
```

**5. Comandos de validación rápida:**
```powershell
# Smoke rápido para verificar que todo funciona (1 min):
npm run pf:smoke:caso02

# Si pasa el smoke → lanzar phase1
npm run pf:phase1:caso02
```

---

## Referencias y Documentación

| Recurso | URL / Ruta |
|---|---|
| Playwright Docs | https://playwright.dev/docs/intro |
| axe-core/playwright | https://github.com/abhinaba-ghosh/axe-playwright |
| Playwright MCP | https://github.com/microsoft/playwright-mcp |
| K6 Docs | https://k6.io/docs |
| Allure Playwright | https://allurereport.org/docs/playwright |
| WCAG 2.1 | https://www.w3.org/TR/WCAG21 |
| ISO/IEC 25010 | (Comprar en ISO o consultar INACAL) |
| ISTQB Syllabus CTFL | https://www.istqb.org/certifications/certified-tester-foundation-level |
| Plan de pruebas Excel | `D:\SUNEDU\AUTOMATIZACION\REGINSA\REGINSA_PF\playwright_ui\tools\PLAN_DE_PRUEBAS_FUNCIONALES_REGINSA.xlsx` |
| Este plan | `C:\Users\usitd04\.gemini\antigravity\brain\88ad34a0-97e7-400a-8385-49f4cc7a6ce8\implementation_plan.md` |
