# Matriz de Herramientas vs ISO/IEC 25010 — QA REGINSA

**Proyecto**: SI-091 REGINSA
**Fecha**: [DD/MM/YYYY]

> Matriz de trazabilidad que cruza las 13 herramientas del framework QA con las 8 caracteristicas de calidad ISO/IEC 25010.

---

## Matriz de cobertura

| Herramienta | Funcionalidad | Rendimiento | Compatibilidad | Usabilidad | Fiabilidad | Seguridad | Mantenibilidad | Portabilidad |
| ------------- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Playwright** | ●● | · | ● | · | ● | · | · | · |
| **k6 OSS** | · | ●● | · | · | ● | · | · | · |
| **Grafana Cloud** | · | ●● | · | · | · | · | · | · |
| **Postman/Newman** | ●● | · | ● | · | · | · | · | · |
| **SonarQube Community** | · | · | · | · | · | ● | ●● | · |
| **OWASP ZAP** | · | · | · | · | · | ●● | · | · |
| **Nuclei** | · | · | · | · | · | ●● | · | · |
| **Gitleaks** | · | · | · | · | · | ●● | · | · |
| **Semgrep** | · | · | · | · | · | ●● | ● | · |
| **CodeQL** | · | · | · | · | · | ●● | ● | · |
| **Dependency-Check** | · | · | · | · | · | ●● | · | · |
| **Trivy** | · | · | · | · | · | ●● | · | · |
| **Allure** | ● | · | · | · | · | · | · | · |

**Leyenda**: ●● = Contribucion principal | ● = Contribucion secundaria | · = No aplica

---

## Detalle por caracteristica ISO 25010

### 1. Funcionalidad (Functional Suitability)

| Herramienta | Sub-caracteristica cubierta | Como contribuye |
| ------------- | --------------------------- | ---------------- |
| Playwright | Completitud, Correctitud, Pertinencia | 5 flujos E2E completos + validaciones de datos por pantalla |
| Postman/Newman | Completitud, Correctitud | Tests API por endpoint: status codes, response bodies, schemas |
| Allure | Reporting | Dashboard visual de resultados funcionales con historial |

### 2. Rendimiento (Performance Efficiency)

| Herramienta | Sub-caracteristica cubierta | Como contribuye |
| ------------- | --------------------------- | ---------------- |
| k6 OSS | Tiempo de respuesta, Capacidad | Scripts con thresholds para p95, failed rate; ramp-up stages |
| Grafana Cloud | Utilizacion de recursos | Dashboards en tiempo real: HTTP reqs/s, data sent, VU activity |

### 3. Compatibilidad (Compatibility)

| Herramienta | Sub-caracteristica cubierta | Como contribuye |
| ------------- | --------------------------- | ---------------- |
| Playwright | Coexistencia | Multi-browser: Chromium (default), Firefox, WebKit |
| Postman/Newman | Interoperabilidad | Tests de contratos API entre Frontend, Enlinea y Backend |

### 4. Usabilidad (Usability)

> No cubierta actualmente. Requiere evaluacion humana o herramientas especializadas (axe-core, Lighthouse).

### 5. Fiabilidad (Reliability)

| Herramienta | Sub-caracteristica cubierta | Como contribuye |
| ------------- | --------------------------- | ---------------- |
| Playwright | Madurez, Tolerancia a fallos | Retries automaticos, gate evaluation (strict/tolerant) |
| k6 OSS | Disponibilidad | Smoke test (caso 00) verifica sistema antes de suites |

### 6. Seguridad (Security)

| Herramienta | Sub-caracteristica cubierta | Como contribuye |
| ------------- | --------------------------- | ---------------- |
| OWASP ZAP | Integridad | DAST: escaneo activo de XSS, SQL injection, CSRF |
| Nuclei | Integridad | DAST: deteccion de CVEs conocidos con templates actualizados |
| Gitleaks | Confidencialidad | Deteccion de secretos/credenciales/tokens en codigo |
| Semgrep | Responsabilidad | SAST: patrones inseguros (hardcoded creds, eval, insecure crypto) |
| CodeQL | Responsabilidad | SAST: analisis semantico de flujos de datos (taint tracking) |
| Dependency-Check | Autenticidad | SCA: CVEs en dependencias Java/NuGet con base NVD |
| Trivy | Autenticidad | SCA: vulnerabilidades en Docker images + NPM packages |

