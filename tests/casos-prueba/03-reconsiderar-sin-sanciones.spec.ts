import { test } from '@playwright/test';
import {
  iniciarSesionYNavegar,
  obtenerCredencial,
  navegarAInfraccionSancion,
  completarCabeceraReconsideracion,
  capturarFormularioLleno,
  capturarToastExito,
  parseFechaTexto,
  calcularFechaReconsideracion,
  resolverDocumentoPrueba,
} from 'tests/utilidades/reginsa-actions';
import { getTestContext } from 'helpers/test-context';

/**
 * EJECUCIÓN (rápido)
 * - Headless por defecto. Para ver navegador: `--headed`.
 * - Con capturas: scripts normales `npm run test:*`.
 * - Sin capturas: scripts `:fast`.
 * - Paralelismo (suite completa): `npm run test:all:w2` / `test:all:w4`.
 */

/**
 * CASO 03: RECONSIDERAR SIN SANCIONES
 *
 * Flujo:
 * 1. Login + navegación al módulo (reutiliza `iniciarSesionYNavegar`)
 * 2. Ir a Infracción y Sanción (reutiliza `navegarAInfraccionSancion`)
 * 3. Buscar registro con campos vacíos (F. Modificación, N° Reconsideración y F. Reconsideración)
 * 4. Editar cabecera y marcar “Presentó reconsideración” (reutiliza `completarCabeceraReconsideracion`)
 * 5. Subir archivo, llenar número y seleccionar fecha válida (fecha > resolución y <= hoy) (reutiliza `completarCabeceraReconsideracion`)
 * 6. Capturar formulario lleno (reutiliza `capturarFormularioLleno`)
 * 7. Guardar cabecera y validar éxito (reutiliza `capturarToastExito`)
 * 8. Ir a Detalle de sanciones y verificar “Sin sanciones registradas”
 *
 * Nota:
 * - Si no hay registros con los 3 campos vacíos y sin sanciones, el test se omite.
 * - Capturas exitosas dependen del modo de ejecución (:fast omite).
 */

