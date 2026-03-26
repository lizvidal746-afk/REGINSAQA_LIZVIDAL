import { test, expect } from '@playwright/test';
import { iniciarSesionYNavegar } from '../utilidades/reginsa-actions';

test.describe('CASO 00 - LOGIN REUSABLE', () => {
  test('00-LOGIN: Inicio de sesion valido con pool de usuarios', async ({ page }, testInfo) => {
    await iniciarSesionYNavegar(page, 'infractor', testInfo.workerIndex);

    const btnAccederAhora = page.getByRole('button', { name: /Acceder Ahora/i }).first();
    const sigueEnLogin = await btnAccederAhora.isVisible().catch(() => false);

    expect(sigueEnLogin).toBeFalsy();
  });
});
