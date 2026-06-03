import { test, expect } from '@playwright/test';
import { POManager } from '../POManager';
import testData from '../fixtures/test-data.json';

test.describe('E2E - Flujo de Registrar Sanción', () => {
  let poManager: POManager;

  test.use({ storageState: '.auth/user.json' });

  test.beforeEach(async ({ page }) => {
    poManager = new POManager(page);
  });

  test('Debería completar el flujo completo de registrar sanción', async ({ page }) => {
    const data = testData.sanciones;
    const sancionesPage = poManager.getSancionesPage();
    const formularioPage = poManager.getFormularioSancionPage();
    const modalPage = poManager.getModalAgregarSancionPage();

    await test.step('1. Navegar al módulo de sanciones', async () => {
      await sancionesPage.navegarAlModulo();
      await sancionesPage.validarModuloCargado();
    });

    await test.step('2. Abrir formulario de registro', async () => {
      await sancionesPage.abrirFormularioRegistrarSancion();
      await expect(page.getByText('Registro de Infracción y Sanción')).toBeVisible();
    });

    await test.step('3. Llenar datos básicos del formulario', async () => {
      await formularioPage
        .llenarNumeroExpediente(data.expediente)
        .llenarNumeroResolucion(data.resolucion)
        .llenarFechaResolucion(data.fechaResolucion);
    });

    await test.step('4. Subir documento PDF', async () => {
      await formularioPage.subirDocumento(data.rutaDocumento);
    });

    await test.step('5. Agregar medidas correctivas', async () => {
      for (let i = 0; i < data.medidasCorrectivas.length; i++) {
        const medida = data.medidasCorrectivas[i];
        await formularioPage.agregarMedidaCorrectiva(medida);
        if (i < data.medidasCorrectivas.length - 1) {
          await formularioPage.clickAgregarMedida();
        }
      }
    });

    await test.step('6. Navegar a detalle de sanciones', async () => {
      await formularioPage.irADetalleSanciones();
      await expect(page.getByRole('tab', { name: 'Detalle de sanciones' })).toHaveAttribute('aria-selected', 'true');
    });

    await test.step('7. Agregar 3 sanciones', async () => {
      for (const sancion of data.sanciones) {
        await formularioPage.clickAgregarSancion();
        await modalPage.validarModalVisible();

        await modalPage
          .seleccionarRIS()
          .seleccionarTipoInfraccion()
          .llenarHechoInfractor(data.hechoInfractor);

        if (sancion.multa) {
          await modalPage
            .marcarMulta()
            .seleccionarTipoMoneda(sancion.usarUIT || false)
            .llenarMontoMulta(sancion.monto || '1000');
        }

        if (sancion.suspension) {
          await modalPage
            .marcarSuspension()
            .llenarTiempoSuspension(
              sancion.tipoTiempo as 'Año' | 'Mes' | 'Día',
              sancion.cantidadTiempo || 1
            );
        }

        if (sancion.cancelacion) {
          await modalPage.marcarCancelacion();
        }

        await modalPage.clickGuardarDetalle();
        await page.waitForTimeout(1000);
        await modalPage.cerrar();
      }
    });

    await test.step('8. Guardar formulario completo', async () => {
      await formularioPage.guardarFormulario();
      await expect(page.getByText('Sanción registrada exitosamente') || page.getByText('Guardado exitoso')).toBeVisible({ timeout: 10000 });
    });
  });
});
