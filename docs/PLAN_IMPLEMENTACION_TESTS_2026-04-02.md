# Plan de Implementación: Reorganización de Tests

## Paso 1: Auditoría de Estado Actual

### Estructura Existente
```
REGINSA/
├── tests/
│   ├── funcionales/          → 01-login-smoke.spec.ts (solo 1 archivo)
│   ├── performance/
│   │   ├── k6/              → k6_casos_locales (multiple)
│   │   └── k6-grafana/      → k6_casos_grafana (multiple)
│   ├── security/
│   │   └── zap/             → zap-config + scripts
│   ├── api/                 → (no existe, necesario)
│   ├── casos-prueba/        → (?) verificar contenido
│   ├── fixtures/            → (?) verificar contenido
│   ├── pages/               → (?) Page Objects
│   └── [otros]/
├── API_TEST/                → Colecciones Postman (migrar a tests/api/)
├── scripts/
│   ├── security/            → Runners SonarQube/ZAP (reorganizar)
│   ├── run-caso*.ps1        → (migrar a tests/performance/runners/)
│   └── [otros]/
└── reports/                 → (crear si no existe)
```

**ACCIÓN REQUERIDA:** Verificar contenido de:
- `tests/casos-prueba/` ¿qué tiene?
- `tests/fixtures/` ¿fixtures qué?
- `tests/pages/` ¿Page Objects o algo más?
- `tests/api/` ¿ya existe?

---

## Paso 2: Crear Estructura de Carpetas Nueva

### 2.1 Crear directorio base para E2E
```powershell
# En PowerShell dentro de REGINSA/
mkdir -Force "tests\e2e\cases\caso-01-agregar-admin" | Out-Null
mkdir -Force "tests\e2e\cases\caso-02-registrar-sancion" | Out-Null
mkdir -Force "tests\e2e\cases\caso-03-reconsiderar-sin-sanciones" | Out-Null
mkdir -Force "tests\e2e\cases\caso-04-reconsiderar-con-sanciones" | Out-Null
mkdir -Force "tests\e2e\page-objects" | Out-Null
mkdir -Force "tests\e2e\fixtures" | Out-Null
mkdir -Force "tests\e2e\utils" | Out-Null
```

### 2.2 Crear directorio base para API
```powershell
mkdir -Force "tests\api\collections" | Out-Null
mkdir -Force "tests\api\environments" | Out-Null
mkdir -Force "tests\api\test-data" | Out-Null
mkdir -Force "tests\api\runners" | Out-Null
```

### 2.3 Reorganizar Performance
```powershell
mkdir -Force "tests\performance\scripts\caso-00-smoke" | Out-Null
mkdir -Force "tests\performance\scripts\caso-01-add-admin" | Out-Null
mkdir -Force "tests\performance\scripts\caso-02-register-sancion" | Out-Null
mkdir -Force "tests\performance\scripts\caso-03-recons-sin-sancion" | Out-Null
mkdir -Force "tests\performance\scripts\caso-04-recons-con-sancion" | Out-Null
mkdir -Force "tests\performance\scripts\api-operations" | Out-Null
mkdir -Force "tests\performance\config" | Out-Null
mkdir -Force "tests\performance\lib" | Out-Null
mkdir -Force "tests\performance\runners" | Out-Null
mkdir -Force "tests\performance\fixtures" | Out-Null
```

### 2.4 Reorganizar Security
```powershell
mkdir -Force "tests\security\owasp-zap\configs" | Out-Null
mkdir -Force "tests\security\owasp-zap\rules" | Out-Null
mkdir -Force "tests\security\owasp-zap\reports" | Out-Null
mkdir -Force "tests\security\owasp-zap\runners" | Out-Null

mkdir -Force "tests\security\sonarqube\configs" | Out-Null
mkdir -Force "tests\security\sonarqube\reports" | Out-Null
mkdir -Force "tests\security\sonarqube\runners" | Out-Null
```

### 2.5 Crear reportes consolidados
```powershell
mkdir -Force "reports\e2e-results" | Out-Null
mkdir -Force "reports\k6-results" | Out-Null
mkdir -Force "reports\api-results" | Out-Null
mkdir -Force "reports\owasp-results" | Out-Null
mkdir -Force "reports\sonar-results" | Out-Null
mkdir -Force "reports\consolidated" | Out-Null
mkdir -Force "reports\archive" | Out-Null
```

