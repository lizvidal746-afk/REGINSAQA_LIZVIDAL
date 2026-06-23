// Interceptor de red para capturar la URL exacta que usa la UI al guardar
// Ejecutar con: npx playwright test tests/utilidades/capturar-url-cabecera.spec.ts --headed

import { test } from '@playwright/test';
import { POManager } from '../../POManager';
import { obtenerAdministradoAleatorio, resolverDocumentoPrueba } from './reginsa-actions';

test.use({ storageState: '.auth/user.json' });

test('Capturar URL exacta de CabeceraInfraccionSancion al guardar', async ({ page }) => {
  test.setTimeout(120000);

  // Interceptar TODAS las peticiones POST/PUT
  const requestsCapturadas: { method: string; url: string; postData: string | null }[] = [];
  page.on('request', (request) => {
    const method = request.method().toUpperCase();
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      requestsCapturadas.push({
        method,
        url: request.url(),
        postData: request.postData()?.slice(0, 300) ?? null,
      });
    }
  });

  const poManager = new POManager(page);
  const sancionesPage = poManager.getSancionesPage();
  const formularioPage = poManager.getFormularioSancionPage();

  await sancionesPage.navegarAlModulo();
  await sancionesPage.validarModuloCargado();
  await sancionesPage.abrirFormularioRegistrarSancion();

  await page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await obtenerAdministradoAleatorio(page, 0);
  await formularioPage.llenarNumeroExpediente('DIAG-URL-001');
  await formularioPage.llenarNumeroResolucion('DIAG-RES-001');
  await formularioPage.llenarFechaResolucion('13/05/2026');

  const pathPdf = resolverDocumentoPrueba('GENERAL N\u00b0 00001-2026-SUNEDU-SG-OTI.pdf');
  await formularioPage.subirDocumento(pathPdf);
  await formularioPage.agregarMedidaCorrectiva('Medida diagnostico');
  await formularioPage.irADetalleSanciones();
  await formularioPage.clickAgregarSancion();

  const modalPage = poManager.getModalAgregarSancionPage();
  await modalPage.seleccionarRIS();
  await modalPage.seleccionarTipoInfraccion();
  await modalPage.llenarHechoInfractor('Hecho diagnostico');
  await modalPage.marcarMulta();
  await modalPage.llenarMontoMulta('500');
  await modalPage.clickGuardarDetalle();
  await page.waitForTimeout(800);
  await modalPage.cerrar();

  // Guardar y capturar la URL real
  const btnGuardar = page.getByRole('button', { name: /^Guardar$/i }).first();
  await btnGuardar.click({ force: true });
  await page.waitForTimeout(6000);

  // Mostrar todas las URLs POST relacionadas con sanciones
  console.log('\n========== URLs POST capturadas al guardar ==========');
  for (const req of requestsCapturadas) {
    const urlLower = req.url.toLowerCase();
    if (
      urlLower.includes('sancion') ||
      urlLower.includes('cabecera') ||
      urlLower.includes('medida') ||
      urlLower.includes('detalle') ||
      urlLower.includes('infraccion')
    ) {
      console.log(`[${req.method}] ${req.url}`);
      if (req.postData) {
        console.log(`  >> Payload: ${req.postData}`);
      }
    }
  }
  console.log('=====================================================\n');
});
