import { test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  iniciarSesionYNavegar,
  abrirFormularioRegistrarSancion,
  obtenerAdministradoAleatorio,
  abrirDropdownRobusto,
  capturarPantallaMejorada,
  capturarFormularioLleno,
  capturarToastExito,
  generarFechaPonderada,
  resolverDocumentoPrueba
} from 'tests/utilidades/reginsa-actions';
import { reservarConsecutivoGlobalPorRun } from 'helpers/strict-sequential';

type Caso02Telemetry = {
  startedAt: string;
  workerIndex: number;
  repeatIndex: number;
  loginStartedAt?: string;
  loginEndedAt?: string;
  loginAttempts: number;
  runId?: string;
  prefijo?: string;
  navigations: string[];
  apiSamples: string[];
};

const caso02TelemetryStore = new Map<string, Caso02Telemetry>();

function pushLimited(target: string[], value: string, max = 25): void {
  target.push(value);
  if (target.length > max) {
    target.splice(0, target.length - max);
  }
}

function createCaso02Telemetry(testInfo: TestInfo): Caso02Telemetry {
  return {
    startedAt: new Date().toISOString(),
    workerIndex: Number(testInfo.workerIndex ?? 0),
    repeatIndex: (testInfo as { repeatEachIndex?: number }).repeatEachIndex ?? 0,
    loginAttempts: 0,
    navigations: [],
    apiSamples: []
  };
}

function createCaso02Logger(testInfo: TestInfo) {
  const workerIndex = Number(testInfo.workerIndex ?? 0);
  const repeatIndex = (testInfo as { repeatEachIndex?: number }).repeatEachIndex ?? 0;
  const executionMode = (process.env.REGINSA_EXECUTION_MODE || '').toLowerCase();
  const compactMode = executionMode === 'fast' || executionMode === 'scale' || process.env.SKIP_SCREENSHOTS === '1';
  const prefix = `[C02 w=${workerIndex} r=${repeatIndex}]`;

  const write = (kind: 'log' | 'warn' | 'error', message: string) => {
    const line = `${prefix} ${message}`;
    if (kind === 'warn') {
      console.warn(line);
      return;
    }
    if (kind === 'error') {
      console.error(line);
      return;
    }
    console.log(line);
  };

  return {
    compactMode,
    step: (message: string) => write('log', message),
    detail: (message: string) => {
      if (!compactMode) write('log', message);
    },
    warn: (message: string) => write('warn', message),
    error: (message: string) => write('error', message)
  };
}

async function extractAuthTokenFromStorage(page: Page): Promise<string> {
  const tokenRaw = await page.evaluate(() => {
    const directKeys = ['token', 'access_token', 'authToken', 'jwtToken', 'Authorization'];
    for (const key of directKeys) {
      const value = window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
      if (value) return value;
    }

    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (!key || !/token|auth|bearer|jwt/i.test(key)) continue;
      const value = window.localStorage.getItem(key);
      if (value) return value;
    }

    for (let index = 0; index < window.sessionStorage.length; index++) {
      const key = window.sessionStorage.key(index);
      if (!key || !/token|auth|bearer|jwt/i.test(key)) continue;
      const value = window.sessionStorage.getItem(key);
      if (value) return value;
    }

    return '';
  }).catch(() => '');

  return String(tokenRaw || '').trim().replace(/^Bearer\s+/i, '');
}

async function classifyCaso02Failure(page: Page): Promise<Record<string, unknown>> {
  const currentUrl = page.url();
  const authCtaVisible = await page.getByRole('button', { name: /Acceder Ahora/i }).first().isVisible().catch(() => false);
  const systemErrorVisible = await page
    .getByText(/no\s*se\s*complet[oó]\s*el\s*proceso|identificador\s*del\s*sistema\s*no\s*ha\s*sido\s*correctamente\s*enviado/i)
    .first()
    .isVisible()
    .catch(() => false);
  const moduleVisible = await page.getByText(/Registro\s+de\s+Infracci[oó]n\s+y\s+Sanci[oó]n/i).first().isVisible().catch(() => false);
  const homeVisible = /#\/home\b/i.test(currentUrl);

  let classification = 'FUNCTIONAL_OR_UNKNOWN';
  if (systemErrorVisible) {
    classification = 'AUTH_UPSTREAM_TRANSIENT';
  } else if (authCtaVisible) {
    classification = homeVisible ? 'AUTH_STATE_NOT_ESTABLISHED' : 'AUTH_SESSION_LOST';
  } else if (homeVisible && !moduleVisible) {
    classification = 'AUTHZ_NOT_READY';
  }

  const storageState = await page.evaluate(() => {
    const pickKeys = (storage: Storage) => {
      const keys: string[] = [];
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key) keys.push(key);
      }
      return keys.slice(0, 20);
    };

    return {
      localStorageKeys: pickKeys(window.localStorage),
      sessionStorageKeys: pickKeys(window.sessionStorage)
    };
  }).catch(() => ({ localStorageKeys: [], sessionStorageKeys: [] }));

  return {
    classification,
    currentUrl,
    authCtaVisible,
    systemErrorVisible,
    moduleVisible,
    homeVisible,
    storageState
  };
}

test.afterEach(async ({ page }, testInfo) => {
  const telemetryKey = testInfo.outputDir;
  const telemetry = caso02TelemetryStore.get(telemetryKey);

  if (testInfo.status !== testInfo.expectedStatus) {
    const screenshot = await page.screenshot({ fullPage: true }).catch(() => null);
    if (screenshot) {
      await testInfo.attach('caso02-failure-screenshot', {
        body: screenshot,
        contentType: 'image/png'
      });
    }

    const html = await page.content().catch(() => '');
    if (html) {
      await testInfo.attach('caso02-page-html', {
        body: Buffer.from(html, 'utf-8'),
        contentType: 'text/html'
      });
    }

    const cookies = await page.context().cookies().catch(() => []);
    await testInfo.attach('caso02-cookies', {
      body: Buffer.from(JSON.stringify(cookies, null, 2), 'utf-8'),
      contentType: 'application/json'
    });

    const classification = await classifyCaso02Failure(page);
    await testInfo.attach('caso02-failure-classification', {
      body: Buffer.from(JSON.stringify(classification, null, 2), 'utf-8'),
      contentType: 'application/json'
    });

    if (telemetry) {
      await testInfo.attach('caso02-telemetry', {
        body: Buffer.from(JSON.stringify(telemetry, null, 2), 'utf-8'),
        contentType: 'application/json'
      });
    }
  }

  caso02TelemetryStore.delete(telemetryKey);
});