---

## Paso 3: Migración de Archivos

### 3.1 Migrar Tests E2E (Playwright)
```powershell
# Mover test actual
Move-Item -Path "tests\funcionales\01-login-smoke.spec.ts" `
          -Destination "tests\e2e\cases\caso-01-agregar-admin\01-login-smoke.spec.ts" -Force

# Crear tests nuevos por caso (templates)
# 01-successful-flow.spec.ts
# 01-error-cases.spec.ts
# etc.
```

### 3.2 Migrar Tests Performance (k6)

**Opción A: Mantener estructura corta (recomendado)**
```powershell
# k6/ (local) → tests/performance/scripts/

# k6/k6_caso_00_smoke.js
# → tests/performance/scripts/caso-00-smoke/local.js

# k6-grafana/k6_caso_00_smoke.js
# → tests/performance/scripts/caso-00-smoke/grafana-cloud.js

# Estructura final:
tests/performance/scripts/
├── caso-00-smoke/
│   ├── local.js              (antes: k6/...)
│   └── grafana-cloud.js      (antes: k6-grafana/...)
├── caso-01-add-admin/
│   ├── local.js
│   └── grafana-cloud.js
├── caso-02-register-sancion/
│   ├── local.js
│   └── grafana-cloud.js
├── caso-03-recons-sin-sancion/
│   ├── local.js
│   └── grafana-cloud.js
├── caso-04-recons-con-sancion/
│   ├── local.js
│   └── grafana-cloud.js
└── api-operations/
    ├── buscar-entidades.js
    ├── eliminar-infraccion.js
    └── ocultar-cabecera.js
```

**Opción B: Mantener nombres largos (compatibilidad)**
```powershell
# Si tienes referencias externas a "k6/" o "k6-grafana/":
# Crear symlinks (PowerShell)
New-Item -ItemType SymbolicLink -Path "k6" -Target "tests\performance\scripts" -Force
New-Item -ItemType SymbolicLink -Path "k6-grafana" -Target "tests\performance\scripts" -Force
```

### 3.3 Migrar Colecciones Postman
```powershell
# API_TEST/postman/*.collection.json
# → tests/api/collections/

Move-Item -Path "API_TEST\postman\*.collection.json" `
          -Destination "tests\api\collections\" -Force

# API_TEST/postman/*environment.json
# → tests/api/environments/

Move-Item -Path "API_TEST\postman\*environment.json" `
          -Destination "tests\api\environments\" -Force
```

### 3.4 Migrar Configuraciones ZAP
```powershell
# tests/security/zap/*.yaml
# → tests/security/owasp-zap/configs/

Move-Item -Path "tests\security\zap\*.yaml" `
          -Destination "tests\security\owasp-zap\configs\" -Force
```

### 3.5 Migrar Runners PowerShell
```powershell
# scripts/run-caso*.ps1
# → tests/performance/runners/run-caso*.ps1

Move-Item -Path "scripts\run-caso*.ps1" `
          -Destination "tests\performance\runners\" -Force

# scripts/security/*.ps1 (escanear-repos-sonar.ps1, etc.)
# → tests/security/owasp-zap/runners/ + tests/security/sonarqube/runners/

Move-Item -Path "scripts\security\escanear-repos-sonar.ps1" `
          -Destination "tests\security\sonarqube\runners\" -Force

Move-Item -Path "scripts\security\generar-reportes-owasp-*.ps1" `
          -Destination "tests\security\owasp-zap\runners\" -Force
```

---

## Paso 4: Crear README por Subsección

### 4.1 tests/e2e/README.md
```markdown
# E2E Tests (Playwright)

## Ejecución Rápida
\`\`\`bash
npm run test:e2e              # Todos los casos
npm run test:caso:01          # Solo caso 01
npm run test:smoke            # Login solo
\`\`\`

## Estructura
- `cases/` : Tests por caso (01-04)
- `page-objects/` : Page Object Model
- `fixtures/` : Test data
- `utils/` : Helpers (assertions, waits)

## Casos
- **Caso 01**: Agregar Administrado (smoke + full flow + error cases)
- **Caso 02**: Registrar Sanción
- **Caso 03**: Reconsiderar sin Sanciones
- **Caso 04**: Reconsiderar con Sanciones (file upload)
```

