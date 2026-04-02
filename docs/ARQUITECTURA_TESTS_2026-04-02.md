# Arquitectura Profesional de Tests - REGINSA

## 1. Estructura de Carpetas Multi-Niveles

```
REGINSA/
├── tests/                              # Raíz de todos los tests
│   ├── README.md                       # Índice y guía de ejecución
│   │
│   ├── unit/                           # Tests unitarios (futuros)
│   │   └── README.md
│   │
│   ├── integration/                    # Tests de integración (futuros)
│   │   └── README.md
│   │
│   ├── e2e/                            # Tests End-to-End (Playwright)
│   │   ├── README.md
│   │   ├── playwright.config.ts        # Configuración Playwright (referencia)
│   │   ├── fixtures/                   # Datos compartidos
│   │   │   ├── users.json
│   │   │   ├── entities.json
│   │   │   └── test-data.ts
│   │   ├── cases/                      # Casos de prueba organizados
│   │   │   ├── caso-01-agregar-admin/
│   │   │   │   ├── 01-login-smoke.spec.ts
│   │   │   │   ├── 01-successful-flow.spec.ts
│   │   │   │   └── 01-error-cases.spec.ts
│   │   │   ├── caso-02-registrar-sancion/
│   │   │   │   ├── 02-successful-flow.spec.ts
│   │   │   │   ├── 02-incomplete-data.spec.ts
│   │   │   │   └── 02-error-cases.spec.ts
│   │   │   ├── caso-03-reconsiderar-sin-sanciones/
│   │   │   │   ├── 03-successful-flow.spec.ts
│   │   │   │   └── 03-error-cases.spec.ts
│   │   │   └── caso-04-reconsiderar-con-sanciones/
│   │   │       ├── 04-successful-flow.spec.ts
│   │   │       ├── 04-file-upload.spec.ts
│   │   │       └── 04-error-cases.spec.ts
│   │   ├── page-objects/               # Page Object Model
│   │   │   ├── base.page.ts
│   │   │   ├── login.page.ts
│   │   │   ├── admin.page.ts
│   │   │   ├── sancion.page.ts
│   │   │   └── reconsideracion.page.ts
│   │   └── utils/                      # Utilidades Playwright
│   │       ├── test-helpers.ts
│   │       ├── assertions.ts
│   │       └── waits.ts
│   │
│   ├── performance/                    # Tests de Performance (k6)
│   │   ├── README.md
│   │   ├── config/                     # Configuraciones compartidas
│   │   │   ├── base-config.js
│   │   │   ├── thresholds.js           # Definiciones de umbrales
│   │   │   └── env-variables.js
│   │   ├── fixtures/                   # Datos de prueba
│   │   │   ├── payloads.js
│   │   │   ├── test-accounts.json
│   │   │   ├── bulk-data.csv
│   │   │   └── mock-files/
│   │   │       └── sample.pdf
│   │   ├── scripts/                    # Scripts k6 organizados por caso
│   │   │   ├── caso-00-smoke/
│   │   │   │   ├── local.js            # Output local (stdout)
│   │   │   │   └── grafana-cloud.js    # Output cloud.k6.io
│   │   │   ├── caso-01-add-admin/
│   │   │   │   ├── local.js
│   │   │   │   └── grafana-cloud.js
│   │   │   ├── caso-02-register-sancion/
│   │   │   │   ├── local.js
│   │   │   │   └── grafana-cloud.js
│   │   │   ├── caso-03-recons-sin-sancion/
│   │   │   │   ├── local.js
│   │   │   │   └── grafana-cloud.js
│   │   │   ├── caso-04-recons-con-sancion/
│   │   │   │   ├── local.js
│   │   │   │   └── grafana-cloud.js
│   │   │   └── api-operations/         # Tests de operaciones API adicionales
│   │   │       ├── buscar-entidades.js
│   │   │       ├── eliminar-infraccion.js
│   │   │       └── ocultar-cabecera.js
│   │   ├── lib/                        # Librerías k6 compartidas
│   │   │   ├── http-client.js
│   │   │   ├── auth-handler.js
│   │   │   ├── data-generator.js
│   │   │   ├── assertions.js
│   │   │   └── reporters.js
│   │   └── runners/                    # PowerShell runners
│   │       ├── run-caso00.ps1
│   │       ├── run-caso01.ps1
│   │       ├── run-caso02.ps1
│   │       ├── run-caso03.ps1
│   │       ├── run-caso04.ps1
│   │       └── run-api-operations.ps1
│   │
│   ├── api/                            # Tests API (Postman/Newman)
│   │   ├── README.md
│   │   ├── collections/                # Colecciones Postman
│   │   │   ├── reginsa-caso03-api-test.collection.json
│   │   │   └── reginsa-caso04-api-test.collection.json
│   │   ├── environments/               # Definiciones de entorno
│   │   │   ├── qa-local.postman_environment.json
│   │   │   ├── qa-staging.postman_environment.json
│   │   │   └── qa-production.postman_environment.json
│   │   ├── pre-scripts/                # Pre/post request scripts
│   │   │   ├── auth-setup.js
│   │   │   └── token-refresh.js
│   │   ├── test-data/                  # Datos de prueba
│   │   │   ├── admin-payloads.json
│   │   │   ├── sancion-payloads.json
│   │   │   └── bulk-test-cases.csv
│   │   └── runners/                    # Newman runners
│   │       ├── run-api-tests.ps1
│   │       └── run-api-tests-bulk.ps1
│   │
│   ├── security/                       # Tests de Seguridad
│   │   ├── README.md
│   │   ├── owasp-zap/                  # OWASP ZAP scanning
│   │   │   ├── README.md
│   │   │   ├── configs/
│   │   │   │   ├── zap-baseline.yaml
│   │   │   │   ├── zap-full.yaml
│   │   │   │   └── zap-api.yaml
│   │   │   ├── rules/                  # Reglas personalizadas
│   │   │   │   └── falsos-positivos.rules
│   │   │   ├── reports/                # Reportes generados
│   │   │   │   ├── baseline-latest.html
│   │   │   │   ├── full-latest.html
│   │   │   │   └── api-latest.html
│   │   │   └── runners/
│   │   │       ├── run-baseline.ps1
│   │   │       ├── run-full.ps1
│   │   │       └── run-api-scan.ps1
│   │   │
│   │   ├── sonarqube/                  # SonarQube scanning
│   │   │   ├── README.md
│   │   │   ├── configs/
│   │   │   │   ├── sonar-project.properties (raíz)
│   │   │   │   ├── frontend-sonar.properties
│   │   │   │   ├── backend-sonar.properties
│   │   │   │   └── enlinea-sonar.properties
│   │   │   ├── exclusions/             # Patrones de exclusión
│   │   │   │   └── sonar-exclusions.rules
│   │   │   ├── rules/                  # Reglas y perfiles
│   │   │   │   └── reginsa-quality-profile.json
│   │   │   ├── reports/                # Reportes generados
│   │   │   │   ├── server-metrics.txt
│   │   │   │   └── quality-gate-status.json
│   │   │   └── runners/
│   │   │       ├── scan-all-repos.ps1
│   │   │       ├── scan-frontend.ps1
│   │   │       ├── scan-backend.ps1
│   │   │       └── scan-enlinea.ps1
│   │   │
│   │   └── compliance/                 # Tests de cumplimiento
│   │       ├── owasp-top10.md
│   │       ├── pci-dss.md
│   │       └── gdpr-validations.ts
│   │
│   └── data/                           # Datos compartidos
│       ├── test-fixtures/
│       ├── mock-responses/
│       └── seeds/
│
├── scripts/
│   ├── run/                            # Runners inteligentes
│   │   ├── run-all-tests.ps1           # Ejecuta suite completa
│   │   ├── run-smoke.ps1               # Solo smoke tests
│   │   ├── run-regression.ps1          # Suite de regresión
│   │   ├── run-nightly.ps1             # Suite nocturna
│   │   └── run-performance.ps1         # Solo performance
│   │
│   ├── ci/                             # Helpers de CI
│   │   ├── setup-env.ps1
│   │   ├── validate-credentials.ps1
│   │   └── report-results.ps1
│   │
│   └── reports/                        # Generación de reportes
│       ├── merge-reports.ps1           # Consolida todos los reportes
│       └── generate-dashboard.ps1      # Dashboard HTML
│
├── reports/                            # Reportes consolidados
│   ├── allure-results/                 # Allure reportes E2E
│   ├── k6-results/                     # Resultados k6
│   ├── sonar-results/                  # Resultados SonarQube
│   ├── zap-results/                    # Resultados OWASP ZAP
│   ├── postman-results/                # Resultados Newman
│   ├── consolidated/                   # Reportes consolidados
│   │   ├── daily-summary.html
│   │   ├── quality-dashboard.html
│   │   └── compliance-report.html
│   └── archive/                        # Histórico de reportes
│
├── .github/workflows/
│   ├── tests-smoke.yml                 # Workflow smoke tests
│   ├── tests-regression.yml            # Workflow regresión
│   ├── tests-nightly.yml               # Workflow nocturno
│   ├── tests-performance.yml           # Workflow performance
│   ├── tests-api.yml                   # Workflow API
│   └── tests-security.yml              # Workflow security
│
└── docs/
    ├── TESTING_STRATEGY.md             # Estrategia global
    ├── TEST_EXECUTION_GUIDE.md         # Cómo ejecutar tests
    ├── TEST_DATA_MANAGEMENT.md         # Gestión de datos
    └── CONTINUOUS_INTEGRATION.md       # CI/CD integration
```

