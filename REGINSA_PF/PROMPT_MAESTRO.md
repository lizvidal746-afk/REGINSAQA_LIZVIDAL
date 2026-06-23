# 🚀 Prompt Maestro — Replicar Proyecto REGINSA_PF

> **Propósito**: Este prompt contiene TODO lo necesario para que un agente IA (o un desarrollador) replique el proyecto REGINSA_PF desde cero, incluyendo estructura, arquitectura, configuración, Page Objects, tests, helpers, tools, reportes y runner. Sigue el orden exacto para garantizar coherencia.

---

## 📋 Instrucciones de Uso

1. Lee este documento COMPLETO antes de empezar.
2. Sigue las secciones en orden — cada una depende de la anterior.
3. No saltes secciones ni cambies el orden de los archivos dentro de cada sección.
4. Verifica que cada archivo se creó correctamente antes de pasar al siguiente.
5. Al finalizar, ejecuta `npm install`, `npx playwright install chromium`, y verifica con `npm run pf:list:caso02`.

---

## FASE 0 — Preparación del Entorno

### 0.1 Estructura de Directorios

Crear la siguiente estructura de carpetas vacías:

```
REGINSA_PF/
run-ui-tests.ps1
playwright_ui/
  .auth/
  .tmp/
  allure-results/
  errors/
  fixtures/
  helpers/
  pages/
  reportes/
  screenshots/
  test-files/
  test-results/
  tests/
    fixtures/
    legacy_tests/
    utilidades/
  tools/
    lib/
```

### 0.2 package.json

```json
{
  "name": "reginsa-playwright-ui",
  "version": "1.0.0",
  "description": "Suite de Pruebas UI con Playwright para REGINSA",
  "scripts": {
    "test": "playwright test",
    "test:smoke": "playwright test --project=ui-smoke",
    "test:regression": "playwright test --project=ui-regression",
    "test:ui": "playwright test --ui",
    "allure:generate": "powershell -ExecutionPolicy Bypass -Command \"$r=Get-ChildItem .\\reportes -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(!$r){throw 'No hay corridas en .\\reportes'}; allure generate (Join-Path $r.FullName '_technical\\allure-results') --clean -o (Join-Path $r.FullName '_technical\\allure-report')\"",
    "allure:open": "powershell -ExecutionPolicy Bypass -Command \"$r=Get-ChildItem .\\reportes -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(!$r){throw 'No hay corridas en .\\reportes'}; Start-Process (Join-Path $r.FullName '_technical\\allure-report\\index.html')\"",
    "report:playwright:open": "powershell -ExecutionPolicy Bypass -Command \"$r=Get-ChildItem .\\reportes -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(!$r){throw 'No hay corridas en .\\reportes'}; Start-Process (Join-Path $r.FullName '_technical\\playwright-report\\index.html')\"",
    "report:allure:generate": "npm run allure:generate",
    "report:allure:open": "npm run allure:open",
    "smoke": "npm run pf:smoke:caso02",
    "smoke:headed": "npm run pf:smoke:caso02:headed",
    "smoke:headed:fast": "npm run pf:smoke:caso02:headed:reuse-auth",
    "report:html": "powershell -ExecutionPolicy Bypass -Command \"$r=Get-ChildItem .\\reportes -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(!$r){throw 'No hay corridas en .\\reportes'}; node tools/generar-html.js (Join-Path $r.FullName '_technical\\playwright-report\\pf-report.json') $r.FullName\"",
    "report:excel": "powershell -ExecutionPolicy Bypass -Command \"$r=Get-ChildItem .\\reportes -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(!$r){throw 'No hay corridas en .\\reportes'}; node tools/generar-excel.js (Join-Path $r.FullName '_technical\\playwright-report\\results.json') $r.FullName\"",
    "report:word": "powershell -ExecutionPolicy Bypass -Command \"$r=Get-ChildItem .\\reportes -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if(!$r){throw 'No hay corridas en .\\reportes'}; node tools/generar-word.js (Join-Path $r.FullName '_technical\\playwright-report\\results.json') $r.FullName\"",
    "report:all": "npm run report:html && npm run report:excel && npm run report:word",
    "pf:list:caso01": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 01 -Scenario smoke -List",
    "pf:list:caso02": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 02 -Scenario smoke -List",
    "pf:list:caso02:legacy": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 02 -Scenario smoke -Model legacy -List",
    "pf:list:caso04": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 04 -Scenario smoke -List",
    "pf:smoke:caso01": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 01 -Scenario smoke",
    "pf:smoke:caso01:headed": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 01 -Scenario smoke -Headed -OpenReports",
    "pf:smoke:caso02": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 02 -Scenario smoke",
    "pf:smoke:caso02:headed": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 02 -Scenario smoke -Headed -OpenReports",
    "pf:smoke:caso02:headed:reuse-auth": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 02 -Scenario smoke -Headed -ReuseAuth -OpenReports",
    "pf:negative:caso02:sin-sanciones": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 02 -Scenario negative",
    "pf:negative:caso02:sin-sanciones:headed": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 02 -Scenario negative -Headed -OpenReports",
    "pf:smoke:caso04": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 04 -Scenario smoke",
    "pf:smoke:caso04:headed": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 04 -Scenario smoke -Headed -OpenReports",
    "pf:phase1:caso02": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 02 -Scenario phase1",
    "pf:phase1:caso02:minimo": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 02 -Scenario phase1 -Phase1Mode minimo",
    "pf:phase1:caso02:multi": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 02 -Scenario phase1 -Phase1Mode multi",
    "pf:phase2:caso02": "powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 02 -Scenario phase2",
    "phase1": "npm run pf:phase1:caso02",
    "phase2": "npm run pf:phase2:caso02"
  },
  "devDependencies": {
    "@playwright/test": "^1.45.0",
    "@types/node": "^14.18.63",
    "allure-commandline": "^2.42.0",
    "allure-playwright": "^3.9.0",
    "dotenv": "^16.4.5",
    "exceljs": "^4.4.0",
    "typescript": "^5.5.0"
  }
}
```