### 4.2 tests/performance/README.md
```markdown
# Performance Tests (k6)

## Ejecución Rápida
\`\`\`bash
npm run test:perf:caso:04:local -- --cantidad=5      # Local
npm run test:perf:caso:04:cloud -- --cantidad=5      # Grafana Cloud
npm run test:perf:smoke                               # Smoke (caso 00)
\`\`\`

## Estructura
- `scripts/caso-XX/` : Scripts por caso (local.js + grafana-cloud.js)
- `config/` : Configuraciones compartidas (thresholds, env)
- `lib/` : Librerías reutilizables (http-client, auth, assertions)
- `fixtures/` : Datos de prueba, payloads
- `runners/` : PowerShell runners

## Casos
- **Caso 00**: Smoke (login simple)
- **Caso 01-04**: Flujos completos
- **api-operations/**: Tests de operaciones adicionales

## Thresholds
Definidos en `config/thresholds.js`:
- rate >= 0 (tolerante con 429)
- p95 < 5s
- error_rate < 5%
```

### 4.3 tests/api/README.md
```markdown
# API Tests (Postman/Newman)

## Ejecución Rápida
\`\`\`bash
npm run test:api              # Todos
npm run test:api:caso:03      # Solo caso 03
npm run test:api:smoke        # Smoke collections
\`\`\`

## Estructura
- `collections/` : Postman collections
- `environments/` : Variables por entorno (QA, staging, prod)
- `test-data/` : Payloads, bulk data
- `runners/` : Newman scripts

## Collections
- `reginsa-caso03-api-test.collection.json`
- `reginsa-caso04-api-test.collection.json`

## Pre-requisitos
- Newman instalado (`npm install -g newman`)
- Variables de entorno: BASE_URL, TOKEN
```

### 4.4 tests/security/README.md
```markdown
# Security Tests (OWASP ZAP + SonarQube)

## Ejecución Rápida
\`\`\`bash
npm run test:security         # OWASP ZAP + SonarQube
npm run test:security:zap     # Solo OWASP ZAP
npm run test:security:sonar   # Solo SonarQube
\`\`\`

## OWASP ZAP
- `owasp-zap/configs/` : zap-baseline.yaml, zap-full.yaml, zap-api.yaml
- `owasp-zap/runners/` : Scripts para ejecutar scans
- `owasp-zap/reports/` : Resultados HTML

## SonarQube
- `sonarqube/configs/` : sonar-project.properties
- `sonarqube/runners/` : Scripts escanear-repos-sonar.ps1
- `sonarqube/reports/` : Resultados JSON

## Flujo
1. Ejecutar escaneo (local o CI)
2. Generar reportes
3. Consolidar en reports/sonar-results/
```

---

## Paso 5: Actualizar package.json con npm scripts

