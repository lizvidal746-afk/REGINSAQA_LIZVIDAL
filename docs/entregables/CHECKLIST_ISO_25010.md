# Checklist ISO/IEC 25010 — QA REGINSA

**Proyecto**: SI-091 REGINSA
**Fecha de evaluacion**: [DD/MM/YYYY]
**Evaluador**: [NOMBRE]

> Este checklist mapea las 8 caracteristicas de calidad ISO 25010 a las herramientas y practicas implementadas en el framework QA.

---

## Resumen de cobertura

| Caracteristica | Sub-caracteristicas evaluadas | Cobertura | Estado |
| --------------- | ------------------------------ | ----------- | -------- |
| Funcionalidad | 5/5 | Alta | ✅ |
| Rendimiento | 3/3 | Alta | ✅ |
| Compatibilidad | 2/2 | Media | ⚠️ |
| Usabilidad | 0/6 | Baja | ❌ |
| Fiabilidad | 3/4 | Media | ⚠️ |
| Seguridad | 5/5 | Alta | ✅ |
| Mantenibilidad | 4/5 | Alta | ✅ |
| Portabilidad | 2/3 | Media | ⚠️ |

**Leyenda**: ✅ Implementado y verificado | ⚠️ Parcialmente cubierto | ❌ No cubierto

---

## 1. Funcionalidad (Functional Suitability)

| Sub-caracteristica | Herramienta(s) | Practica implementada | Estado |
| -------------------- | --------------- | ---------------------- | -------- |
| Completitud funcional | Playwright | 5 flujos E2E (00-04) cubren el ciclo completo: login, registro administrado, sancion, reconsideracion | ✅ |
| Correctitud funcional | Playwright + Postman | Validaciones de datos en UI (`*_validaciones.spec.ts`) + assertions API por endpoint | ✅ |
| Pertinencia funcional | Playwright | Modos de ejecucion: fast (rapido), scale (carga), demo (visual), validaciones (datos) | ✅ |
| Interoperabilidad API | Postman/Newman | 8+ colecciones con tests por contrato, status codes, response schemas | ✅ |
| Cobertura de regresion | GitHub Actions | Suite completa ejecutable via `npm run test:funcional:suite`, CI automatico en push | ✅ |

### Evidencia

- Tests funcionales: `tests/casos-prueba/caso_*.spec.ts`
- Validaciones: `tests/casos-prueba/caso_*_validaciones.spec.ts`
- Colecciones API: `API_TEST/postman/`
- Reportes: `reportes/html/`, `allure-report/`

---

## 2. Rendimiento (Performance Efficiency)

| Sub-caracteristica | Herramienta(s) | Practica implementada | Estado |
| -------------------- | --------------- | ---------------------- | -------- |
| Comportamiento temporal | k6 OSS | Scripts por caso midiendo p95, p99, avg, med; thresholds definidos por endpoint | ✅ |
| Utilizacion de recursos | k6 + Grafana Cloud | Dashboards en tiempo real: HTTP reqs, data sent/received, VU activity, iterations | ✅ |
| Capacidad | k6 (modo scale) | Pruebas con cantidad configurable (1-100 VUs), ramp-up/ramp-down stages, rate limiting | ✅ |

### Evidencia — Rendimiento (Performance Efficiency)

- Scripts k6: `tests/performance/k6-grafana/caso_*.js`
- Dashboards: Grafana Cloud (free tier)
- Reportes locales: `reportes/k6-*-summary.json`
- Comando: `npm run k6:caso01 -- --cantidad 10`

---

## 3. Compatibilidad (Compatibility)

| Sub-caracteristica | Herramienta(s) | Practica implementada | Estado |
| -------------------- | --------------- | ---------------------- | -------- |
| Coexistencia | Playwright (multi-browser) | Configurado para Chromium (default), Firefox, WebKit via `playwright.config.ts` | ⚠️ |
| Interoperabilidad | Postman + Newman | Tests API validan contratos de integracion entre Frontend, Enlinea y Backend | ✅ |

### Notas

- ⚠️ Las pruebas se ejecutan principalmente en Chromium. Firefox y WebKit estan configurados pero no se ejecutan sistematicamente en CI.
- Recomendacion: agregar job paralelo en CI para multi-browser.

---

## 4. Usabilidad (Usability)

| Sub-caracteristica | Herramienta(s) | Practica implementada | Estado |
| -------------------- | --------------- | ---------------------- | -------- |
| Reconocibilidad | — | No evaluado automaticamente | ❌ |
| Aprendibilidad | — | No evaluado automaticamente | ❌ |
| Operabilidad | — | No evaluado automaticamente | ❌ |
| Proteccion frente a errores | — | No evaluado automaticamente | ❌ |
| Estetica de interfaz | — | No evaluado automaticamente | ❌ |
| Accesibilidad | — | No evaluado automaticamente | ❌ |

### Notas — Usabilidad (Usability)

- ❌ Usabilidad requiere evaluacion humana (heuristica, eye-tracking, encuestas).
- Recomendacion: integrar herramientas como axe-core (accesibilidad) o Lighthouse (UX metrics) como complemento.

