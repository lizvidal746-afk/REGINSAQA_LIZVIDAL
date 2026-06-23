import { test, expect } from './fixtures/test-base';
import { POManager } from '../POManager';
import testData from '../fixtures/test-data.json';
import { buildSancionIdentifiers } from '../helpers/sancion-identifiers';
import { configurarContextoReginsa, ReginsaRunContext } from '../helpers/test-run-metadata';
import { obtenerAdministradoAleatorio, resolverDocumentoPrueba } from './utilidades/reginsa-actions';

/**
 * Phase 1 — Registrar Sanción (CP-REG-02)
 *
 * Modo controlado por la variable de entorno PHASE1_MODE:
 *   - "minimo" (default): registra una sola sanción aleatoria por registro.
 *   - "multi" : recorre todas las combinaciones de sanciones del fixture.
 *
 * Uso:
 *   npm run pf:phase1:caso02            → una sola sanción aleatoria
 *   npm run pf:phase1:caso02:multi      → todas las combinaciones
 */

const PHASE1_MODE = (process.env.PHASE1_MODE || 'minimo').toLowerCase();

// ──────────────────────────────────────────────
// Helper: seleccionar las sanciones a ejecutar
// ──────────────────────────────────────────────
function seleccionarSanciones(todas: typeof testData.sanciones.sanciones) {
  if (PHASE1_MODE === 'minimo') {
    // Un único elemento aleatorio del fixture
    const idx = Math.floor(Math.random() * todas.length);
    return [todas[idx]];
  }
  // Por defecto: todas las combinaciones disponibles
  return todas;
}

test.describe(`Phase 1 — Registrar Sanción [modo: ${PHASE1_MODE}]`, () => {
  let poManager: POManager;
  let runContext: ReginsaRunContext;

  test.beforeEach(async ({ page }, testInfo) => {
    runContext = await configurarContextoReginsa(page, testInfo, {
      scenario: `P1-${PHASE1_MODE}`,
      phase1Mode: PHASE1_MODE,
    });
    poManager = new POManager(page);
  });

  test('Debería completar el flujo completo de registrar sanción (Phase 1)', async ({ page }, testInfo) => {
    const workerIndex = runContext.workerIndex;
    const data = testData.sanciones;
    const sancionesPage = poManager.getSancionesPage();
    const formularioPage = poManager.getFormularioSancionPage();
    const modalPage = poManager.getModalAgregarSancionPage();

    const { numExpediente, numResolucion } = buildSancionIdentifiers(data.expediente, data.resolucion, {
      scenario: `P1-${PHASE1_MODE}`,
      workerIndex,
      repeatIndex: runContext.repeatIndex,
      slot: runContext.slot,
    });
    const sancionesParaEjecutar = seleccionarSanciones(data.sanciones);

    console.log(`[Phase1][Worker ${workerIndex + 1}] Modo: ${PHASE1_MODE} | Sanciones: ${sancionesParaEjecutar.length}`);

    // ── 1. Navegar al módulo ─────────────────────────────────────────────
    await test.step(`[W${workerIndex + 1}] 1. Navegar al módulo de sanciones`, async () => {
      await sancionesPage.navegarAlModulo();
      await sancionesPage.validarModuloCargado();
    });

    // ── 2. Abrir formulario ──────────────────────────────────────────────
    await test.step(`[W${workerIndex + 1}] 2. Abrir formulario de registro`, async () => {
      await sancionesPage.abrirFormularioRegistrarSancion();
    });

    // ── 3. Datos básicos ─────────────────────────────────────────────────
    await test.step(`[W${workerIndex + 1}] 3. Llenar datos básicos`, async () => {
      await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
      await obtenerAdministradoAleatorio(page, workerIndex);
      await formularioPage.llenarNumeroExpediente(numExpediente);
      await formularioPage.llenarNumeroResolucion(numResolucion);
      await formularioPage.llenarFechaResolucion(data.fechaResolucion);
    });

    // ── 4. Subir documento ───────────────────────────────────────────────
    await test.step(`[W${workerIndex + 1}] 4. Subir documento PDF`, async () => {
      const pathPdf = resolverDocumentoPrueba('GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf');
      await formularioPage.subirDocumento(pathPdf);
    });

    // ── 5. Medidas correctivas ───────────────────────────────────────────
    await test.step(`[W${workerIndex + 1}] 5. Agregar medidas correctivas`, async () => {
      for (let i = 0; i < data.medidasCorrectivas.length; i++) {
        await formularioPage.agregarMedidaCorrectiva(data.medidasCorrectivas[i]);
        if (i < data.medidasCorrectivas.length - 1) {
          await formularioPage.clickAgregarMedida();
        }
      }
    });

    // ── 6. Navegar a detalle de sanciones ────────────────────────────────
    await test.step(`[W${workerIndex + 1}] 6. Navegar a detalle de sanciones`, async () => {
      await formularioPage.irADetalleSanciones();
    });

    // ── 7. Agregar sanciones ─────────────────────────────────────────────
    await test.step(`[W${workerIndex + 1}] 7. Agregar ${sancionesParaEjecutar.length} sancion(es)`, async () => {
      testInfo.annotations.push({ type: 'sancionesEjecutadas', description: String(sancionesParaEjecutar.length) });
      testInfo.annotations.push({
        type: 'coberturaSanciones',
        description: sancionesParaEjecutar.map((sancion) => sancion.nombre || 'Sin nombre').join(' | '),
      });

      for (const [idx, sancion] of sancionesParaEjecutar.entries()) {
        console.log(`[Phase1][W${workerIndex + 1}] Sanción ${idx + 1}/${sancionesParaEjecutar.length}: ${sancion.nombre || '(sin nombre)'}`);

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
        await modalPage.cerrar();
        // Esperar que el modal cierre completamente antes de la siguiente sanción
        await page.locator('.p-dialog').filter({ hasText: /Agregar\s*Sanci[oó]n/i })
          .waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
      }

      await formularioPage.validarMinimoSancionesAgregadas(sancionesParaEjecutar.length);
      testInfo.annotations.push({
        type: 'validacionMinimoSanciones',
        description: `Se valida que existan al menos ${sancionesParaEjecutar.length} sanciones antes del guardado final.`,
      });
    });

    // ── 8. Guardar formulario ────────────────────────────────────────────
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

      console.log(`[Phase1][W${workerIndex + 1}] Registro persistido. ID: ${saveResult.registroId}`);
    });
  });
});