### 0.3 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Node16",
    "moduleResolution": "node16",
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["POManager.ts", "playwright.config.ts", "pages/**/*.ts", "helpers/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist", ".tmp", "test-results", "playwright-report", "allure-results", "allure-report", "tests/legacy_tests/**/*.ts"]
}
```

### 0.4 .env

```
REGINSA_USER=lizvidal
REGINSA_PASS=QA1234511qa
REGINSA_UI_BASE_URL=https://reginsaqa.sunedu.gob.pe
REGINSA_API_BASE_URL=https://reginsaapiqa.sunedu.gob.pe/api
REGINSA_SAVE_API_TIMEOUT_MS=60000
REGINSA_UI_WAIT_TIMEOUT_MS=30000
REGINSA_OVERLAY_TIMEOUT_MS=30000

# Usuarios para multi-worker
REGINSA_USER_1=lizvidal
REGINSA_PASS_1=QA1234511qa
REGINSA_USER_2=lizitavidal
REGINSA_PASS_2=QA123451qa
# ... hasta REGINSA_USER_10

# IPs (opcional, para multi-IP)
REGINSA_IP_1=192.168.28.48
REGINSA_IP_2=192.168.28.49
# ... hasta REGINSA_IP_10
```

### 0.5 playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const executionMode = String(process.env.REGINSA_EXECUTION_MODE || '').toLowerCase();
const fastEvidenceMode = process.env.SKIP_SCREENSHOTS === '1' || executionMode === 'fast' || executionMode === 'scale';
const projectRoot = path.resolve(__dirname, '..');
const defaultTechnicalReportsDir = path.resolve(projectRoot, 'reportes', '_technical');
const playwrightReportDir = process.env.REGINSA_PLAYWRIGHT_REPORT_DIR || path.resolve(defaultTechnicalReportsDir, 'playwright-report');
const allureResultsDir = process.env.REGINSA_ALLURE_RESULTS_DIR || path.resolve(defaultTechnicalReportsDir, 'allure-results');

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 9,
  timeout: 120000,
  expect: { timeout: 30000 },
  use: {
    baseURL: process.env.REGINSA_UI_BASE_URL || 'https://reginsaqa.sunedu.gob.pe',
    trace: 'retain-on-failure',
    screenshot: fastEvidenceMode ? 'only-on-failure' : 'on',
    video: fastEvidenceMode ? 'retain-on-failure' : 'on',
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 }
  },
  reporter: [
    ['html', { outputFolder: playwrightReportDir, open: 'never' }],
    ['json', { outputFile: path.resolve(playwrightReportDir, 'results.json') }],
    ['allure-playwright', { resultsDir: allureResultsDir }],
    ['list']
  ],
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'ui-smoke',
      dependencies: ['setup'],
      testMatch: /.*\.smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
    },
    {
      name: 'ui-regression',
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts/,
      testIgnore: [/.*\.smoke\.spec\.ts/, /.*auth\.setup\.ts/, /.*legacy_tests.*/, /.*utilidades.*\.spec\.ts/],
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
    },
    {
      name: 'ui-legacy',
      testMatch: /.*legacy_tests.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'ui-diagnostics',
      dependencies: ['setup'],
      testMatch: /.*utilidades.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
    },
  ],
});
```

---

## FASE 1 — Helpers (Dependencias Base)