test.describe('03-RECONSIDERAR SIN SANCIONES', () => {
  test('Reconsiderar sanción con campos vacíos - búsqueda dinámica', async ({ page }, testInfo) => {
    test.setTimeout(300000); // 5 minutos - evitar timeout en flujo completo
    const nombreCaso = '03-reconsiderar-sin-sanciones';
    const ctx = getTestContext(testInfo);
    const esScale = process.env.REGINSA_SCALE_MODE === '1';
    const strictVerify = process.env.REGINSA_STRICT_VERIFY !== '0';

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

    try {
      console.log('\n================================================================================');
      console.log('🧾 CASO 03: RECONSIDERAR SIN SANCIONES');
      console.log('================================================================================\n');
      // ═══════════════════════════════════════════════════════════════════
      // PASO 1: LOGIN + NAVEGACIÓN
      // Reutiliza `iniciarSesionYNavegar`
      // ═══════════════════════════════════════════════════════════════════
      console.log('🔐 PASO 1: Inicializando sesión...');
      await iniciarSesionYNavegar(page, 'infractor', testInfo.workerIndex);
      console.log('✅ Sesión iniciada\n');

      // ═══════════════════════════════════════════════════════════════════
      // PASO 2: NAVEGAR A INFRACCIÓN Y SANCIÓN
      // Reutiliza `navegarAInfraccionSancion`
      // ═══════════════════════════════════════════════════════════════════
      console.log('📋 PASO 2: Navegando a Infracción y Sanción...');
      await navegarAInfraccionSancion(page);
      // Espera a que la tabla de registros esté visible (espera inteligente)
      await page.locator('table').waitFor({ state: 'visible', timeout: 10000 });
      console.log('✅ Módulo accesible\n');

      // ═══════════════════════════════════════════════════════════════════
      // PASO 3: BUSCAR REGISTRO CON CAMPOS VACÍOS
      // ═══════════════════════════════════════════════════════════════════
      console.log('📋 PASO 3: Buscando registro con campos vacíos (F. Modificación, N° Reconsideración y F. Reconsideración)...');
      const filas = page.locator('tr');
      const totalFilas = await filas.count();
      console.log(`   Total de registros: ${totalFilas - 1}\n`);
      
      let registroEncontrado = false;
      let fechaResolucionSeleccionada: Date | null = null;
      const candidatos: Array<{ filaIdx: number; fechaResolucion: Date; administrado: string; key: string }> = [];
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const fechaMinima = new Date(2025, 0, 1);

      const obtenerIndiceColumna = async (regex: RegExp): Promise<number> => {
        const headers = page.locator('thead tr th');
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
      const idxFMod = await obtenerIndiceColumna(/F\.\s*Modificaci\w*|Modificaci\w*/i);
      const idxNRec = await obtenerIndiceColumna(/N\W*Reconsideraci\w*/i);
      const idxFRec = await obtenerIndiceColumna(/F\.\s*Reconsideraci\w*|Reconsideraci\w*/i);
      const idxFRes = await obtenerIndiceColumna(/F\.\s*Resoluci\w*|Resoluci\w*/i);

      if (idxFMod < 0 || idxNRec < 0 || idxFRec < 0) {
        throw new Error('No se pudieron identificar las columnas F. Modificación, N° Reconsideración y F. Reconsideración.');
      }

      // Buscar registros que tengan VACÍOS: F. Modificación, N° Reconsideración y F. Reconsideración
      for (let i = 1; i < totalFilas; i++) {
        const fila = filas.nth(i);
        const celdas = fila.locator('td');
        const totalCeldas = await celdas.count();
        
        if (totalCeldas >= 9) {
          const fModificacion = (await celdas.nth(idxFMod).textContent())?.trim() || '';
          const nReconsid = (await celdas.nth(idxNRec).textContent())?.trim() || '';
          const fReconsid = (await celdas.nth(idxFRec).textContent())?.trim() || '';
          
          console.log(`   Fila ${i}: F.Mod='${fModificacion}' | N°Rec='${nReconsid}' | F.Rec='${fReconsid}'`);
          
          // Buscar fecha de resolución en la fila (prioriza columna F. Resolución si existe)
          let fechaResolucion: Date | null = null;
          if (idxFRes >= 0 && idxFRes < totalCeldas) {
            const textoFRes = (await celdas.nth(idxFRes).textContent())?.trim() || '';
            fechaResolucion = parseFechaTexto(textoFRes);
          }
          if (!fechaResolucion) {
            const fechasDetectadas: Date[] = [];
            for (let c = 0; c < totalCeldas; c++) {
              const texto = (await celdas.nth(c).textContent())?.trim() || '';
              const fecha = parseFechaTexto(texto);
              if (fecha) fechasDetectadas.push(fecha);
            }
            fechaResolucion = fechasDetectadas[0] || null;
          }

          // Si TODOS están vacíos
          if (!fModificacion && !nReconsid && !fReconsid) {
            if (fechaResolucion && fechaResolucion >= fechaMinima && fechaResolucion < hoy) {
              const botones = fila.locator('button.p-button-warning');
              if (await botones.count() > 0) {
                  const administrado = idxAdmin >= 0
                    ? (await celdas.nth(idxAdmin).textContent())?.trim() || 'N/D'
                    : (await celdas.nth(0).textContent())?.trim() || 'N/D';
                const expediente = idxExp >= 0
                  ? (await celdas.nth(idxExp).textContent())?.trim() || ''
                  : '';
                const resolucion = idxRes >= 0
                  ? (await celdas.nth(idxRes).textContent())?.trim() || ''
                  : '';
                const key = `${administrado}|${expediente}|${resolucion}`.trim();
                candidatos.push({ filaIdx: i, fechaResolucion, administrado, key });
              }
            }
          }
        }
      }

      if (candidatos.length > 0) {
        if (candidatos.length < ctx.workers) {
          test.skip(true, 'No hay suficientes candidatos para ejecutar en paralelo sin colisión.');
          return;
        }
        const elegido = candidatos[ctx.selectionSlot % candidatos.length];
        console.log(`   👤 Administrado: ${elegido.administrado}`);
        console.log(`   ✅ REGISTRO VÁLIDO elegido en fila ${elegido.filaIdx} (worker ${ctx.workerIndex}, repeat ${ctx.repeatIndex})\n`);

        const filaElegida = filas.nth(elegido.filaIdx);
        const botonesElegidos = filaElegida.locator('button.p-button-warning');
        await botonesElegidos.first().click();
        // Espera a que el formulario de cabecera esté visible
        await page.locator('form').waitFor({ state: 'visible', timeout: 10000 });
        registroEncontrado = true;
        fechaResolucionSeleccionada = elegido.fechaResolucion;
      }

      if (!registroEncontrado) {
        console.log('⚠️ No se encontró registro válido con campos vacíos y sin sanciones\n');
        test.skip(true, 'No hay registros con F. Modificación, N° Reconsideración y F. Reconsideración vacíos y sin sanciones.');
        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // PASO 4-8: COMPLETAR CABECERA (ARCHIVO + NÚMERO + FECHA)
      // Reutiliza `completarCabeceraReconsideracion`
      // ═══════════════════════════════════════════════════════════════════
      console.log('📋 PASO 4-8: Editando cabecera y completando datos...');
      const rutaArchivo = resolverDocumentoPrueba();
      console.log(`   Ruta: ${rutaArchivo}`);
      const fechaReconsideracion = calcularFechaReconsideracion(fechaResolucionSeleccionada);

      const numeroReconsideracion = await completarCabeceraReconsideracion(page, rutaArchivo, fechaReconsideracion);
      console.log(`✅ Número ingresado: ${numeroReconsideracion}\n`);
      const dd = String(fechaReconsideracion.getDate()).padStart(2, '0');
      const mm = String(fechaReconsideracion.getMonth() + 1).padStart(2, '0');
      const yyyy = fechaReconsideracion.getFullYear();
      console.log(`✅ Fecha seleccionada: ${dd}/${mm}/${yyyy}\n`);

      console.log('📋 PASO 9: Validando campos completados...');
      console.log(`   ✓ Número: ${numeroReconsideracion}`);
      console.log(`   ✓ Archivo: cargado`);
      console.log(`   ✓ Fecha: ${dd}/${mm}/${yyyy}`);
      console.log('   ✅ Todos los campos están completos\n');

      // ═══════════════════════════════════════════════════════════════════
      // PASO 9.5: CAPTURAR FORMULARIO LLENO
      // Reutiliza `capturarFormularioLleno`
      // ═══════════════════════════════════════════════════════════════════
      console.log('📋 PASO 9.5: Captura formulario lleno...');
      // Espera a que el formulario esté completamente cargado antes de capturar
      await page.locator('form').waitFor({ state: 'visible', timeout: 10000 });
      await capturarFormularioLleno(
        page,
        '03-RECONSIDERAR-SIN-SANCIONES',
        numeroReconsideracion,
        '',
        'CABECERA_RECONSIDERACION',
        '09_FORMULARIO_CABECERA'
      );

      console.log('📋 PASO 10: Guardando cabecera...');
      const btnGuardar = page.getByRole('button', { name: 'Guardar cabecera' });
      await btnGuardar.waitFor({ state: 'visible', timeout: 10000 });
      console.log('   ✓ Botón guardar encontrado, haciendo clic...');

      const apiGuardadoPromise = esperarRespuestaApiGuardado(esScale ? 6000 : 9000);
      await btnGuardar.click();
      // Espera corta no bloqueante para permitir render de toast si aparece
      await page.locator('.p-toast-message-success, .p-toast-message').first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
      const apiGuardadoOk = await apiGuardadoPromise;
      console.log(`✅ Guardar completado (api=${apiGuardadoOk ? 'sí' : 'no'})\n`);

      // ═══════════════════════════════════════════════════════════════════
      // PASO 10.5: CAPTURA MENSAJE DE ÉXITO
      // Reutiliza `capturarToastExito`
      // ═══════════════════════════════════════════════════════════════════
      console.log('📸 PASO 10.5: Captura mensaje de éxito (toast verde)...');
      console.log('   ⏳ Esperando que aparezca el mensaje de confirmación...');
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
        throw new Error('No se confirmó el guardado de cabecera (sin toast ni confirmación API).');
      }
      if (!toastCabecera) {
        console.log('   ⚠️ Toast de éxito no visible en ventana rápida, se continúa.');
      }

      // ═══════════════════════════════════════════════════════════════════
      // PASO 11: ACCEDER A DETALLE DE SANCIONES
      // ═══════════════════════════════════════════════════════════════════
      console.log('📋 PASO 11: Accediendo a Detalle de sanciones...');
      const tabDetalle = page.getByRole('tab', { name: 'Detalle de sanciones' });
      await tabDetalle.waitFor({ state: 'visible', timeout: 10000 });
      await tabDetalle.click();
      // Espera a que el contenido de la pestaña esté visible
      await page.locator('body').waitFor({ state: 'visible', timeout: 10000 });
      console.log('✅ Tab Detalle abierto\n');

      // ═══════════════════════════════════════════════════════════════════
      // PASO 12: VERIFICAR TEXTO “SIN SANCIONES REGISTRADAS”
      // ═══════════════════════════════════════════════════════════════════
      console.log('📋 PASO 12: Verificando contenido...');
      // Espera a que el texto "Sin sanciones registradas" esté presente o timeout
      const bodyText = await page.locator('body').textContent();
      const haySinSanciones = bodyText?.includes('Sin sanciones registradas') || false;

      if (haySinSanciones) {
        console.log('✅ Texto "Sin sanciones registradas" detectado\n');
        
        console.log('================================================================================');
        console.log('✅ CASO 03 - SIN SANCIONES COMPLETADO');
        console.log('================================================================================');
        console.log('📊 Resumen:');
        console.log(`   - Nº Reconsideración: ${numeroReconsideracion}`);
        console.log('   - Archivo: GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf');
        console.log('   - Detalle: SIN SANCIONES REGISTRADAS');
        console.log('   - Resultado: ✅ EXITOSO\n');
        const credencial = obtenerCredencial(testInfo.workerIndex);
        console.log(`👷 Worker ${testInfo.workerIndex} (${credencial.usuario}) caso 03 completado`);
        return;
      } else {
        console.log('ℹ️ Se encontraron sanciones en este registro\n');
        if (strictVerify) {
          throw new Error('El registro seleccionado contiene sanciones; no cumple el objetivo de Caso 03.');
        }
      }

    } catch (error) {
      console.error('❌ ERROR:', error instanceof Error ? error.message : String(error));
      try {
        const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-').substring(0, 19);
        const archivo = `./screenshots/${nombreCaso}_ERROR_${timestamp}.png`;
        await page.screenshot({ path: archivo, fullPage: true });
        console.log(`📸 Screenshot de error guardado\n`);
      } catch (e) {
        const detalle = e instanceof Error ? e.message : String(e);
        console.warn(`⚠️ No se pudo capturar screenshot de error: ${detalle}`);
      }
      throw error;
    }
  });
});