---

## 5. Fiabilidad (Reliability)

| Sub-caracteristica | Herramienta(s) | Practica implementada | Estado |
| -------------------- | --------------- | ---------------------- | -------- |
| Madurez | Playwright (retries) | Re-ejecucion automatica con `--retries`, evidencia de flaky tests en reportes Allure | ✅ |
| Disponibilidad | k6 (smoke test) | Caso 00 verifica disponibilidad del sistema antes de suites pesadas | ✅ |
| Tolerancia a fallos | Playwright (gates) | Evaluacion gate: `strict` (0 fallos) vs `tolerant` (>90% OK) configurable por pipeline | ✅ |
| Recuperabilidad | — | No evaluado automaticamente (requiere pruebas de failover/DR) | ❌ |

### Notas — Fiabilidad (Reliability)

- ⚠️ Recuperabilidad no esta cubierta (requiere infraestructura de staging con simulacion de caidas).

---

## 6. Seguridad (Security)

| Sub-caracteristica | Herramienta(s) | Practica implementada | Estado |
| -------------------- | --------------- | ---------------------- | -------- |
| Confidencialidad | Gitleaks | Escaneo de secretos/credenciales en repositorio | ✅ |
| Integridad | OWASP ZAP + Nuclei | Escaneo DAST contra aplicacion desplegada (XSS, injection, CSRF) | ✅ |
| No repudio | — | Cubierto por logs de auditoria del sistema (fuera de scope QA) | ✅ |
| Responsabilidad | Semgrep + CodeQL | SAST: patrones inseguros en codigo fuente, analisis semantico de flujos | ✅ |
| Autenticidad | Dependency-Check + Trivy | SCA: vulnerabilidades en dependencias (NPM, NuGet, Docker images) | ✅ |

### Evidencia — Seguridad (Security)

- ZAP: `reportes/owasp/zap-*.html`
- Nuclei: `reportes/owasp/nuclei-*.md`
- Gitleaks: `reportes/owasp/gitleaks-*.json`
- Semgrep: `reportes/owasp/semgrep-*.json`
- CodeQL: GitHub Security tab
- Dependency-Check: `reportes/owasp/dependency-check-*.html`
- Trivy: `reportes/owasp/trivy-*.json`

---

## 7. Mantenibilidad (Maintainability)

| Sub-caracteristica | Herramienta(s) | Practica implementada | Estado |
| -------------------- | --------------- | ---------------------- | -------- |
| Modularidad | SonarQube Community | Analisis de 4 proyectos independientes (frontend, backend, enlinea, config) | ✅ |
| Reusabilidad | SonarQube + Semgrep | Deteccion de duplicados, code smells, patrones anti-DRY | ✅ |
| Analizabilidad | SonarQube | Metricas: complexity, cognitive complexity, duplications, technical debt | ✅ |
| Modificabilidad | SonarQube | Issues tipo "Code Smell" miden esfuerzo de cambio | ✅ |
| Testeabilidad | — | No medida directamente (coverage requiere unit tests del proveedor) | ⚠️ |

### Evidencia — Mantenibilidad (Maintainability)

- SonarQube: `http://localhost:9000` — Proyectos: `si091reginsafrontend`, `si091reginsabackend`, `si091reginsaenlinea`, `si091reginsaconfig`
- Reportes fechados: `reportes/sonar-dated/`

### Notas — Mantenibilidad (Maintainability)

- ⚠️ Coverage de unit tests depende del equipo de desarrollo, no del QA externo.

---

## 8. Portabilidad (Portability)

| Sub-caracteristica | Herramienta(s) | Practica implementada | Estado |
| -------------------- | --------------- | ---------------------- | -------- |
| Adaptabilidad | Multi-pipeline | Framework funciona en 4 plataformas CI/CD: GitHub Actions, Azure DevOps, Jenkins, AWS | ✅ |
| Instalabilidad | Docs + Scripts | Guias de setup para Windows 11 y macOS, instalacion con un `npm install` | ✅ |
| Reemplazabilidad | — | No evaluado (no aplica directamente al QA framework) | ❌ |

---

## Resumen de acciones recomendadas

| Prioridad | ISO Caracteristica | Accion | Esfuerzo |
| ----------- | ------------------- | -------- | ---------- |
| Alta | Usabilidad | Integrar axe-core para pruebas de accesibilidad automatizadas | 2-3 dias |
| Media | Compatibilidad | Agregar ejecucion multi-browser sistematica en CI | 1 dia |
| Media | Fiabilidad | Disenar pruebas de recuperabilidad con entorno de staging | 3-5 dias |
| Baja | Mantenibilidad | Coordinar con proveedor para mejorar coverage de unit tests | Continuo |

---

## Firma

| Rol | Nombre | Fecha |
| ----- | -------- | ------- |
| Consultor QA | [COMPLETAR] | [DD/MM/YYYY] |
| Jefe de Proyecto | [COMPLETAR] | [DD/MM/YYYY] |
