import { test, expect } from './fixtures/test-base';
import { POManager } from '../POManager';
import testData from '../fixtures/test-data.json';
import { buildSancionIdentifiers } from '../helpers/sancion-identifiers';
import { configurarContextoReginsa, ReginsaRunContext } from '../helpers/test-run-metadata';
import { obtenerAdministradoAleatorio, resolverDocumentoPrueba } from './utilidades/reginsa-actions';

test.describe('Validaciones negativas — Registrar Sanción', () => {
  let poManager: POManager;
  let runContext: ReginsaRunContext;

  test.beforeEach(async ({ page }, testInfo) => {
    runContext = await configurarContextoReginsa(page, testInfo, { scenario: 'NEG-SIN-SANCIONES' });
    poManager = new POManager(page);
  });

  test('No debería permitir guardar expediente sin sanciones', async ({ page }, testInfo) => {
    test.setTimeout(180000);
    const workerIndex = runContext.workerIndex;
    const data = testData.sanciones;
    const sancionesPage = poManager.getSancionesPage();
    const formularioPage = poManager.getFormularioSancionPage();
    const { numExpediente, numResolucion } = buildSancionIdentifiers(data.expediente, data.resolucion, {
      scenario: 'NEG-SIN-SANCIONES',
      workerIndex,
      repeatIndex: runContext.repeatIndex,
      slot: runContext.slot,
    });

    testInfo.annotations.push({ type: 'validacionNegativa', description: 'Guardar sin sanciones debe ser rechazado por UI o backend.' });
    testInfo.annotations.push({ type: 'sancionesEjecutadas', description: '0' });
    testInfo.annotations.push({ type: 'defectoEsperadoSiPermiteGuardar', description: 'DEFECTO FUNCIONAL: REGINSA no debe persistir expedientes sin al menos 1 sancion.' });

    await test.step(`[Worker ${workerIndex + 1}] 1. Navegar y abrir registro`, async () => {
      await sancionesPage.navegarAlModulo();
      await sancionesPage.validarModuloCargado();
      await sancionesPage.abrirFormularioRegistrarSancion();
    });

    await test.step(`[Worker ${workerIndex + 1}] 2. Llenar datos basicos sin agregar sanciones`, async () => {
      await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
      await obtenerAdministradoAleatorio(page, workerIndex);
      await formularioPage.llenarNumeroExpediente(numExpediente);
      await formularioPage.llenarNumeroResolucion(numResolucion);
      await formularioPage.llenarFechaResolucion(data.fechaResolucion);
      const pathPdf = resolverDocumentoPrueba('GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf');
      await formularioPage.subirDocumento(pathPdf);

      for (let i = 0; i < data.medidasCorrectivas.length; i += 1) {
        await formularioPage.agregarMedidaCorrectiva(data.medidasCorrectivas[i]);
        if (i < data.medidasCorrectivas.length - 1) {
          await formularioPage.clickAgregarMedida();
        }
      }

      await formularioPage.irADetalleSanciones();
      await expect.poll(async () => formularioPage.contarSancionesAgregadas(), {
        timeout: 5000,
        message: 'Precondicion negativa: el formulario debe estar sin sanciones antes de intentar guardar.',
      }).toBe(0);
    });

    await test.step(`[Worker ${workerIndex + 1}] 3. Intentar guardar sin sanciones`, async () => {
      const previousTimeout = process.env.REGINSA_SAVE_API_TIMEOUT_MS;
      process.env.REGINSA_SAVE_API_TIMEOUT_MS = process.env.REGINSA_NEGATIVE_SAVE_API_TIMEOUT_MS || '12000';

      try {
        const saveResult = await formularioPage.guardarFormulario();
        await formularioPage.validarPersistenciaCabecera(
          numExpediente,
          saveResult.registroId,
          saveResult.authorizationHeader
        );

        testInfo.annotations.push({ type: 'registroId', description: saveResult.registroId });
        testInfo.annotations.push({ type: 'expediente', description: numExpediente });
        testInfo.annotations.push({ type: 'apiEndpoint', description: saveResult.endpoint });

        throw new Error(
          `DEFECTO FUNCIONAL CRITICO: REGINSA permitio guardar y persistir el expediente ${numExpediente} sin al menos 1 sancion. Registro ID: ${saveResult.registroId}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/DEFECTO FUNCIONAL CRITICO/i.test(message)) {
          throw error;
        }

        testInfo.annotations.push({
          type: 'resultadoNegativo',
          description: 'El guardado sin sanciones fue bloqueado o no devolvio ID real persistente.',
        });
      } finally {
        if (previousTimeout === undefined) {
          delete process.env.REGINSA_SAVE_API_TIMEOUT_MS;
        } else {
          process.env.REGINSA_SAVE_API_TIMEOUT_MS = previousTimeout;
        }
      }
    });
  });
});
