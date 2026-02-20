import { expect, test } from '@playwright/test';
import { LoginPage } from '../pages/login.page';
import { normalizarRuc } from '../utilidades/ruc.util';

test.describe('Smoke funcional - acceso básico', () => {
  test('debe cargar login y validar formato de RUC utilitario', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.abrirLogin();

    const ruc = normalizarRuc('12345678');
    expect(ruc).toHaveLength(11);
  });
});
