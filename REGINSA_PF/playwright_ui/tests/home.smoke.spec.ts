import { test, expect } from '@playwright/test';
import { POManager } from '../POManager';

test.describe('UI Smoke - Home', () => {
  test('Validar que la página de home se carga correctamente', async ({ page }) => {
    const poManager = new POManager(page);
    const homePage = poManager.getHomePage();

    await homePage.abrirHome();
    await homePage.validarHomeCargado();
    console.log('[Smoke Test] Página de Home cargada correctamente!');
  });
});
