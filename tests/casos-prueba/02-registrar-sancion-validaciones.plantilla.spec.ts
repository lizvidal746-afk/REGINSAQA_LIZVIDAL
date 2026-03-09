import { test, expect, type Page } from '@playwright/test';
import {
  iniciarSesionYNavegar,
  abrirFormularioRegistrarSancion,
  obtenerAdministradoAleatorio,
  generarFechaPonderada,
  resolverDocumentoPrueba,
  seleccionarRISEnModal,
  seleccionarTipoInfractorEnModal
} from 'tests/utilidades/reginsa-actions';

type CabeceraOmitir =
  | 'administrado'
  | 'expediente'
  | 'resolucion'
  | 'fecha'
  | 'pdf'
  | 'ninguno';

type ModalOmitir =
  | 'ris'
  | 'tipoInfractor'
  | 'hechoInfractor'
  | 'tipoSancion';

const TOAST_OK = '.p-toast-message-success, .p-toast-message[aria-label*="Éxito"], .p-toast-message[style*="green"]';

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

async function abrirTabDetalle(page: Page) {
  const tabDetalleSanciones = page.getByRole('tab', { name: 'Detalle de sanciones' });
  await tabDetalleSanciones.click();
  await page.waitForTimeout(500);
}

async function agregarSancionMinimaValida(page: Page) {
  await abrirTabDetalle(page);

  const btnAgregarSancion = page.getByRole('button', { name: /^Agregar\s*sanci[oó]n$/i }).first();
  await btnAgregarSancion.click({ force: true });

  const dialog = page.locator('.p-dialog:visible', { hasText: /Agregar\s*Sanci[oó]n/i }).first();
  await dialog.waitFor({ state: 'visible', timeout: 10000 });

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

async function intentarGuardarDetalleIncompleto(page: Page, omitir: ModalOmitir): Promise<{ ok: boolean; modalSigueAbierto: boolean }> {
  await abrirTabDetalle(page);

  const btnAgregarSancion = page.getByRole('button', { name: /^Agregar\s*sanci[oó]n$/i }).first();
  await btnAgregarSancion.waitFor({ state: 'visible', timeout: 8000 });
  const habilitado = await btnAgregarSancion.isEnabled().catch(() => false);
  if (!habilitado) {
    throw new Error('No se habilitó Agregar sanción con cabecera completa en prueba de validación de modal.');
  }
  await btnAgregarSancion.click({ force: true });

  const dialog = page.locator('.p-dialog:visible', { hasText: /Agregar\s*Sanci[oó]n/i }).first();
  await dialog.waitFor({ state: 'visible', timeout: 10000 });

  if (omitir !== 'ris') {
    await seleccionarRISEnModal(dialog);
  }

  if (omitir !== 'tipoInfractor' && omitir !== 'ris') {
    await seleccionarTipoInfractorEnModal(dialog);
  }

  if (omitir !== 'hechoInfractor') {
    const hechoInput = dialog.getByRole('textbox', { name: /Describe el hecho infractor/i }).first();
    await hechoInput.fill(`Hecho validación ${omitir}`);
  }

  if (omitir !== 'tipoSancion') {
    const chkCancelacion = dialog.getByRole('checkbox', { name: /Cancelaci[oó]n/i }).first();
    if (await chkCancelacion.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chkCancelacion.click({ force: true });
    }
  }

  const btnGuardarDetalle = dialog.getByRole('button', { name: /^Guardar\s*detalle$/i }).first();
  await btnGuardarDetalle.click({ force: true });
  await page.waitForTimeout(1000);

  const ok = await page.locator(TOAST_OK).first().isVisible({ timeout: 1500 }).catch(() => false);
  const modalSigueAbierto = await dialog.isVisible().catch(() => false);
  return { ok, modalSigueAbierto };
}

test.describe('@validaciones REGISTRO SANCION - Campos obligatorios', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240000);

  const obligatoriosCabecera: Array<{ campo: CabeceraOmitir; titulo: string }> = [
    { campo: 'administrado', titulo: 'Administrado obligatorio' },
    { campo: 'expediente', titulo: 'N° de Expediente obligatorio' },
    { campo: 'resolucion', titulo: 'N° de Resolución obligatorio' },
    { campo: 'fecha', titulo: 'Fecha de Resolución obligatoria' },
    { campo: 'pdf', titulo: 'Resolución de Sanción (PDF) obligatoria' }
  ];

  for (const item of obligatoriosCabecera) {
    test(`bloquea guardado final cuando falta: ${item.titulo}`, async ({ page }, testInfo) => {
      await iniciarFormulario(page, testInfo.workerIndex);
      await completarCabeceraBase(page, item.campo);
      await abrirTabDetalle(page);

      const btnAgregarSancion = page.getByRole('button', { name: /^Agregar\s*sanci[oó]n$/i }).first();
      const puedeAgregar = await btnAgregarSancion.isEnabled().catch(() => false);
      expect(puedeAgregar).toBeFalsy();

      const guardo = await intentarGuardarFinal(page);
      expect(guardo).toBeFalsy();
    });
  }

  test('bloquea guardado final cuando no se agrega ninguna sanción', async ({ page }, testInfo) => {
    await iniciarFormulario(page, testInfo.workerIndex);
    await completarCabeceraBase(page, 'ninguno');

    const guardo = await intentarGuardarFinal(page);
    expect(guardo).toBeFalsy();
  });

  const obligatoriosModal: Array<{ campo: ModalOmitir; titulo: string }> = [
    { campo: 'ris', titulo: 'RIS obligatorio' },
    { campo: 'tipoInfractor', titulo: 'Tipo Infractor obligatorio' },
    { campo: 'hechoInfractor', titulo: 'Hecho Infractor obligatorio' },
    { campo: 'tipoSancion', titulo: 'Tipo de sanción (al menos uno) obligatorio' }
  ];

  for (const item of obligatoriosModal) {
    test(`bloquea guardar detalle cuando falta: ${item.titulo}`, async ({ page }, testInfo) => {
      await iniciarFormulario(page, testInfo.workerIndex);
      await completarCabeceraBase(page, 'ninguno');

      const resultado = await intentarGuardarDetalleIncompleto(page, item.campo);
      expect(resultado.ok).toBeFalsy();
      expect(resultado.modalSigueAbierto).toBeTruthy();
    });
  }
});
