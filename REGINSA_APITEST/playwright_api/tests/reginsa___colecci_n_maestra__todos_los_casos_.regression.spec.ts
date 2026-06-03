import { test, expect } from '../utils/auth-fixture';

/**
 * Suite de Pruebas Autogenerada de API
 * Colección: REGINSA - Colección Maestra (Todos los Casos)
 */
test.describe('REGINSA - Colección Maestra (Todos los Casos)', () => {

  test('[01 - Agregar Administrado] 01.1) Auth/Login', async ({ request }) => {
    const response = await request.post(`/api/Authentication/GetTokenByCodeAndCodeChallenge`, {
      data: {
  "CODE": process.env.REGINSA_PUNKU_CODE || 'punku_code',
  "CODE_CHALLENGE": process.env.REGINSA_PUNKU_CODE_CHALLENGE || 'punku_code_challenge'
}
    });

    // Validar status de respuesta
    console.log(`[Test] 01.1) Auth/Login -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[01 - Agregar Administrado] 01.2) Entidad/Crear - Éxito', async ({ request }) => {
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
    console.log(`[Test] 01.2) Entidad/Crear - Éxito -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[01 - Agregar Administrado] 01.3) Entidad/Crear - RUC duplicado', async ({ request }) => {
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
    console.log(`[Test] 01.3) Entidad/Crear - RUC duplicado -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[01 - Agregar Administrado] 01.4) Entidad/Crear - Razón social duplicada', async ({ request }) => {
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
    console.log(`[Test] 01.4) Entidad/Crear - Razón social duplicada -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[01 - Agregar Administrado] 01.5) Entidad/Crear - RUC vacío (validación backend)', async ({ request }) => {
    const response = await request.post(`/Entidad/Crear`, {
      data: {
  "ruc": "",
  "Ruc": "",
  "razonSocial": "ENTIDAD PRUEBA VACIA",
  "RazonSocial": "ENTIDAD PRUEBA VACIA",
  "nombreComercial": "ENTIDAD PRUEBA VACIA",
  "NombreComercial": "ENTIDAD PRUEBA VACIA",
  "estado": 1,
  "Estado": 1
}
    });

    // Validar status de respuesta
    console.log(`[Test] 01.5) Entidad/Crear - RUC vacío (validación backend) -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[01 - Agregar Administrado] 01.6) Entidad/Crear - Razón Social vacía (validación backend)', async ({ request }) => {
    const response = await request.post(`/Entidad/Crear`, {
      data: {
  "ruc": "99999000001",
  "Ruc": "99999000001",
  "razonSocial": "",
  "RazonSocial": "",
  "nombreComercial": "ENTIDAD PRUEBA VACIA",
  "NombreComercial": "ENTIDAD PRUEBA VACIA",
  "estado": 1,
  "Estado": 1
}
    });

    // Validar status de respuesta
    console.log(`[Test] 01.6) Entidad/Crear - Razón Social vacía (validación backend) -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[01 - Agregar Administrado] 01.7) Entidad/Crear - Cuerpo vacío (validación backend)', async ({ request }) => {
    const response = await request.post(`/Entidad/Crear`, {
      data: {}
    });

    // Validar status de respuesta
    console.log(`[Test] 01.7) Entidad/Crear - Cuerpo vacío (validación backend) -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[02 - Registrar Sanción] 02.1) Auth/Login', async ({ request }) => {
    const response = await request.post(`/api/Authentication/GetTokenByCodeAndCodeChallenge`, {
      data: {
  "CODE": process.env.REGINSA_PUNKU_CODE || 'punku_code',
  "CODE_CHALLENGE": process.env.REGINSA_PUNKU_CODE_CHALLENGE || 'punku_code_challenge'
}
    });

    // Validar status de respuesta
    console.log(`[Test] 02.1) Auth/Login -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[02 - Registrar Sanción] 02.2) Infraccion/Listar', async ({ request }) => {
    const response = await request.post(`/Infraccion/Listar`, {
      data: "{\n  \"idRis\": {{id_ris}}\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 02.2) Infraccion/Listar -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[02 - Registrar Sanción] 02.3) CabeceraInfraccionSancion/Crear', async ({ request }) => {
    const response = await request.post(`/CabeceraInfraccionSancion/Crear`);

    // Validar status de respuesta
    console.log(`[Test] 02.3) CabeceraInfraccionSancion/Crear -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[02 - Registrar Sanción] 02.4) MedidaCorrectiva/Crear', async ({ request }) => {
    const response = await request.post(`/MedidaCorrectiva/Crear`, {
      data: "{\n  \"idCabeceraInfraccionSancion\": {{cabecera_id}},\n  \"descripcionMedidaCorrectiva\": \"Medida Correctiva API Test - Newman REGINSA 2026\",\n  \"orden\": 1\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 02.4) MedidaCorrectiva/Crear -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[02 - Registrar Sanción] 02.5) DetalleInfraccionSancion/Crear', async ({ request }) => {
    const response = await request.post(`/DetalleInfraccionSancion/Crear`, {
      data: "{\n  \"idCabeceraInfraccionSancion\": {{cabecera_id}},\n  \"IdInfraccion\": {{id_infraccion}},\n  \"desInfraccion\": \"{{display_infraccion}}\",\n  \"desSancion\": \"Multa\",\n  \"bitCancelacion\": 0,\n  \"canSuspension\": 0,\n  \"tipoMulta\": \"SOLES\",\n  \"numMonto\": 1000,\n  \"bitReconsidera\": 0,\n  \"bitReincidente\": 0,\n  \"bitPago\": 0,\n  \"desSuspension\": null,\n  \"desHechoInfractor\": \"Hecho Infractor API Test - Newman\",\n  \"numCorrelativo\": 1,\n  \"bitMedida\": 1,\n  \"desMedidaCorrectivaGen\": \"Medida Correctiva API Test\",\n  \"idRis\": {{id_ris}},\n  \"tempId\": -2\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 02.5) DetalleInfraccionSancion/Crear -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[02 - Registrar Sanción] 02.6) DetalleInfraccionSancion/Crear - Sin datos obligatorios', async ({ request }) => {
    const response = await request.post(`/DetalleInfraccionSancion/Crear`, {
      data: "{\n  \"idCabeceraInfraccionSancion\": {{cabecera_id}},\n  \"IdInfraccion\": 0,\n  \"desInfraccion\": \"\",\n  \"desSancion\": \"\",\n  \"bitCancelacion\": 0,\n  \"canSuspension\": 0,\n  \"tipoMulta\": \"\",\n  \"numMonto\": 0,\n  \"bitReconsidera\": 0,\n  \"bitReincidente\": 0,\n  \"bitPago\": 0,\n  \"desSuspension\": null,\n  \"desHechoInfractor\": \"\",\n  \"numCorrelativo\": 2,\n  \"bitMedida\": 0,\n  \"desMedidaCorrectivaGen\": \"\",\n  \"idRis\": {{id_ris}},\n  \"tempId\": -3\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 02.6) DetalleInfraccionSancion/Crear - Sin datos obligatorios -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[02 - Registrar Sanción] 02.7) DetalleInfraccionSancion/Crear - Multa en soles monto 0', async ({ request }) => {
    const response = await request.post(`/DetalleInfraccionSancion/Crear`, {
      data: "{\n  \"idCabeceraInfraccionSancion\": {{cabecera_id}},\n  \"IdInfraccion\": {{id_infraccion}},\n  \"desInfraccion\": \"{{display_infraccion}}\",\n  \"desSancion\": \"Multa\",\n  \"bitCancelacion\": 0,\n  \"canSuspension\": 0,\n  \"tipoMulta\": \"SOLES\",\n  \"numMonto\": 0,\n  \"bitReconsidera\": 0,\n  \"bitReincidente\": 0,\n  \"bitPago\": 0,\n  \"desSuspension\": null,\n  \"desHechoInfractor\": \"Validacion monto 0 desde Postman\",\n  \"numCorrelativo\": 3,\n  \"bitMedida\": 0,\n  \"desMedidaCorrectivaGen\": \"\",\n  \"idRis\": {{id_ris}},\n  \"tempId\": -4\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 02.7) DetalleInfraccionSancion/Crear - Multa en soles monto 0 -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[02 - Registrar Sanción] 02.8) DetalleInfraccionSancion/Crear - Suspensión sin tiempo ni cantidad', async ({ request }) => {
    const response = await request.post(`/DetalleInfraccionSancion/Crear`, {
      data: "{\n  \"idCabeceraInfraccionSancion\": {{cabecera_id}},\n  \"IdInfraccion\": {{id_infraccion}},\n  \"desInfraccion\": \"{{display_infraccion}}\",\n  \"desSancion\": \"Suspension\",\n  \"bitCancelacion\": 0,\n  \"canSuspension\": 1,\n  \"tipoMulta\": \"\",\n  \"numMonto\": 0,\n  \"bitReconsidera\": 0,\n  \"bitReincidente\": 0,\n  \"bitPago\": 0,\n  \"desSuspension\": null,\n  \"desHechoInfractor\": \"Validacion suspension sin tiempo\",\n  \"numCorrelativo\": 4,\n  \"bitMedida\": 0,\n  \"desMedidaCorrectivaGen\": \"\",\n  \"idRis\": {{id_ris}},\n  \"tempId\": -5\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 02.8) DetalleInfraccionSancion/Crear - Suspensión sin tiempo ni cantidad -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[03 - Reconsiderar Sin Sanciones] 03.1) Auth/Login', async ({ request }) => {
    const response = await request.post(`/api/Authentication/GetTokenByCodeAndCodeChallenge`, {
      data: {
  "CODE": process.env.REGINSA_PUNKU_CODE || 'punku_code',
  "CODE_CHALLENGE": process.env.REGINSA_PUNKU_CODE_CHALLENGE || 'punku_code_challenge'
}
    });

    // Validar status de respuesta
    console.log(`[Test] 03.1) Auth/Login -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[03 - Reconsiderar Sin Sanciones] 03.2) CabeceraInfraccionSancion/Listar (sin sanciones)', async ({ request }) => {
    const response = await request.post(`/CabeceraInfraccionSancion/ListarPaginado`, {
      data: {
  "nPageNumber": 1,
  "nPageSize": 100,
  "sinSanciones": true
}
    });

    // Validar status de respuesta
    console.log(`[Test] 03.2) CabeceraInfraccionSancion/Listar (sin sanciones) -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[03 - Reconsiderar Sin Sanciones] 03.3) CabeceraInfraccionSancion/Actualizar - Reconsideración sin sanciones', async ({ request }) => {
    const response = await request.put(`/CabeceraInfraccionSancion/Actualizar/${process.env.REGINSA_CABECERA_ID || 'cabecera_id'}`);

    // Validar status de respuesta
    console.log(`[Test] 03.3) CabeceraInfraccionSancion/Actualizar - Reconsideración sin sanciones -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[03 - Reconsiderar Sin Sanciones] 03.4) CabeceraInfraccionSancion/Actualizar - Reconsideración incompleta', async ({ request }) => {
    const response = await request.put(`/CabeceraInfraccionSancion/Actualizar/${process.env.REGINSA_CABECERA_ID || 'cabecera_id'}`);

    // Validar status de respuesta
    console.log(`[Test] 03.4) CabeceraInfraccionSancion/Actualizar - Reconsideración incompleta -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[03 - Reconsiderar Sin Sanciones] 03.5) CabeceraInfraccionSancion/Actualizar - Fecha de reconsideración inválida', async ({ request }) => {
    const response = await request.put(`/CabeceraInfraccionSancion/Actualizar/${process.env.REGINSA_CABECERA_ID || 'cabecera_id'}`);

    // Validar status de respuesta
    console.log(`[Test] 03.5) CabeceraInfraccionSancion/Actualizar - Fecha de reconsideración inválida -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[03 - Reconsiderar Sin Sanciones] 03.6) DetalleInfraccionSancion/Listar (verificación sin sanciones)', async ({ request }) => {
    const response = await request.post(`/DetalleInfraccionSancion/ListarPaginado`, {
      data: "{\n  \"idCabeceraInfraccionSancion\": {{cabecera_id}},\n  \"nPageNumber\": 1,\n  \"nPageSize\": 20,\n  \"sSortColumnName\": \"ID_DETALLE_INFRACCION_SANCION\",\n  \"sSortOrder\": \"DESC\",\n  \"sFilterValue\": \"\"\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 03.6) DetalleInfraccionSancion/Listar (verificación sin sanciones) -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[04 - Reconsiderar Con Sanciones] 04.1) Auth/Login', async ({ request }) => {
    const response = await request.post(`/api/Authentication/GetTokenByCodeAndCodeChallenge`, {
      data: {
  "CODE": process.env.REGINSA_PUNKU_CODE || 'punku_code',
  "CODE_CHALLENGE": process.env.REGINSA_PUNKU_CODE_CHALLENGE || 'punku_code_challenge'
}
    });

    // Validar status de respuesta
    console.log(`[Test] 04.1) Auth/Login -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[04 - Reconsiderar Con Sanciones] 04.2) CabeceraInfraccionSancion/ListarPaginado (con sanciones)', async ({ request }) => {
    const response = await request.post(`/CabeceraInfraccionSancion/ListarPaginado`, {
      data: {
  "nPageNumber": 1,
  "nPageSize": 20
}
    });

    // Validar status de respuesta
    console.log(`[Test] 04.2) CabeceraInfraccionSancion/ListarPaginado (con sanciones) -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[04 - Reconsiderar Con Sanciones] 04.3) CabeceraInfraccionSancion/Actualizar - Reconsideración con sanciones', async ({ request }) => {
    const response = await request.put(`/CabeceraInfraccionSancion/Actualizar/${process.env.REGINSA_CABECERA_ID || 'cabecera_id'}`);

    // Validar status de respuesta
    console.log(`[Test] 04.3) CabeceraInfraccionSancion/Actualizar - Reconsideración con sanciones -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[04 - Reconsiderar Con Sanciones] 04.4) CabeceraInfraccionSancion/Actualizar - Reconsideración incompleta', async ({ request }) => {
    const response = await request.put(`/CabeceraInfraccionSancion/Actualizar/${process.env.REGINSA_CABECERA_ID || 'cabecera_id'}`);

    // Validar status de respuesta
    console.log(`[Test] 04.4) CabeceraInfraccionSancion/Actualizar - Reconsideración incompleta -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[04 - Reconsiderar Con Sanciones] 04.5) CabeceraInfraccionSancion/Actualizar - Fecha de reconsideración inválida', async ({ request }) => {
    const response = await request.put(`/CabeceraInfraccionSancion/Actualizar/${process.env.REGINSA_CABECERA_ID || 'cabecera_id'}`);

    // Validar status de respuesta
    console.log(`[Test] 04.5) CabeceraInfraccionSancion/Actualizar - Fecha de reconsideración inválida -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[04 - Reconsiderar Con Sanciones] 04.6) DetalleInfraccionSancion/ListarPaginado (detalle a reconsiderar)', async ({ request }) => {
    const response = await request.post(`/DetalleInfraccionSancion/ListarPaginado`, {
      data: "{\n  \"idCabeceraInfraccionSancion\": {{cabecera_id}},\n  \"nPageNumber\": 1,\n  \"nPageSize\": 20,\n  \"sSortColumnName\": \"ID_DETALLE_INFRACCION_SANCION\",\n  \"sSortOrder\": \"DESC\",\n  \"sFilterValue\": \"\"\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 04.6) DetalleInfraccionSancion/ListarPaginado (detalle a reconsiderar) -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[04 - Reconsiderar Con Sanciones] 04.7) DetalleInfraccionSancion/ActualizarReconsideracion', async ({ request }) => {
    const response = await request.post(`/DetalleInfraccionSancion/ActualizarReconsideracion`, {
      data: "{\n  \"idDetalleInfraccionSancion\": {{detalle_id}},\n  \"bitReconsidera\": 1,\n  \"fechaReconsideracion\": \"{{$isoTimestamp}}\"\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 04.7) DetalleInfraccionSancion/ActualizarReconsideracion -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[04 - Reconsiderar Con Sanciones] 04.8) DetalleInfraccionSancion/Confirmar', async ({ request }) => {
    const response = await request.post(`/DetalleInfraccionSancion/Confirmar`, {
      data: "{\n  \"idDetalleInfraccionSancion\": {{detalle_id}},\n  \"confirmar\": true\n}"
    });

    // Validar status de respuesta
    console.log(`[Test] 04.8) DetalleInfraccionSancion/Confirmar -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[05 - Consultas y Filtros Operativos] 05.1) Auth/Punku', async ({ request }) => {
    const response = await request.post(`/api/Authentication/GetTokenByCodeAndCodeChallenge`, {
      data: {
  "CODE": process.env.REGINSA_PUNKU_CODE || 'punku_code',
  "CODE_CHALLENGE": process.env.REGINSA_PUNKU_CODE_CHALLENGE || 'punku_code_challenge'
}
    });

    // Validar status de respuesta
    console.log(`[Test] 05.1) Auth/Punku -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[05 - Consultas y Filtros Operativos] 05.2) Entidad/Listar - Búsqueda Administrado (RUC/Razón)', async ({ request }) => {
    const response = await request.get(`/Entidad/Listar`);

    // Validar status de respuesta
    console.log(`[Test] 05.2) Entidad/Listar - Búsqueda Administrado (RUC/Razón) -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[05 - Consultas y Filtros Operativos] 05.3) CabeceraInfraccionSancion/ListarPaginado - Con filtros', async ({ request }) => {
    const response = await request.post(`/CabeceraInfraccionSancion/ListarPaginado`, {
      data: {
  "nPageNumber": 1,
  "nPageSize": 10,
  "filtroGeneral": "FA",
  "numeroExpediente": "FA",
  "numeroResolucion": "FA"
}
    });

    // Validar status de respuesta
    console.log(`[Test] 05.3) CabeceraInfraccionSancion/ListarPaginado - Con filtros -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[05 - Consultas y Filtros Operativos] 05.4) CabeceraInfraccionSancion/ListarPaginado - Limpiar filtros', async ({ request }) => {
    const response = await request.post(`/CabeceraInfraccionSancion/ListarPaginado`, {
      data: {
  "nPageNumber": 1,
  "nPageSize": 10
}
    });

    // Validar status de respuesta
    console.log(`[Test] 05.4) CabeceraInfraccionSancion/ListarPaginado - Limpiar filtros -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[06 - Administrado Búsqueda y Eliminación] 06.1) Entidad/Listar - Búsqueda por RUC', async ({ request }) => {
    const response = await request.get(`/Entidad/Listar?nPageNumber=1&nPageSize=10&ruc=${process.env.REGINSA_RUC_BUSQUEDA || 'ruc_busqueda'}`);

    // Validar status de respuesta
    console.log(`[Test] 06.1) Entidad/Listar - Búsqueda por RUC -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[06 - Administrado Búsqueda y Eliminación] 06.2) Entidad/Listar - Búsqueda por Razón Social', async ({ request }) => {
    const response = await request.get(`/Entidad/Listar?nPageNumber=1&nPageSize=10&razonSocial=${process.env.REGINSA_RAZON_BUSQUEDA || 'razon_busqueda'}`);

    // Validar status de respuesta
    console.log(`[Test] 06.2) Entidad/Listar - Búsqueda por Razón Social -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[06 - Administrado Búsqueda y Eliminación] 06.3) Entidad/Listar - Limpiar filtros', async ({ request }) => {
    const response = await request.get(`/Entidad/Listar?nPageNumber=1&nPageSize=10`);

    // Validar status de respuesta
    console.log(`[Test] 06.3) Entidad/Listar - Limpiar filtros -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[06 - Administrado Búsqueda y Eliminación] 06.4) Entidad/Eliminar - Eliminar administrado', async ({ request }) => {
    const response = await request.delete(`/Entidad/Eliminar/${process.env.REGINSA_ID_ENTIDAD_ENCONTRADA || 'id_entidad_encontrada'}`);

    // Validar status de respuesta
    console.log(`[Test] 06.4) Entidad/Eliminar - Eliminar administrado -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[07 - Infracción/Sanción Gestión Expediente] 07.1) CabeceraInfraccionSancion/ListarPaginado - Localizar expediente para gestión', async ({ request }) => {
    const response = await request.post(`/CabeceraInfraccionSancion/ListarPaginado`, {
      data: {
  "nPageNumber": 1,
  "nPageSize": 5
}
    });

    // Validar status de respuesta
    console.log(`[Test] 07.1) CabeceraInfraccionSancion/ListarPaginado - Localizar expediente para gestión -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[07 - Infracción/Sanción Gestión Expediente] 07.2) CabeceraInfraccionSancion/Eliminar - Eliminar expediente', async ({ request }) => {
    const response = await request.delete(`/CabeceraInfraccionSancion/Eliminar/${process.env.REGINSA_CABECERA_ID || 'cabecera_id'}`);

    // Validar status de respuesta
    console.log(`[Test] 07.2) CabeceraInfraccionSancion/Eliminar - Eliminar expediente -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[07 - Infracción/Sanción Gestión Expediente] 07.3) CabeceraInfraccionSancion/Ocultar - Ocultar expediente', async ({ request }) => {
    const response = await request.put(`/CabeceraInfraccionSancion/Ocultar/${process.env.REGINSA_CABECERA_ID || 'cabecera_id'}`);

    // Validar status de respuesta
    console.log(`[Test] 07.3) CabeceraInfraccionSancion/Ocultar - Ocultar expediente -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });

  test('[07 - Infracción/Sanción Gestión Expediente] 07.4) CabeceraInfraccionSancion/Exportar - Exportar listado', async ({ request }) => {
    const response = await request.post(`/CabeceraInfraccionSancion/Exportar`, {
      data: {
  "nPageNumber": 1,
  "nPageSize": 100
}
    });

    // Validar status de respuesta
    console.log(`[Test] 07.4) CabeceraInfraccionSancion/Exportar - Exportar listado -> Status: ${response.status()}`);
    expect(response.ok()).toBeTruthy();
  });
});
