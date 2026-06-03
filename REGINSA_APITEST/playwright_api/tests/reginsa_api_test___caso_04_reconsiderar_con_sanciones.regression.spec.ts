import { test, expect } from '../utils/auth-fixture';

/**
 * Suite de Pruebas Autogenerada de API
 * Colección: REGINSA API Test - Caso 04 Reconsiderar Con Sanciones
 */
test.describe('REGINSA API Test - Caso 04 Reconsiderar Con Sanciones', () => {

  test('1) Auth/Login', async ({ request }) => {
    const response = await request.post(`/api/Authentication/GetTokenByCodeAndCodeChallenge`, {
      data: {
  "CODE": process.env.REGINSA_PUNKU_CODE || 'punku_code',
  "CODE_CHALLENGE": process.env.REGINSA_PUNKU_CODE_CHALLENGE || 'punku_code_challenge'
}
    });

    // Validar status de respuesta
    console.log(`[Test] 1) Auth/Login -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('2) DetalleInfraccionSancion/ListarPaginado', async ({ request }) => {
    const response = await request.post(`/DetalleInfraccionSancion/ListarPaginado`, {
      data: {
  "nPageNumber": 1,
  "nPageSize": 20,
  "conSanciones": true
}
    });

    // Validar status de respuesta
    console.log(`[Test] 2) DetalleInfraccionSancion/ListarPaginado -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('3) DetalleInfraccionSancion/ActualizarReconsideracion', async ({ request }) => {
    const response = await request.post(`/DetalleInfraccionSancion/ActualizarReconsideracion`, {
      data: "{\n  \"idDetalleInfraccionSancion\": {{detalle_id}},\n  \"bitReconsidera\": 1,\n  \"fechaReconsideracion\": \"{{$isoTimestamp}}\"\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 3) DetalleInfraccionSancion/ActualizarReconsideracion -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('4) DetalleInfraccionSancion/Confirmar', async ({ request }) => {
    const response = await request.post(`/DetalleInfraccionSancion/Confirmar`, {
      data: "{\n  \"idDetalleInfraccionSancion\": {{detalle_id}},\n  \"confirmar\": true\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 4) DetalleInfraccionSancion/Confirmar -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });
});
