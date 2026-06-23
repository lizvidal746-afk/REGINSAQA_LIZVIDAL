import { test, expect } from '@playwright/test';
import { POManager } from '../POManager';

test.describe('02-AUDITORÍA UI: Verificar registros de auditoría', () => {
  let poManager: POManager;

  test.use({ storageState: '.auth/user.json' });

  test.beforeEach(async ({ page }) => {
    poManager = new POManager(page);
  });

  test('Auditoría UI: Verificar que hay 9 registros de auditoría (una por cada IP/VU)', async ({ page }) => {
    const baseUrl = process.env.REGINSA_UI_BASE_URL || 'https://reginsaqa.sunedu.gob.pe';
    
    // 1. Navegar a la página principal
    await test.step('1. Navegar a la página principal', async () => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    });

    // 2. Abrir el módulo de auditorías (ajusta según tu aplicación)
    await test.step('2. Abrir el módulo de auditorías', async () => {
      // Ajusta estos selectores según la estructura real de tu aplicación
      const btnAuditorias = page.getByRole('link', { name: /Auditoría/i }).first()
        .or(page.getByRole('button', { name: /Auditoría/i }).first());
      
      if (await btnAuditorias.isVisible({ timeout: 10000 })) {
        await btnAuditorias.click();
        await page.waitForTimeout(2000);
      }
    });

    // 3. Verificar la tabla de auditorías
    await test.step('3. Verificar la tabla de auditorías', async () => {
      // Ajusta el selector de la tabla según tu aplicación
      const tablaAuditorias = page.locator('table').first()
        .or(page.locator('.p-datatable').first());
      
      await expect(tablaAuditorias).toBeVisible({ timeout: 15000 });
      
      // Contar las filas de la tabla (ajusta el selector si es necesario)
      const filas = tablaAuditorias.locator('tbody tr');
      const cantidadFilas = await filas.count();
      
      console.log(`📊 Cantidad de filas en la tabla de auditorías: ${cantidadFilas}`);
      
      // Verificar que hay al menos 9 filas (una por cada IP/VU)
      expect(cantidadFilas).toBeGreaterThanOrEqual(9);
    });
  });
});