### 5.1 Reorganizar scripts E2E
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:smoke": "playwright test --grep '01-LOGIN'",
    "test:caso:01": "playwright test --grep '01-AGREGAR'",
    "test:caso:02": "playwright test --grep '02-SANCION'",
    "test:caso:03": "playwright test --grep '03-RECONS-SIN'",
    "test:caso:04": "playwright test --grep '04-RECONS-CON'",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:headed": "playwright test --headed"
  }
}
```

### 5.2 Reorganizar scripts Performance
```json
{
  "scripts": {
    "test:perf:smoke": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/performance/runners/run-caso00.ps1",
    "test:perf:caso:00:local": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/performance/runners/run-caso00.ps1 -Local",
    "test:perf:caso:00:cloud": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/performance/runners/run-caso00.ps1 -Cloud",
    "test:perf:caso:01:local": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/performance/runners/run-caso01.ps1 -Local",
    "test:perf:caso:01:cloud": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/performance/runners/run-caso01.ps1 -Cloud",
    "test:perf:caso:02:local": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/performance/runners/run-caso02.ps1 -Local",
    "test:perf:caso:02:cloud": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/performance/runners/run-caso02.ps1 -Cloud",
    "test:perf:caso:03:local": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/performance/runners/run-caso03.ps1 -Local",
    "test:perf:caso:03:cloud": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/performance/runners/run-caso03.ps1 -Cloud",
    "test:perf:caso:04:local": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/performance/runners/run-caso04.ps1 -Local",
    "test:perf:caso:04:cloud": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/performance/runners/run-caso04.ps1 -Cloud"
  }
}
```

### 5.3 Scripts API & Security
```json
{
  "scripts": {
    "test:api": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/api/runners/run-api-tests.ps1",
    "test:api:smoke": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/api/runners/run-api-tests.ps1 -Smoke",
    "test:api:caso:03": "newman run tests/api/collections/reginsa-caso03-api-test.collection.json ...",
    "test:api:caso:04": "newman run tests/api/collections/reginsa-caso04-api-test.collection.json ...",
    
    "test:security": "npm run test:security:zap && npm run test:security:sonar",
    "test:security:zap": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/security/owasp-zap/runners/run-baseline.ps1",
    "test:security:zap:full": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/security/owasp-zap/runners/run-full.ps1",
    "test:security:sonar": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/security/sonarqube/runners/scan-all-repos.ps1",
    "test:security:sonar:frontend": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/security/sonarqube/runners/scan-frontend.ps1",
    "test:security:sonar:backend": "powershell -NoProfile -ExecutionPolicy Bypass -File tests/security/sonarqube/runners/scan-backend.ps1"
  }
}
```

### 5.4 Scripts de Suite Integrada
```json
{
  "scripts": {
    "test:suite:smoke": "npm run test:smoke && npm run test:api:smoke && npm run test:perf:smoke",
    "test:suite:regression": "npm run test:e2e && npm run test:api",
    "test:suite:nightly": "npm run test:e2e && npm run test:api && npm run test:perf:caso:04:local && npm run test:security:zap:full",
    "test:suite:enterprise": "npm run test:e2e && npm run test:api && npm run test:perf:caso:04:cloud && npm run test:security",
    "test:suite:full": "npm run test:suite:enterprise && npm run report:consolidate"
  }
}
```

---

## Paso 6: Actualizar .gitignore

```text
# Tests
tests/e2e/.auth/
tests/performance/results/
tests/security/reports/*
!tests/security/reports/.gitkeep

# Reports
reports/*
!reports/.gitkeep
!reports/archive/.gitkeep

# Temp files
.tmp-*.log
.tmp-*.exit
.scannerwork/

# Postman
tests/api/collections/.postman_uuid

# K6
.k6/
k6-results/
```

---

## Paso 7: Crear Archivos de Configuración Centrales

### 7.1 tests/performance/config/base-config.js
```javascript
// Configuración base reutilizable
export const BASE_CONFIG = {
  baseUrl: __ENV.BASE_URL || 'https://reginsaqa.sunedu.gob.pe',
  timeout: 30000,
  thinkTime: 500,
};

export const SETUP = {
  adminEmail: __ENV.ADMIN_EMAIL,
  adminPassword: __ENV.ADMIN_PASSWORD,
  RUN_ID: `RUN_${Date.now()}`,
};
```

### 7.2 tests/performance/config/thresholds.js
```javascript
// Umbrales reutilizables
export const THRESHOLDS = {
  'http_req_failed': ['rate<=0.05'],        // 5% max
  'http_req_duration': ['p(95)<5000'],      // p95 < 5s
  'http_requests': ['count>=10'],            // mínimo 10 requests
  'rate': ['rate>=0'],                       // tolerante con 429
};
```

### 7.3 tests/api/environments/qa-local.postman_environment.json
```json
{
  "name": "QA Local",
  "values": [
    {"key": "base_url", "value": "http://localhost:5000", "enabled": true},
    {"key": "admin_email", "value": "admin@test.local", "enabled": true},
    {"key": "token", "value": "", "enabled": true}
  ]
}
```

---

## Paso 8: Crear Runners Principales

### 8.1 scripts/run/run-smoke.ps1
```powershell
param([switch]$Local, [switch]$Cloud)

Write-Host "Ejecutando Smoke Tests..." -ForegroundColor Cyan

# E2E
Write-Host "`n[1/3] Smoke E2E..." -ForegroundColor Yellow
npm run test:smoke

# API
Write-Host "`n[2/3] Smoke API..." -ForegroundColor Yellow
npm run test:api:smoke

# Performance
Write-Host "`n[3/3] Smoke Performance (caso 00)..." -ForegroundColor Yellow
if ($Cloud) {
    npm run test:perf:caso:00:cloud -- --cantidad=1
} else {
    npm run test:perf:caso:00:local -- --cantidad=1
}

Write-Host "`n✓ Smoke tests completados" -ForegroundColor Green
```

### 8.2 scripts/run/run-regression.ps1
```powershell
Write-Host "Ejecutando Regression Tests..." -ForegroundColor Cyan

# E2E full
npm run test:e2e

# API full
npm run test:api

# Performance (casos 00-04 local)
foreach ($caso in 0..4) {
    npm run "test:perf:caso:$('{0:d2}' -f $caso):local" -- --cantidad=5
}

# SonarQube
npm run test:security:sonar

Write-Host "`n✓ Regression tests completados" -ForegroundColor Green
```

---

## Paso 9: Actualizar Documentación

### 9.1 Crear TEST_EXECUTION_GUIDE.md
```markdown
# Guía de Ejecución de Tests

## Quick Start
\`\`\`bash
npm run test:suite:smoke        # 2-3 min, rápido
npm run test:suite:regression   # 15-20 min
npm run test:suite:nightly      # 45-60 min, completo
\`\`\`

## Por Tipo
- **E2E**: npm run test:e2e
- **API**: npm run test:api
- **Performance**: npm run test:perf:caso:04:local -- --cantidad=10
- **Security**: npm run test:security

## Resultados
- E2E: reports/e2e-results/
- K6: reports/k6-results/
- API: reports/api-results/
- ZAP: reports/owasp-results/
- SonarQube: reports/sonar-results/
```

---

## Paso 10: Validar & Limpiar

### 10.1 Checklist de Migración
- [ ] Carpetas nuevas creadas
- [ ] Archivos movidos sin errores
- [ ] package.json actualizado
- [ ] npm scripts funcionan (test run)
- [ ] .gitignore actualizado
- [ ] READMEs creados
- [ ] Referencias internas actualizadas (si las hay)
- [ ] Workflows CI/CD actualizados (mañana)

### 10.2 Limpiar Carpetas Antiguas
```powershell
# DESPUÉS de verificar que todo funciona:
Remove-Item -Path "tests\funcionales" -Recurse -Force
Remove-Item -Path "tests\performance\k6" -Recurse -Force     # o mantener symlink
Remove-Item -Path "tests\performance\k6-grafana" -Recurse -Force
Remove-Item -Path "API_TEST" -Recurse -Force
# NO ELIMINAR: scripts/security/ hasta migrar completamente
```

---

## Paso 11: Tiempo Estimado

| Paso | Duración | Notas |
|------|----------|-------|
| 1. Auditoría | 15 min | Revisar qué existe |
| 2. Crear carpetas | 5 min | Comandos PowerShell |
| 3. Migrar archivos | 20 min | Move-Item loop |
| 4. READMEs | 20 min | Copiar templates |
| 5. package.json | 15 min | Agregar scripts |
| 6. gitignore | 5 min | Merge patterns |
| 7. Configs centrales | 15 min | base-config.js, etc. |
| 8. Runners principales | 20 min | PowerShell scripts |
| 9. Documentación | 15 min | TEST_EXECUTION_GUIDE |
| 10. Validar | 30 min | Test run, verificar |
| **TOTAL** | **~2.5 horas** | Puedo hacerlo en 1 sesión |

---

## Próximos Pasos

1. **¿Te parece bien esta estructura?** ¿Algún ajuste antes de empezar?
2. **¿Empiezo ahora con la migración?** Puedo hacer paso 1-10 automáticamente
3. **¿Prefieres solo estructura sin migrar?** Solo crear carpetas + DOCs
4. **¿Qué piensas de los npm scripts?** ¿Demasiados? ¿Faltan algunos?

**Tu decisión:**
- Opción A: Migración completa (recomendado)
- Opción B: Solo crear estructura + manual después
- Opción C: Solo README + documentación sin reorganizar
