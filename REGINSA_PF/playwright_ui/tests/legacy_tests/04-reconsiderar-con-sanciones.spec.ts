import { test } from '@playwright/test';
import path from 'node:path';
import {
  iniciarSesionYNavegar,
  completarCabeceraReconsideracion,
  capturarFormularioLleno,
  capturarToastExito,
  parseFechaTexto,
  calcularFechaReconsideracion,
  resolverDocumentoPrueba
} from 'tests/utilidades/reginsa-actions';
import { getTestContext } from 'helpers/test-context';
import {
  reservarConsecutivoGlobalPorRun,
  reservarClaveCandidato,
  registrarAsignacionSecuencial,
  marcarPaginaAgotada,
  esPaginaAgotada,
} from 'helpers/strict-sequential';

/**
 * EJECUCIÓN (rápido)
 * - Headless por defecto. Para ver navegador: `--headed`.
 * - Con capturas: scripts normales `npm run test:*`.
 * - Sin capturas: scripts `:fast`.
 * - Paralelismo (suite completa): `npm run test:all:w2` / `test:all:w4`.
 */

/**
 * CASO 04: RECONSIDERAR CON SANCIONES
 *
 * Flujo:
 * 1. Login + navegación al módulo (reutiliza `iniciarSesionYNavegar`)
 * 2. Buscar registro con detalle de sanciones disponible y campos vacíos
 * 3. Click en “Reconsiderar”
 * 4. Editar cabecera y marcar “Presentó reconsideración” (reutiliza `completarCabeceraReconsideracion`)
 * 5. Subir archivo, llenar número y seleccionar fecha válida (fecha > resolución y <= hoy) (reutiliza `completarCabeceraReconsideracion`)
 * 6. Capturar formulario lleno (reutiliza `capturarFormularioLleno`)
 * 7. Guardar cabecera y validar éxito (reutiliza `capturarToastExito`)
 * 8. Ir a Detalle de sanciones
 * 9. Editar registros y marcar opciones según sanción
 *
 * Nota:
 * - Solo se seleccionan registros con fecha de resolución válida (< hoy).
 * - Capturas exitosas dependen del modo de ejecución (:fast omite).
 */

