import { expect, Locator, Page, Response } from '@playwright/test';
import { BasePage } from './base.page';
import { buildPfRunSuffix, getPfRunLabel } from '../helpers/pf-run-label';
import { reserveRunResource } from '../helpers/resource-lock';
import { resolverDocumentoPrueba } from '../tests/utilidades/reginsa-actions';

export type ReconsideracionData = {
  numeroReconsideracion: string;
  fechaReconsideracion: string;
  archivo: string;
};

export type GuardarReconsideracionResult = {
  endpoint: string;
  status: number;
  url: string;
  responseBody: unknown;
};

function preview(value: string, maxLength = 700): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function parseJsonBody(bodyText: string): unknown {
  if (!bodyText.trim()) return {};
  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}

const RECONSIDERACION_PF_REGEX = /PF\s+\d{2}\s+REC|PF RECONS/i;

export class ReconsideracionPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navegarAlModulo(): Promise<this> {
    const baseUrl = process.env.REGINSA_UI_BASE_URL || 'https://reginsaqa.sunedu.gob.pe';
    await this.irA(`${baseUrl}/#/pages/infractor`);
    await this.page.waitForLoadState('domcontentloaded');
    await this.esperarCapaCarga();
    return this;
  }

  async validarModuloCargado(): Promise<this> {
    await expect(
      this.page.locator('h3, h1, h2, .p-breadcrumb, table, .p-datatable').first()
    ).toBeVisible({ timeout: 30000 });
    await this.configurarFilasPorPagina(100);
    return this;
  }

  generarDatos(slot: number, repeatIndex: number): ReconsideracionData {
    const runLabel = getPfRunLabel();
    const suffix = buildPfRunSuffix(slot, repeatIndex);
    return {
      numeroReconsideracion: `${runLabel} REC ${suffix}`,
      fechaReconsideracion: this.fechaHoy(),
      archivo: resolverDocumentoPrueba('GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf'),
    };
  }

  async estaReconsiderado(): Promise<boolean> {
    const form = this.page.locator('form, p-dialog:visible, .p-dialog:visible, .card').first();
    try {
      await expect(async () => {
        const html = await form.innerHTML().catch(() => '');
        if (RECONSIDERACION_PF_REGEX.test(html)) {
          return;
        }
        const numeroInput = this.inputNumeroReconsideracion();
        if (await numeroInput.isVisible().catch(() => false)) {
          const val = await numeroInput.inputValue().catch(() => '');
          if (val.trim().length > 0) {
            return;
          }
        }
        throw new Error('Aún no se ha detectado reconsideración en el form');
      }).toPass({ timeout: 5000, intervals: [500, 1000] });
      return true;
    } catch {
      return false;
    }
  }

  async cerrarFormulario(): Promise<void> {
    const btnCancelar = this.page.locator('button[label*="Cancelar" i], button:has-text("Cancelar"), button[label*="Regresar" i], button:has-text("Regresar"), button[label*="Cerrar" i], button:has-text("Cerrar")').first();
    const btnCloseIcon = this.page.locator('.p-dialog-header-close, button[class*="close" i]').first();
    
    if (await btnCancelar.isVisible().catch(() => false)) {
      await this.safeClick(btnCancelar);
    } else if (await btnCloseIcon.isVisible().catch(() => false)) {
      await this.safeClick(btnCloseIcon);
    } else {
      await this.navegarAlModulo();
    }
    await this.esperarCapaCarga();
  }

  async abrirPrimerRegistroParaReconsiderar(slot = 1, repeatIndex = 0, retryCount = 0): Promise<string> {
    await this.esperarCapaCarga();
    await this.configurarFilasPorPagina(100);
    await this.page.locator('table tbody tr').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    const tabla = this.page.locator('table').filter({ has: this.page.locator('tbody tr') }).first();
    await expect(tabla).toBeVisible({ timeout: this.uiTimeout() });

    let targetRow: Locator | null = null;
    let clickedCandidateText = '';

    const maxPages = Number.parseInt(process.env.REGINSA_RECONSIDERACION_MAX_PAGES || '60', 10);

    for (let pageNum = 0; pageNum < maxPages; pageNum++) {
      const candidates = tabla
        .locator('tbody tr')
        .filter({
          has: this.page.locator(
            'button[ptooltip*="Reconsider" i], button:has(.pi-refresh), button:has(.pi-pencil), button.p-button-warning'
          ),
        });

      const total = await candidates.count().catch(() => 0);
      let foundClean = false;
      
      for (let idx = 0; idx < total; idx++) {
        const text = await candidates.nth(idx).innerText().catch(() => '');
        if (!RECONSIDERACION_PF_REGEX.test(text)) {
          const reserved = reserveRunResource('reconsideracion-candidate', text, {
            slot,
            repeatIndex,
            retryCount,
            pageNum,
            rowIndex: idx,
          });
          if (!reserved) {
            console.log(`[Reconsideracion] Candidato ya reservado por otro worker; se omite fila ${idx + 1} pagina ${pageNum + 1}.`);
            continue;
          }
          targetRow = candidates.nth(idx);
          clickedCandidateText = preview(text);
          const action = targetRow
            .locator('button[ptooltip*="Reconsider" i], button:has(.pi-refresh), button:has(.pi-pencil), button.p-button-warning')
            .first();

          await this.safeClick(action);
          await this.esperarFormularioCabecera();
          await this.page.waitForTimeout(1000);

          const yaReconsiderado = await this.estaReconsiderado().catch(() => false);
          if (yaReconsiderado) {
            console.log(`[Reconsideracion] Registro detectado como YA reconsiderado (read-only) al abrir. Recargando página y reiniciando búsqueda (intento ${retryCount + 1}).`);
            await this.cerrarFormulario().catch(() => {});
            await this.page.reload();
            await this.esperarCapaCarga();
            
            if (retryCount < 3) {
              return this.abrirPrimerRegistroParaReconsiderar(slot, repeatIndex, retryCount + 1);
            }
            targetRow = null;
            continue;
          }

          foundClean = true;
          break;
        }
      }

      if (foundClean && targetRow) {
        break;
      }
      
      const nextBtn = this.page.locator('.p-paginator-next, button[aria-label="Next Page"], button[aria-label="Next"]').first();
      if (await nextBtn.isVisible().catch(() => false)) {
        const isDisabled = await nextBtn.getAttribute('disabled').catch(() => null) !== null 
            || await nextBtn.getAttribute('class').catch(() => '').then(c => String(c || '').includes('p-disabled'))
            || await nextBtn.getAttribute('aria-disabled').catch(() => '') === 'true';
        if (isDisabled) break;
        
        const firstRowTextBefore = await tabla.locator('tbody tr').first().innerText().catch(() => '');
        await this.safeClick(nextBtn);
        await this.esperarCapaCarga();
        
        await expect.poll(async () => {
          return await tabla.locator('tbody tr').first().innerText().catch(() => '');
        }, {
          timeout: 10000,
          message: 'Timeout esperando cambio de página de la tabla',
        }).not.toBe(firstRowTextBefore);

        await this.page.waitForTimeout(500);
      } else {
        break;
      }
    }

    if (!targetRow) {
      // Reintentar con paginación desde el principio si todos los de la grilla actual ya fueron procesados
      const candidatesFallback = tabla.locator('tbody tr').filter({ has: this.page.locator('button[ptooltip*="Reconsider" i], button:has(.pi-refresh), button:has(.pi-pencil), button.p-button-warning') });
      const totalFB = await candidatesFallback.count().catch(() => 0);
      if (totalFB === 0) {
        if (retryCount < 3) {
          console.log(`[Reconsideracion] No hay candidatos visibles. Recargando y reintentando busqueda (intento ${retryCount + 1}).`);
          await this.page.reload();
          await this.esperarCapaCarga();
          return this.abrirPrimerRegistroParaReconsiderar(slot, repeatIndex, retryCount + 1);
        }
        throw new Error('[Reconsideracion] No quedan registros pendientes de reconsiderar en la grilla. La BD puede haberse agotado para este slot.');
      }
      console.warn(`[Reconsideracion] ADVERTENCIA: No se encontró candidato limpio. Usando fallback (${totalFB} candidatos disponibles).`);
      let fallbackIndex = -1;
      for (let idx = 0; idx < totalFB; idx++) {
        const text = await candidatesFallback.nth(idx).innerText().catch(() => '');
        if (RECONSIDERACION_PF_REGEX.test(text)) continue;
        const reserved = reserveRunResource('reconsideracion-candidate', text, {
          slot,
          repeatIndex,
          retryCount,
          fallback: true,
          rowIndex: idx,
        });
        if (reserved) {
          fallbackIndex = idx;
          break;
        }
      }
      if (fallbackIndex < 0) {
        if (retryCount < 3) {
          console.log(`[Reconsideracion] Candidatos visibles ya reservados. Recargando y reintentando busqueda (intento ${retryCount + 1}).`);
          await this.page.reload();
          await this.esperarCapaCarga();
          return this.abrirPrimerRegistroParaReconsiderar(slot, repeatIndex, retryCount + 1);
        }
        throw new Error('[Reconsideracion] No quedan registros pendientes no reservados para reconsiderar. La BD puede haberse agotado para este slot.');
      }
      targetRow = candidatesFallback.nth(fallbackIndex);
      await expect(targetRow).toBeVisible({ timeout: this.uiTimeout() });
      clickedCandidateText = preview(await targetRow.innerText().catch(() => 'registro candidato'));
      const action = targetRow
        .locator('button[ptooltip*="Reconsider" i], button:has(.pi-refresh), button:has(.pi-pencil), button.p-button-warning')
        .first();

      await this.safeClick(action);
      await this.esperarFormularioCabecera();
      await this.page.waitForTimeout(1000);

      // Verificar que el fallback tampoco sea ya-reconsiderado
      const yaReconsideradoFB = await this.estaReconsiderado().catch(() => false);
      if (yaReconsideradoFB) {
        console.log(`[Reconsideracion] Fallback también ya reconsiderado. Recargando y reintentando (intento ${retryCount + 1}).`);
        await this.cerrarFormulario().catch(() => {});
        await this.page.reload();
        await this.esperarCapaCarga();
        if (retryCount < 5) {
          return this.abrirPrimerRegistroParaReconsiderar(slot, repeatIndex, retryCount + 1);
        }
        throw new Error('[Reconsideracion] Todos los candidatos disponibles ya fueron reconsiderados. BD agotada para este slot.');
      }
    }

    return clickedCandidateText;
  }

  async activarModoEdicion(): Promise<this> {
    // El formulario de reconsideración abre en modo lectura; hay que hacer click
    // en "Editar cabecera" para habilitarlo antes de interactuar con los campos.
    const btnEditar = this.page
      .getByRole('button', { name: /editar.*cabecera/i })
      .or(this.page.locator('button[label*="Editar" i], button:has-text("Editar cabecera")'))
      .first();

    const isVisible = await btnEditar.isVisible().catch(() => false);
    if (isVisible) {
      await this.safeClick(btnEditar);
      // Esperar que el botón Guardar se habilite (señal de modo edición activo)
      await this.page
        .getByRole('button', { name: /guardar.*cabecera/i })
        .or(this.page.locator('button[label*="Guardar" i]:not([disabled])'))
        .first()
        .waitFor({ state: 'visible', timeout: this.uiTimeout() })
        .catch(() => {/* si no aparece, continuamos igual */});
      await this.esperarCapaCarga();
    }
    return this;
  }

  async marcarPresentoReconsideracion(): Promise<this> {
    await this.activarModoEdicion();
    const checkbox = await this.localizarCheckboxReconsideracion();
    const checked = await checkbox.isChecked().catch(async () => {
      const aria = await checkbox.getAttribute('aria-checked').catch(() => null);
      return aria === 'true';
    });
    if (!checked) {
      await this.page.waitForTimeout(500);
      await this.safeClick(checkbox);
    }
    await this.validarCamposReconsideracionVisibles();
    return this;
  }

  async completarCamposReconsideracion(data: ReconsideracionData): Promise<this> {
    await this.marcarPresentoReconsideracion();

    const form = this.page.locator('form, p-dialog:visible, .p-dialog:visible, .card').first();
    const fileInput = form.locator('text=/Resoluci[o\u00f3]n de Reconsideraci[o\u00f3]n/i')
      .locator('xpath=./following::input[@type="file"][1]');
    await fileInput.waitFor({ state: 'attached', timeout: 30000 });
    await fileInput.setInputFiles(data.archivo);
    await this.page.waitForTimeout(500);

    const numeroInput = this.inputNumeroReconsideracion();
    await numeroInput.waitFor({ state: 'visible', timeout: this.uiTimeout() });
    await numeroInput.click();
    await numeroInput.fill(data.numeroReconsideracion);
    await numeroInput.evaluate((input: HTMLInputElement) => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await numeroInput.press('Tab');

    const fechaInput = this.inputFechaReconsideracion();
    await fechaInput.waitFor({ state: 'visible', timeout: this.uiTimeout() });
    await fechaInput.click({ force: true });
    await fechaInput.press('Control+a');
    await fechaInput.press('Backspace');
    
    // Asignar el valor usando evaluate y disparar los eventos que Angular/PrimeNG necesitan para registrar el cambio en el modelo reactivo.
    await fechaInput.evaluate((input: HTMLInputElement, val: string) => {
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, data.fechaReconsideracion);

    await fechaInput.press('Enter');
    await fechaInput.press('Tab');
    return this;
  }

  async limpiarCamposReconsideracion(): Promise<this> {
    await this.marcarPresentoReconsideracion();
    await this.inputNumeroReconsideracion().fill('').catch(() => {});
    const fecha = this.inputFechaReconsideracion();
    await fecha.click({ force: true }).catch(() => {});
    await fecha.press('Control+a').catch(() => {});
    await fecha.press('Backspace').catch(() => {});
    return this;
  }

  async guardarCabecera(): Promise<GuardarReconsideracionResult> {
    const btnGuardar = this.page
      .getByRole('button', { name: /guardar.*cabecera|^guardar$/i })
      .or(this.page.locator('button[label*="Guardar" i]'))
      .first();
    await expect(btnGuardar).toBeVisible({ timeout: this.uiTimeout() });
    await this.esperarCapaCarga();

    await this.diagnosticarEstadoGuardado(btnGuardar);

    const timeoutMs = this.apiTimeout();
    const responsePromise = this.esperarRespuestaGuardarReconsideracion(timeoutMs);
    await btnGuardar.click({ force: true });
    return responsePromise;
  }

  private async diagnosticarEstadoGuardado(btnGuardar: Locator): Promise<void> {
    const disabledAttr = await btnGuardar.getAttribute('disabled').catch(() => null);
    const ariaDisabled = await btnGuardar.getAttribute('aria-disabled').catch(() => null);
    const classAttr = await btnGuardar.getAttribute('class').catch(() => '');
    const enabled = await btnGuardar.isEnabled().catch(() => false);
    const bloqueadoPorClase = String(classAttr || '').includes('p-disabled');

    console.log('[Reconsideracion][Guardar] estado boton:', {
      enabled,
      disabledAttr,
      ariaDisabled,
      bloqueadoPorClase,
    });

    const invalidos = await this.page
      .locator('.ng-invalid[formcontrolname], input.ng-invalid, p-calendar.ng-invalid')
      .count()
      .catch(() => 0);
    if (invalidos > 0) {
      const nombresInvalidos = await this.page
        .locator('.ng-invalid[formcontrolname]')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('formcontrolname') || n.tagName).slice(0, 10))
        .catch(() => [] as string[]);
      console.log('[Reconsideracion][Guardar] campos ng-invalid:', invalidos, nombresInvalidos);
    }

    const mensajes = await this.page
      .locator('.p-error, .p-invalid-feedback, small.p-error, text=/obligatorio|requerido|required|complete|ingrese|seleccione/i')
      .allInnerTexts()
      .catch(() => [] as string[]);
    const mensajesVisibles = mensajes.map((m) => m.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 10);
    if (mensajesVisibles.length > 0) {
      console.log('[Reconsideracion][Guardar] mensajes de validacion:', mensajesVisibles);
    }

    if (!enabled || disabledAttr !== null || ariaDisabled === 'true' || bloqueadoPorClase) {
      console.warn('[Reconsideracion][Guardar] ADVERTENCIA: el boton Guardar parece deshabilitado; el submit podria no dispararse.');
    }
  }

  async validarBloqueoCamposObligatorios(): Promise<void> {
    const btnGuardar = this.page
      .getByRole('button', { name: /guardar.*cabecera|^guardar$/i })
      .or(this.page.locator('button[label*="Guardar" i]'))
      .first();
    await expect(btnGuardar).toBeVisible({ timeout: this.uiTimeout() });

    const responsePromise = this.page.waitForResponse((response) => {
      const method = response.request().method().toUpperCase();
      if (!['POST', 'PUT', 'PATCH'].includes(method)) return false;
      return /\/api\/.*(reconsider|cabecera|infraccion|sancion)/i.test(response.url());
    }, { timeout: 8000 }).catch(() => null);

    await btnGuardar.click({ force: true });
    const response = await responsePromise;
    if (response && response.status() >= 200 && response.status() < 300) {
      throw new Error(
        'DEFECTO FUNCIONAL: El sistema permitio guardar reconsideracion sin archivo, numero o fecha obligatoria.'
      );
    }

    await expect(this.page.locator('body')).toContainText(/obligatorio|required|requerido|complete|ingrese|seleccione|archivo|fecha/i, {
      timeout: this.uiTimeout(15000),
    });
  }

  async validarDetalleSancionesMinimo(minimo = 1): Promise<void> {
    const tabDetalle = this.page.getByRole('tab', { name: /detalle.*sanci/i }).first();
    if (await tabDetalle.isVisible().catch(() => false)) {
      await this.safeClick(tabDetalle);
    }

    await expect.poll(async () => this.contarFilasDetalleSanciones(), {
      timeout: this.uiTimeout(30000),
      intervals: [500, 1000, 2000],
      message: `DEFECTO FUNCIONAL: la reconsideracion debe mantener al menos ${minimo} sancion(es) en detalle.`,
    }).toBeGreaterThanOrEqual(minimo);
  }

  private async esperarFormularioCabecera(): Promise<Locator> {
    const form = this.page
      .locator('form, p-dialog:visible, .p-dialog:visible, .card, .container')
      .filter({ hasText: /datos del administrado|reconsideraci[oó]n|resoluci[oó]n/i })
      .first();
    await expect(form).toBeVisible({ timeout: this.uiTimeout() });
    return form;
  }

  private async configurarFilasPorPagina(rows = 100): Promise<void> {
    const rowsLabel = String(rows);
    const paginator = this.page.locator('.p-paginator').first();
    if (!(await paginator.isVisible().catch(() => false))) return;

    const current = await paginator.locator('.p-paginator-rpp-options, p-dropdown').first().innerText().catch(() => '');
    if (new RegExp(`\\b${rowsLabel}\\b`).test(current)) {
      await this.irPrimeraPaginaTabla();
      return;
    }

    const firstRowTextBefore = await this.page.locator('table tbody tr').first().innerText().catch(() => '');
    const dropdown = paginator.locator('.p-paginator-rpp-options, p-dropdown, .p-dropdown').first();
    if (!(await dropdown.isVisible().catch(() => false))) return;

    await this.safeClick(dropdown);
    const option = this.page
      .locator('.p-dropdown-panel .p-dropdown-item, .p-select-overlay .p-select-option, li[role="option"]')
      .filter({ hasText: new RegExp(`^\\s*${rowsLabel}\\s*$`) })
      .first();

    if (!(await option.isVisible({ timeout: 3000 }).catch(() => false))) {
      await this.page.keyboard.press('Escape').catch(() => {});
      return;
    }

    await this.safeClick(option);
    await this.esperarCapaCarga();

    await expect.poll(async () => {
      const visibleRows = await this.page.locator('table tbody tr').count().catch(() => 0);
      const firstRowTextAfter = await this.page.locator('table tbody tr').first().innerText().catch(() => '');
      return visibleRows >= Math.min(rows, 20) || firstRowTextAfter !== firstRowTextBefore;
    }, {
      timeout: 15000,
      message: `Timeout configurando paginacion a ${rowsLabel} filas`,
    }).toBeTruthy();

    await this.irPrimeraPaginaTabla();
  }

  private async irPrimeraPaginaTabla(): Promise<void> {
    const firstBtn = this.page.locator('.p-paginator-first, button[aria-label="First Page"], button[aria-label="First"]').first();
    if (!(await firstBtn.isVisible().catch(() => false))) return;

    const disabled = await firstBtn.getAttribute('disabled').catch(() => null) !== null
      || await firstBtn.getAttribute('aria-disabled').catch(() => '') === 'true'
      || await firstBtn.getAttribute('class').catch(() => '').then(c => String(c || '').includes('p-disabled'));
    if (disabled) return;

    const firstRowTextBefore = await this.page.locator('table tbody tr').first().innerText().catch(() => '');
    await this.safeClick(firstBtn);
    await this.esperarCapaCarga();
    await expect.poll(async () => {
      const firstRowTextAfter = await this.page.locator('table tbody tr').first().innerText().catch(() => '');
      return firstRowTextAfter !== firstRowTextBefore;
    }, {
      timeout: 10000,
      message: 'Timeout regresando a la primera pagina de la tabla',
    }).toBeTruthy();
  }

  private async localizarCheckboxReconsideracion(): Promise<Locator> {
    const candidates = [
      this.page.getByLabel(/present[oó].*reconsideraci[oó]n/i).first(),
      this.page.locator('p-checkbox[formcontrolname*="reconsider" i], input[type="checkbox"][formcontrolname*="reconsider" i]').first(),
      this.page.locator('label', { hasText: /present[oó].*reconsideraci[oó]n/i }).locator('xpath=preceding::input[@type="checkbox"][1]').first(),
      this.page.locator('label', { hasText: /present[oó].*reconsideraci[oó]n/i }).locator('xpath=following::input[@type="checkbox"][1]').first(),
    ];

    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }

    throw new Error('No se encontro el check Presento recurso de reconsideracion.');
  }

  private async validarCamposReconsideracionVisibles(): Promise<void> {
    const form = this.page.locator('form, p-dialog:visible, .p-dialog:visible, .card').first();
    const fileInput = form.locator('text=/Resoluci[o\u00f3]n de Reconsideraci[o\u00f3]n/i')
      .locator('xpath=./following::input[@type="file"][1]');
    // Timeout aumentado a 30s para soportar carga concurrente de 10+ workers
    await fileInput.waitFor({ state: 'attached', timeout: 30000 });
    await this.inputNumeroReconsideracion().waitFor({ state: 'attached', timeout: 20000 });
    await this.inputFechaReconsideracion().waitFor({ state: 'attached', timeout: 20000 });
  }

  private inputNumeroReconsideracion(): Locator {
    const form = this.page.locator('form, p-dialog:visible, .p-dialog:visible, .card').first();
    return form.locator('text=/N[º\u00ba\u00b0] de Reconsideraci[o\u00f3]n/i')
      .locator('xpath=./following::input[not(@type="file") and not(@type="hidden")][1]')
      .first();
  }

  private inputFechaReconsideracion(): Locator {
    const form = this.page.locator('form, p-dialog:visible, .p-dialog:visible, .card').first();
    return form.locator('text=/Fecha de Reconsideraci[o\u00f3]n/i')
      .locator('xpath=./following::input[not(@type="file") and not(@type="hidden")][1]')
      .first();
  }

  private async esperarRespuestaGuardarReconsideracion(timeoutMs: number): Promise<GuardarReconsideracionResult> {
    const requestListener = (req: any) => {
      if (req.url().includes('/api/')) {
        console.log(`[Reconsideracion][Guardar][Red] Petición: [${req.method()}] ${req.url()}`);
      }
    };
    const responseListener = (res: any) => {
      if (res.url().includes('/api/')) {
        console.log(`[Reconsideracion][Guardar][Red] Respuesta: [${res.request().method()}] ${res.url()} -> Status: ${res.status()}`);
      }
    };

    this.page.on('request', requestListener);
    this.page.on('response', responseListener);

    try {
      const response = await this.page.waitForResponse((res) => {
        const method = res.request().method().toUpperCase();
        if (!['POST', 'PUT', 'PATCH'].includes(method)) return false;
        const url = res.url();
        return /\/api\//i.test(url);
      }, { timeout: timeoutMs });

      const bodyText = await response.text().catch(() => '');
      if (response.status() < 200 || response.status() >= 300) {
        throw new Error(`Guardado de reconsideracion no fue exitoso. status=${response.status()} body=${preview(bodyText)}`);
      }

      return {
        endpoint: this.extraerEndpoint(response),
        status: response.status(),
        url: response.url(),
        responseBody: parseJsonBody(bodyText),
      };
    } finally {
      this.page.off('request', requestListener);
      this.page.off('response', responseListener);
    }
  }

  private async contarFilasDetalleSanciones(): Promise<number> {
    const rows = this.page.locator('table tbody tr').filter({ hasNotText: /sin registros|no se encontraron|no records/i });
    return rows.count().catch(() => 0);
  }



  private extraerEndpoint(response: Response): string {
    const match = /\/api\/([^?#]+)/i.exec(response.url());
    return match?.[1] || response.url();
  }

  private fechaHoy(): string {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = String(today.getFullYear());
    return `${day}/${month}/${year}`;
  }
}
