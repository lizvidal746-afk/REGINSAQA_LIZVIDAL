import { test, expect, type Page } from '@playwright/test';
import {
  iniciarSesionYNavegar,
  abrirFormularioRegistrarSancion,
  obtenerAdministradoAleatorio,
  generarFechaPonderada,
  resolverDocumentoPrueba
} from 'tests/utilidades/reginsa-actions';

const seleccionarRISEnModal = async (...args: any[]) => { return ""; };
const seleccionarTipoInfractorEnModal = async (...args: any[]) => { return ""; };

type CabeceraOmitir =
  | 'administrado'
  | 'expediente'
  | 'resolucion'
  | 'fecha'
  | 'pdf'
  | 'ninguno';

const TOAST_OK = '.p-toast-message-success, .p-toast-message[aria-label*="Éxito"], .p-toast-message[style*="green"]';
const TOAST_WARNING = '.p-toast-message-warn, .p-toast-message[aria-label*="Advertencia"], .p-toast-message[style*="orange"], .p-toast-message';

function esModoRapido(): boolean {
  const mode = (process.env.REGINSA_EXECUTION_MODE || '').toLowerCase();
  return mode === 'fast' || mode === 'scale';
}

async function abrirModalAgregarSancion(page: Page) {
  const dialog = page.locator('.p-dialog:visible', { hasText: /Agregar\s*Sanci[oó]n/i }).first();
  const candidatos = [
    page.locator('button[label="Agregar sanción"][icon="pi pi-plus"]').first(),
    page.locator('.p-tabview-panel[aria-hidden="false"] button[label="Agregar sanción"]').first(),
    page.getByRole('button', { name: /^Agregar\s*sanci[oó]n$/i }).first(),
    page.locator('button.p-button-success:has-text("Agregar sanción")').first()
  ];

  const rapido = esModoRapido();
  const maxIntentos = rapido ? 4 : 8;
  const timeoutSondeo = rapido ? 250 : 900;
  const timeoutModal = rapido ? 1800 : 3500;
  const espera = rapido ? 80 : 200;

  for (let intento = 0; intento < maxIntentos; intento++) {
    for (const boton of candidatos) {
      const visible = await boton.isVisible({ timeout: timeoutSondeo }).catch(() => false);
      if (!visible) continue;

      const enabled = await boton.isEnabled({ timeout: timeoutSondeo }).catch(() => false);
      if (!enabled) continue;

      await boton.scrollIntoViewIfNeeded().catch(() => {});
      await boton.click({ force: true, timeout: timeoutSondeo * 4 }).catch(() => {});

      const modalVisible = await dialog.isVisible({ timeout: timeoutModal }).catch(() => false);
      if (modalVisible) {
        await dialog.waitFor({ state: 'visible', timeout: timeoutModal }).catch(() => {});
        return dialog;
      }
    }

    await page.waitForTimeout(espera);
  }

  throw new Error('No se pudo abrir el modal de Agregar sanción en validaciones.');
}

async function iniciarFormulario(page: Page, workerIndex: number) {
  await iniciarSesionYNavegar(page, 'infractor', workerIndex);
  await abrirFormularioRegistrarSancion(page);
  await page.waitForTimeout(800);
}

