import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  iniciarSesionYNavegar,
  parseFechaTexto,
  calcularFechaReconsideracion
} from 'tests/utilidades/reginsa-actions';

type OmitirCampo = 'archivo' | 'numero' | 'fecha' | 'ninguno';

const TOAST_OK = '.p-toast-message-success, .p-toast-message[aria-label*="Exito"], .p-toast-message[aria-label*="\u00c9xito"]';

async function obtenerIndiceColumna(page: Page, regex: RegExp): Promise<number> {
  const headers = page.locator('thead tr th');
  const total = await headers.count();
  for (let i = 0; i < total; i++) {
    const texto = (await headers.nth(i).textContent())?.trim() || '';
    if (regex.test(texto)) return i;
  }
  return -1;
}

async function abrirRegistroElegible(page: Page): Promise<Date | null> {
  await page.locator('table').first().waitFor({ state: 'visible', timeout: 12000 });
  const filas = page.locator('tr');
  const totalFilas = await filas.count();

  const idxFMod = await obtenerIndiceColumna(page, /F\.\s*Modificaci\w*|Modificaci\w*/i);
  const idxNRec = await obtenerIndiceColumna(page, /N\W*Reconsideraci\w*/i);
  const idxFRec = await obtenerIndiceColumna(page, /F\.\s*Reconsideraci\w*|Reconsideraci\w*/i);

  if (idxFMod < 0 || idxNRec < 0 || idxFRec < 0) {
    throw new Error('No se pudieron identificar columnas de reconsideracion para validaciones de Caso 03.');
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  for (let i = 1; i < totalFilas; i++) {
    const fila = filas.nth(i);
    const celdas = fila.locator('td');
    const totalCeldas = await celdas.count();
    if (totalCeldas < 6) continue;

    const fMod = (await celdas.nth(idxFMod).textContent())?.trim() || '';
    const nRec = (await celdas.nth(idxNRec).textContent())?.trim() || '';
    const fRec = (await celdas.nth(idxFRec).textContent())?.trim() || '';
    if (fMod || nRec || fRec) continue;

    let fechaResolucion: Date | null = null;
    for (let c = 0; c < totalCeldas; c++) {
      const texto = (await celdas.nth(c).textContent())?.trim() || '';
      const fecha = parseFechaTexto(texto);
      if (fecha) {
        fechaResolucion = fecha;
        break;
      }
    }

    if (!fechaResolucion || fechaResolucion >= hoy) continue;

    const btnReconsiderar = fila.locator('button.p-button-warning').first();
    if (!(await btnReconsiderar.isVisible().catch(() => false))) continue;

    await btnReconsiderar.click({ force: true });
    await page.locator('form').first().waitFor({ state: 'visible', timeout: 10000 });
    return fechaResolucion;
  }

  return null;
}

async function habilitarCabecera(page: Page): Promise<Locator> {
  const scope = page.getByRole('tabpanel').filter({ hasText: /Datos del administrado/i }).first();
  const tabDatos = page.getByRole('tab', { name: /Datos del administrado/i });

  if (await tabDatos.isVisible().catch(() => false)) {
    const selected = await tabDatos.getAttribute('aria-selected').catch(() => 'true');
    if (selected !== 'true') {
      await tabDatos.click();
      await scope.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    }
  }

  const btnEditar = scope.getByRole('button', { name: /Editar cabecera/i }).first();
  if (await btnEditar.isVisible().catch(() => false)) {
    await btnEditar.click().catch(() => {});
  }

  return (await scope.isVisible().catch(() => false)) ? scope : page.locator('body');
}

async function marcarPresentoReconsideracion(scope: Locator): Promise<void> {
  const input = scope.locator('input#presentoReconsideracion').first();
  const box = scope.locator('p-checkbox[inputid="presentoReconsideracion"] .p-checkbox-box').first();
  const label = scope.locator('label[for="presentoReconsideracion"]').first();

  for (let i = 0; i < 3; i++) {
    const checked = await input.isChecked().catch(() => false);
    if (checked) return;

    if (await box.isVisible().catch(() => false)) {
      await box.click({ force: true });
    } else if (await label.isVisible().catch(() => false)) {
      await label.click({ force: true });
    }

    await (scope.page() as Page).waitForTimeout(200);
  }
}

async function completarCamposCabecera(scope: Locator, fechaResolucion: Date | null, omitir: OmitirCampo): Promise<void> {
  const page = scope.page() as Page;
  const fechaReconsideracion = calcularFechaReconsideracion(fechaResolucion);
  const dd = String(fechaReconsideracion.getDate()).padStart(2, '0');
  const mm = String(fechaReconsideracion.getMonth() + 1).padStart(2, '0');
  const yyyy = fechaReconsideracion.getFullYear();
  const fechaTexto = `${dd}/${mm}/${yyyy}`;

  if (omitir !== 'numero') {
    const inputNumero = scope
      .locator('label', { hasText: /N\W*Reconsideraci\w*/i })
      .locator('..')
      .locator('input[formcontrolname="desResolucionReconsideracion"], input')
      .first();

    await inputNumero.waitFor({ state: 'visible', timeout: 9000 });
    await inputNumero.fill(`RECONS-VAL-03-${Date.now()}`);
  }

  if (omitir !== 'fecha') {
    const inputFecha = scope
      .locator('label', { hasText: /Fecha.*Reconsideraci\w*/i })
      .locator('..')
      .locator('input')
      .first();

    await inputFecha.waitFor({ state: 'visible', timeout: 9000 });
    await inputFecha.click();
    await inputFecha.fill(fechaTexto);
    await page.keyboard.press('Tab');
  }

  if (omitir !== 'archivo') {
    const fileInput = scope
      .locator('p-fileupload[name="rutaArchivoReconsideracion"], p-fileupload[name="rutaArchivoRecons"]')
      .locator('input[type="file"]')
      .first();

    await fileInput.waitFor({ state: 'attached', timeout: 9000 });
    await fileInput.setInputFiles('Id_entidad.csv');
  }
}

async function intentarGuardarCabecera(page: Page): Promise<boolean> {
  const btnGuardar = page.getByRole('button', { name: /Guardar cabecera/i }).first();
  await btnGuardar.waitFor({ state: 'visible', timeout: 8000 });
  await btnGuardar.click({ force: true });
  await page.waitForTimeout(1500);

  return await page.locator(TOAST_OK).first().isVisible({ timeout: 1400 }).catch(() => false);
}

test.describe('@validaciones 03-RECONSIDERAR SIN SANCIONES - Cabecera obligatoria', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(240000);

  const casos: Array<{ omitir: OmitirCampo; titulo: string }> = [
    { omitir: 'archivo', titulo: 'Archivo de reconsideracion obligatorio' },
    { omitir: 'numero', titulo: 'Numero de reconsideracion obligatorio' },
    { omitir: 'fecha', titulo: 'Fecha de reconsideracion obligatoria' }
  ];

  for (const item of casos) {
    test(`bloquea guardado cuando falta: ${item.titulo}`, async ({ page }, testInfo) => {
      await iniciarSesionYNavegar(page, 'infractor', testInfo.workerIndex);
      const fechaResolucion = await abrirRegistroElegible(page);

      test.skip(!fechaResolucion, 'No hay registro elegible para validar Caso 03.');

      const scope = await habilitarCabecera(page);
      await marcarPresentoReconsideracion(scope);
      await completarCamposCabecera(scope, fechaResolucion, item.omitir);

      const guardo = await intentarGuardarCabecera(page);
      expect(guardo).toBeFalsy();
    });
  }
});
