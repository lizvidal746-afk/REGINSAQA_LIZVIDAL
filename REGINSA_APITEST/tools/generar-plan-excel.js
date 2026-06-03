const ExcelJS = require('exceljs');
const path = require('path');

async function generateExcelPlan() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Plan de Pruebas API');

  // Configurar las columnas (mimic K6 structure)
  worksheet.columns = [
    { header: 'N°', key: 'n', width: 5 },
    { header: 'ID CASO', key: 'id', width: 15 },
    { header: 'MÓDULO', key: 'modulo', width: 20 },
    { header: 'NOMBRE DEL CASO DE PRUEBA', key: 'nombre', width: 45 },
    { header: 'TIPO DE PRUEBA', key: 'escenario', width: 20 },
    { header: 'INSTRUCCIÓN / COMANDO', key: 'comando', width: 65 },
    { header: 'CONDICIÓN Y DATOS DE ENTRADA', key: 'condicion', width: 50 },
    { header: 'RESULTADO ESPERADO', key: 'esperado', width: 50 },
    { header: 'ESTADO', key: 'estado', width: 15 }
  ];

  // Aplicar estilo al encabezado
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  const testCases = [
    {
      n: 1, id: 'CP-API-00', modulo: 'REGINSA - Auth', nombre: 'API Smoke Health Check (Autenticación y Conectividad)', escenario: 'Smoke API',
      comando: 'npx playwright test tests/health-check.smoke.spec.ts --project=api-smoke',
      condicion: 'Credenciales en .env validas. Validar generación de Token JWT vía Punku',
      esperado: 'Playwright debe obtener el Token, inyectarlo en headers y enviar una petición sin error de autenticación.', estado: 'LISTO'
    },
    {
      n: 2, id: 'CP-API-01', modulo: 'REGINSA - Sanciones', nombre: 'Flujo API: Caso 01 - Registro Entidad Administrado', escenario: 'Regression API',
      comando: 'npx playwright test tests/reginsa_api_test___caso_01_entidad.regression.spec.ts --project=api-regression',
      condicion: 'Ejecución secuencial de los endpoints del caso 01. Requiere Token JWT activo.',
      esperado: 'Todos los endpoints deben devolver HTTP 200/201 con el esquema JSON esperado en los responses.', estado: 'LISTO'
    },
    {
      n: 3, id: 'CP-API-02', modulo: 'REGINSA - Sanciones', nombre: 'Flujo API: Caso 02 - Registrar Sanción', escenario: 'Regression API',
      comando: 'npx playwright test tests/reginsa_api_test___caso_02_registrar_sancion.regression.spec.ts --project=api-regression',
      condicion: 'Ejecución secuencial de los endpoints del caso 02.',
      esperado: 'Registro de la sanción a nivel backend debe reflejarse correctamente sin errores de DB.', estado: 'LISTO'
    },
    {
      n: 4, id: 'CP-API-03', modulo: 'REGINSA - Sanciones', nombre: 'Flujo API: Caso 03 - Reconsiderar sin sanciones', escenario: 'Regression API',
      comando: 'npx playwright test tests/reginsa_api_test___caso_03_reconsiderar_sin_sanciones.regression.spec.ts --project=api-regression',
      condicion: 'Ejecución secuencial de los endpoints del caso 03.',
      esperado: 'El cambio de estado de la reconsideración debe ser exitoso (HTTP 200).', estado: 'LISTO'
    },
    {
      n: 5, id: 'CP-API-04', modulo: 'REGINSA - Sanciones', nombre: 'Flujo API: Caso 04 - Reconsiderar con sanciones', escenario: 'Regression API',
      comando: 'npx playwright test tests/reginsa_api_test___caso_04_reconsiderar_con_sanciones.regression.spec.ts --project=api-regression',
      condicion: 'Ejecución secuencial de los endpoints del caso 04.',
      esperado: 'Se debe aplicar la reconsideración manteniendo la trazabilidad de las sanciones.', estado: 'LISTO'
    },
    {
      n: 6, id: 'CP-API-99', modulo: 'REGINSA - Core', nombre: 'Regresión Completa Maestra (Todos los Casos)', escenario: 'Regression Full',
      comando: 'npx playwright test --project=api-regression',
      condicion: 'Validar toda la suite de API Migrada de Postman.',
      esperado: 'Todos los 59 endpoints de todos los flujos deben estar en verde.', estado: 'LISTO'
    }
  ];

  worksheet.addRows(testCases);

  // Dar formato a las celdas
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.border = {
        top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'}
      };
      if (rowNumber > 1) {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      }
    });
    // Color de estado
    if (rowNumber > 1) {
      row.getCell('estado').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } }; // Verde
      row.getCell('estado').alignment = { vertical: 'middle', horizontal: 'center' };
    }
  });

  const outputPath = path.join(__dirname, '../PLAN_DE_PRUEBAS_API_REGINSA.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Plan de Pruebas de API generado en: ${outputPath}`);
}

generateExcelPlan().catch(console.error);