/**
 * EJECUCIÓN (rápido)
 * - Headless por defecto. Para ver navegador: `--headed`.
 * - Con capturas: scripts normales `npm run test:*`.
 * - Sin capturas: scripts `:fast`.
 * - Paralelismo (suite completa): `npm run test:all:w2` / `test:all:w4`.
 */

/**
 * CASO 02: REGISTRAR SANCIÓN
 * 
 * Flujo:
 * 1. Login + navegación al módulo
 * 2. Abrir formulario
 * 3. Seleccionar UN administrado (aleatorio, sin repetir)
 * 4. Llenar datos básicos (expediente, resolución, fecha)
 * 5. Subir PDF
 * 6. Agregar 2-3 medidas correctivas
 * 7. Navegar a "Detalle de sanciones"
 * 8. Agregar 8 SANCIONES para el mismo administrado:
 *    - Seleccionar RIS aplicable y Tipo de Infracción
 *    - Sanción 1: MULTA (SOLES o UIT aleatorio)
 *    - Sanción 2: SUSPENSIÓN (Año/Mes/Día aleatorio)
 *    - Sanción 3: CANCELACIÓN (solo marcar)
 *    - Sanción 4: MULTA + SUSPENSIÓN (ambas)
 *    - Sanción 5: MULTA + CANCELACIÓN (ambas)
 *    - Sanción 6: MULTA (UIT 1-10) + SUSPENSIÓN (ambas)
 *    - Sanción 7: MULTA (UIT 1-10)
 *    - Sanción 8: MULTA (UIT 1-10) + CANCELACIÓN (ambas)
 * 9. Guardar formulario final
 *
 * Capturas:
 * - Exitosas dependen del modo de ejecución (:fast omite).
 * - Errores se guardan siempre en errors/.
 */

