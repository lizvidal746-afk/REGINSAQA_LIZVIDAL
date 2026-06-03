import { test, expect } from '../utils/auth-fixture';

/**
 * Suite de Pruebas Autogenerada de API
 * Colección: REGINSA API Test - Caso 01 Entidad
 */
test.describe('REGINSA API Test - Caso 01 Entidad', () => {

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

  test('2) Entidad/Crear - Exito', async ({ request }) => {
    const response = await request.post(`/Entidad/Crear`, {
      data: {
  "ruc": process.env.REGINSA_RUC_NUEVO || 'ruc_nuevo',
  "Ruc": process.env.REGINSA_RUC_NUEVO || 'ruc_nuevo',
  "razonSocial": process.env.REGINSA_RAZON_SOCIAL_NUEVA || 'razon_social_nueva',
  "RazonSocial": process.env.REGINSA_RAZON_SOCIAL_NUEVA || 'razon_social_nueva',
  "nombreComercial": process.env.REGINSA_NOMBRE_COMERCIAL_NUEVO || 'nombre_comercial_nuevo',
  "NombreComercial": process.env.REGINSA_NOMBRE_COMERCIAL_NUEVO || 'nombre_comercial_nuevo',
  "estado": 1,
  "Estado": 1,
  "idEstado": 1,
  "IdEstado": 1,
  "bitActivo": true,
  "BitActivo": true
}
    });

    // Validar status de respuesta
    console.log(`[Test] 2) Entidad/Crear - Exito -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('3) Entidad/Crear - RUC duplicado', async ({ request }) => {
    const response = await request.post(`/Entidad/Crear`, {
      data: {
  "ruc": process.env.REGINSA_RUC_NUEVO || 'ruc_nuevo',
  "Ruc": process.env.REGINSA_RUC_NUEVO || 'ruc_nuevo',
  "razonSocial": "{{razon_social_nueva}} DUP",
  "RazonSocial": "{{razon_social_nueva}} DUP",
  "nombreComercial": "{{nombre_comercial_nuevo}} DUP",
  "NombreComercial": "{{nombre_comercial_nuevo}} DUP",
  "estado": 1,
  "Estado": 1
}
    });

    // Validar status de respuesta
    console.log(`[Test] 3) Entidad/Crear - RUC duplicado -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('4) Entidad/Crear - Razon social duplicada', async ({ request }) => {
    const response = await request.post(`/Entidad/Crear`, {
      data: {
  "ruc": "{{ruc_nuevo}}9",
  "Ruc": "{{ruc_nuevo}}9",
  "razonSocial": process.env.REGINSA_RAZON_SOCIAL_NUEVA || 'razon_social_nueva',
  "RazonSocial": process.env.REGINSA_RAZON_SOCIAL_NUEVA || 'razon_social_nueva',
  "nombreComercial": "{{nombre_comercial_nuevo}} ZZ",
  "NombreComercial": "{{nombre_comercial_nuevo}} ZZ",
  "estado": 1,
  "Estado": 1
}
    });

    // Validar status de respuesta
    console.log(`[Test] 4) Entidad/Crear - Razon social duplicada -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });
});
