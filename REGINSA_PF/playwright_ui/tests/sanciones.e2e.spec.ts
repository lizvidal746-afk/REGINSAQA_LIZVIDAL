import { test, expect } from './fixtures/test-base';
import { POManager } from '../POManager';
import testData from '../fixtures/test-data.json';
import { buildSancionIdentifiers } from '../helpers/sancion-identifiers';
import { configurarContextoReginsa, ReginsaRunContext } from '../helpers/test-run-metadata';
import { obtenerAdministradoAleatorio, resolverDocumentoPrueba } from './utilidades/reginsa-actions';

test.describe('E2E - Flujo de Registrar Sanción (Escalado)', () => {
  let poManager: POManager;
  let runContext: ReginsaRunContext;

  test.beforeEach(async ({ page }, testInfo) => {
    runContext = await configurarContextoReginsa(page, testInfo, {
      scenario: 'SMOKE',
      timeoutJustification: 'Smoke Caso 02 ejecuta 8 combinaciones de sancion en un solo expediente; se amplia a 5 minutos para medir el flujo completo sin ocultar defectos.',
    });
    poManager = new POManager(page);
  });

  test('Debería completar el flujo completo de registrar sanción', async ({ page }, testInfo) => {
    test.setTimeout(300000);
    const workerIndex = runContext.workerIndex;
    const data = testData.sanciones;
    const sancionesPage = poManager.getSancionesPage();
    const formularioPage = poManager.getFormularioSancionPage();
    const modalPage = poManager.getModalAgregarSancionPage();
    const { numExpediente, numResolucion } = buildSancionIdentifiers(data.expediente, data.resolucion, {
      scenario: 'SMOKE',
      workerIndex,
      repeatIndex: runContext.repeatIndex,
      slot: runContext.slot,
    });

    console.log(`[Worker ${workerIndex + 1}] Iniciando prueba con IP: ${runContext.assignedIp}...`);

    await test.step(`[Worker ${workerIndex + 1}] 1. Navegar al módulo de sanciones`, async () => {
      await sancionesPage.navegarAlModulo();
      await sancionesPage.validarModuloCargado();
    });

    await test.step(`[Worker ${workerIndex + 1}] 2. Abrir formulario de registro`, async () => {
      await sancionesPage.abrirFormularioRegistrarSancion();
    });

    await test.step(`[Worker ${workerIndex + 1}] 3. Llenar datos básicos del formulario`, async () => {
      await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
      await obtenerAdministradoAleatorio(page, workerIndex);
      await formularioPage.llenarNumeroExpediente(numExpediente);
      await formularioPage.llenarNumeroResolucion(numResolucion);
      await formularioPage.llenarFechaResolucion(data.fechaResolucion);
    });

    await test.step(`[Worker ${workerIndex + 1}] 4. Subir documento PDF`, async () => {
      const pathPdf = resolverDocumentoPrueba('GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf');
      await formularioPage.subirDocumento(pathPdf);
    });

    await test.step(`[Worker ${workerIndex + 1}] 5. Agregar medidas correctivas`, async () => {
      for (let i = 0; i < data.medidasCorrectivas.length; i++) {
        const medida = data.medidasCorrectivas[i];
        await formularioPage.agregarMedidaCorrectiva(medida);
        if (i < data.medidasCorrectivas.length - 1) {
          await formularioPage.clickAgregarMedida();
        }
      }
    });

    await test.step(`[Worker ${workerIndex + 1}] 6. Navegar a detalle de sanciones`, async () => {
      await formularioPage.irADetalleSanciones();
    });

    await test.step(`[Worker ${workerIndex + 1}] 7. Agregar todas las combinaciones de sanciones`, async () => {
      const sancionesParaEjecutar = data.sanciones;
      testInfo.annotations.push({ type: 'sancionesEjecutadas', description: String(sancionesParaEjecutar.length) });
      testInfo.annotations.push({
        type: 'coberturaSanciones',
        description: sancionesParaEjecutar.map((sancion) => sancion.nombre || 'Sin nombre').join(' | '),
      });

      for (const sancion of sancionesParaEjecutar) {
        await formularioPage.clickAgregarSancion();
        await modalPage.validarModalVisible();

        await modalPage.seleccionarRIS();
        await modalPage.seleccionarTipoInfraccion();
        await modalPage.llenarHechoInfractor(data.hechoInfractor);

        if (sancion.multa) {
          await modalPage.marcarMulta();
          await modalPage.seleccionarTipoMoneda(sancion.usarUIT || false);
          await modalPage.llenarMontoMulta(sancion.monto || '1000');
        }

        if (sancion.suspension) {
          await modalPage.marcarSuspension();
          await modalPage.llenarTiempoSuspension(
            (sancion.tipoTiempo as 'Año' | 'Mes' | 'Día') || 'Mes',
            sancion.cantidadTiempo || 1
          );
        }

        if (sancion.cancelacion) {
          await modalPage.marcarCancelacion();
        }

        await modalPage.clickGuardarDetalle();
        await page.waitForTimeout(800);
        await modalPage.cerrar();
      }

      await formularioPage.validarMinimoSancionesAgregadas(sancionesParaEjecutar.length);
      testInfo.annotations.push({
        type: 'validacionMinimoSanciones',
        description: `Se valida que existan al menos ${sancionesParaEjecutar.length} sanciones antes del guardado final.`,
      });
    });

    await test.step(`[Worker ${workerIndex + 1}] 8. Guardar formulario completo`, async () => {
      const saveResult = await formularioPage.guardarFormulario();
      await formularioPage.validarPersistenciaCabecera(
        numExpediente,
        saveResult.registroId,
        saveResult.authorizationHeader
      );

      testInfo.annotations.push({ type: 'registroId', description: saveResult.registroId });
      testInfo.annotations.push({ type: 'expediente', description: numExpediente });
      testInfo.annotations.push({ type: 'apiEndpoint', description: saveResult.endpoint });

      console.log(`[Worker ${workerIndex + 1}] Formulario persistido. ID Registro: ${saveResult.registroId}`);
    });
  });
});