> **IMPORTANTE**: Crear en este orden exacto. Cada helper es importado por el siguiente.

### 1.1 `helpers/pf-run-label.ts`

Genera etiquetas de corrida tipo `PF-01 W01R01`.

```typescript
// Etiquetas de corrida: PF-XX WXXRXX
// getPfRunSequence() → "01"
// getPfRunLabel() → "PF 01"
// buildPfRunSuffix(slot, repeatIndex) → "W01R01"
```

**Exporta**: `getPfRunSequence()`, `getPfRunLabel()`, `buildPfRunSuffix(slot, repeatIndex)`
- Lee `REGINSA_PF_RUN_SEQUENCE` o calcula desde `REGINSA_FUNC_RUN_SEED`
- `buildPfRunSuffix` formatea `W{slot} R{repeatIndex+1}`

### 1.2 `helpers/data-generator.ts`

Genera datos de prueba: RUC válido con dígito verificador, razón social, nombre comercial, estado.

**Exporta**: `generateTestData(workerIndex, repeatIndex)`
- Genera RUC de 11 dígitos con dígito verificador (algoritmo SUNAT)
- Razón social: `REGINSA AUTOMATIZACION FUNCIONAL {suffix} S.A.C.`
- Estados: Licenciada, Informal, Licencia denegada

### 1.3 `helpers/state-distributor.ts`

Distribuye estados entre workers.

**Exporta**: `getEstadoLabel(value: string | number | undefined)`
- Parsea valores numéricos o texto a uno de: Licenciada, Informal, Licencia denegada

### 1.4 `helpers/resource-lock.ts`

Sistema de bloqueo distribuido entre workers usando `mkdir` atómico del sistema de archivos.

```typescript
// Reserva un recurso por namespace + contenido (hash SHA1 del texto)
// retorna true si se reservó exitosamente, false si ya estaba reservado
reserveRunResource(namespace: string, resourceText: string, metadata: Record<string, unknown>): boolean
```

**Exporta**: `reserveRunResource()`
- Crea directorio `reportes/../resource-locks/{runId}/{namespace}/{sha1}`
- Si `mkdir` falla con `EEXIST` → recurso ya reservado

### 1.5 `helpers/strict-sequential.ts`

Máquina de estado secuencial estricta con lock de archivos para asignación ordenada entre workers.

```typescript
reservarOrdinalSecuencial(caseId, fallbackOrdinal): number
registrarAsignacionSecuencial(caseId, ordinal, data): void
reservarConsecutivoGlobal(counterId, startValue): number
reservarConsecutivoGlobalPorRun(counterId, runId, startValue): number
reservarClaveCandidato(caseId, key): boolean
reservarClaveCandidatoConLimite(caseId, key, maxReservas): 'ok' | 'duplicate' | 'limit' | 'invalid'
contarReservasCandidatos(caseId): number
liberarClaveCandidato(caseId, key): void
marcarPaginaAgotada(caseId, page): void
esPaginaAgotada(caseId, page): boolean
```

**Exporta**: 11 funciones de bloqueo secuencial
- Usa `reportes/reconsideracion-sequential.json` como archivo de estado
- Lock via `reportes/reconsideracion-sequential.lock` (mkdir atómico)
- Incluye sistema de candidate-reservations, exhausted-pages y global-counters

### 1.6 `helpers/sancion-identifiers.ts`

Genera identificadores únicos de sanción.

```typescript
buildSancionIdentifiers(expedienteBase, resolucionBase, options): { numExpediente, numResolucion, runSuffix }
```

**Exporta**: `buildSancionIdentifiers()`
- Formato: `{runLabel} {scenario} W{slot}R{repeatIndex} {expedienteBase}`

### 1.7 `helpers/test-context.ts`

Contexto de ejecución del test.

```typescript
getTestContext(testInfo): { workerIndex, repeatIndex, repeatEach, workers, selectionSlot, isMassive }
```

**Exporta**: `getTestContext()`
- Lee `REGINSA_REPEAT_EACH`, `PLAYWRIGHT_REPEAT_EACH`, `REGINSA_LOGICAL_WORKERS`, `PLAYWRIGHT_WORKERS`

### 1.8 `helpers/test-run-metadata.ts`

**⭐ Contexto enriquecido de ejecución + carga de release-changelog + inyección en Allure.**

```typescript
configurarContextoReginsa(page, testInfo, options): Promise<ReginsaRunContext>
loadChangelog(): ReleaseChangelog | null
```

**Exporta**: `configurarContextoReginsa()`, `loadChangelog()`
- Resuelve slot funcional: `workerIndex = physicalRepeatIndex % workers`
- Asigna IP vía `REGINSA_IP_{slot}`
- Setea header `X-Forwarded-For`
- Registra anotaciones: worker, slot, ip, usuario, escenario
- Inyecta en Allure: parámetros QA Audit, QA API, QA Defecto
- Carga `release-changelog.json` y adjunta como attachment

