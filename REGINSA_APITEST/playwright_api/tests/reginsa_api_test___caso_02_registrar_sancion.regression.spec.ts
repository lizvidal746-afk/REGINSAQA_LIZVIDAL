import { test, expect } from '../utils/auth-fixture';

/**
 * Suite de Pruebas Autogenerada de API
 * Colección: REGINSA API Test - Caso 02 Registrar Sancion
 */
test.describe('REGINSA API Test - Caso 02 Registrar Sancion', () => {

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

  test('2) Infraccion/Listar', async ({ request }) => {
    const response = await request.post(`/Infraccion/Listar`, {
      data: "{\n  \"idRis\": {{id_ris}}\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 2) Infraccion/Listar -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('3) CabeceraInfraccionSancion/Crear', async ({ request }) => {
    const response = await request.post(`/CabeceraInfraccionSancion/Crear`, {
      data: "{\n  \"IdEntidad\": {{id_entidad}},\n  \"NumeroExpediente\": \"{{numero_expediente}}\",\n  \"NumeroResolucion\": \"{{numero_resolucion}}\",\n  \"FechaResolucion\": \"{{fecha_resolucion}}\",\n  \"RutaResolucionSancion\": \"GENERAL N 00001-2026-SUNEDU-SG-OTI.pdf\",\n  \"ArchivoResolucion\": \"\"\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 3) CabeceraInfraccionSancion/Crear -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('4) MedidaCorrectiva/Crear', async ({ request }) => {
    const response = await request.post(`/MedidaCorrectiva/Crear`, {
      data: "{\n  \"idCabeceraInfraccionSancion\": {{cabecera_id}},\n  \"descripcionMedidaCorrectiva\": \"Medida Correctiva API Test\",\n  \"orden\": 1\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 4) MedidaCorrectiva/Crear -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('5) DetalleInfraccionSancion/Crear', async ({ request }) => {
    const response = await request.post(`/DetalleInfraccionSancion/Crear`, {
      data: "{\n  \"idCabeceraInfraccionSancion\": {{cabecera_id}},\n  \"IdInfraccion\": {{id_infraccion}},\n  \"desInfraccion\": \"{{display_infraccion}}\",\n  \"desSancion\": \"Multa\",\n  \"bitCancelacion\": 0,\n  \"canSuspension\": 0,\n  \"tipoMulta\": \"SOLES\",\n  \"numMonto\": 1000,\n  \"bitReconsidera\": 0,\n  \"bitReincidente\": 0,\n  \"bitPago\": 0,\n  \"desSuspension\": null,\n  \"desHechoInfractor\": \"Hecho Infractor API Test\",\n  \"numCorrelativo\": 1,\n  \"bitMedida\": 1,\n  \"desMedidaCorrectivaGen\": \"Medida Correctiva API Test\",\n  \"idRis\": {{id_ris}},\n  \"tempId\": -2\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 5) DetalleInfraccionSancion/Crear -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });
});