function generarFechaResolucionTexto(): string {
  const hoy = new Date();
  const maxFecha = new Date(hoy);
  maxFecha.setDate(maxFecha.getDate() - 2);

  const fechaResolucion = generarFechaPonderada(
    [
      { anio: 2024, peso: 0.2 },
      { anio: 2025, peso: 0.4 },
      { anio: 2026, peso: 0.4 }
    ],
    maxFecha
  );

  const dd = String(fechaResolucion.getDate()).padStart(2, '0');
  const mm = String(fechaResolucion.getMonth() + 1).padStart(2, '0');
  const yyyy = fechaResolucion.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function completarCabeceraBase(page: Page, omitir: CabeceraOmitir) {
  if (omitir !== 'administrado') {
    await obtenerAdministradoAleatorio(page);
    await page.waitForTimeout(400);
  }

  const year = new Date().getFullYear();
  if (omitir !== 'expediente') {
    const expInput = page.getByRole('textbox').nth(1);
    await expInput.fill(`Exp N° ${Math.floor(Math.random() * 10000)}-${year}`);
  }

  if (omitir !== 'resolucion') {
    const resInput = page.locator('input[formcontrolname="numeroResolucion"]');
    await resInput.fill(`Res N° ${Math.floor(Math.random() * 10000)}-${year}`);
  }

  if (omitir !== 'fecha') {
    const btnFecha = page.getByRole('button', { name: /Choose|Seleccionar/i }).first();
    const fechaInput = btnFecha.locator('..').locator('input');
    const fechaTexto = generarFechaResolucionTexto();

    const fijarFecha = async () => {
      if (await fechaInput.isVisible().catch(() => false)) {
        await fechaInput.click();
        await fechaInput.fill(fechaTexto);
        await page.keyboard.press('Tab');
        await page.waitForTimeout(250);
      } else {
        await btnFecha.click();
        await page.waitForTimeout(500);
        const dayBtn = page.getByText(String(Number(fechaTexto.substring(0, 2))), { exact: true }).first();
        if (await dayBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
          await dayBtn.click({ force: true });
        }
      }

      const valor = await fechaInput.inputValue().catch(() => '');
      return valor.includes(fechaTexto);
    };

    let fechaOk = false;
    for (let intento = 0; intento < 3; intento++) {
      fechaOk = await fijarFecha();
      if (fechaOk) break;
      await page.waitForTimeout(250);
    }

    if (!fechaOk) {
      throw new Error(`No se pudo fijar fecha de resolución (${fechaTexto}) en suite de validaciones.`);
    }
  }

  if (omitir !== 'pdf') {
    const pdfPath = resolverDocumentoPrueba();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(pdfPath);
    await page.waitForTimeout(1500);
  }

  const medidaInput = page.getByRole('textbox', { name: 'Ingrese la medida correctiva' }).first();
  await medidaInput.fill('Medida validación obligatorios');
}

async function completarCabeceraObligatoria(page: Page) {
  await completarCabeceraBase(page, 'ninguno');
}

async function completarSoloAdministrado(page: Page) {
  await obtenerAdministradoAleatorio(page);
  await page.waitForTimeout(400);
}

async function completarSoloExpediente(page: Page) {
  const year = new Date().getFullYear();
  const expInput = page.getByRole('textbox').nth(1);
  await expInput.fill(`FA Exp N° ${Math.floor(Math.random() * 10000)}-${year}`);
}

async function completarSoloResolucion(page: Page) {
  const year = new Date().getFullYear();
  const resInput = page.locator('input[formcontrolname="numeroResolucion"]');
  await resInput.fill(`FA Res N° ${Math.floor(Math.random() * 10000)}-${year}`);
}

async function completarSoloFecha(page: Page) {
  const btnFecha = page.getByRole('button', { name: /Choose|Seleccionar/i }).first();
  const fechaInput = btnFecha.locator('..').locator('input');
  const fechaTexto = generarFechaResolucionTexto();
  await fechaInput.click();
  await fechaInput.fill(fechaTexto);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(250);
}

async function completarSoloPdf(page: Page) {
  const pdfPath = resolverDocumentoPrueba();
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(pdfPath);
  await page.waitForTimeout(800);
}

async function abrirTabDetalle(page: Page) {
  const tabDetalleSanciones = page.getByRole('tab', { name: 'Detalle de sanciones' });
  await tabDetalleSanciones.click();
  await page.waitForTimeout(500);
}

async function agregarSancionMinimaValida(page: Page) {
  await abrirTabDetalle(page);
  const dialog = await abrirModalAgregarSancion(page);

  await seleccionarRISEnModal(dialog);
  await seleccionarTipoInfractorEnModal(dialog);

  const hechoInput = dialog.getByRole('textbox', { name: /Describe el hecho infractor/i }).first();
  await hechoInput.fill('Hecho infractor validación mínima');

  const chkCancelacion = dialog.getByRole('checkbox', { name: /Cancelaci[oó]n/i }).first();
  if (await chkCancelacion.isVisible({ timeout: 2000 }).catch(() => false)) {
    await chkCancelacion.click({ force: true });
  }

  const btnGuardarDetalle = dialog.getByRole('button', { name: /^Guardar\s*detalle$/i }).first();
  await btnGuardarDetalle.click({ force: true });

  await page.waitForTimeout(1000);
}

async function intentarGuardarFinal(page: Page): Promise<boolean> {
  const btnGuardarFinal = page.locator('button[label="Guardar"][icon="pi pi-save"]').first();
  await btnGuardarFinal.waitFor({ state: 'visible', timeout: 8000 });
  await btnGuardarFinal.click({ force: true });
  await page.waitForTimeout(1500);

  return await page.locator(TOAST_OK).first().isVisible({ timeout: 1800 }).catch(() => false);
}

async function obtenerTextoToastAdvertencia(page: Page): Promise<string> {
  const toast = page.locator(TOAST_WARNING).first();
  const visible = await toast.isVisible({ timeout: 3000 }).catch(() => false);
  if (!visible) return '';
  return (await toast.innerText().catch(() => '')).trim();
}

async function intentarGuardarDetalleVacio(page: Page): Promise<{ ok: boolean; modalSigueAbierto: boolean; errores: string[] }> {
  await abrirTabDetalle(page);

  const btnAgregarSancion = page.getByRole('button', { name: /^Agregar\s*sanci[oó]n$/i }).first();
  await btnAgregarSancion.waitFor({ state: 'visible', timeout: 8000 });
  const habilitado = await btnAgregarSancion.isEnabled().catch(() => false);
  if (!habilitado) {
    throw new Error('No se habilitó Agregar sanción con cabecera completa en prueba de validación de modal.');
  }
  const dialog = await abrirModalAgregarSancion(page);

  const btnGuardarDetalle = dialog.getByRole('button', { name: /^Guardar\s*detalle$/i }).first();
  await btnGuardarDetalle.click({ force: true });
  await page.waitForTimeout(1000);

  const ok = await page.locator(TOAST_OK).first().isVisible({ timeout: 1500 }).catch(() => false);
  const modalSigueAbierto = await dialog.isVisible().catch(() => false);

  const errores: string[] = [];
  const validaciones = [
    /selecciona\s*un\s*ris/i,
    /selecciona\s*un\s*tipo\s*infractor/i,
    /ingresa\s*el\s*hecho\s*infractor|este\s*campo\s*es\s*obligatorio/i,
    /selecciona\s*al\s*menos\s*una\s*opci[oó]n/i
  ];

  for (const patron of validaciones) {
    const msg = dialog.getByText(patron).first();
    const visible = await msg.isVisible().catch(() => false);
    if (visible) {
      errores.push(patron.source);
    }
  }

  return { ok, modalSigueAbierto, errores };
}

test.describe('@validaciones REGISTRO SANCION - Campos obligatorios', () => {
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

  test('valida guardado progresivo en pestaña 1 hasta exigir al menos una sanción', async ({ page }, testInfo) => {
    await iniciarFormulario(page, testInfo.workerIndex);

    // 1) Guardar con todo vacío
    let guardo = await intentarGuardarFinal(page);
    expect(guardo).toBeFalsy();

    // 2) Solo administrado
    await completarSoloAdministrado(page);
    guardo = await intentarGuardarFinal(page);
    expect(guardo).toBeFalsy();

    // 3) + expediente
    await completarSoloExpediente(page);
    guardo = await intentarGuardarFinal(page);
    expect(guardo).toBeFalsy();

    // 4) + resolución
    await completarSoloResolucion(page);
    guardo = await intentarGuardarFinal(page);
    expect(guardo).toBeFalsy();

    // 5) + fecha
    await completarSoloFecha(page);
    guardo = await intentarGuardarFinal(page);
    expect(guardo).toBeFalsy();

    // 6) + PDF => debe aparecer advertencia de al menos una sanción
    await completarSoloPdf(page);
    guardo = await intentarGuardarFinal(page);
    expect(guardo).toBeFalsy();

    const textoToast = await obtenerTextoToastAdvertencia(page);
    expect(/al\s*menos\s*1\s*sanci[oó]n|agregar\s*al\s*menos\s*una\s*sanci[oó]n|antes\s*de\s*guardar/i.test(textoToast)).toBeTruthy();
  });

  test('valida modal Agregar sanción vacío al guardar detalle', async ({ page }, testInfo) => {
    await iniciarFormulario(page, testInfo.workerIndex);
    await completarCabeceraObligatoria(page);

    const resultado = await intentarGuardarDetalleVacio(page);
    expect(resultado.ok).toBeFalsy();
    expect(resultado.modalSigueAbierto).toBeTruthy();
    expect(resultado.errores.length).toBeGreaterThanOrEqual(3);
  });
});