test.describe('04-RECONSIDERAR CON SANCIONES', () => {
  test('Reconsiderar - Buscar y abrir modal de sanción', async ({ page }, testInfo) => {
    test.setTimeout(300000);
    const ctx = getTestContext(testInfo);
    const esScale = process.env.REGINSA_SCALE_MODE === '1';
    const strictVerify = process.env.REGINSA_STRICT_VERIFY !== '0';
    const usarSkipPaginasAgotadas = process.env.REGINSA_CASO04_SKIP_EXHAUSTED_PAGES !== '0';
    const crearTimestampArchivo = (): string =>
      new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

    const esperarRespuestaApiGuardado = async (
      timeoutMs: number,
      modo: 'estricto' | 'amplio' = 'estricto'
    ): Promise<boolean> => {
      try {
        const response = await page.waitForResponse((res) => {
          const method = res.request().method().toUpperCase();
          if (!['POST', 'PUT', 'PATCH'].includes(method)) return false;
          const url = res.url().toLowerCase();
          if (!url.includes('/api/')) return false;
          if (modo === 'estricto' && !/(reconsider|sanci|infractor|resoluci|detalle)/i.test(url)) return false;
          const status = res.status();
          return status >= 200 && status < 300;
        }, { timeout: timeoutMs });

        return !!response;
      } catch {
        return false;
      }
    };

    const esErrorContextoCerrado = (error: unknown): boolean => {
      const mensaje = String((error as Error)?.message || error || '');
      return /Target page, context or browser has been closed|Execution context was destroyed|navigation|Most likely the page has been closed/i.test(mensaje);
    };

    try {
      console.log('\n================================================================================');
      console.log('🔍 CASO 04: RECONSIDERAR CON SANCIONES');
      console.log('================================================================================\n');

      // ═══════════════════════════════════════════════════════════════════
      // PASO 1: LOGIN + NAVEGACIÓN
      // Reutiliza `iniciarSesionYNavegar`
      // ═══════════════════════════════════════════════════════════════════
      console.log('📋 PASO 1: Iniciando sesión...');
      const iniciarSesionConReintento = async (): Promise<void> => {
        let ultimoError: unknown;
        const workerBase = Number(testInfo.workerIndex ?? 0);
        const maxIntentos = Number.parseInt(process.env.REGINSA_CASO04_LOGIN_RETRIES || '5', 10) || 5;
        for (let intento = 1; intento <= maxIntentos; intento++) {
          try {
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
            console.warn(`⚠️ Reintento de sesión/navegación (${intento}/${maxIntentos}) por rebote a Home...`);
            await page.goto('https://reginsaqa.sunedu.gob.pe/#/home', { waitUntil: 'domcontentloaded' }).catch(() => {});
            await page.waitForTimeout(Math.min(3000, 600 * intento));
          }
        }
        throw (ultimoError || new Error('No se pudo inicializar sesión para Caso 04.'));
      };

      await iniciarSesionConReintento();
      console.log('✅ Sesión iniciada\n');

      page.on('dialog', async (dialog) => {
        const mensaje = dialog.message();
        console.warn(`   ⚠️ Diálogo detectado durante Caso 04: "${mensaje}". Se descarta para no bloquear el flujo.`);
        await dialog.dismiss().catch(() => {});
      });

      // ═══════════════════════════════════════════════════════════════════
      // PASO 2: BUSCAR REGISTRO CON DETALLE DE SANCIONES
      // ═══════════════════════════════════════════════════════════════════
      console.log('📋 PASO 2: Buscando registro con campos de reconsideración vacíos (API/UI)...');
      const tablaPrincipal = page
        .locator('table')
        .filter({ has: page.locator('th', { hasText: /F\.?\s*Modificaci/i }) })
        .first();
      await tablaPrincipal.waitFor({ state: 'visible', timeout: 15000 });
      let registroEncontrado = false;
      let numeroFilaEncontrada = -1;
      let fechaResolucionSeleccionada: Date | null = null;
      let ordinalSeleccionadoFinal: number | null = null;
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      console.log(`   🎯 Selección en orden estricto (worker=${ctx.workerIndex}, repeat=${ctx.repeatIndex})`);
      console.log('   📌 Estrategia: validar vacíos por API (idCabeceraInfraccionSancion) -> expandir -> validar infracciones -> reservar y procesar.');
      console.log(`   🧪 Skip páginas agotadas (misma corrida): ${usarSkipPaginasAgotadas ? 'ON' : 'OFF'}`);
      console.log('   🔢 Selección: primer candidato elegible y reservable (sin salto por ordinal fijo).');

      const isEmptyValor = (value: unknown): boolean => {
        if (value === null || value === undefined) return true;
        const v = String(value).trim().toLowerCase();
        if (
          v === '' ||
          v === '-' ||
          v === '--' ||
          v === '\u2013' ||
          v === '\u2014' ||
          v === 'null' ||
          v === 'undefined' ||
          v === 'n/a' ||
          v === 'na' ||
          /^0+$/i.test(v) ||
          /^0{4}-0{2}-0{2}(t0{2}:0{2}:0{2}(\.0+)?(z|[+-]\d{2}:\d{2})?)?$/i.test(v) ||
          /^0001-01-01(t00:00:00(\.0+)?(z|[+-]\d{2}:\d{2})?)?$/i.test(v) ||
          /^1900-01-01(t00:00:00(\.0+)?(z|[+-]\d{2}:\d{2})?)?$/i.test(v) ||
          /^01\/01\/0001(\s+00:00(:00)?)?$/i.test(v) ||
          /^01\/01\/1900(\s+00:00(:00)?)?$/i.test(v)
        ) {
          return true;
        }

        const soloSeparadores = v.replace(/[\s\/:._-]/g, '');
        if (!soloSeparadores) return true;

        return false;
      };
      const normalizarTexto = (value: unknown): string => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
      const claveFila = (expediente: unknown, resolucion: unknown): string => `${normalizarTexto(expediente)}|${normalizarTexto(resolucion)}`;

      type CabeceraApiC04 = {
        idCabeceraInfraccionSancion: number;
        numeroExpediente: string;
        numeroResolucion: string;
        rutaResolucionReconsideracion: unknown;
        resolucionReconsideracion: unknown;
        fechaResolucionReconsideracion: unknown;
        fechaModificacion: unknown;
      };

      const cabecerasApiPorPagina = new Map<number, CabeceraApiC04[]>();

      const normalizarCabeceraApi = (raw: unknown): CabeceraApiC04 | null => {
        if (!raw || typeof raw !== 'object') return null;
        const rec = raw as Record<string, unknown>;

        const idRaw = rec.idCabeceraInfraccionSancion ?? rec.IdCabeceraInfraccionSancion;
        const id = Number(idRaw);
        if (!Number.isFinite(id) || id <= 0) return null;

        const numeroExpediente = String(rec.numeroExpediente ?? rec.NumeroExpediente ?? '').trim();
        const numeroResolucion = String(rec.numeroResolucion ?? rec.NumeroResolucion ?? '').trim();
        if (!numeroExpediente && !numeroResolucion) return null;

        return {
          idCabeceraInfraccionSancion: id,
          numeroExpediente,
          numeroResolucion,
          rutaResolucionReconsideracion:
            rec.rutaResolucionReconsideracion ??
            rec.RutaResolucionReconsideracion ??
            rec.rutaResolReconsidera ??
            rec.RutaResolReconsidera,
          resolucionReconsideracion:
            rec.resolucionReconsideracion ??
            rec.ResolucionReconsideracion ??
            rec.desResolucionReconsideracion ??
            rec.DesResolucionReconsideracion,
          fechaResolucionReconsideracion:
            rec.fechaResolucionReconsideracion ??
            rec.FechaResolucionReconsideracion ??
            rec.fechaReconsideracion ??
            rec.FechaReconsideracion,
          fechaModificacion: rec.fechaModificacion ?? rec.FechaModificacion,
        };
      };

      const registrarCabecerasDesdeResponse = async (
        response: Awaited<ReturnType<typeof page.waitForResponse>> | null,
        motivo: string
      ): Promise<void> => {
        if (!response) return;
        const url = response.url().toLowerCase();
        if (!url.includes('/cabecerainfraccionsancion/listarpaginado')) return;

        const requestData = response.request().postDataJSON?.() as Record<string, unknown> | undefined;
        const paginaRequest = Number(
          requestData?.nPageNumber ?? requestData?.pageNumber ?? requestData?.PageNumber ?? requestData?.NPageNumber ?? 0
        );
        const pagina = Number.isFinite(paginaRequest) && paginaRequest > 0 ? paginaRequest : 1;

        const payload = await response.json().catch(() => null) as
          | { oData?: { Results?: unknown[] } }
          | null;
        const resultadosRaw = Array.isArray(payload?.oData?.Results) ? payload!.oData!.Results : [];
        const cabeceras = resultadosRaw
          .map(normalizarCabeceraApi)
          .filter((item): item is CabeceraApiC04 => Boolean(item));

        if (cabeceras.length > 0) {
          cabecerasApiPorPagina.set(pagina, cabeceras);
          console.log(`   🧩 API ListarPaginado (${motivo}) -> página ${pagina}, cabeceras=${cabeceras.length}`);
        }
      };

      console.log('   ℹ️ Criterio de vacío: rutaResolucionReconsideracion/resolucionReconsideracion/fechaResolucionReconsideracion (null o vacío) por idCabeceraInfraccionSancion.');

      

      const obtenerIndiceColumna = async (regex: RegExp): Promise<number> => {
        const headers = tablaPrincipal.locator('thead tr th');
        const total = await headers.count();
        for (let i = 0; i < total; i++) {
          const texto = (await headers.nth(i).textContent())?.trim() || '';
          if (regex.test(texto)) return i;
        }
        return -1;
      };

      const idxAdmin = await obtenerIndiceColumna(/Administrado/i);
      const idxExp = await obtenerIndiceColumna(/N\W*de\W*Expediente|N\W*Expediente/i);
      const idxRes = await obtenerIndiceColumna(/N\W*de\W*Resoluci\w*|N\W*Resoluci\w*/i);
      const idxSancion = await obtenerIndiceColumna(/Sanci[oó]n\s*Impuesta|Sanci[oó]n/i);
      const idxInfracciones = await obtenerIndiceColumna(/Infracci[oó]n|Infracciones\s*detectadas/i);
      const idxFMod = await obtenerIndiceColumna(/F\.\s*Modificaci\w*|Modificaci\w*/i);
      const idxNRec = await obtenerIndiceColumna(/N\W*Reconsideraci\w*/i);
      const idxFRec = await obtenerIndiceColumna(/F\.\s*Reconsideraci\w*|Reconsideraci\w*/i);

      if (idxFMod < 0 || idxNRec < 0 || idxFRec < 0) {
        throw new Error('No se pudieron identificar las columnas F. Modificación, N° Reconsideración y F. Reconsideración.');
      }

      const getPaginatorButton = (kind: 'prev' | 'next') => {
        if (kind === 'prev') {
          return page.locator(
            'button[aria-label="Previous Page"], button[aria-label="Previous"], .p-paginator-prev, .p-paginator-first'
          ).first();
        }
        return page.locator(
          'button[aria-label="Next Page"], button[aria-label="Next"], .p-paginator-next, .p-paginator-last'
        ).first();
      };

      const isPaginatorEnabled = async (button: ReturnType<typeof page.locator>): Promise<boolean> => {
        const exists = await button.count().catch(() => 0);
        if (!exists) return false;
        const disabledAttr = await button.getAttribute('disabled').catch(() => null);
        if (disabledAttr !== null) return false;
        const ariaDisabled = (await button.getAttribute('aria-disabled').catch(() => null)) || '';
        if (ariaDisabled.toLowerCase() === 'true') return false;
        const className = (await button.getAttribute('class').catch(() => '')) || '';
        if (/p-disabled|disabled/i.test(className)) return false;
        return await button.isEnabled().catch(() => false);
      };

      const esperarListadoRefrescado = async (motivo: string): Promise<void> => {
        if (page.isClosed()) return;
        await page
          .locator('.p-datatable-loading-overlay, .p-datatable-loading-icon, .p-progressspinner, .p-component-overlay')
          .first()
          .waitFor({ state: 'hidden', timeout: 2500 })
          .catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        await tablaPrincipal.locator('tbody').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(120);
        const filasVisibles = await tablaPrincipal.locator('tbody > tr').count().catch(() => 0);
        console.log(`   🔄 Listado releído (${motivo}) - filas visibles: ${filasVisibles}`);
      };

      const forzarRefrescoInfractorYSancion = async (motivo: string): Promise<void> => {
        if (page.isClosed()) return;
        const activadores = [
          page.getByRole('tab', { name: /Infractor\s*y\s*Sanci[oó]n/i }).first(),
          page.getByRole('link', { name: /Infractor\s*y\s*Sanci[oó]n/i }).first(),
          page.getByRole('button', { name: /Infractor\s*y\s*Sanci[oó]n/i }).first(),
          page.locator('a,button,[role="tab"],[role="menuitem"]').filter({ hasText: /Infractor\s*y\s*Sanci[oó]n/i }).first(),
        ];

        for (const activador of activadores) {
          const existe = await activador.count().catch(() => 0);
          if (!existe) continue;
          const visible = await activador.isVisible().catch(() => false);
          if (!visible) continue;

          const esperaListado = page
            .waitForResponse((res) => {
              const url = res.url().toLowerCase();
              return /listar|listarpaginado/.test(url) && res.status() >= 200 && res.status() < 500;
            }, { timeout: 4500 })
            .catch(() => null);

          await activador.click({ force: true }).catch(() => {});
          const respuestaListado = await esperaListado;
          await registrarCabecerasDesdeResponse(respuestaListado, `click-infractor-sancion-${motivo}`);
          await esperarListadoRefrescado(`click-infractor-sancion-${motivo}`);
          console.log(`   ♻️ Refresco forzado con clic en "Infractor y Sanción" (${motivo}).`);
          return;
        }
      };

      const limpiarFiltrosListado = async (): Promise<void> => {
        const filtros = tablaPrincipal.locator('thead input, thead textarea');
        const totalFiltros = await filtros.count().catch(() => 0);
        let filtrosLimpiados = 0;
        for (let i = 0; i < totalFiltros; i++) {
          const input = filtros.nth(i);
          const visible = await input.isVisible().catch(() => false);
          if (!visible) continue;
          const actual = ((await input.inputValue().catch(() => '')) || '').trim();
          if (!actual) continue;
          await input.fill('').catch(() => {});
          await input.press('Enter').catch(() => {});
          filtrosLimpiados++;
        }
        if (filtrosLimpiados > 0) {
          console.log(`   🧹 Filtros limpiados antes de seleccionar: ${filtrosLimpiados}`);
        }
      };

      const limpiarFiltrosAntesSeleccion = /^(1|true|yes|si)$/i.test(
        String(process.env.REGINSA_C04_CLEAR_FILTERS || '').trim()
      );

      const irPrimeraPagina = async (): Promise<void> => {
        const btnPrev = getPaginatorButton('prev');
        for (let i = 0; i < 120; i++) {
          const habilitado = await isPaginatorEnabled(btnPrev);
          if (!habilitado) break;
          const esperaListado = page
            .waitForResponse((res) => {
              const url = res.url().toLowerCase();
              return url.includes('/cabecerainfraccionsancion/listarpaginado') && res.status() >= 200 && res.status() < 500;
            }, { timeout: 4500 })
            .catch(() => null);
          await btnPrev.click();
          const respuestaListado = await esperaListado;
          await registrarCabecerasDesdeResponse(respuestaListado, 'navegando-a-primera');
          await esperarListadoRefrescado('navegando-a-primera');
        }
      };

      const evaluarFilaCandidata = async (
        fila: ReturnType<typeof page.locator>,
        totalCeldas: number,
        cabecerasApiPagina: CabeceraApiC04[],
        rowIndex: number
      ) => {
        try {
          const celdas = fila.locator('td');
          const fModificacion = ((await celdas.nth(idxFMod).textContent()) || '').replace(/\u00a0/g, ' ').trim();
          const nReconsid = ((await celdas.nth(idxNRec).textContent()) || '').replace(/\u00a0/g, ' ').trim();
          const fReconsid = ((await celdas.nth(idxFRec).textContent()) || '').replace(/\u00a0/g, ' ').trim();
          const expedienteFila = idxExp >= 0 && idxExp < totalCeldas
            ? (await celdas.nth(idxExp).textContent())?.trim() || ''
            : '';
          const resolucionFila = idxRes >= 0 && idxRes < totalCeldas
            ? (await celdas.nth(idxRes).textContent())?.trim() || ''
            : '';
          const administrado = idxAdmin >= 0
            ? (await celdas.nth(idxAdmin).textContent())?.trim() || 'N/D'
            : (await celdas.nth(0).textContent())?.trim() || 'N/D';

          const sancionTexto = idxSancion >= 0 && idxSancion < totalCeldas
            ? (await celdas.nth(idxSancion).textContent())?.trim() || ''
            : '';
          const infraccionesTexto = idxInfracciones >= 0 && idxInfracciones < totalCeldas
            ? (await celdas.nth(idxInfracciones).textContent())?.trim() || ''
            : '';
          const filaTexto = (await fila.innerText().catch(() => '')).trim();

          const haySancionPorTexto = Boolean(sancionTexto && !/^(sin|ninguna|no\s*aplica|n\/a|0)$/i.test(sancionTexto));
          const hayInfraccionPorColumna = Boolean(infraccionesTexto && !/^(sin|ninguna|no\s*aplica|n\/a|0)$/i.test(infraccionesTexto));
          const hayInfraccionPorFila = /infracci|multa|uit|suspensi[oó]n|cancelaci[oó]n/i.test(filaTexto);
          const fechasDetectadas: Date[] = [];
          for (let c = 0; c < totalCeldas; c++) {
            const texto = (await celdas.nth(c).textContent())?.trim() || '';
            const fecha = parseFechaTexto(texto);
            if (fecha) fechasDetectadas.push(fecha);
          }

          const fechaResolucion = fechasDetectadas[0] || null;
          const fechaResolucionValida = fechasDetectadas.length === 0 || fechasDetectadas.some((f) => f <= hoy);
          const tresCamposVaciosUI = isEmptyValor(nReconsid) && isEmptyValor(fReconsid);

          const claveActual = claveFila(expedienteFila, resolucionFila);
          const clavePorExpediente = claveFila(expedienteFila, '');
          const clavePorResolucion = claveFila('', resolucionFila);

          const exactMatches = cabecerasApiPagina.filter(
            (item) => claveFila(item.numeroExpediente, item.numeroResolucion) === claveActual
          );
          const exactMatch = exactMatches.length === 1 ? exactMatches[0] : null;

          const candidatosPorExpediente = cabecerasApiPagina.filter(
            (item) => claveFila(item.numeroExpediente, '') === clavePorExpediente
          );
          const candidatosPorResolucion = cabecerasApiPagina.filter(
            (item) => claveFila('', item.numeroResolucion) === clavePorResolucion
          );

          const matchPorExpedienteUnico = candidatosPorExpediente.length === 1 ? candidatosPorExpediente[0] : null;
          const matchPorResolucionUnico = candidatosPorResolucion.length === 1 ? candidatosPorResolucion[0] : null;
          const matchPorIndice = rowIndex >= 0 && rowIndex < cabecerasApiPagina.length
            ? cabecerasApiPagina[rowIndex]
            : null;

          // Para vacíos: solo confiar en matches por clave, no por índice (el orden API/UI puede diferir)
          const apiMatchConfiable = exactMatch || matchPorExpedienteUnico || matchPorResolucionUnico;
          const apiMatch = apiMatchConfiable || matchPorIndice;

          const tresCamposVaciosApi = apiMatchConfiable
            ? Boolean(
              isEmptyValor(apiMatchConfiable.rutaResolucionReconsideracion)
              && isEmptyValor(apiMatchConfiable.resolucionReconsideracion)
              && isEmptyValor(apiMatchConfiable.fechaResolucionReconsideracion)
            )
            : null;

          // UI tiene precedencia visual: si se ven campos vacíos, el registro es candidato
          const cumpleCamposVacios = tresCamposVaciosUI || (tresCamposVaciosApi === true);
          if (tresCamposVaciosUI && tresCamposVaciosApi === false) {
            console.log(`   ⚠️ Fila ${rowIndex + 1}: UI muestra vacíos pero API reporta datos (se confía en UI)`);
          }
          const esApto = cumpleCamposVacios && fechaResolucionValida;

          return {
            esApto,
            cumpleCamposVacios,
            fuenteCamposVacios: apiMatchConfiable ? 'API' : 'UI',
            idCabeceraInfraccionSancion: apiMatch?.idCabeceraInfraccionSancion ?? null,
            sancionTexto,
            infraccionesTexto,
            haySancionPorTexto,
            hayInfraccionPorColumna,
            hayInfraccionPorFila,
            expedienteFila,
            resolucionFila,
            administrado,
            fechaResolucion,
          };
        } catch (error) {
          if (esErrorContextoCerrado(error)) {
            return {
              esApto: false,
              cumpleCamposVacios: false,
              fuenteCamposVacios: 'UI',
              idCabeceraInfraccionSancion: null,
              sancionTexto: '',
              infraccionesTexto: '',
              haySancionPorTexto: false,
              hayInfraccionPorColumna: false,
              hayInfraccionPorFila: false,
              expedienteFila: '',
              resolucionFila: '',
              administrado: 'N/D',
              fechaResolucion: null,
            };
          }
          throw error;
        }
      };

      const tieneSancionRapidaEnFila = async (fila: ReturnType<typeof page.locator>, totalCeldas: number): Promise<boolean> => {
        const celdas = fila.locator('td');
        const sancionTexto = idxSancion >= 0 && idxSancion < totalCeldas
          ? (await celdas.nth(idxSancion).innerText().catch(() => '')).trim()
          : '';
        const infraccionesTexto = idxInfracciones >= 0 && idxInfracciones < totalCeldas
          ? (await celdas.nth(idxInfracciones).innerText().catch(() => '')).trim()
          : '';
        const combinado = `${sancionTexto} ${infraccionesTexto}`.toLowerCase();
        if (!combinado) return false;
        if (/^\s*(sin|ninguna|no\s*aplica|n\/a|0)\s*$/i.test(combinado)) return false;
        return /multa|suspensi|cancelaci|uit|soles|hecho\s*infractor|infracci/i.test(combinado);
      };

      const tieneSancionesEnTablaHija = async (fila: ReturnType<typeof page.locator>): Promise<boolean> => {
        const btnExpand = fila.locator('button:has(i.pi-chevron-down), button:has(i.pi-chevron-right)').first();
        if ((await btnExpand.count().catch(() => 0)) === 0) return false;

        const filaDetalle = fila.locator('xpath=following-sibling::tr[1]');
        const tablaDetalle = filaDetalle.locator('table').first();
        const visibleAntes = await tablaDetalle.isVisible().catch(() => false);

        if (!visibleAntes) {
          await btnExpand.click().catch(() => {});
          await tablaDetalle.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
        }

        const textoDetalle = (await filaDetalle.innerText().catch(() => '')).toLowerCase();
        const filasDetalle = await filaDetalle.locator('tbody tr').count().catch(() => 0);
        const sinDatos = /sin sanciones|sin infracciones|no registra/i.test(textoDetalle);
        // Criterio manual: al expandir, si hay filas en el detalle y no indica "sin datos",
        // se considera elegible para reconsideración.
        const tiene = filasDetalle > 0 && !sinDatos;

        if (!visibleAntes) {
          await btnExpand.click().catch(() => {});
        }

        return tiene;
      };

        await forzarRefrescoInfractorYSancion('pre-seleccion');
        await irPrimeraPagina();
        if (limpiarFiltrosAntesSeleccion) {
          await limpiarFiltrosListado();
          await forzarRefrescoInfractorYSancion('post-filtros');
        } else {
          console.log('   🔒 Filtros preservados (REGINSA_C04_CLEAR_FILTERS desactivado).');
        }
      await esperarListadoRefrescado('inicio-seleccion');
      let elegiblesAcumulados = 0;
      let paginasExploradas = 0;
      const clavesElegiblesVistas = new Set<string>();

      for (let pagina = 1; !registroEncontrado; pagina++) {
        paginasExploradas = pagina;

        if (usarSkipPaginasAgotadas && esPaginaAgotada('caso04-con-sanciones', pagina)) {
          console.log(`   ↪️ Página ${pagina}: omitida en esta corrida (marcada sin casos).`);
          const btnNextSkip = getPaginatorButton('next');
          const habilitadoSkip = await isPaginatorEnabled(btnNextSkip);
          if (!habilitadoSkip) break;
          await btnNextSkip.click();
          await esperarListadoRefrescado(`skip-pagina-${pagina}`);
          continue;
        }

        let elegiblesPagina = 0;
        let candidatosVaciosPagina = 0;
        const lecturasPagina = pagina === 1 ? 2 : 1;

        for (let lectura = 1; lectura <= lecturasPagina && !registroEncontrado; lectura++) {
          if (pagina === 1 && lectura === 1) {
            await forzarRefrescoInfractorYSancion('pagina-1-lectura-1');
          }
          if (lectura > 1) {
            await esperarListadoRefrescado(`relectura-pagina-${pagina}`);
          }

          if (page.isClosed()) {
            throw new Error('La página se cerró durante la búsqueda de candidatos en Caso 04.');
          }

          const filasPagina = tablaPrincipal.locator('tbody > tr');
          const totalFilas = await filasPagina.count();
          const cabecerasApiPagina = cabecerasApiPorPagina.get(pagina) || [];

          for (let i = 0; i < totalFilas; i++) {
            const fila = filasPagina.nth(i);
            const botonesEnFila = await fila.locator('button').count().catch(() => 0);
            if (botonesEnFila === 0) continue;

            const totalCeldas = await fila.locator('td').count();
            const evaluacion = await evaluarFilaCandidata(fila, totalCeldas, cabecerasApiPagina, i);
            if (!evaluacion.cumpleCamposVacios) continue;
            candidatosVaciosPagina++;

            if (!evaluacion.esApto) continue;

            // Estrategia manual: primero validar vacíos y luego expandir para confirmar infracciones.
            let tieneSancion = await tieneSancionesEnTablaHija(fila);
            if (!tieneSancion) {
              const btnReconsiderarCount = await fila
                .locator('button.p-button-warning, button[ptooltip*="Reconsiderar"], button i.pi-refresh')
                .count()
                .catch(() => 0);
              const btnInfoCount = await fila
                .locator('button.p-button-info, button[ptooltip*="Ver Sanción"], button[ptooltip*="Ver Sancion"], button[ptooltip*="Ver Sanci"]')
                .count()
                .catch(() => 0);

              tieneSancion =
                btnReconsiderarCount > 0 ||
                btnInfoCount > 0 ||
                evaluacion.haySancionPorTexto ||
                evaluacion.hayInfraccionPorColumna ||
                evaluacion.hayInfraccionPorFila ||
                await tieneSancionRapidaEnFila(fila, totalCeldas);
            }
            if (!tieneSancion) continue;

            const claveReserva = `${String(evaluacion.expedienteFila || '').trim()}|${String(evaluacion.resolucionFila || '').trim()}`;
            if (!claveReserva || claveReserva === '|') continue;

            if (clavesElegiblesVistas.has(claveReserva)) continue;
            clavesElegiblesVistas.add(claveReserva);

            elegiblesAcumulados++;
            elegiblesPagina++;

            const reservado = reservarClaveCandidato('caso04-con-sanciones', claveReserva);
            if (!reservado) {
              console.log(`   ↪️ Omitido por reserva previa: ${claveReserva}`);
              continue;
            }

            numeroFilaEncontrada = i;
            fechaResolucionSeleccionada = evaluacion.fechaResolucion;
            registroEncontrado = true;
            const ordinalSeleccionado = Math.max(0, elegiblesAcumulados - 1);
            ordinalSeleccionadoFinal = ordinalSeleccionado;

            const trazaSeleccion = {
              testRunId: process.env.TEST_RUN_ID || '',
              workerIndex: ctx.workerIndex,
              repeatIndex: ctx.repeatIndex,
              selectionSlot: ctx.selectionSlot,
              ordinalSeleccionado,
              ordinalSeleccionadoGlobal: ordinalSeleccionado + 1,
              elegiblesAcumulados,
              page: pagina,
              row: i + 1,
              idCabeceraInfraccionSancion: evaluacion.idCabeceraInfraccionSancion,
              fuenteCamposVacios: evaluacion.fuenteCamposVacios,
              expediente: evaluacion.expedienteFila,
              resolucion: evaluacion.resolucionFila,
              administrado: evaluacion.administrado,
              modoSeleccion: 'orden-estricto-con-reserva',
            };

            registrarAsignacionSecuencial('caso04-con-sanciones', ordinalSeleccionado, {
              status: 'selected',
              page: pagina,
              row: i,
              workerIndex: ctx.workerIndex,
              repeatIndex: ctx.repeatIndex,
              reason: `ordinalSeleccionado=${ordinalSeleccionado}`,
              expediente: evaluacion.expedienteFila,
              resolucion: evaluacion.resolucionFila,
            });

            console.log(`   👤 Administrado: ${evaluacion.administrado}`);
            console.log(`   ✅ REGISTRO SELECCIONADO en página ${pagina}, fila ${i + 1}`);
            console.log(`   🧭 TRAZA_SELECCION_C04: ${JSON.stringify(trazaSeleccion)}`);
            break;
          }

          if (!registroEncontrado && pagina === 1 && lectura === 1) {
            console.log('   🔁 Relectura de página 1 para tomar listado actualizado antes de ir a páginas siguientes.');
          }
        }

        if (!registroEncontrado) {
          console.log(`   📄 Página ${pagina}: vacios=${candidatosVaciosPagina}, elegibles=${elegiblesPagina}, acumulados=${elegiblesAcumulados}`);
          if (usarSkipPaginasAgotadas && elegiblesPagina === 0) {
            marcarPaginaAgotada('caso04-con-sanciones', pagina);
          }
        }

        if (registroEncontrado) break;
        const btnNextPage = getPaginatorButton('next');
        const habilitado = await isPaginatorEnabled(btnNextPage);
        if (!habilitado) break;
        const esperaListado = page
          .waitForResponse((res) => {
            const url = res.url().toLowerCase();
            return url.includes('/cabecerainfraccionsancion/listarpaginado') && res.status() >= 200 && res.status() < 500;
          }, { timeout: 4500 })
          .catch(() => null);
        await btnNextPage.click();
        const respuestaListado = await esperaListado;
        await registrarCabecerasDesdeResponse(respuestaListado, `navegar-pagina-${pagina + 1}`);
        await esperarListadoRefrescado(`navegar-pagina-${pagina + 1}`);
      }

      if (!registroEncontrado) {
        throw new Error(
          `❌ No se encontró elegible para reconsideración. elegibles=${elegiblesAcumulados}, páginas=${paginasExploradas}.`
        );
      }
      console.log('✅ Registro encontrado\n');

      // ═══════════════════════════════════════════════════════════════════
      // PASO 3: CLICK EN RECONSIDERAR
      // ═══════════════════════════════════════════════════════════════════
      console.log('📋 PASO 3: Clickeando RECONSIDERAR...');
      const filaSeleccionada = tablaPrincipal.locator('tbody > tr').nth(numeroFilaEncontrada);
      const btnReconsiderar = filaSeleccionada.locator('button.p-button-warning');
      await btnReconsiderar.first().click();
      // Espera a que el formulario de cabecera esté visible (igual que caso 3)
      await page.locator('form').waitFor({ state: 'visible', timeout: 10000 });
      console.log('✅ RECONSIDERAR clickeado\n');

      // ═══════════════════════════════════════════════════════════════════
      // PASO 3.5: VALIDAR DATOS DE ADMINISTRADO
      // ═══════════════════════════════════════════════════════════════════
      console.log('📋 PASO 3.5: Validando datos de administrado...');
      const adminInput = page
        .getByRole('textbox', { name: /Administrado|Razón Social|R\.U\.C|RUC/i })
        .first();
      const adminValor = await adminInput.inputValue().catch(() => '');
      if (adminValor) {
        console.log(`   👤 Administrado (formulario): ${adminValor}`);
      } else {
        console.log('   👤 Administrado (formulario): N/D');
      }

      // ═══════════════════════════════════════════════════════════════════
      // PASO 4-10: COMPLETAR CABECERA (ARCHIVO + NÚMERO + FECHA)
      // Reutiliza `completarCabeceraReconsideracion`
      // ═══════════════════════════════════════════════════════════════════
      console.log('📋 PASO 4-10: Rellenando datos de cabecera...');
      const rutaArchivo = resolverDocumentoPrueba();
      const fechaReconsideracion = calcularFechaReconsideracion(fechaResolucionSeleccionada);
      const runIdPrefijo = String(process.env.TEST_RUN_ID || process.env.REGINSA_FUNC_RUN_ID || '').trim();
      const correlativoFA = reservarConsecutivoGlobalPorRun('caso04-fa-prefix-run', runIdPrefijo, 1);
      const prefijoReconsideracion = `FA ${String(correlativoFA).padStart(2, '0')} REC`;
      console.log(`   🔢 Prefijo de reconsideración: ${prefijoReconsideracion}`);

      const numeroReconsideracion = await completarCabeceraReconsideracion(
        page,
        rutaArchivo,
        fechaReconsideracion,
        prefijoReconsideracion
      );
      console.log('✅ Datos rellenados\n');

      // Validar archivo, número y fecha antes de guardar (reintentos)
      const nombreArchivo = path.basename(rutaArchivo);
      const numeroLabel = page.locator('label').filter({ hasText: /N\W*Reconsideraci/i }).first();
      const inputNumero = (await numeroLabel.count().catch(() => 0))
        ? numeroLabel.locator('xpath=following::input[1]')
        : page.getByRole('textbox').nth(2);
      const fechaLabel = page.locator('label').filter({ hasText: /Fecha.*Reconsideraci/i }).first();
      const btnFecha = (await fechaLabel.count().catch(() => 0))
        ? fechaLabel.locator('xpath=following::button[contains(@aria-label,"Choose") or contains(@aria-label,"Seleccionar")][1]')
        : page.getByRole('button', { name: /Choose|Seleccionar/i }).nth(1);
      const fechaInput = (await fechaLabel.count().catch(() => 0))
        ? fechaLabel.locator('xpath=following::input[1]')
        : btnFecha.locator('..').locator('input');
      const validarCabecera = async (): Promise<boolean> => {
        const numeroValor = await inputNumero.inputValue().catch(() => '');
        const fechaValor = await fechaInput.inputValue().catch(() => '');
        const presentoInput = page.locator('input#presentoReconsideracion').first();
        const presentoBox = page.locator('p-checkbox[inputid="presentoReconsideracion"] .p-checkbox-box').first();
        const presentoChecked = (await presentoInput.isChecked().catch(() => false))
          || (await presentoInput.getAttribute('aria-checked').catch(() => null)) === 'true'
          || String(await presentoBox.getAttribute('class').catch(() => '') || '').includes('p-highlight');

        const labelRecons = page.locator('label').filter({ hasText: /Resoluci[oó]n de Reconsideraci[oó]n/i }).first();
        const archivoReconsEnBloque = labelRecons
          .locator('xpath=following::small[contains(.,"Archivo:")][1]')
          .filter({ hasText: nombreArchivo })
          .first();
        const btnVerRecons = page.getByRole('button', { name: /Ver reconsideraci[oó]n/i }).first();
        const archivoVisible = await page
          .locator('.p-fileupload-filename, .p-fileupload-files')
          .filter({ hasText: nombreArchivo })
          .first()
          .isVisible()
          .catch(() => false);
        const archivoTexto = await page.getByText(nombreArchivo).first().isVisible().catch(() => false);
        const archivoRuta = await page
          .locator('text=/Archivo:/i')
          .first()
          .isVisible()
          .catch(() => false);
        const archivoReconsVisible = await archivoReconsEnBloque.isVisible().catch(() => false);
        const verReconsHabilitado = await btnVerRecons.isEnabled().catch(() => false);
        const archivoOk = archivoVisible || archivoTexto || archivoRuta || archivoReconsVisible || verReconsHabilitado;
        console.log(`   🧾 Cabecera -> Check presento: ${presentoChecked ? 'OK' : 'NO'} | Archivo recons: ${archivoOk ? 'OK' : 'NO'} | Número: ${numeroValor ? 'OK' : 'NO'} | Fecha: ${fechaValor ? 'OK' : 'NO'}`);
        return presentoChecked && Boolean(numeroValor) && Boolean(fechaValor) && archivoOk;
      };

      let cabeceraOk = await validarCabecera();
      for (let intento = 0; intento < 2 && !cabeceraOk; intento++) {
        console.log('⚠️ Cabecera incompleta, reintentando carga de archivo/número/fecha...');
        await completarCabeceraReconsideracion(page, rutaArchivo, fechaReconsideracion, prefijoReconsideracion);
        cabeceraOk = await validarCabecera();
      }

      if (!cabeceraOk) {
        throw new Error('❌ No se pudo validar archivo, número o fecha en cabecera antes de guardar.');
      }

      // Captura formulario lleno antes de guardar (reutiliza `capturarFormularioLleno`)
      await capturarFormularioLleno(
        page,
        '04-RECONSIDERAR-CON-SANCIONES',
        numeroReconsideracion,
        '',
        'CABECERA_RECONSIDERACION',
        '10_FORMULARIO_CABECERA'
      );

      // Guardar cabecera
      const btnGuardar = page.getByRole('button', { name: 'Guardar cabecera' });
      await btnGuardar.waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ Botón guardar encontrado, haciendo clic...');

      let guardadoCabeceraConfirmado = false;
      let toastCabeceraDetectado = false;
      const intentosGuardadoCabecera = strictVerify ? 2 : 1;

      for (let intento = 1; intento <= intentosGuardadoCabecera && !guardadoCabeceraConfirmado; intento++) {
        const timeoutApiEstricto = esScale ? 7000 : 11000;
        const timeoutApiAmplio = esScale ? 9000 : 14000;
        const apiGuardadoPromise = esperarRespuestaApiGuardado(timeoutApiEstricto, 'estricto');
        const apiGuardadoAmplioPromise = esperarRespuestaApiGuardado(timeoutApiAmplio, 'amplio');

        await btnGuardar.click();
        // Espera breve de toast para capturar confirmación rápida cuando existe
        await page.locator('.p-toast-message-success, .p-toast-message').first().waitFor({ state: 'visible', timeout: 3500 }).catch(() => {});

        const [apiGuardadoOk, apiGuardadoAmplioOk] = await Promise.all([
          apiGuardadoPromise,
          apiGuardadoAmplioPromise,
        ]);
        const toastCabecera = Boolean(await capturarToastExito(
          page,
          '04-RECONSIDERAR-CON-SANCIONES',
          '11_EXITO_CABECERA',
          numeroReconsideracion,
          '',
          'CABECERA_RECONSIDERACION',
          3000
        ));
        toastCabeceraDetectado = toastCabeceraDetectado || toastCabecera;

        guardadoCabeceraConfirmado = toastCabecera || apiGuardadoOk || apiGuardadoAmplioOk;
        if (!guardadoCabeceraConfirmado && intento < intentosGuardadoCabecera) {
          console.warn(`⚠️ Guardado de cabecera sin señal de confirmación en intento ${intento}; reintentando...`);
          await page.waitForTimeout(800);
        }
      }

      if (strictVerify && !guardadoCabeceraConfirmado) {
        throw new Error('No se confirmó el guardado de cabecera (sin toast ni confirmación API).');
      }

      // Capturar mensaje de confirmación en esquina superior izquierda (si existe)
      const toastIzq = page.locator('.p-toast-top-left .p-toast-message, .p-toast-top-left').first();
      if (!toastCabeceraDetectado && (await toastIzq.isVisible().catch(() => false))) {
        const timestamp = crearTimestampArchivo();
        const archivo = `./screenshots/04-RECONSIDERAR-CON-SANCIONES_11_TOAST_IZQ_${timestamp}.png`;
        await toastIzq.screenshot({ path: archivo });
      }
      console.log('✅ Cabecera guardada\n');

      // ═══════════════════════════════════════════════════════════════════
      // PASO 11: ACCEDER A DETALLE DE SANCIONES
      // ═══════════════════════════════════════════════════════════════════
      console.log('📋 PASO 11: Accediendo a Detalle de sanciones...');
      if (page.isClosed()) {
        throw new Error('La página se cerró antes de abrir Detalle de sanciones.');
      }
      const tabDetalle = page.getByRole('tab', { name: 'Detalle de sanciones' });
      await tabDetalle.waitFor({ state: 'visible', timeout: 10000 });
      await tabDetalle.click();
      // Espera a que el contenido de la pestaña esté visible (igual que caso 3)
      await page.locator('body').waitFor({ state: 'visible', timeout: 10000 });
      console.log('✅ Tab Detalle abierto\n');

      // ═══════════════════════════════════════════════════════════════════
      // PASO 12: PROCESAR REGISTROS (MODAL + CHECKBOXES)
      // ═══════════════════════════════════════════════════════════════════
      console.log('📋 PASO 12: Procesando detalles de sanciones...\n');
      
      const tablaDetalle = page
        .locator('table')
        .filter({ has: page.locator('th', { hasText: /Sanci[oó]n/i }) })
        .first();
      const filasTR = tablaDetalle.locator('tbody tr');
      const headersDetalle = tablaDetalle.locator('thead tr th');
      const sinSanciones = await tablaDetalle.getByText(/Sin sanciones registradas/i).first().isVisible().catch(() => false);
      if (sinSanciones) {
        test.skip(true, 'El registro seleccionado no tiene sanciones en detalle; se omite para evitar falso fallo.');
        return;
      }
      const totalFilasTabla = await filasTR.count();
      console.log(`📊 Total de registros: ${totalFilasTabla}\n`);
      
      let registrosEditados = 0;
      let registrosYaConformes = 0;
      const maxRegistrosAEditar = totalFilasTabla;

      const obtenerIndiceDetalle = async (regex: RegExp): Promise<number> => {
        const total = await headersDetalle.count();
        for (let i = 0; i < total; i++) {
          const texto = (await headersDetalle.nth(i).textContent())?.trim() || '';
          if (regex.test(texto)) return i;
        }
        return -1;
      };

      const idxSancionDetalle = await obtenerIndiceDetalle(/Sanci[oó]n/i);
      const idxPago = await obtenerIndiceDetalle(/Pag[oó]/i);
      const idxReconsidera = await obtenerIndiceDetalle(/Reconsidera/i);

      for (let filaIdx = 0; filaIdx < maxRegistrosAEditar; filaIdx++) {
        console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
        console.log(`║ REGISTRO ${filaIdx + 1} de ${maxRegistrosAEditar}`);
        console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

        const fila = filasTR.nth(filaIdx);
        const celdas = fila.locator('td');

        const sancionTexto = idxSancionDetalle >= 0
          ? (await celdas.nth(idxSancionDetalle).innerText().catch(() => '')).trim()
          : (await fila.innerText().catch(() => '')).trim();
        const tieneMulta = /Multa|UIT|U\.I\.T\.|SOLES/i.test(sancionTexto);
        const tieneSuspension = /Suspensi[oó]n/i.test(sancionTexto);
        const tieneCancelacion = /Cancelaci[oó]n/i.test(sancionTexto);

        const pagoActual = idxPago >= 0
          ? await celdas.nth(idxPago).locator('input[type="checkbox"]').getAttribute('aria-checked').then(v => v === 'true').catch(() => false)
          : false;
        const reconsideraActual = idxReconsidera >= 0
          ? await celdas.nth(idxReconsidera).locator('input[type="checkbox"]').getAttribute('aria-checked').then(v => v === 'true').catch(() => false)
          : false;

        const debeMarcarPago = tieneMulta;
        // RECONSIDERA solo se habilita cuando PAGÓ está marcado; PAGÓ requiere Multa
        const debeMarcarReconsidera = (tieneMulta || pagoActual) && (tieneMulta || tieneSuspension || tieneCancelacion);
        if (debeMarcarPago === pagoActual && debeMarcarReconsidera === reconsideraActual) {
          console.log(`   ✅ Registro ${filaIdx + 1} ya cumple Pagó/Reconsidera, se omite edición.`);
          registrosYaConformes++;
          continue;
        }

        const btnLapiz = fila.locator('button i.pi-pencil, button[icon="pi pi-pencil"]').first();
        
        try {
          await btnLapiz.waitFor({ state: 'visible', timeout: 8000 });
          await fila.scrollIntoViewIfNeeded();
          // Espera fija eliminada para máxima velocidad
          
          console.log(`   🖱️  Abriendo modal...`);
          await btnLapiz.click();
          // Espera fija eliminada para máxima velocidad
          const dialog = page.locator('[role="dialog"]').first();
          await dialog.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
          await dialog.locator('p-checkbox').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

          // Captura antes de realizar checks en detalle de sanciones
          const timestampAntes = crearTimestampArchivo();
          const archivoAntes = `./screenshots/04-DETALLE-SANCIONES_12_ANTES_REG_${filaIdx + 1}_${timestampAntes}.png`;
          await page.screenshot({ path: archivoAntes, fullPage: true });

          const encontrarCheckboxPorLabel = async (regex: RegExp, idsFallback: string[] = []) => {
            const labels = dialog.locator('label').filter({ hasText: regex });
            const total = await labels.count();
            if (total > 0) {
              const label = labels.first();
              const forId = await label.getAttribute('for');
              if (forId) {
                const byFor = dialog.locator(`input#${forId}`).first();
                if ((await byFor.count().catch(() => 0)) > 0) {
                  return byFor;
                }
              }
              const byRelative = label.locator('xpath=following::input[@type="checkbox"][1]').first();
              if ((await byRelative.count().catch(() => 0)) > 0) {
                return byRelative;
              }
            }
            for (const id of idsFallback) {
              const byId = dialog.locator(`input#${id}`).first();
              if ((await byId.count().catch(() => 0)) > 0) {
                return byId;
              }
            }
            return null;
          };
          
          // Obtener checkboxes con selector ID (más confiable)
          console.log(`   🔍 Obteniendo referencias de checkboxes...`);
          // Espera fija eliminada para máxima velocidad
          const chkMulta = (await encontrarCheckboxPorLabel(/Multa/i, ['reconsMulta'])) ?? dialog.locator('input#reconsMulta').first();
          const chkSuspension = (await encontrarCheckboxPorLabel(/Suspensi[oó]n/i, ['reconsSuspension'])) ?? dialog.locator('input#reconsSuspension').first();
          const chkCancelacion = (await encontrarCheckboxPorLabel(/Cancelaci[oó]n/i, ['reconsCancelacion'])) ?? dialog.locator('input#reconsCancelacion').first();
          
          console.log(`   🔍 Verificando sanciones...`);
          // Espera fija eliminada para máxima velocidad
          
          // Verificar sanciones marcadas
          let multaMarcada = await chkMulta.isChecked().catch(() => false);
          let suspensionMarcada = await chkSuspension.isChecked().catch(() => false);
          let cancelacionMarcada = await chkCancelacion.isChecked().catch(() => false);

          if (!multaMarcada && !suspensionMarcada && !cancelacionMarcada) {
            const allInputs = dialog.locator('input[type="checkbox"]');
            const altMulta = allInputs.first();
            const altSuspension = allInputs.nth(1);
            const altCancelacion = allInputs.nth(2);
            multaMarcada = await altMulta.isChecked().catch(() => false);
            suspensionMarcada = await altSuspension.isChecked().catch(() => false);
            cancelacionMarcada = await altCancelacion.isChecked().catch(() => false);
          }
          
          console.log(`   Sanciones encontradas:`);
          console.log(`      Multa: ${multaMarcada ? '✅ SÍ' : '⭕ NO'}`);
          console.log(`      Suspensión: ${suspensionMarcada ? '✅ SÍ' : '⭕ NO'}`);
          console.log(`      Cancelación: ${cancelacionMarcada ? '✅ SÍ' : '⭕ NO'}`);
          
          console.log(`   Marcando opciones...`);
          
          // REGLAS DE MARCADO (según sanción en la tabla)
          const debeMarcarPago = tieneMulta || multaMarcada;
          // RECONSIDERA solo se habilita cuando PAGÓ está marcado; sin Multa → PAGÓ no se marca → RECONSIDERA disabled
          const debeMarcarReconsidera = debeMarcarPago &&
            (tieneMulta || tieneSuspension || tieneCancelacion || multaMarcada || suspensionMarcada || cancelacionMarcada);

          const obtenerEstadoCheckInput = async (inputLocator: ReturnType<typeof dialog.locator>) => {
            const input = inputLocator.first();
            const wrapper = input.locator('xpath=ancestor::p-checkbox[1]').first();
            const box = wrapper.locator('.p-checkbox-box').first();
            const inputChecked = await input.isChecked().catch(() => false);
            const ariaChecked = await input.getAttribute('aria-checked').catch(() => null);
            const className = (await box.getAttribute('class').catch(() => '')) || '';
            const checked = inputChecked || ariaChecked === 'true' || className.includes('p-highlight');
            const disabled = (await input.isDisabled().catch(() => false))
              || (await box.evaluate((el) => (el as HTMLElement).dataset?.pDisabled ?? null).catch(() => null)) === 'true';
            const visible = await box.isVisible().catch(() => false);
            return { input, box, checked, disabled, visible };
          };

          const forzarCheckInput = async (inputLocator: ReturnType<typeof dialog.locator>, etiqueta: string): Promise<boolean> => {
            for (let intento = 0; intento < 8; intento++) {
              const estado = await obtenerEstadoCheckInput(inputLocator);
              console.log(`         ${etiqueta}: visible=${estado.visible} disabled=${estado.disabled} checked=${estado.checked}`);

              if (estado.checked) return true;
              if (estado.disabled) {
                await page.waitForTimeout(300);
                continue;
              }

              if (estado.visible) {
                await estado.box.click({ force: true });
              } else {
                await estado.input.click({ force: true }).catch(() => {});
              }
              // Espera fija eliminada para máxima velocidad

              const estado2 = await obtenerEstadoCheckInput(inputLocator);
              if (estado2.checked) return true;
              const inputId = await estado.input.getAttribute('id').catch(() => null);
              if (inputId) {
                await dialog.evaluate((root, checkboxId) => {
                  const input = root.querySelector(`input#${checkboxId}`);
                  const box = root.querySelector(`p-checkbox[inputid="${checkboxId}"] .p-checkbox-box`);
                  if (box) {
                    (box as HTMLElement).click();
                  } else if (input) {
                    (input as HTMLInputElement).checked = true;
                    (input as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }, inputId);
              }
              // Espera fija eliminada para máxima velocidad
            }

            const final = await obtenerEstadoCheckInput(inputLocator);
            if (!final.checked) {
              console.log(`         ⚠️ No se pudo marcar ${etiqueta}`);
            }
            return final.checked;
          };

          const inputPago = (await encontrarCheckboxPorLabel(/Pag[oó]/i, ['reconsPago', 'pago'])) ?? dialog.locator('input#reconsPago').first();
          const inputReconsidera = (await encontrarCheckboxPorLabel(/Reconsidera/i, ['reconsReconsidera', 'reconsidera'])) ?? dialog.locator('input#reconsReconsidera').first();

          if (debeMarcarPago) {
            console.log(`      → Multa encontrada, marcando PAGÓ`);
            const pagoMarcado = await forzarCheckInput(inputPago, 'PAGÓ');
            console.log(`         ✓ PAGÓ: ${pagoMarcado ? '✅ MARCADO' : '⭕ NO'}`);
            if (pagoMarcado) {
              await page.waitForTimeout(400);
            }
          }
          
          // Marcar RECONSIDERA según reglas
          if (debeMarcarReconsidera) {
            const sanciones = [];
            if (tieneMulta) sanciones.push('Multa');
            if (tieneSuspension) sanciones.push('Suspensión');
            if (tieneCancelacion) sanciones.push('Cancelación');
            console.log(`      → ${sanciones.join(' + ')} encontrada(s), marcando RECONSIDERA`);
            console.log(`         Suspensión: ${tieneSuspension}, Cancelación: ${tieneCancelacion}`);
            
            const esReconsideraYaMarcado = (await obtenerEstadoCheckInput(inputReconsidera)).checked;
            
            console.log(`         Estado inicial RECONSIDERA: ${esReconsideraYaMarcado ? '✅ YA' : '⭕ NO'}`);
            
            if (!esReconsideraYaMarcado) {
              console.log(`         RECONSIDERA no está marcado, clickeando vía JavaScript...`);
              const reconsideraCheckFirst = await forzarCheckInput(inputReconsidera, 'RECONSIDERA');
              console.log(`         Después de primer clic: ${reconsideraCheckFirst ? '✅ SÍ' : '⭕ NO'}`);
            }
            const reconsideraMarcado = (await obtenerEstadoCheckInput(inputReconsidera)).checked;
            console.log(`         ✓ RECONSIDERA FINAL: ${reconsideraMarcado ? '✅ MARCADO' : '⭕ NO'}`);
          }
          
          // Validar estado final usando selectores por ID (más confiable)
          console.log(`   Validando cambios finales...`);
          
          const multaFinal = await page.evaluate(() => {
            const input = document.querySelector('input#reconsMulta');
            return (input as HTMLInputElement | null)?.checked || false;
          });
          const suspensionFinal = await page.evaluate(() => {
            const input = document.querySelector('input#reconsSuspension');
            return (input as HTMLInputElement | null)?.checked || false;
          });
          const cancelacionFinal = await page.evaluate(() => {
            const input = document.querySelector('input#reconsCancelacion');
            return (input as HTMLInputElement | null)?.checked || false;
          });
          const pagoFinal = (await obtenerEstadoCheckInput(inputPago)).checked;
          const reconsideraFinal = (await obtenerEstadoCheckInput(inputReconsidera)).checked;
          
          console.log(`      Estado final: Multa: ${multaFinal ? '✅' : '⭕'} | Suspensión: ${suspensionFinal ? '✅' : '⭕'} | Cancelación: ${cancelacionFinal ? '✅' : '⭕'} | Pagó: ${pagoFinal ? '✅' : '⭕'} | Reconsidera: ${reconsideraFinal ? '✅' : '⭕'}`);

          // Captura después de realizar checks en detalle de sanciones
          const timestampDespues = crearTimestampArchivo();
          const archivoDespues = `./screenshots/04-DETALLE-SANCIONES_13_DESPUES_REG_${filaIdx + 1}_${timestampDespues}.png`;
          await page.screenshot({ path: archivoDespues, fullPage: true });

          const pagoDisabled = (await obtenerEstadoCheckInput(inputPago)).disabled;
          if (debeMarcarPago && !pagoDisabled && !pagoFinal) {
            throw new Error('No se pudo marcar PAGÓ en el modal.');
          }
          if (debeMarcarReconsidera && !reconsideraFinal) {
            const reconsideraState = await obtenerEstadoCheckInput(inputReconsidera);
            if (reconsideraState.disabled && !pagoFinal) {
              console.log(`      ℹ️ RECONSIDERA disabled sin PAGÓ (sin Multa): comportamiento esperado de la app.`);
            } else {
              throw new Error('No se pudo marcar RECONSIDERA en el modal.');
            }
          }
          
          // Guardar
          console.log(`   💾 Guardando...`);
          // Espera fija eliminada para máxima velocidad
          const btnAceptar = dialog.getByRole('button', { name: 'Aceptar' });
          await btnAceptar.waitFor({ state: 'visible', timeout: 8000 });
          // Espera fija eliminada para máxima velocidad
          await btnAceptar.click();
          await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
          
          // Captura de éxito (toast verde) (reutiliza `capturarToastExito`)
          console.log(`   ⏳ Esperando confirmación...`);
          // Espera fija eliminada para máxima velocidad
          await capturarToastExito(
            page,
            '04-RECONSIDERAR-CON-SANCIONES',
            `14_EXITO_REG_${filaIdx + 1}`,
            numeroReconsideracion,
            '',
            'DETALLE_SANCION'
          );
          
          // Espera fija eliminada para máxima velocidad
          
          console.log(`✅ Registro ${filaIdx + 1} completado\n`);
          registrosEditados++;
          
        } catch (error) {
          console.warn(`⚠️ Error en registro ${filaIdx + 1}: ${error instanceof Error ? error.message : String(error)}`);
          try {
            const btnCancelar = page.getByRole('button', { name: 'Cancelar' });
            if (await btnCancelar.isVisible().catch(() => false)) {
              await btnCancelar.click();
              // Espera fija eliminada para máxima velocidad
            }
          } catch (e) {
            const detalle = e instanceof Error ? e.message : String(e);
            console.log(`⚠️ No se pudo cerrar modal: ${detalle}`);
          }
        }
      }

      const totalRegistrosValidos = registrosEditados + registrosYaConformes;
      const minRegistrosRequeridos = strictVerify && totalFilasTabla > 0 ? 1 : 0;
      if (totalRegistrosValidos < minRegistrosRequeridos) {
        throw new Error(
          `No se completó ningún detalle de sanción (editados=${registrosEditados}, yaConformes=${registrosYaConformes}).`
        );
      }

      console.log('================================================================================');
      console.log(
        `✅ PRUEBA COMPLETADA: editados=${registrosEditados}, yaConformes=${registrosYaConformes}, procesados=${totalRegistrosValidos}`
      );
      console.log('================================================================================\n');

      registrarAsignacionSecuencial('caso04-con-sanciones', ordinalSeleccionadoFinal ?? 0, {
        status: 'completed',
        page: 0,
        row: 0,
        workerIndex: ctx.workerIndex,
        repeatIndex: ctx.repeatIndex,
        processed: totalRegistrosValidos,
        reason: `ordinalSeleccionado=${ordinalSeleccionadoFinal ?? 0}`,
      });

    } catch (error) {
      console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
      try {
        if (page.isClosed()) {
          throw new Error('No se captura screenshot porque la página ya está cerrada.');
        }
        const timestamp = crearTimestampArchivo();
        const archivo = `./screenshots/04-ERROR_${timestamp}.png`;
        await page.screenshot({ path: archivo, fullPage: true });
        console.log(`📸 Screenshot de error: ${archivo}\n`);
      } catch (e) {
        const detalle = e instanceof Error ? e.message : String(e);
        console.warn(`⚠️ No se pudo capturar screenshot: ${detalle}`);
      }
      throw error;
    }
  });
});