---

## FASE 2 — Page Objects

> **Orden de creación**: BasePage → LoginPage → HomePage → SancionesPage → FormularioSancionPage → ModalAgregarSancionPage → AdministradosPage → ReconsideracionPage → POManager

### 2.1 `pages/base.page.ts`

Clase base con utilidades compartidas.

```typescript
export class BasePage {
  constructor(protected readonly page: Page) {}

  async irA(ruta: string): Promise<void>
  async esperarCapaCarga(timeout?): Promise<void>
  async safeClick(locator: Locator, timeout?): Promise<void>
  async fillFirstEditable(candidates: Locator[], value, timeout?): Promise<Locator>
  async selectPrimeOption(trigger: Locator, optionName?, timeout?): Promise<string>
  readTimeout(name, fallback): number
  uiTimeout(fallback?): number
  apiTimeout(fallback?): number
  overlayTimeout(fallback?): number
}
```

**Detalles clave**:
- `esperarCapaCarga`: espera que desaparezcan `.swal2-container`, `.p-blockui`, `.p-progress-spinner`
- `safeClick`: expect visible → scrollIntoView → click normal, fallback force click
- `fillFirstEditable`: prueba múltiples locators en orden; omite readonly/disabled
- `selectPrimeOption`: abre dropdown PrimeNG, selecciona opción por nombre o primera disponible

### 2.2 `pages/login.page.ts`

```typescript
export class LoginPage extends BasePage {
  async abrirLogin(): Promise<void>
  async iniciarSesion(usuario: string, clave: string): Promise<void>
  async validarSesionActiva(): Promise<void>
}
```

### 2.3 `pages/home.page.ts`

```typescript
export class HomePage extends BasePage {
  async abrirHome(): Promise<void>
  async validarHomeCargado(): Promise<void>
  async navegarA(ruta: string): Promise<void>
}
```

### 2.4 `pages/sanciones.page.ts`

```typescript
export class SancionesPage extends BasePage {
  async navegarAlModulo(): Promise<this>
  async abrirFormularioRegistrarSancion(): Promise<this>
  async validarModuloCargado(): Promise<this>
}
```

**Detalles clave**:
- `navegarAlModulo`: navega a `/#/pages/infractor`
- `abrirFormularioRegistrarSancion`: 
  - No usa `networkidle` (Angular polling lo bloquea)
  - Busca botón `Registrar Sancionar`
  - Hasta 3 intentos de click + verificar que `input[formcontrolname="numeroExpediente"]` sea visible

### 2.5 `pages/formulario-sancion.page.ts` (⭐ Archivo crítico)

**El Page Object más complejo del proyecto.** Maneja intercepción de API, recuperación activa y validación de persistencia.

```typescript
export type GuardarFormularioResult = {
  id: string; registroId: string; endpoint: string;
  status: number; url: string; responseBody: unknown;
  observed: SaveApiObservation[]; toastVisible: boolean;
  authorizationHeader?: string;
};

export class FormularioSancionPage extends BasePage {
  async seleccionarAdministrado(indicePreferido?): Promise<string>
  async llenarNumeroExpediente(numero: string): Promise<this>
  async llenarNumeroResolucion(numero: string): Promise<this>
  async llenarFechaResolucion(fecha: string): Promise<this>
  async subirDocumento(ruta: string): Promise<this>
  async agregarMedidaCorrectiva(medida: string): Promise<this>
  async clickAgregarMedida(): Promise<this>
  async irADetalleSanciones(): Promise<this>
  async clickAgregarSancion(): Promise<this>
  async contarSancionesAgregadas(): Promise<number>
  async validarMinimoSancionesAgregadas(minimo: number): Promise<void>
  async guardarFormulario(): Promise<GuardarFormularioResult>
  async validarPersistenciaCabecera(numeroExpediente, registroId, authorizationHeader?): Promise<void>
}
```

**Patrón guardarFormulario**:
1. Registra interceptor `page.on('response')` ANTES del click
2. Escucha endpoints: `CabeceraInfraccionSancion/Crear`, `CrearConDetalles`, `Actualizar`, `MedidaCorrectiva/Crear`, `DetalleInfraccionSancion/Crear`
3. Si captura respuesta con ID → resuelve inmediatamente
4. Timeout con RECUPERACIÓN ACTIVA: consulta `ListarPaginado` con el número de expediente para recuperar el ID
5. Extrae ID desde múltiples formatos de respuesta anidados

### 2.6 `pages/modal-agregar-sancion.page.ts`