---

## 2. Clasificación de Tests por Pirámide

```
                    ╭─────┬─────╮
                    │  E2E │  5% │  Casos funcionales (Playwright)
                    ├─────┴─────┤
                  ╭─│   API Tests│  15% │  Postman/Newman
                  │ ├───────────┤      │
                  │ │Performance │  20% │  K6 + Grafana Cloud
                ╭─┼─│ Security  │  20% │  OWASP ZAP + SonarQube
              │ │ ├───────────┤      │
              │ │ │   Unit    │  40% │  Unitarios (futuros)
              ╰─┴─╰─────┬─────╯
                      Base estable
```

**Ratios sugeridos:**
- **E2E (5%)**: 4 casos × 1-2 tests = ~5 tests
- **API (15%)**: Colecciones Postman con múltiples requests
- **Performance (20%)**: k6 casos 00-04 + API operations
- **Security (20%)**: OWASP ZAP baseline + full + SonarQube
- **Unit (40%)**: Tests unitarios (organización futura)

---

## 3. Matriz de Ejecución: Cuándo Correr Qué

| Trigger | E2E | API | Performance | Security | Reportes |
|---------|-----|-----|-------------|----------|----------|
| **Pre-commit** (local) | ✓ smoke | - | - | ✓ sonar (rápido) | - |
| **PR/MR check** | ✓ smoke | ✓ rápido | - | ✓ sonar | dashboard |
| **Nightly** (2am) | ✓ full | ✓ full | ✓ k6 local | ✓ ZAP full | ✓ completo |
| **Weekly** (Fri 6pm) | ✓ regresión | ✓ all | ✓ k6 grafana | ✓ ZAP+sonar | ✓ histórico |
| **On-demand** | ✓ any | ✓ bulk | ✓ stress | ✓ specific | ✓ custom |

