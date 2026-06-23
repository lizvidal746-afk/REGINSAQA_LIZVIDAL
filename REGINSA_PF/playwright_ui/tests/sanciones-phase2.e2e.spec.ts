import { test, expect } from './fixtures/test-base';
import { POManager } from '../POManager';
import testData from '../fixtures/test-data.json';
import { buildSancionIdentifiers } from '../helpers/sancion-identifiers';
import { configurarContextoReginsa, ReginsaRunContext } from '../helpers/test-run-metadata';
import { obtenerAdministradoAleatorio, resolverDocumentoPrueba } from './utilidades/reginsa-actions';

/**
 * Phase 2 — Registrar Sanción Escalada (CP-REG-02)
 *
 * Cada ejecución registra UNA sanción aleatoria del fixture.
 * El escalado se logra con --repeat-each=4 (por worker) desde run-pf.ps1,
 * lo que produce 4 registros por IP/worker.
 *
 * Uso:
 *   npm run pf:phase2:caso02   → 4 registros/worker × 9 workers = 36 registros
 */

test.describe('Phase 2 — Registrar Sanción Escalada (1 sanción/registro)', () => {
  let poManager: POManager;
  let runContext: ReginsaRunContext;

  test.beforeEach(async ({ page }, testInfo) => {
    runContext = await configurarContextoReginsa(page, testInfo, { scenario: 'P2' });
    poManager = new POManager(page);
  });

  test('Debería registrar una sanción aleatoria (Phase 2)', async ({ page }, testInfo) => {
    const workerIndex = runContext.workerIndex;
    const repeatIndex = runContext.repeatIndex;
    const data = testData.sanciones;
    const sancionesPage = poManager.getSancionesPage();
    const formularioPage = poManager.getFormularioSancionPage();
    const modalPage = poManager.getModalAgregarSancionPage();

    // Seleccionar UNA sanción aleatoria del fixture
    const todas = data.sanciones;
    // Usamos seed combinado de worker + repeat para mayor variedad
    const seedIdx = (workerIndex * 17 + repeatIndex) % todas.length;
    const sancion = todas[seedIdx];

    // Números únicos por worker + repetición
    const { numExpediente, numResolucion } = buildSancionIdentifiers(data.expediente, data.resolucion, {
      scenario: 'P2',
      workerIndex,
      repeatIndex,
      slot: runContext.slot,
    });

    console.log(`[Phase2][W${workerIndex + 1}][R${repeatIndex + 1}] Sanción: "${sancion.nombre || 'aleatoria'}"`);
    testInfo.annotations.push({ type: 'expedientePlaneado', description: numExpediente });
    testInfo.annotations.push({ type: 'resolucionPlaneada', description: numResolucion });
    testInfo.annotations.push({ type: 'sancionSeleccionada', description: sancion.nombre || 'Sin nombre' });

    // ── 1. Navegar al módulo ─────────────────────────────────────────────
    await test.step(`[W${workerIndex + 1}R${repeatIndex + 1}] 1. Navegar al módulo`, async () => {
      await sancionesPage.navegarAlModulo();
      await sancionesPage.validarModuloCargado();
    });

    // ── 2. Abrir formulario ──────────────────────────────────────────────
    await test.step(`[W${workerIndex + 1}R${repeatIndex + 1}] 2. Abrir formulario`, async () => {
      await sancionesPage.abrirFormularioRegistrarSancion();
    });

    // ── 3. Datos básicos ─────────────────────────────────────────────────
    await test.step(`[W${workerIndex + 1}R${repeatIndex + 1}] 3. Llenar datos básicos`, async () => {
      await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
      const administradoSeleccionado = await obtenerAdministradoAleatorio(page, workerIndex, {
        workerIndex,
        repeatIndex,
        slot: runContext.slot,
        scenario: 'P2',
      });
      testInfo.annotations.push({ type: 'administradoSeleccionado', description: administradoSeleccionado });
      await formularioPage.llenarNumeroExpediente(numExpediente);
      await formularioPage.llenarNumeroResolucion(numResolucion);
      await formularioPage.llenarFechaResolucion(data.fechaResolucion);
    });

    // ── 4. Subir documento ───────────────────────────────────────────────
    await test.step(`[W${workerIndex + 1}R${repeatIndex + 1}] 4. Subir documento`, async () => {
      const pathPdf = resolverDocumentoPrueba('GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf');
      await formularioPage.subirDocumento(pathPdf);
    });

    // ── 5. Medidas correctivas ───────────────────────────────────────────
    await test.step(`[W${workerIndex + 1}R${repeatIndex + 1}] 5. Medidas correctivas`, async () => {
      for (let i = 0; i < data.medidasCorrectivas.length; i++) {
        await formularioPage.agregarMedidaCorrectiva(data.medidasCorrectivas[i]);
        if (i < data.medidasCorrectivas.length - 1) {
          await formularioPage.clickAgregarMedida();
        }
      }
    });

    // ── 6. Navegar a detalle de sanciones ────────────────────────────────
    await test.step(`[W${workerIndex + 1}R${repeatIndex + 1}] 6. Detalle de sanciones`, async () => {
      await formularioPage.irADetalleSanciones();
    });

    // ── 7. Agregar la única sanción aleatoria ────────────────────────────
    await test.step(`[W${workerIndex + 1}R${repeatIndex + 1}] 7. Agregar sanción: "${sancion.nombre}"`, async () => {
      testInfo.annotations.push({ type: 'sancionesEjecutadas', description: '1' });
      testInfo.annotations.push({ type: 'coberturaSanciones', description: sancion.nombre || 'Sin nombre' });

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
      await page.locator('.p-dialog').filter({ hasText: /Agregar\s*Sanci[oó]n/i })
        .waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});

      await formularioPage.validarMinimoSancionesAgregadas(1);
      testInfo.annotations.push({
        type: 'validacionMinimoSanciones',
        description: 'Se valida que exista al menos 1 sancion antes del guardado final.',
      });
    });

    // ── 8. Guardar formulario ────────────────────────────────────────────
    await test.step(`[W${workerIndex + 1}R${repeatIndex + 1}] 8. Guardar formulario`, async () => {
      const saveResult = await formularioPage.guardarFormulario();
      await formularioPage.validarPersistenciaCabecera(
        numExpediente,
        saveResult.registroId,
        saveResult.authorizationHeader
      );

      testInfo.annotations.push({ type: 'registroId', description: saveResult.registroId });
      testInfo.annotations.push({ type: 'expediente', description: numExpediente });
      testInfo.annotations.push({ type: 'apiEndpoint', description: saveResult.endpoint });

      console.log(`[Phase2][W${workerIndex + 1}][R${repeatIndex + 1}] Registro persistido. ID: ${saveResult.registroId}`);
    });
  });
});