test('02-REGISTRAR SANCIÓN: registro robusto por lotes', async ({ page }, testInfo) => {
  test.setTimeout(300000); // 5 minutos de timeout

  const telemetryKey = testInfo.outputDir;
  const telemetry = createCaso02Telemetry(testInfo);
  const log = createCaso02Logger(testInfo);
  caso02TelemetryStore.set(telemetryKey, telemetry);

  const onFrameNavigated = (frame: { url: () => string; parentFrame: () => unknown }) => {
    if (frame.parentFrame()) return;
    pushLimited(telemetry.navigations, `${new Date().toISOString()} | ${frame.url()}`);
  };

  const onResponse = (response: { url: () => string; status: () => number; request: () => { method: () => string } }) => {
    const url = response.url();
    if (!/(auth|token|punku|session|permis|menu|\/api\/)/i.test(url)) return;
    pushLimited(
      telemetry.apiSamples,
      `${new Date().toISOString()} | ${response.request().method()} ${response.status()} ${url}`
    );
  };

  page.on('framenavigated', onFrameNavigated);
  page.on('response', onResponse);

  log.step('INICIO CASO 02: REGISTRAR SANCIÓN');

  // ═══════════════════════════════════════════════════════════════════
  // PASO 1: LOGIN + NAVEGACIÓN
  // Reutiliza `iniciarSesionYNavegar`
  // ═══════════════════════════════════════════════════════════════════
  log.step('PASO 1: LOGIN Y NAVEGACIÓN');

  const iniciarSesionConReintento = async (): Promise<void> => {
    let ultimoError: unknown;
    const workerBase = Number(testInfo.workerIndex ?? 0);
    const maxIntentos = Number.parseInt(process.env.REGINSA_CASO02_LOGIN_RETRIES || '3', 10) || 3;
    for (let intento = 1; intento <= maxIntentos; intento++) {
      telemetry.loginAttempts = intento;
      try {
        // Rotar usuario por intento reduce colisiones de sesión en paralelo.
        const workerRotado = workerBase + (intento - 1);
        await iniciarSesionYNavegar(page, 'infractor', workerRotado);
        return;
      } catch (error) {
        ultimoError = error;
        const mensaje = String((error as Error)?.message || '');
        const recuperable = /Navegaci[oó]n incompleta|Acceder Ahora visible|volvi[oó] a Home/i.test(mensaje);
        if (!recuperable || intento === maxIntentos) {
          throw error;
        }
        log.warn(`Reintento de sesión (${intento}/${maxIntentos}) por inestabilidad de navegación...`);
        await page.goto('https://reginsaqa.sunedu.gob.pe/#/home', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(500);
      }
    }
    throw (ultimoError || new Error('No se pudo inicializar sesión para Caso 02.'));
  };

  telemetry.loginStartedAt = new Date().toISOString();
  await iniciarSesionConReintento();
  telemetry.loginEndedAt = new Date().toISOString();
  log.step('Sesión iniciada y módulo cargado');

  // ═══════════════════════════════════════════════════════════════════
  // PASO 2: ABRIR FORMULARIO
  // ═══════════════════════════════════════════════════════════════════
  log.step('PASO 2: ABRIENDO FORMULARIO');

  // Reutiliza `abrirFormularioRegistrarSancion`
  await abrirFormularioRegistrarSancion(page);
  await page.waitForTimeout(2000);
  log.step('Formulario abierto');

  // ═══════════════════════════════════════════════════════════════════
  // PASO 3: SELECCIONAR ADMINISTRADO (UNA SOLA VEZ)
  // ═══════════════════════════════════════════════════════════════════
  log.step('PASO 3: SELECCIONANDO ADMINISTRADO');

  // Reutiliza `obtenerAdministradoAleatorio` pero reduce espera
  const admin = await obtenerAdministradoAleatorio(page);
  // Espera mínima, solo para asegurar carga
  await page.waitForTimeout(800);
  log.step(`Administrado seleccionado: ${admin}`);

  // ═══════════════════════════════════════════════════════════════════
  // PASO 4: LLENAR DATOS BÁSICOS
  // ═══════════════════════════════════════════════════════════════════
  log.step('PASO 4: DATOS BÁSICOS');

  const hoy = new Date();
  const maxFecha = new Date(hoy);
  maxFecha.setDate(maxFecha.getDate() - 2);
  // Reutiliza `generarFechaPonderada`
  const fechaResolucion = generarFechaPonderada(
    [
      { anio: 2024, peso: 0.2 },
      { anio: 2025, peso: 0.4 },
      { anio: 2026, peso: 0.4 }
    ],
    maxFecha
  );
  const yearResolucion = fechaResolucion.getFullYear();

  const numExp = Math.floor(Math.random() * 10000);
  const runIdPrefijo = String(process.env.TEST_RUN_ID || process.env.REGINSA_FUNC_RUN_ID || '').trim();
  const correlativoFA = reservarConsecutivoGlobalPorRun('caso02-fa-prefix-run', runIdPrefijo, 1);
  const prefijoFA = `FA ${String(correlativoFA).padStart(2, '0')}`;
  telemetry.runId = runIdPrefijo || 'SIN_RUN_ID';
  telemetry.prefijo = prefijoFA;
  log.step(`PREFIJO_CORRIDA_C02=${prefijoFA} | RUN_ID=${runIdPrefijo || 'SIN_RUN_ID'}`);

  const expInput = page.getByRole('textbox').nth(1);
  await expInput.click();
  await expInput.fill(`${prefijoFA} Exp N° ${numExp}-${yearResolucion}`);
  log.detail(`Expediente: ${prefijoFA} Exp N° ${numExp}-${yearResolucion}`);

  const numRes = Math.floor(Math.random() * 10000);
  const resInput = page.locator('input[formcontrolname="numeroResolucion"]');
  await resInput.click();
  await resInput.fill(`${prefijoFA} Res N° ${numRes}-${yearResolucion}`);
  log.detail(`Resolución: ${prefijoFA} Res N° ${numRes}-${yearResolucion}`);

  const formatFecha = (date: Date) => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const btnFecha = page.getByRole('button', { name: /Choose|Seleccionar/i });
  const fechaInput = btnFecha.locator('..').locator('input');
  const fechaTexto = formatFecha(fechaResolucion);

  const asegurarFecha = async () => {
    if (await fechaInput.isVisible().catch(() => false)) {
      await fechaInput.click();
      await fechaInput.fill(fechaTexto);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
    } else {
      await btnFecha.click();
      await page.waitForTimeout(1000);
      const dayBtn = page.getByText(String(fechaResolucion.getDate()), { exact: true }).first();
      await dayBtn.click();
      await page.waitForTimeout(500);
    }

    const valor = await fechaInput.inputValue().catch(() => '');
    return valor?.includes(fechaTexto);
  };

  let fechaOk = false;
  for (let intento = 0; intento < 3; intento++) {
    fechaOk = await asegurarFecha();
    if (fechaOk) break;
    await page.waitForTimeout(500);
  }

  if (!fechaOk) {
    throw new Error(`No se pudo fijar la fecha de resolución (${fechaTexto})`);
  }

  log.detail(`Fecha: ${fechaTexto}`);

  // ═══════════════════════════════════════════════════════════════════
  // PASO 5: SUBIR PDF
  // ═══════════════════════════════════════════════════════════════════
  log.step('PASO 5: SUBIENDO PDF');

  const pdfPath = resolverDocumentoPrueba();
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(pdfPath);
  await page.waitForTimeout(5000);
  log.step('PDF subido');

  // ═══════════════════════════════════════════════════════════════════
  // PASO 6: MEDIDAS CORRECTIVAS
  // ═══════════════════════════════════════════════════════════════════
  log.step('PASO 6: MEDIDAS CORRECTIVAS');

  for (let i = 1; i <= 3; i++) {
    const medidaInput = page.getByRole('textbox', { name: 'Ingrese la medida correctiva' }).nth(i - 1);
    await medidaInput.click();
    await medidaInput.fill(`Medida correctiva ${i}`);

    if (i < 3) {
      const btnAgregarMedida = page.getByRole('button', { name: 'Agregar medida' });
      if (await btnAgregarMedida.isVisible().catch(() => false)) {
        await btnAgregarMedida.click();
        await page.waitForTimeout(500);
      }
    }
    log.detail(`Medida ${i} agregada`);
  }

  log.step('Medidas ingresadas');

  // ═══════════════════════════════════════════════════════════════════
  // PASO 7: IR A PESTAÑA "DETALLE DE SANCIONES"
  // ═══════════════════════════════════════════════════════════════════
  log.step('PASO 7: NAVEGANDO A DETALLE DE SANCIONES');

  await page.waitForTimeout(2000);
  const tabDetalleSanciones = page.getByRole('tab', { name: 'Detalle de sanciones' });
  await tabDetalleSanciones.click();
  await page.waitForTimeout(2000);
  log.step('Tab Detalle de sanciones seleccionado');

  // ═══════════════════════════════════════════════════════════════════
  // PASO 8: AGREGAR SANCIONES (cantidad según repeat: completo vs ligero)
  // ═══════════════════════════════════════════════════════════════════

  // Estrategia funcional solicitada:
  // - si repeat-each <= 2: todas las ejecuciones con 8 sanciones (cobertura completa)
  // - si repeat-each >= 3: todas las ejecuciones con 2 sanciones (modo ligero)
  // Se prioriza REGINSA_EXECUTION_MODE para evitar fuga de variables entre scripts.
  const executionMode = (process.env.REGINSA_EXECUTION_MODE || '').toLowerCase();
  const isFast = executionMode === 'fast';
  const esScale = executionMode === 'scale' || (executionMode !== 'fast' && process.env.REGINSA_SCALE_MODE === '1');
  const shouldCapture = !esScale && process.env.SKIP_SCREENSHOTS !== '1';
  const repeatIndex = (testInfo as { repeatEachIndex?: number }).repeatEachIndex ?? 0;
  const repeatEachTotal = Math.max(1, Number(process.env.REGINSA_REPEAT_EACH || process.env.PLAYWRIGHT_REPEAT_EACH || 1));
  const sancionesEnCompleto = Math.max(1, Number.parseInt(process.env.REGINSA_CASO02_FULL_COUNT || '8', 10) || 8);
  const sancionesEnLigero = Math.max(1, Number.parseInt(process.env.REGINSA_CASO02_LIGHT_COUNT || '2', 10) || 2);

  const usarModoLigeroGlobal = repeatEachTotal >= 3;
  const repeat = usarModoLigeroGlobal ? sancionesEnLigero : sancionesEnCompleto;
  log.step(`PASO 8: AGREGANDO ${repeat} SANCIONES`);
  log.step(`Patrón funcional aplicado: repeatEach=${repeatEachTotal}, repeatIndex=${repeatIndex} -> ${repeat} sanciones (ligeroGlobal=${usarModoLigeroGlobal})`);
  const secuenciaSancionesBase: Array<{
    numero: number;
    nombre: string;
    multa: boolean;
    suspension: boolean;
    cancelacion: boolean;
    forceUIT?: boolean;
  }> = [
    { numero: 1, nombre: 'Multa (SOLES)', multa: true, suspension: false, cancelacion: false },
    { numero: 2, nombre: 'Suspensión', multa: false, suspension: true, cancelacion: false },
    { numero: 3, nombre: 'Cancelación', multa: false, suspension: false, cancelacion: true },
    { numero: 4, nombre: 'Multa (SOLES) + Suspensión', multa: true, suspension: true, cancelacion: false },
    { numero: 5, nombre: 'Multa (SOLES) + Cancelación', multa: true, suspension: false, cancelacion: true },
    { numero: 6, nombre: 'Multa (UIT)', multa: true, suspension: false, cancelacion: false, forceUIT: true },
    { numero: 7, nombre: 'Multa (UIT) + Suspensión', multa: true, suspension: true, cancelacion: false, forceUIT: true },
    { numero: 8, nombre: 'Multa (UIT) + Cancelación', multa: true, suspension: false, cancelacion: true, forceUIT: true }
  ];

  const sancionesDisponibles = [...secuenciaSancionesBase]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.max(1, Math.min(repeat, secuenciaSancionesBase.length)));

  const sanciones = Array.from({ length: sancionesDisponibles.length }, (_, idx) => {
    const base = sancionesDisponibles[idx % sancionesDisponibles.length];
    return {
      ...base,
      numero: idx + 1
    };
  });

  let exitosas = 0;
  const strictVerify = process.env.REGINSA_STRICT_VERIFY !== '0';
  const requireFinalApiConfirm = process.env.REGINSA_REQUIRE_FINAL_API_CONFIRM === '1';
  const minSancionesScale = Number(process.env.REGINSA_MIN_SANCIONES_SCALE || 5);
  // En este flujo: casos 1, 4 y 5 son SOLES; casos 6, 7 y 8 son UIT.

  const esperarRespuestaApiGuardado = async (timeoutMs: number): Promise<boolean> => {
    try {
      const response = await page.waitForResponse((res) => {
        const method = res.request().method().toUpperCase();
        if (!['POST', 'PUT', 'PATCH'].includes(method)) return false;

        const url = res.url().toLowerCase();
        if (!url.includes('/api/')) return false;
        if (!/(sanci|infractor|resoluci|detalle)/i.test(url)) return false;

        const status = res.status();
        return status >= 200 && status < 300;
      }, { timeout: timeoutMs });

      return !!response;
    } catch {
      return false;
    }
  };

  const esperarRespuestaApiGuardadoDetallada = async (
    timeoutMs: number
  ): Promise<{ ok: boolean; rateLimited: boolean; status: number }> => {
    try {
      const response = await page.waitForResponse((res) => {
        const method = res.request().method().toUpperCase();
        if (!['POST', 'PUT', 'PATCH'].includes(method)) return false;

        const url = res.url().toLowerCase();
        if (!url.includes('/api/')) return false;
        if (!/(sanci|infractor|resoluci|detalle)/i.test(url)) return false;

        const status = res.status();
        return (status >= 200 && status < 300) || status === 429;
      }, { timeout: timeoutMs });

      const status = response.status();
      return {
        ok: status >= 200 && status < 300,
        rateLimited: status === 429,
        status,
      };
    } catch {
      return { ok: false, rateLimited: false, status: 0 };
    }
  };

  const contarFilasDetalle = async (): Promise<number> => {
    const candidatos = [
      page.locator('.p-tabview-panel[aria-hidden="false"] table tbody tr'),
      page.locator('table tbody tr')
    ];

    let max = 0;
    for (const locator of candidatos) {
      const total = await locator.count().catch(() => 0);
      if (total > max) {
        max = total;
      }
    }
    return max;
  };

  const safeClick = async (locator: ReturnType<typeof page.locator>, label: string, attempts = 3): Promise<void> => {
    let lastError: unknown = null;
    for (let i = 0; i < attempts; i++) {
      try {
        await locator.waitFor({ state: 'visible', timeout: 4000 });
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.click({ force: true, timeout: 6000 });
        return;
      } catch (error) {
        lastError = error;
        await page.waitForTimeout(200);
      }
    }
    throw new Error(`No se pudo hacer click en ${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  };

  const cerrarDialogoSancion = async (): Promise<void> => {
    const dialogVisible = page.locator('.p-dialog:visible', { hasText: /Agregar\s*Sanci[oó]n/i }).first();
    if (!(await dialogVisible.isVisible().catch(() => false))) return;

    const btnCerrar = dialogVisible.locator('.p-dialog-header-close, button[aria-label*="close" i], button[icon="pi pi-times"]').first();
    if (await btnCerrar.isVisible().catch(() => false)) {
      await btnCerrar.click({ force: true }).catch(() => {});
    }
    if (await dialogVisible.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
    }
    await dialogVisible.waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
  };

  const dialogAgregarSancion = page.locator('.p-dialog:visible', { hasText: /Agregar\s*Sanci[oó]n/i }).first();
  let botonAgregarSancionEstable: Locator | null = null;

  const abrirDialogoSancion = async (): Promise<ReturnType<typeof page.locator>> => {
    const dialog = dialogAgregarSancion;

    // Fast-path: si el modal ya está visible, reutilizarlo de inmediato.
    if (await dialog.isVisible().catch(() => false)) {
      return dialog;
    }

    const btnAgregarSancionCandidatos = [
      page.locator('button[label="Agregar sanción"][icon="pi pi-plus"]').first(),
      page.locator('.p-tabview-panel[aria-hidden="false"] button[label="Agregar sanción"]').first(),
      page.getByRole('button', { name: /^Agregar\s*sanci[oó]n$/i }).first(),
      page.locator('button.p-button-success:has-text("Agregar sanción")').first()
    ];

    const esRapido = isFast || esScale;
    const maxIntentosAbrir = esRapido ? 4 : 8;
    const timeoutSondeo = esRapido ? 250 : 900;
    const timeoutVisibleModal = esRapido ? 1800 : 3500;
    const esperaReintento = esRapido ? 80 : 200;

    // Fast-path 2: reutiliza el botón que funcionó previamente.
    if (botonAgregarSancionEstable) {
      const visible = await botonAgregarSancionEstable.isVisible({ timeout: timeoutSondeo }).catch(() => false);
      const enabled = await botonAgregarSancionEstable.isEnabled({ timeout: timeoutSondeo }).catch(() => false);
      if (visible && enabled) {
        await botonAgregarSancionEstable.scrollIntoViewIfNeeded().catch(() => {});
        await botonAgregarSancionEstable.click({ force: true, timeout: timeoutSondeo * 3 }).catch(() => {});
        const modalVisible = await dialog.isVisible({ timeout: timeoutVisibleModal }).catch(() => false);
        if (modalVisible) {
          await dialog.waitFor({ state: 'visible', timeout: timeoutVisibleModal }).catch(() => {});
          return dialog;
        }
      }
    }

    for (let intento = 0; intento < maxIntentosAbrir; intento++) {
      for (const boton of btnAgregarSancionCandidatos) {
        const isVisible = await boton.isVisible({ timeout: timeoutSondeo }).catch(() => false);
        if (!isVisible) continue;

        const isEnabled = await boton.isEnabled({ timeout: timeoutSondeo }).catch(() => false);
        if (!isEnabled) continue;

        await boton.scrollIntoViewIfNeeded().catch(() => {});
        await boton.click({ force: true, timeout: timeoutSondeo * 4 }).catch(() => {});

        const modalVisible = await dialog.isVisible({ timeout: timeoutVisibleModal }).catch(() => false);
        if (modalVisible) {
          botonAgregarSancionEstable = boton;
          await dialog.waitFor({ state: 'visible', timeout: timeoutVisibleModal }).catch(() => {});
          return dialog;
        }
      }

      await page.waitForTimeout(esperaReintento);
    }

    throw new Error('No se pudo abrir el modal de Agregar sanción.');
  };

  for (const sancion of sanciones) {
    log.detail(`SANCIÓN ${sancion.numero}/${sanciones.length}: ${sancion.nombre}`);

    try {
      await cerrarDialogoSancion();
      const filasAntes = await contarFilasDetalle();

      // PASO 8A: ABRIR MODAL
      const dialog = await abrirDialogoSancion();

      log.detail('Modal abierto');

      // PASO 8B: RIS (aleatorio, selector exacto)
      const risDropdown = dialog.locator('p-dropdown[name="risSeleccionado"]');
      await risDropdown.waitFor({ state: 'visible', timeout: 3000 });
      const risTrigger = risDropdown.locator('.p-dropdown-trigger');
      let risSeleccionado = false;
      for (let intentoRis = 1; intentoRis <= 5 && !risSeleccionado; intentoRis++) {
        const panelRis = page.locator('.p-dropdown-panel:visible').last();
        const risOptions = panelRis.locator('.p-dropdown-item, [role="option"]');
        let risCount = 0;
        try {
          risCount = await abrirDropdownRobusto(page, risTrigger, panelRis, risOptions, {
            maxIntentos: 3,
            timeoutPasoMs: 2200
          });
        } catch {
          await page.waitForTimeout(220);
          continue;
        }

        const indicesValidos: number[] = [];
        for (let idx = 0; idx < risCount; idx++) {
          const texto = ((await risOptions.nth(idx).textContent()) || '').trim();
          if (!texto || /seleccione/i.test(texto)) continue;
          indicesValidos.push(idx);
        }

        if (indicesValidos.length > 0) {
          const risIndex = indicesValidos[Math.floor(Math.random() * indicesValidos.length)];
          await safeClick(risOptions.nth(risIndex), 'opción RIS');
          await page.waitForTimeout(220);
          risSeleccionado = true;
          log.detail('RIS aplicable seleccionado');
          break;
        }

        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(280);
      }

      if (!risSeleccionado) {
        throw new Error('No se encontraron opciones RIS aplicable');
      }

      // PASO 8C: TIPO INFRACCIÓN (aleatorio, rápido y variable)
      await page.waitForTimeout(200);
      const tipoDropdown = dialog.locator('p-dropdown[name="infraccionSeleccionada"], p-dropdown[formcontrolname="idTipoInfractor"], p-dropdown[optionlabel*="Infractor" i]').first();
      await tipoDropdown.waitFor({ state: 'visible', timeout: 4000 });

      let tipoSeleccionado = false;
      for (let intentoTipo = 1; intentoTipo <= 4 && !tipoSeleccionado; intentoTipo++) {
        const tipoRoot = tipoDropdown.locator('.p-dropdown').first();
        const disabledAttr = await tipoRoot.getAttribute('aria-disabled').catch(() => null);
        const clase = (await tipoRoot.getAttribute('class').catch(() => '')) || '';
        const deshabilitado = disabledAttr === 'true' || /\bp-disabled\b/i.test(clase);

        if (deshabilitado) {
          await page.waitForTimeout(300);
          continue;
        }

        const tipoTrigger = tipoDropdown.locator('.p-dropdown-trigger').first();
        const panelTipo = page.locator('.dropdown-panel-wrap--tipo:visible, .p-dropdown-panel:visible').last();
        const tipoOptions = panelTipo.locator('.p-dropdown-item, [role="option"]');
        let tipoCount = 0;
        try {
          tipoCount = await abrirDropdownRobusto(page, tipoTrigger, panelTipo, tipoOptions, {
            maxIntentos: 3,
            timeoutPasoMs: 2400
          });
        } catch {
          await page.waitForTimeout(220);
          continue;
        }

        const indicesValidos: number[] = [];
        for (let idx = 0; idx < tipoCount; idx++) {
          const texto = ((await tipoOptions.nth(idx).textContent()) || '').trim();
          if (!texto || /seleccione/i.test(texto)) continue;
          indicesValidos.push(idx);
        }

        if (indicesValidos.length > 0) {
          const elegido = indicesValidos[Math.floor(Math.random() * indicesValidos.length)];
          await safeClick(tipoOptions.nth(elegido), 'opción Tipo Infractor');
          await page.waitForTimeout(180);
          tipoSeleccionado = true;
          log.detail('Tipo Infractor seleccionado');
          break;
        }

        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(280);
      }

      if (!tipoSeleccionado) {
        throw new Error('No se encontraron opciones de Tipo Infractor');
      }

      // PASO 8D: HECHO INFRACTOR
      const hechoInput = dialog.getByPlaceholder('Describe el hecho infractor');
      await hechoInput.click();
      await hechoInput.fill('hecho infractor');
      await page.waitForTimeout(1000);
      log.detail('Hecho Infractor llenado');

      const marcarCheckbox = async (id: string, label: string) => {
        const input = dialog.locator(`#${id}`);
        const visible = await input.isVisible({ timeout: 3000 }).catch(() => false);
        if (visible) {
          const marcado = await input.isChecked().catch(() => false);
          if (!marcado) {
            await safeClick(input, `checkbox ${label}`);
            await page.waitForTimeout(800);
          }
          log.detail(`${label} marcada`);
          return;
        }

        const labelLocator = dialog.locator(`label[for="${id}"]`);
        if (await labelLocator.isVisible({ timeout: 3000 }).catch(() => false)) {
          await safeClick(labelLocator, `label ${label}`);
          await page.waitForTimeout(800);
          log.detail(`${label} marcada`);
        }
      };

      if (sancion.multa) {
        await marcarCheckbox('multa', 'Multa');
      }

      if (sancion.suspension) {
        await marcarCheckbox('suspension', 'Suspensión');
      }

      if (sancion.cancelacion) {
        await marcarCheckbox('cancelacion', 'Cancelación');
      }

      // PASO 8F: MULTA - MONTO
      if (sancion.multa) {
        const forceUIT = (sancion as { forceUIT?: boolean }).forceUIT === true;
        const usarUIT = forceUIT;
        const cantidad = usarUIT
          ? (Math.floor(Math.random() * 10) + 1).toString()
          : (Math.floor(Math.random() * 200000) + 1).toString();
        const tipoMoneda = usarUIT ? 'UIT' : 'SOLES';

        const radioId = usarUIT ? 'uit' : 'soles';
        const radioInput = dialog.locator(`#${radioId}`);
        const radioBoxById = dialog.locator(`p-radiobutton[inputid="${radioId}"] .p-radiobutton-box`).first();

        if (await radioBoxById.isVisible({ timeout: 1000 }).catch(() => false)) {
          await safeClick(radioBoxById, `radio ${radioId}`);
        } else if (await radioInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await safeClick(radioInput, `radio input ${radioId}`);
        }
        await page.waitForTimeout(800);

        if (forceUIT) {
          log.detail('UIT forzado seleccionado');
        }

        const inputMoneda = usarUIT
          ? dialog.locator('input[name="valorUIT"]').first()
          : dialog.locator('input[name="valorSoles"], input[placeholder="0.00"]').first();
        if (await inputMoneda.isVisible({ timeout: 3000 }).catch(() => false)) {
          await inputMoneda.click();
          await inputMoneda.fill(cantidad);
          await page.waitForTimeout(600);
          log.detail(`Monto: ${cantidad} ${tipoMoneda}`);
        }
      }

      // PASO 8G: TIEMPO (SOLO SUSPENSIÓN)
      if (sancion.suspension) {
        const dialog = page.locator('[role="dialog"]').first();

        const tiempoLabel = dialog.locator('label', { hasText: /Tiempo/i }).first();
        const tiempoDropdown = tiempoLabel.locator('..').locator('p-dropdown, .p-dropdown').first();
        const tiempoCombobox = dialog.getByRole('combobox', { name: /Tiempo/i }).first();
        let tiempoButton = tiempoDropdown.locator('.p-dropdown-trigger, [role="button"], [role="combobox"]').first();

        if (!(await tiempoButton.isVisible({ timeout: 1500 }).catch(() => false))) {
          tiempoButton = tiempoCombobox;
        }

        await tiempoButton.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

        let tipoSeleccionado: 'Año' | 'Mes' | 'Día' | null = null;
        const opcionesTiempo = page.getByRole('option').filter({ hasText: /Año|Mes|Día/i });

        for (let intento = 0; intento < 3; intento++) {
          await safeClick(tiempoButton, 'trigger Tiempo');
          await page.waitForTimeout(800);

          const totalOpciones = await opcionesTiempo.count().catch(() => 0);
          if (totalOpciones > 0) {
            const index = Math.floor(Math.random() * totalOpciones);
            const opcion = opcionesTiempo.nth(index);
            const texto = (await opcion.innerText()).trim();
            if (/Año/i.test(texto)) tipoSeleccionado = 'Año';
            else if (/Mes/i.test(texto)) tipoSeleccionado = 'Mes';
            else tipoSeleccionado = 'Día';

            await safeClick(opcion, 'opción Tiempo');
            await page.waitForTimeout(800);
            break;
          }

          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }

        const tipoFinal = tipoSeleccionado ?? 'Año';
        let cantidad = 1;
        if (tipoFinal === 'Año') cantidad = Math.floor(Math.random() * 5) + 1;
        else if (tipoFinal === 'Mes') cantidad = Math.floor(Math.random() * 11) + 1;
        else cantidad = Math.floor(Math.random() * 29) + 1;

        const cantidadInput = dialog.getByPlaceholder('Cantidad');
        if (await cantidadInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await cantidadInput.click();
          await cantidadInput.fill(cantidad.toString());
          await page.waitForTimeout(600);
          log.detail(`Tiempo: ${tipoFinal} (${cantidad})`);
        }
      }

      // PASO 8H: GUARDAR DETALLE
      const btnGuardarDetalle = page.locator('button[label="Guardar detalle"][icon="pi pi-save"]');
      await btnGuardarDetalle.waitFor({ state: 'visible', timeout: 5000 });

      const apiDetalleOkPromise = esperarRespuestaApiGuardado(esScale ? 6500 : 9000);
      await safeClick(btnGuardarDetalle, 'Guardar detalle');

      // Validar que el detalle fue guardado correctamente
      let guardado = false;
      const maxIntentosGuardado = esScale ? 4 : 3;
      const esperaGuardadoMs = esScale ? 450 : 1000;
      let toastDetalleVisible = false;
      let filasIncrementaron = false;

      for (let intento = 0; intento < maxIntentosGuardado; intento++) {
        const toastExito = page.locator('.p-toast-message-success, .p-toast-message[aria-label*="Éxito"], .p-toast-message[style*="green"]').first();
        toastDetalleVisible = await toastExito.isVisible().catch(() => false);
        const filasDespues = await contarFilasDetalle();
        filasIncrementaron = filasDespues > filasAntes;

        if (toastDetalleVisible || filasIncrementaron) {
          guardado = true;
          break;
        }
        await page.waitForTimeout(esperaGuardadoMs);
      }

      const apiDetalleOk = await apiDetalleOkPromise;
      guardado = guardado || apiDetalleOk;

      if (!guardado) {
        throw new Error(`No se confirmó el guardado del detalle de sanción (toast=${toastDetalleVisible}, filasIncrementaron=${filasIncrementaron}, api=${apiDetalleOk})`);
      }
      await page.waitForTimeout(esScale ? 120 : (isFast ? 300 : 1000));
      exitosas++;
      log.step(`DETALLE GUARDADO ${exitosas}/${sanciones.length}`);

      if (shouldCapture && (sancion.numero === 5 || sancion.numero === sanciones.length)) {
        try {
          const toast = page.locator('.p-toast-message-success, .p-toast-message[aria-label*="Éxito"], .p-toast-message[style*="green"]');
          await toast.waitFor({ state: 'visible', timeout: 4000 });
          await page.waitForTimeout(300);
          await page.screenshot({
            path: `screenshots/02-REGISTRAR_SANCION_DETALLE_${sancion.numero}_VENTANA.png`,
            fullPage: true
          });
        } catch (errorToast) {
          const detalle = errorToast instanceof Error ? errorToast.message : String(errorToast);
          log.warn(`Captura de detalle omitida: ${detalle}`);
        }
      }

      // PASO 8I: CERRAR MODAL
      await cerrarDialogoSancion();
      await page.waitForTimeout(esScale ? 120 : (isFast ? 350 : 1500));

    } catch (error) {
      await cerrarDialogoSancion().catch(() => {});
      const msg = error instanceof Error ? error.message.substring(0, 35) : 'Error';
      log.warn(`Detalle no completado: ${msg}`);
    }

  }

  log.step(`SANCIONES COMPLETADAS: ${exitosas}/${sanciones.length}`);

  // ═══════════════════════════════════════════════════════════════════
  // PASO 9: GUARDAR FORMULARIO FINAL
  // ═══════════════════════════════════════════════════════════════════
  log.step('PASO 9: GUARDANDO FORMULARIO FINAL');

  // Captura formulario lleno antes de guardar
  // Reutiliza `capturarFormularioLleno`
  if (shouldCapture) {
    await capturarFormularioLleno(page, '02-REGISTRAR_SANCION', admin, '', 'REGISTRAR_SANCION', '09_FORMULARIO_FINAL');
  }

  await page.waitForTimeout(esScale ? 200 : (isFast ? 400 : 2000));
  const btnGuardarFinal = page.locator('button[label="Guardar"][icon="pi pi-save"]');
  await btnGuardarFinal.waitFor({ state: 'visible', timeout: 5000 });

  const toastFinal = page.locator('.p-toast-message-success, .p-toast-message[aria-label*="Éxito"], .p-toast-message[style*="green"]').first();
  const extraFinalSaveRetries = Math.max(
    0,
    Number.parseInt(process.env.REGINSA_CASO02_FINAL_SAVE_RETRIES || (isFast ? '2' : '1'), 10) || (isFast ? 2 : 1)
  );

  let toastVisible = false;
  let apiFinalEstado = { ok: false, rateLimited: false, status: undefined as number | undefined };
  let apiFinalOk = false;

  for (let intento = 0; intento <= extraFinalSaveRetries; intento++) {
    if (intento > 0) {
      log.warn(`Sin confirmación de guardado final en intento ${intento}. Reintentando...`);
      await page.waitForTimeout(esScale ? 400 : (isFast ? 700 : 1500));
      await btnGuardarFinal.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    }

    const apiFinalEstadoPromise = esperarRespuestaApiGuardadoDetallada(esScale ? 6500 : 10000);
    await btnGuardarFinal.click({ force: true }).catch(() => {});
    await page.waitForTimeout(esScale ? 900 : (isFast ? 1200 : 4000));

    const toastVisibleIntento = await toastFinal.isVisible({ timeout: esScale ? 3000 : 5000 }).catch(() => false);
    const apiEstadoIntento = await apiFinalEstadoPromise;

    toastVisible = toastVisible || toastVisibleIntento;
    if (!apiFinalOk || apiEstadoIntento.ok || apiEstadoIntento.rateLimited) {
      apiFinalEstado = apiEstadoIntento;
      apiFinalOk = apiEstadoIntento.ok;
    }

    if (toastVisible || apiFinalOk || apiFinalEstado.rateLimited) {
      break;
    }
  }

  if (strictVerify) {
    if (!toastVisible && !apiFinalOk) {
      if (apiFinalEstado.rateLimited) {
        log.warn('Guardado final con límite de tasa (HTTP 429). Se considera válido por política de entorno.');
      } else {
        throw new Error('No se confirmó el guardado final del formulario (sin toast ni confirmación API).');
      }
    }
    if (requireFinalApiConfirm && !apiFinalOk && !apiFinalEstado.rateLimited) {
      throw new Error('No se confirmó el guardado final del formulario por API.');
    }
  }


  log.step('Formulario guardado');

  // Validar que la cabecera aparece en el listado paginado (nueva API)
  // En modo fast se prioriza velocidad/estabilidad E2E de UI y no se bloquea por esta consulta.
  const strictCabeceraPaginada = !esScale && !isFast;
  try {
    const token = await extractAuthTokenFromStorage(page);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await page.request.post(
      'https://reginsaapiqa.sunedu.gob.pe/api/CabeceraInfraccionSancion/ListarPaginado',
      {
        data: {
          PageNumber: 1,
          PageSize: 10,
        },
        headers
      }
    );

    if (!response.ok()) {
      if (strictCabeceraPaginada) {
        throw new Error('Error al consultar la API de cabeceras paginadas');
      }
      log.warn(`Consulta paginada no disponible (status=${response.status()}) en modo no estricto.`);
    } else {
      const data = await response.json();
      const encontrado = data.oData?.Results?.some(
        (cab: { NumeroExpediente?: string }) => cab.NumeroExpediente === `${prefijoFA} Exp N° ${numExp}-${yearResolucion}`
      );
      if (!encontrado) {
        if (strictCabeceraPaginada) {
          throw new Error('La cabecera recién creada no aparece en el listado paginado.');
        }
        log.warn('Cabecera no encontrada en paginado en modo no estricto.');
      } else {
        log.detail('Cabecera encontrada en el listado paginado');
      }
    }
  } catch (errorCabecera) {
    if (strictCabeceraPaginada) {
      throw errorCabecera;
    }
    const detalle = errorCabecera instanceof Error ? errorCabecera.message : String(errorCabecera);
    log.warn(`Validación de cabecera paginada omitida en modo no estricto: ${detalle}`);
  }

  if (shouldCapture) {
    // Captura pantalla completa de éxito final
    const toastVisible = await toastFinal.isVisible({ timeout: 4000 }).catch(() => false);
    if (toastVisible) {
      await page.waitForTimeout(300);
    } else {
      log.warn('Toast final no visible dentro del timeout. Se continúa por validación de guardado ya completada.');
    }
    await page.screenshot({
      path: 'screenshots/02-REGISTRAR_SANCION_EXITO_FINAL.png',
      fullPage: true
    });

    // Reutiliza `capturarToastExito`
    await capturarToastExito(page, '02-REGISTRAR_SANCION', '10_EXITO_GUARDAR_GENERAL', admin, '', 'REGISTRAR_SANCION', 2500);

    try {
      // Reutiliza `capturarPantallaMejorada`
      await capturarPantallaMejorada(page, '02-REGISTRAR_SANCION', '11_FINAL', 'Éxito', 'Final');
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      log.warn(`No se pudo capturar pantalla final mejorada: ${detalle}`);
    }
  }
  log.step(`TEST COMPLETADO - Sanciones: ${exitosas}/${sanciones.length}`);

  let minSancionesRequeridas = 3;
  if (strictVerify) {
    minSancionesRequeridas = esScale
      ? Math.max(1, Math.min(sanciones.length, minSancionesScale))
      : sanciones.length;
  }
  if (exitosas >= minSancionesRequeridas) {
    log.step(`EXITOSO: ${exitosas}/${sanciones.length} sanciones registradas`);
    if (strictVerify && esScale && exitosas < sanciones.length) {
      log.warn(`Modo scale: sanciones parciales ${exitosas}/${sanciones.length} (umbral=${minSancionesRequeridas}).`);
    }
  } else {
    throw new Error(`Solo ${exitosas} sanciones registradas (se requieren al menos ${minSancionesRequeridas})`);
  }

  page.off('framenavigated', onFrameNavigated);
  page.off('response', onResponse);
});