---

## 4. Naming Conventions (Convenciones)

### Tests E2E (Playwright)
```
{caso-number}-{area}-{scenario}.spec.ts

Ejemplos:
  01-admin-login-success.spec.ts
  01-admin-login-invalid-credentials.spec.ts
  02-sancion-complete-flow.spec.ts
  02-sancion-missing-fields.spec.ts
  04-recons-file-upload-pdf.spec.ts
```

### Scripts Performance (k6)
```
{caso-number}-{operation}.js o {operation}-{variant}.js

Ejemplos:
  tests/performance/scripts/caso-00-smoke/local.js
  tests/performance/scripts/caso-04-recons-con-sancion/grafana-cloud.js
  tests/performance/scripts/api-operations/buscar-entidades.js
```

### Colecciones API (Postman)
```
reginsa-{caso-number}-{workflow}.collection.json

Ejemplos:
  reginsa-caso03-api-contracts.collection.json
  reginsa-caso04-api-file-operations.collection.json
```

### Configuraciones Seguridad
```
{tool}-{scope}-{mode}.{yaml|properties}

Ejemplos:
  zap-baseline.yaml
  zap-full-api.yaml
  sonar-project.properties
  sonar-frontend-exclusions.rules
```

---

## 5. Ejecución desde npm scripts