```typescript
export class ModalAgregarSancionPage extends BasePage {
  async seleccionarRIS(): Promise<this>
  async seleccionarTipoInfraccion(): Promise<this>
  async llenarHechoInfractor(hecho?: string): Promise<this>
  async marcarMulta(): Promise<this>
  async marcarSuspension(): Promise<this>
  async marcarCancelacion(): Promise<this>
  async seleccionarTipoMoneda(usarUIT?: boolean): Promise<this>
  async llenarMontoMulta(monto: string): Promise<this>
  async llenarTiempoSuspension(tipo: 'Año'|'Mes'|'Día', cantidad: number): Promise<this>
  async clickGuardarDetalle(): Promise<this>
  async cerrar(): Promise<this>
  async validarModalVisible(): Promise<this>
}
```

### 2.7 `pages/administrados.page.ts` (⭐ Archivo crítico)

```typescript
export type AdministradoData = { ruc, razonSocial, nombreComercial, estado }
export type GuardarAdministradoResult = { registroId, endpoint, status, url, responseBody, authorizationHeader? }

export class AdministradosPage extends BasePage {
  async navegarAlModulo(): Promise<this>
  async validarModuloCargado(): Promise<this>
  async abrirFormularioNuevoAdministrado(): Promise<this>
  generarDatos(slot, repeatIndex, retryIndex?): AdministradoData
  async llenarFormulario(data: AdministradoData): Promise<this>
  async guardarFormulario(data?: AdministradoData): Promise<GuardarAdministradoResult>
  async validarPersistencia(data, authorizationHeader?): Promise<void>
  async validarObligatoriosBloqueanGuardado(): Promise<void>
  async validarDuplicadoBloqueaGuardado(): Promise<void>
}
```

**Patrones críticos**:
- **Pool de RUCs**: Puede leer de `REGINSA_ADMIN_RUC_POOL`, `REGINSA_ADMIN_RUC_POOL_FILE` o generar RUCs únicos automáticamente
- **Bloqueo funcional serializado**: `REGINSA_ADMIN_SERIALIZE_SAVE=1` activa lock filesystem para serializar `Entidad/Crear`
- **Recuperación post-fallo**: Si `guardarFormulario` no captura respuesta exitosa, busca el administrado creado vía `Entidad/ListarPaginado`
- **Validación pre-guardado**: `esperarFormularioListoParaGuardar` verifica que todos los campos estén llenos, sin ng-invalid, y botón enabled
- **Interceptor de red**: Captura authorization header, response, y requestfailed para diagnóstico completo

### 2.8 `pages/reconsideracion.page.ts`

```typescript
export class ReconsideracionPage extends BasePage {
  async navegarAlModulo(): Promise<this>
  async validarModuloCargado(): Promise<this>
  generarDatos(slot, repeatIndex): ReconsideracionData
  async abrirPrimerRegistroParaReconsiderar(slot?, repeatIndex?, retryCount?): Promise<string>
  async activarModoEdicion(): Promise<this>
  async marcarPresentoReconsideracion(): Promise<this>
  async completarCamposReconsideracion(data: ReconsideracionData): Promise<this>
  async limpiarCamposReconsideracion(): Promise<this>
  async guardarCabecera(): Promise<GuardarReconsideracionResult>
  async validarBloqueoCamposObligatorios(): Promise<void>
  async validarDetalleSancionesMinimo(minimo?): Promise<void>
}
```

**Patrones críticos**:
- **Búsqueda con paginación**: Navega hasta 60 páginas buscando registro con botón de reconsideración
- **Reserva de candidatos**: Usa `reserveRunResource` para evitar que 2 workers seleccionen el mismo registro
- **Detección de ya-reconsiderados**: Si el formulario abre en modo read-only, salta al siguiente candidato
- **Establecimiento de fecha**: Triple estrategia: fill+tab → evaluate JS → calendario UI

### 2.9 `POManager.ts`

```typescript
export class POManager {
  constructor(page: Page) {}
  getBasePage(): BasePage
  getLoginPage(): LoginPage
  getHomePage(): HomePage
  getSancionesPage(): SancionesPage
  getFormularioSancionPage(): FormularioSancionPage
  getModalAgregarSancionPage(): ModalAgregarSancionPage
  getAdministradosPage(): AdministradosPage
  getReconsideracionPage(): ReconsideracionPage
}
```

---

## FASE 3 — Tests

### 3.1 `tests/fixtures/test-base.ts`

Fixture personalizada que selecciona dinámicamente el storageState por worker.

```typescript
export const test = baseTest.extend({
  storageState: async ({}, use, testInfo) => {
    // Resuelve slot funcional
    // Usa `.auth/user-{slot}.json` o `.auth/user.json` como fallback
  },
});
export { expect } from '@playwright/test';
```

