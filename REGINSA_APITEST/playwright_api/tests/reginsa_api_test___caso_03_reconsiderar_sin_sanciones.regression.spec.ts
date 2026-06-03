import { test, expect } from '../utils/auth-fixture';

/**
 * Suite de Pruebas Autogenerada de API
 * Colección: REGINSA API Test - Caso 03 Reconsiderar Sin Sanciones
 */
test.describe('REGINSA API Test - Caso 03 Reconsiderar Sin Sanciones', () => {

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

  test('2) CabeceraInfraccionSancion/ListarPaginado', async ({ request }) => {
    const response = await request.post(`/CabeceraInfraccionSancion/ListarPaginado`, {
      data: {
  "nPageNumber": 1,
  "nPageSize": 20,
  "sinSanciones": true,
  "reconsideracionPendiente": true
}
    });

    // Validar status de respuesta
    console.log(`[Test] 2) CabeceraInfraccionSancion/ListarPaginado -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('3) Reconsideracion/GuardarCabecera', async ({ request }) => {
    const response = await request.post(`/Reconsideracion/GuardarCabecera`, {
      data: "{\n  \"idCabeceraInfraccionSancion\": {{cabecera_id}},\n  \"numeroReconsideracion\": \"POSTMAN-REC-{{ $timestamp }}\",\n  \"fechaReconsideracion\": \"{{$isoTimestamp}}\",\n  \"sinSanciones\": true\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 3) Reconsideracion/GuardarCabecera -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('4) DetalleInfraccionSancion/ListarPaginado', async ({ request }) => {
    const response = await request.post(`/DetalleInfraccionSancion/ListarPaginado`, {
      data: "{\n  \"nPageNumber\": 1,\n  \"nPageSize\": 20,\n  \"idCabeceraInfraccionSancion\": {{cabecera_id}},\n  \"sinSanciones\": true\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 4) DetalleInfraccionSancion/ListarPaginado -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });
});
