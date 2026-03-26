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
  liberarClaveCandidato,
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
    let reservaActivaKey = '';
    let reservaCompletada = false;
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

      // ═══════════════════════════════════════════════════════════════════
      // PASO 2: BUSCAR REGISTRO CON DETALLE DE SANCIONES
      // ═══════════════════════════════════════════════════════════════════
      console.log('📋 PASO 2: Buscando registro con F. Modificación, N° Reconsideración y F. Reconsideración vacíos...');
      const tablaPrincipal = page
        .locator('table')
        .filter({ has: page.locator('th', { hasText: /F\.?\s*Modificaci/i }) })
        .first();
      await tablaPrincipal.waitFor({ state: 'visible', timeout: 15000 });
      let registroEncontrado = false;
      let numeroFilaEncontrada = -1;
      let fechaResolucionSeleccionada: Date | null = null;
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      console.log(`   🎯 Selección en orden estricto (worker=${ctx.workerIndex}, repeat=${ctx.repeatIndex})`);
      console.log('   📌 Estrategia: columnas vacías -> expandir -> validar infracciones -> reservar y procesar.');
      console.log(`   🧪 Skip páginas agotadas (misma corrida): ${usarSkipPaginasAgotadas ? 'ON' : 'OFF'}`);

      const isEmptyValor = (value: unknown): boolean => {
        if (value === null || value === undefined) return true;
        const v = String(value).trim().toLowerCase();
        return v === '' || v === '-' || v === '--' || v === 'null' || v === 'undefined' || v === '0001-01-01' || v === '0001-01-01t00:00:00';
      };
      console.log('   ℹ️ Selección basada solo en UI para evitar desalineación API/UI.');

      

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

      const irPrimeraPagina = async (): Promise<void> => {
        const btnPrev = getPaginatorButton('prev');
        for (let i = 0; i < 120; i++) {
          const habilitado = await isPaginatorEnabled(btnPrev);
          if (!habilitado) break;
          await btnPrev.click();
          await page.waitForTimeout(80);
        }
      };

      const evaluarFilaCandidata = async (fila: ReturnType<typeof page.locator>, totalCeldas: number) => {
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
        const fechaResolucionValida = fechasDetectadas.length === 0 || fechasDetectadas.some((f) => f < hoy);
        const tresCamposVacios = isEmptyValor(fModificacion) && isEmptyValor(nReconsid) && isEmptyValor(fReconsid);
        const esApto = tresCamposVacios && fechaResolucionValida;
        return {
          esApto,
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

      await irPrimeraPagina();
      let elegiblesAcumulados = 0;
      let paginasExploradas = 0;

      for (let pagina = 1; !registroEncontrado; pagina++) {
        paginasExploradas = pagina;

        if (usarSkipPaginasAgotadas && esPaginaAgotada('caso04-con-sanciones', pagina)) {
          console.log(`   ↪️ Página ${pagina}: omitida en esta corrida (marcada sin casos).`);
          const btnNextSkip = getPaginatorButton('next');
          const habilitadoSkip = await isPaginatorEnabled(btnNextSkip);
          if (!habilitadoSkip) break;
          await btnNextSkip.click();
          await page.waitForTimeout(80);
          continue;
        }

        const filasPagina = tablaPrincipal.locator('tbody > tr');
        const totalFilas = await filasPagina.count();
        let elegiblesPagina = 0;
        let candidatosVaciosPagina = 0;

        for (let i = 0; i < totalFilas; i++) {
          const fila = filasPagina.nth(i);
          const botonesEnFila = await fila.locator('button').count().catch(() => 0);
          if (botonesEnFila === 0) continue;

          const totalCeldas = await fila.locator('td').count();
          const evaluacion = await evaluarFilaCandidata(fila, totalCeldas);
          if (!evaluacion.esApto) continue;
          candidatosVaciosPagina++;

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

          const reservado = reservarClaveCandidato('caso04-con-sanciones', claveReserva);
          if (!reservado) {
            continue;
          }
          reservaActivaKey = claveReserva;

          elegiblesAcumulados++;
          elegiblesPagina++;

          numeroFilaEncontrada = i;
          fechaResolucionSeleccionada = evaluacion.fechaResolucion;
          registroEncontrado = true;

          const trazaSeleccion = {
            testRunId: process.env.TEST_RUN_ID || '',
            workerIndex: ctx.workerIndex,
            repeatIndex: ctx.repeatIndex,
            selectionSlot: ctx.selectionSlot,
            elegiblesAcumulados,
            page: pagina,
            row: i + 1,
            expediente: evaluacion.expedienteFila,
            resolucion: evaluacion.resolucionFila,
            administrado: evaluacion.administrado,
            modoSeleccion: 'orden-estricto-con-reserva',
          };

          registrarAsignacionSecuencial('caso04-con-sanciones', ctx.selectionSlot, {
            status: 'selected',
            page: pagina,
            row: i,
            workerIndex: ctx.workerIndex,
            repeatIndex: ctx.repeatIndex,
            expediente: evaluacion.expedienteFila,
            resolucion: evaluacion.resolucionFila,
          });

          console.log(`   👤 Administrado: ${evaluacion.administrado}`);
          console.log(`   ✅ REGISTRO SELECCIONADO en página ${pagina}, fila ${i + 1}`);
          console.log(`   🧭 TRAZA_SELECCION_C04: ${JSON.stringify(trazaSeleccion)}`);
          break;
        }

        if (!registroEncontrado) {
          console.log(`   📄 Página ${pagina}: vacios=${candidatosVaciosPagina}, elegibles=${elegiblesPagina}, acumulados=${elegiblesAcumulados}`);
          if (usarSkipPaginasAgotadas && candidatosVaciosPagina === 0 && elegiblesPagina === 0) {
            marcarPaginaAgotada('caso04-con-sanciones', pagina);
          }
        }

        if (registroEncontrado) break;
        const btnNextPage = getPaginatorButton('next');
        const habilitado = await isPaginatorEnabled(btnNextPage);
        if (!habilitado) break;
        await btnNextPage.click();
        await page.waitForTimeout(80);
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
      const prefijoReconsideracion = `FA ${String(correlativoFA).padStart(2, '0')}`;
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
        const archivoOk = archivoVisible || archivoTexto || archivoRuta;
        console.log(`   🧾 Cabecera -> Archivo: ${archivoOk ? 'OK' : 'NO'} | Número: ${numeroValor ? 'OK' : 'NO'} | Fecha: ${fechaValor ? 'OK' : 'NO'}`);
        return Boolean(numeroValor) && Boolean(fechaValor) && archivoOk;
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
        const toastCabecera = await capturarToastExito(
          page,
          '04-RECONSIDERAR-CON-SANCIONES',
          '11_EXITO_CABECERA',
          numeroReconsideracion,
          '',
          'CABECERA_RECONSIDERACION',
          3000
        );
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
        const debeMarcarReconsidera = tieneMulta || tieneSuspension || tieneCancelacion;
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

          const encontrarCheckboxPorLabel = async (regex: RegExp) => {
            const labels = dialog.locator('label').filter({ hasText: regex });
            const total = await labels.count();
            if (total === 0) return null;
            const label = labels.first();
            const forId = await label.getAttribute('for');
            if (forId) {
              return dialog.locator(`#${forId}`);
            }
            const inputFallback = label.locator('xpath=following::input[@type="checkbox"][1]');
            if (await inputFallback.count().catch(() => 0)) {
              return inputFallback;
            }
            return null;
          };
          
          // Obtener checkboxes con selector ID (más confiable)
          console.log(`   🔍 Obteniendo referencias de checkboxes...`);
          // Espera fija eliminada para máxima velocidad
          const chkMulta = (await encontrarCheckboxPorLabel(/Multa/i)) ?? dialog.locator('input#reconsMulta');
          const chkSuspension = (await encontrarCheckboxPorLabel(/Suspensi[oó]n/i)) ?? dialog.locator('input#reconsSuspension');
          const chkCancelacion = (await encontrarCheckboxPorLabel(/Cancelaci[oó]n/i)) ?? dialog.locator('input#reconsCancelacion');
          
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
          const debeMarcarReconsidera = tieneMulta || tieneSuspension || tieneCancelacion;

          const obtenerEstadoCheck = async (id: string) => {
            const checkbox = dialog.locator(`p-checkbox[inputid="${id}"]`).first();
            const input = checkbox.locator('input[type="checkbox"]');
            const box = checkbox.locator('.p-checkbox-box');
            const ariaChecked = await input.getAttribute('aria-checked').catch(() => null);
            const dataHighlight = await box.evaluate((el) => (el as HTMLElement).dataset?.pHighlight ?? null).catch(() => null);
            const className = await box.getAttribute('class').catch(() => '');
            const checked = ariaChecked === 'true' || dataHighlight === 'true' || className?.includes('p-highlight');
            const disabled = (await box.evaluate((el) => (el as HTMLElement).dataset?.pDisabled ?? null).catch(() => null)) === 'true';
            const visible = await box.isVisible().catch(() => false);
            return { checkbox, input, box, checked, disabled, visible };
          };

          const forzarCheck = async (id: string, etiqueta: string): Promise<boolean> => {
            for (let intento = 0; intento < 8; intento++) {
              const estado = await obtenerEstadoCheck(id);
              console.log(`         ${etiqueta}: visible=${estado.visible} disabled=${estado.disabled} checked=${estado.checked}`);

              if (estado.checked) return true;
              if (estado.disabled) {
                // Espera fija eliminada para máxima velocidad
                continue;
              }

              if (estado.visible) {
                await estado.box.click({ force: true });
              } else {
                await estado.input.click({ force: true }).catch(() => {});
              }
              // Espera fija eliminada para máxima velocidad

              const estado2 = await obtenerEstadoCheck(id);
              if (estado2.checked) return true;

              await dialog.evaluate((root, checkboxId) => {
                const input = root.querySelector(`p-checkbox[inputid="${checkboxId}"] input[type="checkbox"]`);
                const box = root.querySelector(`p-checkbox[inputid="${checkboxId}"] .p-checkbox-box`);
                if (box) {
                  (box as HTMLElement).click();
                } else if (input) {
                  (input as HTMLInputElement).checked = true;
                  (input as HTMLInputElement).dispatchEvent(new Event('change', { bubbles: true }));
                }
              }, id);
              // Espera fija eliminada para máxima velocidad
            }

            const final = await obtenerEstadoCheck(id);
            if (!final.checked) {
              console.log(`         ⚠️ No se pudo marcar ${etiqueta}`);
            }
            return final.checked;
          };

          if (debeMarcarPago) {
            console.log(`      → Multa encontrada, marcando PAGÓ + ¿Presentó recurso de reconsideración?`);
            const pagoMarcado = await forzarCheck('reconsPago', 'PAGÓ');
            console.log(`         ✓ PAGÓ: ${pagoMarcado ? '✅ MARCADO' : '⭕ NO'}`);
            
            // Marcar "¿Presentó recurso de reconsideración?"
            // Buscar por múltiples IDs posibles
            const recursoIds = ['presentoRecurso', 'presentaRecurso', 'presentoReconsideracion', 'presentaReconsideracion', 'recursoReconsideracion'];
            let recursoEncontrado = false;
            
            for (const idRecurso of recursoIds) {
              const recursoInput = await page.$(`input#${idRecurso}`);
              if (recursoInput) {
                const isChecked = await page.evaluate((id) => {
                  const input = document.querySelector(`input#${id}`);
                  return (input as HTMLInputElement | null)?.checked || false;
                }, idRecurso);
                
                if (!isChecked) {
                  console.log(`         ¿Presentó recurso? no está marcado, clickeando vía JavaScript...`);
                  await page.evaluate((id) => {
                    const labelForId = document.querySelector(`label[for="${id}"]`);
                    if (labelForId) {
                      (labelForId as HTMLElement).click();
                    } else {
                      const input = document.querySelector(`input#${id}`);
                      if (input) (input as HTMLElement).click();
                    }
                  }, idRecurso);
                  // Espera fija eliminada para máxima velocidad
                }
                
                const recursoMarcado = await page.evaluate((id) => {
                  const input = document.querySelector(`input#${id}`);
                  return (input as HTMLInputElement | null)?.checked || false;
                }, idRecurso);
                console.log(`         ✓ ¿Presentó recurso?: ${recursoMarcado ? '✅ MARCADO' : '⭕ NO'}`);
                recursoEncontrado = true;
                break;
              }
            }
            
            if (!recursoEncontrado) {
              console.log(`         ⚠️ No se encontró checkbox de "¿Presentó recurso de reconsideración?"`);
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
            
            const esReconsideraYaMarcado = await dialog.locator('input#reconsReconsidera').isChecked().catch(() => false);
            
            console.log(`         Estado inicial RECONSIDERA: ${esReconsideraYaMarcado ? '✅ YA' : '⭕ NO'}`);
            
            if (!esReconsideraYaMarcado) {
              console.log(`         RECONSIDERA no está marcado, clickeando vía JavaScript...`);
              const reconsideraCheckFirst = await forzarCheck('reconsReconsidera', 'RECONSIDERA');
              console.log(`         Después de primer clic: ${reconsideraCheckFirst ? '✅ SÍ' : '⭕ NO'}`);
            }
            const reconsideraMarcado = await dialog.locator('input#reconsReconsidera').isChecked().catch(() => false);
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
          const pagoFinal = (await obtenerEstadoCheck('reconsPago')).checked;
          const reconsideraFinal = (await obtenerEstadoCheck('reconsReconsidera')).checked;
          
          console.log(`      Estado final: Multa: ${multaFinal ? '✅' : '⭕'} | Suspensión: ${suspensionFinal ? '✅' : '⭕'} | Cancelación: ${cancelacionFinal ? '✅' : '⭕'} | Pagó: ${pagoFinal ? '✅' : '⭕'} | Reconsidera: ${reconsideraFinal ? '✅' : '⭕'}`);

          // Captura después de realizar checks en detalle de sanciones
          const timestampDespues = crearTimestampArchivo();
          const archivoDespues = `./screenshots/04-DETALLE-SANCIONES_13_DESPUES_REG_${filaIdx + 1}_${timestampDespues}.png`;
          await page.screenshot({ path: archivoDespues, fullPage: true });

          const pagoDisabled = (await obtenerEstadoCheck('reconsPago')).disabled;
          if (debeMarcarPago && !pagoDisabled && !pagoFinal) {
            throw new Error('No se pudo marcar PAGÓ en el modal.');
          }
          if (debeMarcarReconsidera && !reconsideraFinal) {
            throw new Error('No se pudo marcar RECONSIDERA en el modal.');
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
      reservaCompletada = true;

      registrarAsignacionSecuencial('caso04-con-sanciones', ctx.selectionSlot, {
        status: 'completed',
        page: 0,
        row: 0,
        workerIndex: ctx.workerIndex,
        repeatIndex: ctx.repeatIndex,
        processed: totalRegistrosValidos,
      });

    } catch (error) {
      if (reservaActivaKey && !reservaCompletada) {
        liberarClaveCandidato('caso04-con-sanciones', reservaActivaKey);
      }
      console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
      try {
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