### 3.2 `tests/auth.setup.ts`

Autenticación multi-usuario.

```typescript
setup('Autenticación multi-usuario: generar storageState por slot', async ({ browser }) => {
  // Lee REGINSA_AUTH_SLOTS, REGINSA_USER_1..N, REGINSA_PASS_1..N
  // Para cada slot: navega, login SSO, guarda storageState como user-{slot}.json
  // Copia user-1.json → user.json como fallback
});
```

**Detalles**: timeout dinámico `120000 + users.length * 90000`

### 3.3 `tests/sanciones.e2e.spec.ts`

```typescript
test.describe('E2E - Flujo de Registrar Sanción (Escalado)', () => {
  test('Debería completar el flujo completo de registrar sanción', async ({ page }, testInfo) => {
    // 8 steps: navegar → abrir formulario → llenar datos → subir PDF → medidas → detalle sanciones → 8 combinaciones → guardar
    // timeout 300s
    // Anotaciones: workerIndex, registroId, expediente, apiEndpoint, sancionesEjecutadas
    // Antes de guardar: validarMinimoSancionesAgregadas(8)
  });
});
```

### 3.4 `tests/sanciones-phase1.e2e.spec.ts`

```typescript
test.describe('Phase 1 — Registrar Sanción [modo: {PHASE1_MODE}]', () => {
  test('Debería completar el flujo completo de registrar sanción (Phase 1)', async ({ page }, testInfo) => {
    // PHASE1_MODE=minimo: 1 sanción aleatoria
    // PHASE1_MODE=multi: todas las combinaciones del fixture
  });
});
```

### 3.5 `tests/sanciones-phase2.e2e.spec.ts`

```typescript
test.describe('Phase 2 — Registrar Sanción Escalada (1 sanción/registro)', () => {
  test('Debería registrar una sanción aleatoria (Phase 2)', async ({ page }, testInfo) => {
    // 1 sanción aleatoria por iteración (escalado vía --repeat-each en runner)
    // seed combinado: (workerIndex * 17 + repeatIndex) % total
  });
});
```

### 3.6 `tests/sanciones-negative.e2e.spec.ts`

```typescript
test.describe('Validaciones negativas — Registrar Sanción', () => {
  test('No debería permitir guardar expediente sin sanciones', async ({ page }, testInfo) => {
    // Completa formulario sin agregar sanciones
    // Verifica que guardar falle (timeout reducido a 12s)
    // Si guarda exitosamente → lanza DEFECTO FUNCIONAL CRITICO
  });
});
```

### 3.7 `tests/administrados.e2e.spec.ts`

```typescript
test.describe('CP-REG-01 - Agregar administrado', () => {
  test('Deberia registrar administrado con RUC y Razon Social unicos', async ({}, testInfo) => {
    // 3 steps: navegar → llenar → guardar con confirmación backend
    // Anotaciones: ruc, razonSocial, registroId, apiEndpoint, apiStatus
    // Valida persistencia vía ListarPaginado
  });
});
```

### 3.8 `tests/administrados-negative.e2e.spec.ts`

```typescript
test.describe('CP-REG-01 - Validaciones negativas de administrado', () => {
  test('No deberia permitir guardar sin campos obligatorios', async ({}, testInfo) => {});
  test('No deberia permitir duplicar RUC ni Razon Social', async ({}, testInfo) => {});
});
```

### 3.9 `tests/reconsideracion.e2e.spec.ts`

```typescript
test.describe('CP-REG-04 - Reconsiderar con sanciones', () => {
  test('Deberia registrar reconsideracion llenando archivo, numero y fecha', async ({}, testInfo) => {
    // 3 steps: navegar + abrir candidato → marcar reconsideración + completar campos → guardar + validar detalle sanciones
    // Skip si BD agotada: test.skip(true, mensaje)
  });
});
```

### 3.10 `tests/reconsideracion-negative.e2e.spec.ts`

```typescript
test.describe('CP-REG-04 - Validaciones negativas de reconsideracion', () => {
  test('No deberia permitir guardar reconsideracion sin archivo, numero y fecha', async ({}, testInfo) => {});
});
```

### 3.11 `tests/home.smoke.spec.ts`

```typescript
test.describe('UI Smoke - Home', () => {
  test('Validar que la página de home se carga correctamente', async ({ page }) => {});
});
```

---

## FASE 4 — Test Data y Acciones Compartidas

### 4.1 `fixtures/test-data.json`

