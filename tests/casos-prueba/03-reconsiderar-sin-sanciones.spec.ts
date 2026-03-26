import { test } from '@playwright/test';
import {
  iniciarSesionYNavegar,
  obtenerCredencial,
  completarCabeceraReconsideracion,
  capturarFormularioLleno,
  capturarToastExito,
  parseFechaTexto,
  calcularFechaReconsideracion,
  resolverDocumentoPrueba,
} from 'tests/utilidades/reginsa-actions';
import {
  cumpleCamposVaciosReconsideracion,
  fechaEnRango,
  uiMuestraSinDetallesInfraccion,
  uiMuestraIndicadoresSancion,
} from 'tests/utilidades/reconsideracion-criterios';
import { getTestContext } from 'helpers/test-context';
import { reservarClaveCandidato, liberarClaveCandidato, registrarAsignacionSecuencial } from 'helpers/strict-sequential';

function normalizarTexto(valor: string): string {
  return String(valor || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test.describe('03-RECONSIDERAR SIN SANCIONES', () => {
  test('Reconsiderar sancion con campos vacios - busqueda ligera', async ({ page }, testInfo) => {
    test.setTimeout(300000);

    const ctx = getTestContext(testInfo);
    const strictVerify = process.env.REGINSA_STRICT_VERIFY !== '0';
    const maxPaginas = Math.max(1, Number.parseInt(process.env.REGINSA_CASO03_MAX_PAGINAS || '30', 10) || 30);
    const reiniciarPrimeraPagina = process.env.REGINSA_CASO03_START_FIRST_PAGE !== '0';
    let reservaActivaKey = '';
    let reservaCompletada = false;

    const esperarRespuestaApiGuardado = async (timeoutMs: number): Promise<boolean> => {
      try {
        const response = await page.waitForResponse((res) => {
          const method = res.request().method().toUpperCase();
          if (!['POST', 'PUT', 'PATCH'].includes(method)) return false;
          const url = res.url().toLowerCase();
          if (!url.includes('/api/')) return false;
          if (!/(reconsider|sanci|infractor|resoluci|detalle)/i.test(url)) return false;
          const status = res.status();
          return status >= 200 && status < 300;
        }, { timeout: timeoutMs });

        return !!response;
      } catch {
        return false;
      }
    };

    const obtenerIndiceColumna = async (tabla: ReturnType<typeof page.locator>, regex: RegExp): Promise<number> => {
      const headers = tabla.locator('xpath=./thead/tr/th');
      const total = await headers.count();
      for (let i = 0; i < total; i++) {
        const texto = normalizarTexto((await headers.nth(i).textContent()) || '');
        if (regex.test(texto)) return i;
      }
      return -1;
    };

    const irAPrimeraPagina = async (): Promise<void> => {
      const paginaUno = page.locator('.p-paginator-page').filter({ hasText: /^1$/ }).first();
      if (await paginaUno.isVisible().catch(() => false)) {
        const clase = (await paginaUno.getAttribute('class').catch(() => '')) || '';
        if (!clase.includes('p-highlight')) {
          await paginaUno.click().catch(() => {});
          await page.waitForTimeout(300);
        }
        return;
      }

      const btnFirst = page.getByRole('button', { name: /First Page|Primera/i }).first();
      if (await btnFirst.isVisible().catch(() => false) && await btnFirst.isEnabled().catch(() => false)) {
        await btnFirst.click().catch(() => {});
        await page.waitForTimeout(300);
      }
    };

    try {
      console.log('\n================================================================================');
      console.log('CASO 03: RECONSIDERAR SIN SANCIONES (MODO LIGERO)');
      console.log('================================================================================\n');

      await iniciarSesionYNavegar(page, 'infractor', testInfo.workerIndex);
      await page.locator('table').first().waitFor({ state: 'visible', timeout: 12000 });

      const tablaListado = page
        .locator('table')
        .filter({ has: page.locator('th', { hasText: /N\W*Reconsideraci\w*|F\.\s*Modificaci\w*|N\W*de\W*Expediente/i }) })
        .first();

      const idxFMod = await obtenerIndiceColumna(tablaListado, /^F\W*Modificaci\w*/i);
      const idxNRec = await obtenerIndiceColumna(tablaListado, /N\W*Reconsideraci\w*/i);
      const idxFRec = await obtenerIndiceColumna(tablaListado, /^F\W*Reconsideraci\w*/i);
      const idxFRes = await obtenerIndiceColumna(tablaListado, /F\.\s*Resoluci\w*|Resoluci\w*/i);
      const idxSancion = await obtenerIndiceColumna(tablaListado, /Sanci[oó]n|Detalle\s*de\s*sanciones|N\W*de\W*Sanci\w*/i);
      const idxExp = await obtenerIndiceColumna(tablaListado, /N\W*de\W*Expediente|N\W*Expediente/i);
      const idxRes = await obtenerIndiceColumna(tablaListado, /N\W*de\W*Resoluci\w*|N\W*Resoluci\w*/i);

      if (idxFMod < 0 || idxNRec < 0 || idxFRec < 0) {
        throw new Error('No se pudieron identificar columnas de reconsideracion.');
      }

      if (reiniciarPrimeraPagina) {
        await irAPrimeraPagina();
      }

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const fechaMinima = new Date(2025, 0, 1);

      let registroEncontrado = false;
      let fechaResolucionSeleccionada: Date | null = null;
      let paginaSeleccionada = 0;
      let filaSeleccionada = 0;

      for (let paginaActual = 1; paginaActual <= maxPaginas; paginaActual++) {
        const filas = tablaListado.locator('xpath=./tbody/tr[not(contains(@class,"p-datatable-row-expansion"))]');
        let totalFilas = await filas.count().catch(() => 0);

        if (totalFilas === 0) {
          await page.waitForTimeout(500);
          totalFilas = await filas.count().catch(() => 0);
        }

        console.log(`Pagina ${paginaActual}: ${totalFilas} filas`);

        for (let i = 0; i < totalFilas; i++) {
          const fila = filas.nth(i);
          const textosCeldas = await fila.locator('xpath=./td').allTextContents().catch(() => [] as string[]);
          const totalCeldas = textosCeldas.length;
          if (totalCeldas < 8) continue;

          const cell = (index: number): string => {
            if (index < 0 || index >= totalCeldas) return '';
            return normalizarTexto(textosCeldas[index] || '');
          };

          const fMod = cell(idxFMod);
          const nRec = cell(idxNRec);
          const fRec = cell(idxFRec);

          const fModTail = totalCeldas >= 4 ? cell(totalCeldas - 4) : '';
          const nRecTail = totalCeldas >= 3 ? cell(totalCeldas - 3) : '';
          const fRecTail = totalCeldas >= 2 ? cell(totalCeldas - 2) : '';

          const camposVacios =
            cumpleCamposVaciosReconsideracion(fMod, nRec, fRec)
            || cumpleCamposVaciosReconsideracion(fModTail, nRecTail, fRecTail);

          if (!camposVacios) continue;

          let fechaResolucion: Date | null = null;
          if (idxFRes >= 0) {
            fechaResolucion = parseFechaTexto(cell(idxFRes));
          }

          if (!fechaResolucion) {
            for (let c = 0; c < totalCeldas; c++) {
              const posible = parseFechaTexto(cell(c));
              if (posible) {
                fechaResolucion = posible;
                break;
              }
            }
          }

          if (!fechaEnRango(fechaResolucion, fechaMinima, hoy)) continue;

          const textoFila = normalizarTexto((await fila.innerText().catch(() => '')) || '');
          const textoSancion = idxSancion >= 0 ? cell(idxSancion) : '';

          let evidenciaSinSancion = uiMuestraSinDetallesInfraccion(`${textoSancion} ${textoFila}`);
          let evidenciaConSancion = uiMuestraIndicadoresSancion(`${textoSancion} ${textoFila}`);

          if (!evidenciaSinSancion && !evidenciaConSancion) {
            const toggler = fila
              .locator('td:first-child button, button[aria-expanded], button.p-row-toggler, button:has(span.pi-chevron-right), button:has(span.pi-chevron-down), button:has(i.pi-chevron-right), button:has(i.pi-chevron-down)')
              .first();
            if (await toggler.isVisible().catch(() => false)) {
              await toggler.click().catch(() => {});
              await page.waitForTimeout(180);

              const detalle = fila.locator('xpath=following-sibling::tr[1]').first();
              const detalleTexto = normalizarTexto((await detalle.innerText().catch(() => '')) || '');
              evidenciaSinSancion = uiMuestraSinDetallesInfraccion(detalleTexto);
              evidenciaConSancion = uiMuestraIndicadoresSancion(detalleTexto);
            }
          }

          if (evidenciaConSancion || !evidenciaSinSancion) continue;

          const expediente = idxExp >= 0 ? cell(idxExp) : '';
          const resolucion = idxRes >= 0 ? cell(idxRes) : '';
          const candidateKey = `${expediente}|${resolucion}`.trim();
          if (!candidateKey || candidateKey === '|') continue;
          const reservado = reservarClaveCandidato('caso03-sin-sanciones', candidateKey);
          if (!reservado) continue;
          reservaActivaKey = candidateKey;

          const botones = fila.locator(
            'button[ptooltip*="Reconsiderar" i], button[icon*="pi-refresh" i], button.p-button-warning:has(span.pi-refresh), button:has(i.pi-refresh), button:has(span.pi-refresh), button[aria-label*="reconsider" i]'
          );

          if ((await botones.count()) === 0) {
            liberarClaveCandidato('caso03-sin-sanciones', candidateKey);
            reservaActivaKey = '';
            continue;
          }

          await botones.first().click();
          await page.locator('form').first().waitFor({ state: 'visible', timeout: 10000 });

          registroEncontrado = true;
          fechaResolucionSeleccionada = fechaResolucion;
          paginaSeleccionada = paginaActual;
          filaSeleccionada = i + 1;
          registrarAsignacionSecuencial('caso03-sin-sanciones', ctx.selectionSlot, {
            status: 'selected',
            page: paginaActual,
            row: i,
            workerIndex: ctx.workerIndex,
            repeatIndex: ctx.repeatIndex,
            expediente,
            resolucion
          });
          break;
        }

        if (registroEncontrado) break;

        const btnNextPage = page.getByRole('button', { name: /Next Page/i }).first();
        const puedeIrSiguiente = await btnNextPage.isEnabled().catch(() => false);
        if (!puedeIrSiguiente) break;

        await btnNextPage.click().catch(() => {});
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await page.waitForTimeout(300);
      }

      if (!registroEncontrado) {
        console.log('No se encontro registro valido en este intento.');
        console.log(`EJECUCION CASO03 [worker=${ctx.workerIndex} repeat=${ctx.repeatIndex}] REALIZADA=NO`);
        return;
      }

      console.log(`Registro elegido en pagina ${paginaSeleccionada}, fila ${filaSeleccionada}.`);

      const rutaArchivo = resolverDocumentoPrueba();
      const fechaReconsideracion = calcularFechaReconsideracion(fechaResolucionSeleccionada);
      const prefijoReconsideracion = `FA3 ${String(Date.now()).slice(-4)} N RECONSID`;
      const numeroReconsideracion = await completarCabeceraReconsideracion(page, rutaArchivo, fechaReconsideracion, prefijoReconsideracion);

      await page.locator('form').first().waitFor({ state: 'visible', timeout: 10000 });
      await capturarFormularioLleno(
        page,
        '03-RECONSIDERAR-SIN-SANCIONES',
        numeroReconsideracion,
        '',
        'CABECERA_RECONSIDERACION',
        '09_FORMULARIO_CABECERA'
      );

      const btnGuardar = page.getByRole('button', { name: 'Guardar cabecera' }).first();
      await btnGuardar.waitFor({ state: 'visible', timeout: 10000 });

      const apiGuardadoPromise = esperarRespuestaApiGuardado(9000);
      await btnGuardar.click();

      await page.locator('.p-toast-message-success, .p-toast-message').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
      const apiGuardadoOk = await apiGuardadoPromise;

      const toastCabecera = await capturarToastExito(
        page,
        '03-RECONSIDERAR-SIN-SANCIONES',
        '10_EXITO_CABECERA',
        numeroReconsideracion,
        '',
        'CABECERA_RECONSIDERACION',
        2500
      );

      if (strictVerify && !toastCabecera && !apiGuardadoOk) {
        throw new Error('No se confirmo el guardado de cabecera.');
      }

      const tabDetalle = page.getByRole('tab', { name: 'Detalle de sanciones' }).first();
      await tabDetalle.waitFor({ state: 'visible', timeout: 10000 });
      await tabDetalle.click();
      await page.waitForTimeout(600);

      const bodyText = (await page.locator('body').textContent().catch(() => '')) || '';
      const haySinSanciones = /sin\s+sanciones\s+registradas/i.test(bodyText);

      console.log('================================================================================');
      console.log('CASO 03 COMPLETADO');
      console.log('================================================================================');
      console.log(`N Reconsideracion: ${numeroReconsideracion}`);
      console.log(`Detalle sin sanciones: ${haySinSanciones ? 'SI' : 'NO'}`);
      console.log(`EJECUCION CASO03 [worker=${ctx.workerIndex} repeat=${ctx.repeatIndex}] REALIZADA=SI`);
      reservaCompletada = true;

      const credencial = obtenerCredencial(testInfo.workerIndex);
      console.log(`Worker ${testInfo.workerIndex} (${credencial.usuario}) caso 03 completado`);
    } catch (error) {
      if (reservaActivaKey && !reservaCompletada) {
        liberarClaveCandidato('caso03-sin-sanciones', reservaActivaKey);
      }
      console.error('ERROR:', error instanceof Error ? error.message : String(error));
      try {
        const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-').substring(0, 19);
        const archivo = `./screenshots/03-reconsiderar-sin-sanciones_ERROR_${timestamp}.png`;
        await page.screenshot({ path: archivo, fullPage: true });
      } catch {
        // No bloquear por falla de screenshot.
      }
      throw error;
    }
  });
});