### Smoke Tests (rápido, sin dependencias externas)
```bash
npm run test:smoke           # Playwright smoke
npm run test:api:smoke       # Postman smoke collections
npm run test:perf:smoke      # K6 caso 00 local
npm run test:security:quick  # SonarQube análisis rápido
```

### Full Test Suites
```bash
npm run test:e2e             # Todos los E2E (Playwright)
npm run test:api             # Todos los API (Newman)
npm run test:performance     # Todos los K6 (local)
npm run test:performance:cloud # Todos los K6 (Grafana Cloud)
npm run test:security        # OWASP ZAP + SonarQube
```

### Caso Específico
```bash
npm run test:caso:01         # E2E caso 01
npm run test:perf:caso:01    # K6 caso 01 local
npm run test:perf:caso:01:cloud # K6 caso 01 Grafana Cloud
npm run test:api:caso:03     # API contracts caso 03
```

### Suites Integradas (múltiples test types)
```bash
npm run test:suite:smoke          # E2E + API smoke + K6 caso00
npm run test:suite:regression     # E2E full + API full
npm run test:suite:nightly        # E2E + API + K6 local + ZAP full
npm run test:suite:enterprise     # E2E + API + K6 Grafana + SonarQube
npm run test:suite:full           # TODO: E2E + API + K6 + ZAP + SonarQube
```

### Reportes
```bash
npm run report:consolidate        # Mezcla todos los reportes
npm run report:dashboard          # Genera dashboard HTML
npm run report:archive            # Archiva resultados históricos
```

---

## 6. Integración CI/CD (Pipelines)

### GitHub Actions (Self-hosted)
```yaml
# .github/workflows/tests-smoke.yml
on: [push, pull_request]
jobs:
  smoke-tests:
    runs-on: [self-hosted, windows]
    steps:
      - npm run test:smoke
      - npm run test:api:smoke
      - npm run test:perf:smoke

# .github/workflows/tests-nightly.yml
on: schedule: [cron: '0 2 * * *']
jobs:
  full-tests:
    runs-on: [self-hosted, windows]
    steps:
      - npm run test:suite:nightly
      - npm run report:consolidate
```

### Jenkins / Azure DevOps / AWS CodeBuild
Similar structure con stages/jobs por tipo de test

---

## 7. Estrategia de Datos Compartidos

### Fixtures (datos reutilizables)
```typescript
// tests/e2e/fixtures/test-data.ts
export const TEST_ACCOUNTS = {
  admin: { email: '...', password: '...' },
  viewer: { email: '...', password: '...' }
};

export const TEST_ENTITIES = [
  { id: 'E001', name: 'Entidad Test 1' },
  { id: 'E002', name: 'Entidad Test 2' }
];
```