```json
{
  "sanciones": {
    "expediente": "FA 01 Exp N° 1234-2024",
    "resolucion": "FA 01 Res N° 5678-2024",
    "fechaResolucion": "02/06/2024",
    "rutaDocumento": "fixtures/dummy.pdf",
    "medidasCorrectivas": ["Medida correctiva 1", "Medida correctiva 2", "Medida correctiva 3"],
    "hechoInfractor": "Hecho infractor de prueba",
    "tiposMoneda": ["SOLES", "UIT"],
    "tiposTiempo": ["Año", "Mes", "Día"],
    "sanciones": [
      { "nombre": "Multa SOLES", "multa": true, "suspension": false, "cancelacion": false, "usarUIT": false, "monto": "1500" },
      { "nombre": "Multa UIT", "multa": true, "suspension": false, "cancelacion": false, "usarUIT": true, "monto": "5" },
      { "nombre": "Suspension Anio", "multa": false, "suspension": true, "cancelacion": false, "tipoTiempo": "Año", "cantidadTiempo": 1 },
      { "nombre": "Suspension Mes", "multa": false, "suspension": true, "cancelacion": false, "tipoTiempo": "Mes", "cantidadTiempo": 3 },
      { "nombre": "Suspension Dia", "multa": false, "suspension": true, "cancelacion": false, "tipoTiempo": "Día", "cantidadTiempo": 15 },
      { "nombre": "Multa SOLES + Suspension", "multa": true, "suspension": true, "usarUIT": false, "monto": "2500", "tipoTiempo": "Mes", "cantidadTiempo": 6 },
      { "nombre": "Multa UIT + Suspension", "multa": true, "suspension": true, "usarUIT": true, "monto": "8", "tipoTiempo": "Año", "cantidadTiempo": 1 },
      { "nombre": "Cancelacion", "multa": false, "suspension": false, "cancelacion": true }
    ]
  }
}
```

### 4.2 `tests/utilidades/reginsa-actions.ts`

Acciones reutilizables entre tests: login, navegación, selección de administrado, generación de datos, subida de archivos, captura de pantallas.

**Exporta**:
- `resolverDocumentoPrueba(nombreArchivo)`: busca PDF en `test-files/`, `playwrigth/test-files/`, `files/`
- `obtenerAdministradoAleatorio(page, indicePreferido?, metadata?)`: selecciona administrado del dropdown con reserva de recurso
- `iniciarSesionYNavegar(page, modulo, workerIndex)`: login SSO completo + navegación a módulo
- `abrirFormularioNuevoAdministrado(page)`, `abrirFormularioRegistrarSancion(page)` (legacy)
- `completarCabeceraReconsideracion(page, rutaArchivo, fecha?, numeroPrefix?)`: flujo completo de reconsideración
- `generarExpediente()`, `generarResolucion()`, `generarRUC()`
- `capturarPantalla()`, `capturarPantallaMejorada()`, `capturarToastExito()`
- `extraerAdministradosDesdeTabla(page, maxPaginas)`
- `abrirDropdownRobusto(page, trigger, panel, options, config?)`

---

## FASE 5 — Tools (Runner y Reportes)

### 5.1 `tools/run-pf.ps1` (⭐ Orquestador Principal)

Runner PowerShell que orquesta toda la ejecución.

```powershell
# Parámetros:
# -CaseId 01|02|04  -Scenario smoke|phase1|phase2|audit|negative
# -Model auto|new|legacy  -Phase1Mode multi|minimo
# -RepeatEach N  -Workers N  -Headed  -List  -ReuseAuth
# -OpenReports  -NoOpenReports  -SkipReports
```

**Funcionalidades**:
- Carga `.env` al proceso (variables de entorno)
- Calcula workers dinámicamente según usuarios declarados
- Advertencia si hay menos IPs que workers
- Crea carpeta de corrida: `reportes/{TestCaseId}_PF_{Scenario}_RUN_{timestamp}/`
- Estructura: `_technical/playwright-report/`, `_technical/allure-results/`, `_technical/allure-report/`
- Variables de entorno: SCENARIO, TEST_CASE_ID, TEST_RUN_ID, REGINSA_EXECUTION_MODE, etc.
- Ejecuta `playwright test` con parámetros calculados
- Post-ejecución: `validate-dual-view.js` → `generar-html.js` → `generar-excel.js` → `generar-word.js`
- Allure: preserva history para trend, genera reporte HTML
- Abre reportes automáticamente (salvo `-NoOpenReports`)
- Secuencia de corrida: `reportes/.pf-run-sequence.json`

### 5.2 `tools/lib/playwright-reader.js` (⭐ Lector Canónico)

Clase `PlaywrightReader` que procesa results.json y expone:
- `dualView`: testListFinal + attemptList + ipSummary + endpointSummary + integridad
- `ipSummary`: métricas por IP (fórmulas corregidas, nunca > 100%)
- `workerList`, `functionalWorkerList`
- `errorSpectrum`, `errorBudget`, `concurrencyAnalysis`
- `toAiPayload()`: payload plano para IA
- Clasificación de errores: UI/API/PERSISTENCIA/TIMEOUT

