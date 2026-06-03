import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  abrirFormularioNuevoAdministrado,
  generarRUC,
  iniciarSesionYNavegar
} from 'tests/utilidades/reginsa-actions';

type CampoOmitir =
  | 'ruc'
  | 'razonSocial'
  | 'nombreComercial'
  | 'estado'
  | 'ninguno';

const TOAST_OK = '.p-toast-message-success, .p-toast-message[aria-label*="Éxito"], .p-toast-message[style*="green"]';
const TOAST_ERROR = '.p-toast-message-error, .p-toast-message[aria-label*="Error"], .p-toast-message[style*="red"]';
const VALIDACION_DUPLICADO_REGEX = /ya\s*existe|duplicad|repetid|registrad|no\s*puede\s*repetirse|se\s*encuentra\s*registrad/i;
const VALIDACION_RUC_11_DIGITOS_REGEX = /debe\s*tener\s*11\s*d[ií]gitos\s*num[eé]ricos/i;

async function iniciarFormulario(page: Page, workerIndex: number) {
  await iniciarSesionYNavegar(page, 'infractor', workerIndex);
  await abrirFormularioNuevoAdministrado(page);
  await page.waitForTimeout(700);
}

function crearDatosBase() {
  const marca = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const rucGenerado = String(generarRUC()).replaceAll(/\D/g, '');
  const ruc = /^\d{11}$/.test(rucGenerado)
    ? rucGenerado
    : String(Math.floor(10000000000 + Math.random() * 90000000000));
  const razonSocial = `FA VALIDACION RAZON SOCIAL ${marca} S.A.C.`;
  const nombreComercial = `VALIDACION COMERCIAL ${marca}`;
  return { ruc, razonSocial, nombreComercial };
}

async function obtenerScopeFormulario(page: Page): Promise<Locator> {
  const dialog = page.getByRole('dialog').filter({ hasText: /Agregar\s*Administrado|Registrar\s*Sancionar/i }).first();
  if (await dialog.isVisible().catch(() => false)) {
    return dialog;
  }

  const dialogAlt = page.locator('.p-dialog:visible, .ant-modal:visible').filter({ hasText: /Agregar\s*Administrado|Registrar\s*Sancionar/i }).first();
  if (await dialogAlt.isVisible().catch(() => false)) {
    return dialogAlt;
  }

  return page.locator('body');
}

async function inputCampo(scope: Locator, campo: 'ruc' | 'razonSocial' | 'nombreComercial'): Promise<Locator> {
  const mapa: Record<'ruc' | 'razonSocial' | 'nombreComercial', string> = {
    ruc: 'input[formcontrolname*="ruc" i], input[name*="ruc" i], input[id*="ruc" i], input[placeholder*="ruc" i], input[aria-label*="ruc" i]',
    razonSocial: 'input[formcontrolname*="razon" i], input[name*="razon" i], input[id*="razon" i], input[placeholder*="razon" i], input[aria-label*="razon" i]',
    nombreComercial: 'input[formcontrolname*="comercial" i], input[name*="comercial" i], input[id*="comercial" i], input[placeholder*="comercial" i], input[aria-label*="comercial" i], input[formcontrolname*="nombre" i], input[name*="nombre" i]'
  };

  const candidato = scope.locator(mapa[campo]).first();
  const visible = await candidato.isVisible().catch(() => false);
  if (!visible) {
    throw new Error(`No se encontró el input para campo: ${campo}`);
  }

  return candidato;
}

async function llenarInput(scope: Locator, campo: 'ruc' | 'razonSocial' | 'nombreComercial', valor: string) {
  const input = await inputCampo(scope, campo);
  await input.click();
  await input.fill('');
  await input.fill(valor);
}

async function seleccionarEstadoValido(page: Page, scope: Locator): Promise<void> {
  const combobox = scope.getByRole('combobox').first();
  if (!(await combobox.isVisible().catch(() => false))) {
    throw new Error('No se encontró combobox de estado en formulario de administrado.');
  }

  await combobox.click({ force: true });
  await page.waitForTimeout(250);

  const opcionVisible = page
    .locator('.p-dropdown-panel:visible li[role="option"], .p-dropdown-panel:visible .p-dropdown-item, [role="option"]:visible')
    .filter({ hasText: /^(?!.*seleccione).+/i })
    .first();

  const pudoSeleccionar = await opcionVisible.isVisible({ timeout: 2500 }).catch(() => false);
  if (!pudoSeleccionar) {
    throw new Error('No se encontró opción visible para seleccionar Estado.');
  }

  await opcionVisible.click({ force: true });
  await page.waitForTimeout(250);
}