### 7. Mantenibilidad (Maintainability)

| Herramienta | Sub-caracteristica cubierta | Como contribuye |
| ------------- | --------------------------- | ---------------- |
| SonarQube Community | Modularidad, Reusabilidad, Analizabilidad, Modificabilidad | Metricas: bugs, code smells, duplications, complexity, debt |
| Semgrep | Analizabilidad | Deteccion de patrones que dificultan mantenimiento |
| CodeQL | Analizabilidad | Analisis de flujos de datos complejos en el codigo |

### 8. Portabilidad (Portability)

| Herramienta | Sub-caracteristica cubierta | Como contribuye |
| ------------- | --------------------------- | ---------------- |
| GitHub Actions | Adaptabilidad, Instalabilidad | 35+ workflows + reusable workflows |
| Azure DevOps | Adaptabilidad | Pipelines de referencia portados desde GitHub Actions |
| Jenkins | Adaptabilidad | Jenkinsfiles Windows/Linux |
| AWS CodeBuild | Adaptabilidad | buildspec.yml por herramienta |

---

## Mapa de cobertura visual

```text
                    FUNC  REND  COMP  USAB  FIAB  SEGU  MANT  PORT
                    ─────────────────────────────────────────────────
Playwright          ████  ░░░░  ██░░  ░░░░  ██░░  ░░░░  ░░░░  ░░░░
k6 OSS              ░░░░  ████  ░░░░  ░░░░  ██░░  ░░░░  ░░░░  ░░░░
Grafana Cloud       ░░░░  ████  ░░░░  ░░░░  ░░░░  ░░░░  ░░░░  ░░░░
Postman/Newman      ████  ░░░░  ██░░  ░░░░  ░░░░  ░░░░  ░░░░  ░░░░
SonarQube           ░░░░  ░░░░  ░░░░  ░░░░  ░░░░  ██░░  ████  ░░░░
OWASP ZAP           ░░░░  ░░░░  ░░░░  ░░░░  ░░░░  ████  ░░░░  ░░░░
Nuclei              ░░░░  ░░░░  ░░░░  ░░░░  ░░░░  ████  ░░░░  ░░░░
Gitleaks            ░░░░  ░░░░  ░░░░  ░░░░  ░░░░  ████  ░░░░  ░░░░
Semgrep             ░░░░  ░░░░  ░░░░  ░░░░  ░░░░  ████  ██░░  ░░░░
CodeQL              ░░░░  ░░░░  ░░░░  ░░░░  ░░░░  ████  ██░░  ░░░░
Dep-Check           ░░░░  ░░░░  ░░░░  ░░░░  ░░░░  ████  ░░░░  ░░░░
Trivy               ░░░░  ░░░░  ░░░░  ░░░░  ░░░░  ████  ░░░░  ░░░░
Allure              ██░░  ░░░░  ░░░░  ░░░░  ░░░░  ░░░░  ░░░░  ░░░░
                    ─────────────────────────────────────────────────
Cobertura           ALTA  ALTA  MEDIA BAJA  MEDIA ALTA  ALTA  MEDIA
```

---

## Gaps identificados y plan de cierre

| Gap | Caracteristica ISO | Solucion propuesta | Herramienta sugerida | Costo |
| ----- | ------------------- | ------------------- | --------------------- | ------- |
| Sin pruebas de usabilidad automatizadas | Usabilidad | Agregar axe-core para accesibilidad WCAG 2.1 | axe-core | Gratis |
| Sin metricas Lighthouse | Usabilidad | Integrar Lighthouse CI para Core Web Vitals | Lighthouse CI | Gratis |
| Multi-browser no sistematico en CI | Compatibilidad | Agregar matrix de browsers en workflow | Playwright built-in | Gratis |
| Sin pruebas de recuperabilidad | Fiabilidad | Script de chaos/failover en staging | Scripts custom | Gratis |
| Coverage de unit tests no medido | Mantenibilidad | Coordinar con proveedor para integrar en pipeline | Jest/xUnit | Gratis |