### Payloads (datos dinámicos)
```javascript
// tests/performance/fixtures/payloads.js
export function generateAdminPayload() {
  return {
    tipoEntidad: 'PUBLICA',
    nombre: `Admin_${Date.now()}`,
    ruc: generateRUC()
  };
}
```

### Seeds (limpieza/preparación)
```bash
npm run data:seed            # Carga datos iniciales
npm run data:cleanup         # Limpia datos de prueba
npm run data:reset           # Reset completo
```

---

## 8. Gestión de Resultados & Reportes

### Consolidación de Reportes
```
reportes/
├── E2E/              → allure-results/ → Dashboard Allure
├── Performance/      → k6-results/     → JSON k6
├── API/              → postman-results/ → Newman reports
├── Security/
│   ├── OWASP/        → zap-results/    → HTML ZAP
│   └── SonarQube/    → sonar-results/  → JSON + UI
├── consolidated/     → daily-summary.html + dashboard
└── archive/          → YYYY-MM-DD/ (histórico)
```

### Dashboard Consolidado
Se genera con npm scripts que mezclan:
- Snapshots E2E (passed/failed/skipped)
- Métricas K6 (p95, throughput, errores)
- Vulnerabilidades OWASP ZAP
- Code quality issues SonarQube
- Coverage API (% endpoints probados)

---

## 9. Ejemplo: Ejecutar Caso 04 Completo

```bash
# 1. E2E (Playwright)
npm run test:caso:04         # Ejecuta 04-reconsiderar-con-sanciones full flow

# 2. API (Postman)
npm run test:api:caso:04     # Ejecuta reginsa-caso04-api-test.collection.json

# 3. Performance (k6 local)
npm run test:perf:caso:04:local -- --cantidad=10

# 4. Performance (k6 Grafana Cloud)
npm run test:perf:caso:04:cloud -- --cantidad=10

# 5. Consolidar todo
npm run report:consolidate

# Resultado: reportes/consolidated/daily-summary.html con:
# - E2E: ✓ 2 tests passed
# - API: ✓ 15 requests OK
# - K6 local: ✓ 10/10 iterations
# - K6 cloud: ✓ métricas en Grafana
```

---

## 10. Beneficios de Esta Arquitectura

✅ **Escalabilidad**: Agregar nuevos tests sin conflictos
✅ **Mantenibilidad**: Carpetas claras, convenciones nombrado
✅ **Reutilización**: Fixtures, librerías k6, page-objects
✅ **CI/CD Ready**: Workflows parametrizables
✅ **Reportes Consolidados**: Dashboard único
✅ **Múltiples Tecnologías**: E2E + API + Performance + Security coexisten
✅ **Independencia**: Cada test type puede ejecutarse solo
✅ **Versionamiento**: Histórico de resultados por carpetas fechadas

---

## 11. Hoja de Ruta: Implementación

**Fase 1 (Semana 1):** Reorganizar carpetas existentes
- Mover tests/funcionales → tests/e2e/cases/
- Mover tests/performance → tests/performance/ (ya existe, refactorizar)
- Crear tests/api/ con Postman collections
- Crear tests/security/ con OWASP + SonarQube

**Fase 2 (Semana 2):** Crear runners inteligentes
- scripts/run/run-smoke.ps1
- scripts/run/run-regression.ps1
- npm scripts unificados

**Fase 3 (Semana 3):** Consolidación de reportes
- Merge de Allure + k6 + Newman + ZAP
- Dashboard HTML único

**Fase 4 (Semana 4):** Integración CI/CD
- Workflows GitHub Actions
- Jenkins pipelines
- Azure DevOps

---

## 12. Próximos Pasos

1. ¿Apruebas esta estructura?
2. ¿Necesitas ajustes en las carpetas o convenciones?
3. ¿Prefieres empezar reorganizando o creando runners primero?
