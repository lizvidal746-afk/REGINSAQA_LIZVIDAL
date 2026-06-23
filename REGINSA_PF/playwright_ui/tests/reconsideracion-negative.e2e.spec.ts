import { test } from './fixtures/test-base';
import { POManager } from '../POManager';
import { configurarContextoReginsa } from '../helpers/test-run-metadata';

test.describe('CP-REG-04 - Validaciones negativas de reconsideracion', () => {
  let poManager: POManager;
  let runContext: any;

  test.beforeEach(async ({ page }, testInfo) => {
    runContext = await configurarContextoReginsa(page, testInfo, {
      scenario: 'NEG-RECONSIDERACION',
      timeoutJustification: 'Caso 04 negativo valida campos condicionales obligatorios al marcar Presento recurso de reconsideracion.',
    });
    poManager = new POManager(page);
  });

  test('No deberia permitir guardar reconsideracion sin archivo, numero y fecha', async ({}, testInfo) => {
    test.setTimeout(180000);
    const reconsideracionPage = poManager.getReconsideracionPage();

    testInfo.annotations.push({
      type: 'validacionNegativa',
      description: 'Al marcar Presento recurso, Archivo, Numero de Reconsideracion y Fecha de Reconsideracion son obligatorios.',
    });
    testInfo.annotations.push({
      type: 'defectoEsperadoSiPermiteGuardar',
      description: 'DEFECTO FUNCIONAL: guardar reconsideracion sin los 3 campos condicionales obligatorios no debe persistir.',
    });

    await reconsideracionPage.navegarAlModulo();
    await reconsideracionPage.validarModuloCargado();
    await reconsideracionPage.abrirPrimerRegistroParaReconsiderar(runContext.slot);
    await reconsideracionPage.limpiarCamposReconsideracion();
    await reconsideracionPage.validarBloqueoCamposObligatorios();
  });
});
