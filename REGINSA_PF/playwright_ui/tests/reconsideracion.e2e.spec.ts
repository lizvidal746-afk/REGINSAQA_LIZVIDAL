import { test } from './fixtures/test-base';
import { POManager } from '../POManager';
import { configurarContextoReginsa, ReginsaRunContext } from '../helpers/test-run-metadata';

test.describe('CP-REG-04 - Reconsiderar con sanciones', () => {
  let poManager: POManager;
  let runContext: ReginsaRunContext;

  test.beforeEach(async ({ page }, testInfo) => {
    runContext = await configurarContextoReginsa(page, testInfo, {
      scenario: process.env.SCENARIO || 'SMOKE',
      timeoutJustification: 'Caso 04 edita cabecera existente, marca reconsideracion y valida que el detalle mantenga sanciones.',
    });
    poManager = new POManager(page);
  });

  test('Deberia registrar reconsideracion llenando archivo, numero y fecha', async ({}, testInfo) => {
    test.setTimeout(240000);
    const reconsideracionPage = poManager.getReconsideracionPage();
    const data = reconsideracionPage.generarDatos(runContext.slot, runContext.repeatIndex);

    testInfo.annotations.push({ type: 'flujo', description: 'CP-REG-04 Reconsiderar con sanciones' });
    testInfo.annotations.push({ type: 'camposObligatoriosCondicionales', description: 'Archivo, Numero de Reconsideracion y Fecha de Reconsideracion.' });
    testInfo.annotations.push({ type: 'numeroReconsideracion', description: data.numeroReconsideracion });
    testInfo.annotations.push({ type: 'fechaReconsideracion', description: data.fechaReconsideracion });

    await test.step('1. Navegar y abrir candidato para reconsideracion', async () => {
      await reconsideracionPage.navegarAlModulo();
      await reconsideracionPage.validarModuloCargado();
      let candidato: string;
      try {
        candidato = await reconsideracionPage.abrirPrimerRegistroParaReconsiderar(runContext.slot, runContext.repeatIndex);
      } catch (err: any) {
        if (/agotad|no quedan registros/i.test(String(err?.message || ''))) {
          test.skip(true, `Sin datos disponibles para reconsiderar en este slot (BD agotada): ${err.message}`);
          return;
        }
        throw err;
      }
      testInfo.annotations.push({ type: 'candidatoReconsideracion', description: candidato });
    });

    await test.step('2. Marcar reconsideracion y completar campos obligatorios', async () => {
      await reconsideracionPage.completarCamposReconsideracion(data);
    });

    await test.step('3. Guardar y validar detalle con sanciones', async () => {
      const result = await reconsideracionPage.guardarCabecera();
      testInfo.annotations.push({ type: 'apiEndpoint', description: result.endpoint });
      testInfo.annotations.push({ type: 'apiStatus', description: String(result.status) });
      testInfo.annotations.push({ type: 'operacionFuncional', description: 'reconsideracion-guardada' });
      testInfo.annotations.push({ type: 'evidenciaFuncional', description: data.numeroReconsideracion });
      await reconsideracionPage.validarDetalleSancionesMinimo(1);
    });
  });
});