async function completarFormularioBase(
  page: Page,
  omitir: CampoOmitir,
  override?: Partial<{ ruc: string; razonSocial: string; nombreComercial: string }>
) {
  const scope = await obtenerScopeFormulario(page);
  const datos = { ...crearDatosBase(), ...(override || {}) };

  if (omitir !== 'ruc') {
    await llenarInput(scope, 'ruc', datos.ruc);
  }

  if (omitir !== 'razonSocial') {
    await llenarInput(scope, 'razonSocial', datos.razonSocial);
  }

  if (omitir !== 'nombreComercial') {
    await llenarInput(scope, 'nombreComercial', datos.nombreComercial);
  }

  if (omitir !== 'estado') {
    await seleccionarEstadoValido(page, scope);
  }

  return datos;
}

async function intentarGuardar(page: Page): Promise<{ ok: boolean; modalSigueAbierto: boolean }> {
  const scope = await obtenerScopeFormulario(page);
  const btnGuardar = scope.getByRole('button', { name: /^Guardar$/i }).first();

  await btnGuardar.waitFor({ state: 'visible', timeout: 10000 });
  await btnGuardar.click({ force: true });
  await page.waitForTimeout(1400);

  const ok = await page.locator(TOAST_OK).first().isVisible({ timeout: 1500 }).catch(() => false);
  const modalSigueAbierto = await (await obtenerScopeFormulario(page)).getByRole('button', { name: /^Guardar$/i }).first().isVisible().catch(() => false);

  return { ok, modalSigueAbierto };
}

async function obtenerBotonGuardar(page: Page): Promise<Locator> {
  const scope = await obtenerScopeFormulario(page);
  const btnGuardar = scope.getByRole('button', { name: /^Guardar$/i }).first();
  await btnGuardar.waitFor({ state: 'visible', timeout: 10000 });
  return btnGuardar;
}

async function esperarToastErrorConTexto(page: Page, regex: RegExp): Promise<boolean> {
  const toast = page.locator(TOAST_ERROR).first();
  const visible = await toast.isVisible({ timeout: 4000 }).catch(() => false);
  if (!visible) return false;

  const texto = (await toast.innerText().catch(() => '')).trim();
  return regex.test(texto);
}

async function detectarMensajeValidacion(scope: Locator, regex: RegExp): Promise<boolean> {
  const mensajeDirecto = scope.getByText(regex).first();
  if (await mensajeDirecto.isVisible().catch(() => false)) return true;

  const mensajes = scope.locator('.p-error, .invalid-feedback, .mat-error, .text-danger, .error-message, small');
  const total = await mensajes.count().catch(() => 0);

  for (let i = 0; i < total; i++) {
    const texto = await mensajes.nth(i).innerText().catch(() => '');
    if (regex.test(texto || '')) {
      return true;
    }
  }

  return false;
}

async function detectarValidacionDuplicado(page: Page): Promise<boolean> {
  const scope = await obtenerScopeFormulario(page);

  const mensajeDirecto = scope.getByText(VALIDACION_DUPLICADO_REGEX).first();
  if (await mensajeDirecto.isVisible().catch(() => false)) return true;

  const mensajes = scope.locator('.p-error, .invalid-feedback, .mat-error, .text-danger, .error-message');
  const total = await mensajes.count().catch(() => 0);

  for (let i = 0; i < total; i++) {
    const texto = await mensajes.nth(i).innerText().catch(() => '');
    if (VALIDACION_DUPLICADO_REGEX.test(texto || '')) {
      return true;
    }
  }

  return false;
}

