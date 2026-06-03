import { test, expect } from '../utils/auth-fixture';

/**
 * Suite de Pruebas Autogenerada de API
 * Colección: REGINSA - Login Punku
 */
test.describe('REGINSA - Login Punku', () => {

  test('00.1) Auth/Punku - Login unico', async ({ request }) => {
    const response = await request.post(`/api/Authentication/GetTokenByCodeAndCodeChallenge`, {
      data: {
  "CODE": process.env.REGINSA_PUNKU_CODE || 'punku_code',
  "CODE_CHALLENGE": process.env.REGINSA_PUNKU_CODE_CHALLENGE || 'punku_code_challenge'
}
    });

    // Validar status de respuesta
    console.log(`[Test] 00.1) Auth/Punku - Login unico -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });
});