### 5.3 `tools/validate-dual-view.js`

Valida arquitectura dual-view y genera `pf-report.json` (fuente canónica funcional).

```javascript
// Uso: node tools/validate-dual-view.js [ruta/results.json]
// Lee results.json via PlaywrightReader
// Exporta pf-report.json con:
//   - metadata, summaryGlobal
//   - interpretacionAutomatica (GO/GO_CON_RIESGO/NO_GO)
//   - hallazgosVigentes (cambios de contrato API)
//   - hallazgosTecnicos (errores clasificados)
//   - accionesRecomendadas
```

### 5.4 `tools/generar-html.js`

Genera reporte HTML profesional con:
- Cabecera con Run ID, metadata
- Señal semafórica GO/GO_CON_RIESGO/NO_GO
- Métricas: tests únicos, passed limpios, flaky, failed, éxito final, flaky rate, retry burden
- Chart.js: resultados por IP, duración promedio, errores clasificados, llamadas por endpoint
- Tabla IP con ranking de estabilidad (barra de progreso)
- Tabla endpoint con persistencia %
- Embudo de persistencia (SVG)
- Análisis retries y flaky
- Clasificación de errores
- Métricas de estabilidad
- Nota metodológica
- Marco normativo ISTQB/ISO/IEEE
- Leyenda de métricas con fórmulas y umbrales
- Hallazgos vigentes
- Acciones para desarrollo con criterios de cierre

### 5.5 `tools/generar-excel.js`

Genera Excel con KPIs usando ExcelJS.

### 5.6 `tools/generar-word.js`

Genera documento Word formal para auditoría.

---

## FASE 6 — Runner Raíz

### 6.1 `run-ui-tests.ps1` (Entry point raíz)

Wrapper simplificado que delega en `playwright_ui/tools/run-pf.ps1`:

```powershell
param([ValidateSet('list','smoke','smoke-headed','phase1','phase2','reports')] [string]$Mode = 'smoke')

$uiDir = Join-Path $PSScriptRoot 'playwright_ui'
Push-Location $uiDir
try { npm.cmd run $scriptName } finally { Pop-Location }
```

---

## FASE 7 — Verificación Final

### 7.1 Pasos de verificación

```powershell
# 1. Instalar dependencias
cd playwright_ui && npm install

# 2. Instalar navegador Chromium
npx playwright install chromium

# 3. Verificar que los specs cargan (sin ejecutar)
npm run pf:list:caso02

# 4. Ejecutar smoke de Caso 02
npm run pf:smoke:caso02

# 5. Generar reportes manualmente (si smoke pasó)
npm run report:all
```

### 7.2 Variables de entorno de control

| Variable | Propósito |
|---|---|
| `REGINSA_EXECUTION_MODE=fast` | Modo rápido: sin screenshots/video, menos timeouts |
| `SKIP_SCREENSHOTS=1` | Omite todas las capturas |
| `REGINSA_ADMIN_SERIALIZE_SAVE=1` | Serializa Entidad/Crear (modo estable) |
| `REGINSA_AUTH_SLOTS=N` | Limita slots de autenticación |
| `PHASE1_MODE=multi` | Phase1 con todas las combinaciones |
| `REGINSA_USE_OLLAMA=1` | Activa IA local para reportes |

---

## 📌 Resumen de Archivos a Crear (55 archivos)

| Fase | Archivos | Cantidad |
|---|---|---|
| 0. Preparación | package.json, tsconfig.json, .env, playwright.config.ts | 4 |
| 1. Helpers | pf-run-label, data-generator, state-distributor, resource-lock, strict-sequential, sancion-identifiers, test-context, test-run-metadata | 8 |
| 2. Pages | base, login, home, sanciones, formulario-sancion, modal-agregar-sancion, administrados, reconsideracion, POManager | 9 |
| 3. Tests | test-base, auth.setup, sanciones.e2e, sanciones-phase1, sanciones-phase2, sanciones-negative, administrados.e2e, administrados-negative, reconsideracion.e2e, reconsideracion-negative, home.smoke | 11 |
| 4. Data | test-data.json, reginsa-actions.ts | 2 |
| 5. Tools | run-pf.ps1, playwright-reader.js, validate-dual-view.js, generar-html.js, generar-excel.js, generar-word.js, ai-prompts.js | 7 |
| 6. Raíz | run-ui-tests.ps1 | 1 |
| **Total** | | **42** |

(+ ~9 archivos legacy_tests y ~9 utilidades opcionales) = ~55 archivos totales.