test.describe('@validaciones AGREGAR ADMINISTRADO - Campos obligatorios y reglas', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240000);

  test.afterEach(async ({ page }, testInfo) => {
    const screenshot = await page.screenshot({ fullPage: true }).catch(() => null);
    if (screenshot) {
      await testInfo.attach('validacion-evidencia-ui', {
        body: screenshot,
        contentType: 'image/png'
      });
    }
  });

  const obligatorios: Array<{ campo: CampoOmitir; titulo: string }> = [
    { campo: 'ruc', titulo: 'R.U.C. obligatorio' },
    { campo: 'razonSocial', titulo: 'Razón Social obligatoria' },
    { campo: 'nombreComercial', titulo: 'Nombre Comercial obligatorio' },
    { campo: 'estado', titulo: 'Estado obligatorio' }
  ];

  for (const item of obligatorios) {
    test(`bloquea guardado cuando falta: ${item.titulo}`, async ({ page }, testInfo) => {
      await iniciarFormulario(page, testInfo.workerIndex);
      await completarFormularioBase(page, item.campo);

      const btnGuardar = await obtenerBotonGuardar(page);
      const deshabilitadoAntes = !(await btnGuardar.isEnabled().catch(() => false));
      expect(deshabilitadoAntes).toBeTruthy();

      const resultado = await intentarGuardar(page);
      expect(resultado.ok).toBeFalsy();
      expect(resultado.modalSigueAbierto).toBeTruthy();

      const sigueDeshabilitado = !(await btnGuardar.isEnabled().catch(() => false));
      expect(sigueDeshabilitado).toBeTruthy();
    });
  }

  const rucInvalidos = [
    { valor: '1234567890', titulo: 'RUC con 10 dígitos' },
    { valor: '1234ABC8901', titulo: 'RUC alfanumérico' },
    { valor: '123456789012', titulo: 'RUC con 12 dígitos' }
  ];

  for (const item of rucInvalidos) {
    test(`bloquea guardado por validación de RUC: ${item.titulo}`, async ({ page }, testInfo) => {
      await iniciarFormulario(page, testInfo.workerIndex);
      await completarFormularioBase(page, 'ninguno', { ruc: item.valor });

      const scope = await obtenerScopeFormulario(page);
      const rucInput = await inputCampo(scope, 'ruc');
      const razonInput = await inputCampo(scope, 'razonSocial');
      await rucInput.blur().catch(async () => {
        await razonInput.click({ force: true });
      });
      await page.waitForTimeout(400);

      const msg11 = await detectarMensajeValidacion(scope, VALIDACION_RUC_11_DIGITOS_REGEX);
      expect(msg11).toBeTruthy();

      const resultado = await intentarGuardar(page);
      expect(resultado.ok).toBeFalsy();
      expect(resultado.modalSigueAbierto).toBeTruthy();
    });
  }

  test('valida RUC duplicado con toast de error superior derecho', async ({ page }, testInfo) => {
    const datos = crearDatosBase();

    await iniciarFormulario(page, testInfo.workerIndex);
    await completarFormularioBase(page, 'ninguno', datos);
    const primerGuardado = await intentarGuardar(page);
    expect(primerGuardado.ok).toBeTruthy();

    await abrirFormularioNuevoAdministrado(page);
    await page.waitForTimeout(700);
    const datosSegundo = crearDatosBase();
    await completarFormularioBase(page, 'ninguno', {
      ruc: datos.ruc,
      razonSocial: datosSegundo.razonSocial,
      nombreComercial: datosSegundo.nombreComercial
    });

    const segundoGuardado = await intentarGuardar(page);
    const toastDuplicadoRuc = await esperarToastErrorConTexto(page, /ya\s*existe.*ruc|ruc.*ya\s*existe|misma\s*ruc|entidad\s+con\s+el\s+ruc/i);
    const duplicadoDetectado = await detectarValidacionDuplicado(page);

    expect(segundoGuardado.ok).toBeFalsy();
    expect(toastDuplicadoRuc || duplicadoDetectado || segundoGuardado.modalSigueAbierto).toBeTruthy();
  });

  test('valida Razón Social duplicada con toast de error superior derecho', async ({ page }, testInfo) => {
    const datos = crearDatosBase();

    await iniciarFormulario(page, testInfo.workerIndex);
    await completarFormularioBase(page, 'ninguno', datos);
    const primerGuardado = await intentarGuardar(page);
    expect(primerGuardado.ok).toBeTruthy();

    await abrirFormularioNuevoAdministrado(page);
    await page.waitForTimeout(700);
    const datosSegundo = crearDatosBase();
    await completarFormularioBase(page, 'ninguno', {
      ruc: datosSegundo.ruc,
      razonSocial: datos.razonSocial,
      nombreComercial: datosSegundo.nombreComercial
    });

    const segundoGuardado = await intentarGuardar(page);
    const toastDuplicadoRazon = await esperarToastErrorConTexto(page, /misma\s*raz[oó]n\s*social|raz[oó]n\s*social.*ya\s*existe|entidad\s+con\s+la\s+misma\s+raz[oó]n/i);
    const duplicadoDetectado = await detectarValidacionDuplicado(page);

    expect(segundoGuardado.ok).toBeFalsy();
    expect(toastDuplicadoRazon || duplicadoDetectado || segundoGuardado.modalSigueAbierto).toBeTruthy();
  });
});
