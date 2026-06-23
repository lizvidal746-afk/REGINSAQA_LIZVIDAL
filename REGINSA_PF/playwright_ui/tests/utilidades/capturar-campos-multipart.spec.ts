// Captura los campos multipart exactos de CrearConDetalles usando route interception
// Ejecutar: npx playwright test tests/utilidades/capturar-campos-multipart.spec.ts --headed

import { test } from '@playwright/test';
import { POManager } from '../../POManager';
import { obtenerAdministradoAleatorio, resolverDocumentoPrueba } from './reginsa-actions';

test.use({ storageState: '.auth/user.json' });

test('Capturar campos multipart de CrearConDetalles', async ({ page }) => {
  test.setTimeout(120000);

  // Interceptar la ruta y loguear el body completo como texto
  await page.route('**/CabeceraInfraccionSancion/CrearConDetalles', async (route) => {
    const request = route.request();
    const body = request.postDataBuffer();
    if (body) {
      const bodyStr = body.toString('utf8');
      console.log('\n====== BODY MULTIPART COMPLETO ======');
      // Loguear en partes para no truncar
      const chunkSize = 1000;
      for (let i = 0; i < bodyStr.length; i += chunkSize) {
        console.log(bodyStr.substring(i, i + chunkSize));
      }
      console.log('=====================================\n');
    }
    // Continuar la petición normalmente
    await route.continue();
  });

  const poManager = new POManager(page);
  const sancionesPage = poManager.getSancionesPage();
  const formularioPage = poManager.getFormularioSancionPage();
  const modalPage = poManager.getModalAgregarSancionPage();

  await sancionesPage.navegarAlModulo();
  await sancionesPage.validarModuloCargado();
  await sancionesPage.abrirFormularioRegistrarSancion();
  await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await obtenerAdministradoAleatorio(page, 0);
  await formularioPage.llenarNumeroExpediente('MULTIPART-DIAG-001');
  await formularioPage.llenarNumeroResolucion('MULTIPART-RES-001');
  await formularioPage.llenarFechaResolucion('13/05/2026');
  const pathPdf = resolverDocumentoPrueba('GENERAL N\u00b0 00001-2026-SUNEDU-SG-OTI.pdf');
  await formularioPage.subirDocumento(pathPdf);
  await formularioPage.agregarMedidaCorrectiva('Medida multipart test');
  await formularioPage.irADetalleSanciones();
  await formularioPage.clickAgregarSancion();
  await modalPage.seleccionarRIS();
  await modalPage.seleccionarTipoInfraccion();
  await modalPage.llenarHechoInfractor('Hecho multipart test');
  await modalPage.marcarMulta();
  await modalPage.llenarMontoMulta('500');
  await modalPage.clickGuardarDetalle();
  await page.waitForTimeout(800);
  await modalPage.cerrar();

  const btnGuardar = page.getByRole('button', { name: /^Guardar$/i }).first();
  await btnGuardar.click({ force: true });
  await page.waitForTimeout(8000);
});
