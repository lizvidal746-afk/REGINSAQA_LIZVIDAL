// Captura el payload COMPLETO que envía la UI a CrearConDetalles
// Ejecutar: npx playwright test tests/utilidades/capturar-payload-crearcondetalles.spec.ts --headed

import { test } from '@playwright/test';
import { POManager } from '../../POManager';
import { obtenerAdministradoAleatorio, resolverDocumentoPrueba } from './reginsa-actions';

test.use({ storageState: '.auth/user.json' });

test('Capturar payload de CrearConDetalles', async ({ page }) => {
  test.setTimeout(120000);

  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('CrearConDetalles') || url.includes('crearcondetalles')) {
      console.log('\n====== PAYLOAD CrearConDetalles ======');
      console.log('URL:', url);
      console.log('Method:', request.method());
      console.log('Headers:', JSON.stringify(request.headers(), null, 2));
      const postData = request.postData();
      if (postData) {
        console.log('Body (primeros 2000 chars):', postData.substring(0, 2000));
      }
      console.log('=====================================\n');
    }
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('CrearConDetalles') || url.includes('crearcondetalles')) {
      const body = await response.text().catch(() => '');
      console.log('\n====== RESPUESTA CrearConDetalles ======');
      console.log('Status:', response.status());
      console.log('Body:', body.substring(0, 1000));
      console.log('========================================\n');
    }
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
  await formularioPage.llenarNumeroExpediente('PAYLOAD-DIAG-001');
  await formularioPage.llenarNumeroResolucion('PAYLOAD-RES-001');
  await formularioPage.llenarFechaResolucion('13/05/2026');
  const pathPdf = resolverDocumentoPrueba('GENERAL N\u00b0 00001-2026-SUNEDU-SG-OTI.pdf');
  await formularioPage.subirDocumento(pathPdf);
  await formularioPage.agregarMedidaCorrectiva('Medida diagnostico payload');
  await formularioPage.irADetalleSanciones();
  await formularioPage.clickAgregarSancion();
  await modalPage.seleccionarRIS();
  await modalPage.seleccionarTipoInfraccion();
  await modalPage.llenarHechoInfractor('Hecho diagnostico payload');
  await modalPage.marcarMulta();
  await modalPage.llenarMontoMulta('1000');
  await modalPage.clickGuardarDetalle();
  await page.waitForTimeout(800);
  await modalPage.cerrar();

  // Guardar y capturar
  const btnGuardar = page.getByRole('button', { name: /^Guardar$/i }).first();
  await btnGuardar.click({ force: true });
  await page.waitForTimeout(8000);
});
