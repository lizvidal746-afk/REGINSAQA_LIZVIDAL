// tools/generar-plan-excel.js
const ExcelJS = require('exceljs');
const fs = require('node:fs');
const path = require('node:path');

function caso(id_num, id, modulo, nombre, escenario, comando, datos, esperado, estado = 'PENDIENTE') {
  return { id_num, id, modulo, nombre, escenario, comando, datos, esperado, estado };
}

async function crearPlanPruebas() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Matriz de Casos de Prueba');

  sheet.columns = [
    { header: 'N°', key: 'id_num', width: 6 },
    { header: 'ID CASO', key: 'id', width: 13 },
    { header: 'MÓDULO', key: 'modulo', width: 16 },
    { header: 'NOMBRE DEL CASO DE PRUEBA', key: 'nombre', width: 34 },
    { header: 'ESCENARIO / CARGA', key: 'escenario', width: 24 },
    { header: 'INSTRUCCIÓN / COMANDO', key: 'comando', width: 36 },
    { header: 'CONDICIÓN Y DATOS DE ENTRADA', key: 'datos', width: 48 },
    { header: 'RESULTADO ESPERADO (CAPACIDAD)', key: 'esperado', width: 55 },
    { header: 'ESTADO', key: 'estado', width: 13 },
  ];

  const casos = [];
  const add = (id, modulo, nombre, escenario, comando, datos, esperado, estado = 'LISTO') => {
    casos.push(caso(casos.length + 1, id, modulo, nombre, escenario, comando, datos, esperado, estado));
  };

  add(
    'CP-REG-00',
    'REGINSA - Login',
    'Smoke Baseline - Login Punku',
    'Smoke',
    'npm run smoke:caso00',
    '1 VU / 4 iteraciones / validación rápida de autenticación y conectividad.',
    'Confirmar token, credenciales y disponibilidad mínima antes de ejecutar casos de negocio.',
  );

  [
    ['smoke', 'Smoke', '1 VU / 4 iteraciones / creación simple de administrado.', 'Validar payload, token y creación funcional con contador reginsa_created_records.'],
    ['audit', 'Audit Multi-IP', '9 IPs / 9 VUs / 4 iteraciones por VU / trazabilidad por nodo.', 'Validar distribución por IP, 2xx, 429, error/red y creadas reales sin doble conteo.'],
    ['load', 'Load', '9 VUs constantes / duración configurable K6_LOAD_DURATION.', 'Validar carga nominal sostenida del alta de administrado.'],
    ['stress', 'Stress', 'Rampa progresiva configurable hasta K6_STRESS_VUS_4.', 'Medir degradación controlada de p95/p99 y checks funcionales.'],
    ['spike', 'Spike', 'Pico repentino configurable con K6_SPIKE_*.', 'Medir absorción de pico y recuperación del endpoint Entidad/Crear.'],
    ['soak', 'Soak', 'Carga moderada sostenida configurable K6_SOAK_DURATION.', 'Detectar fatiga, degradación gradual o límites temporales del servicio.'],
    ['collapse', 'Collapse', 'Ramping arrival rate destructivo controlado.', 'Identificar punto de ruptura y primera aparición relevante de 429/5xx/timeout.'],
    ['attack', 'Attack', 'Escalones instantáneos de VUs configurables K6_ATTACK_*.', 'Auditar resistencia a saturación súbita y rate limiting.'],
    ['oneshot', 'One Shot', 'Ráfaga instantánea de VUs K6_ONESHOT_VUS.', 'Validar respuesta a concurrencia inicial extrema.'],
  ].forEach(([cmd, escenario, datos, esperado]) => {
    add(
      'CP-REG-01',
      'REGINSA - Administrado',
      `Caso 01 - Agregar Administrado (${escenario})`,
      escenario,
      `npm run ${cmd}:caso01`,
      datos,
      esperado,
    );
  });

  [
    ['smoke', 'Smoke', '1 VU / 4 iteraciones / flujo mínimo de sanción.', 'Validar flujo de listar infracción, crear cabecera, medida correctiva y detalle.'],
    ['audit', 'Audit Multi-IP', '9 IPs / 9 VUs / 4 iteraciones por VU / varios endpoints.', 'Auditar por endpoint e IP: consulta vs creación, 2xx, 429, error/red y creadas reales.'],
    ['load', 'Load', '9 VUs constantes / duración configurable K6_LOAD_DURATION.', 'Validar carga nominal sostenida del flujo completo de sanción.'],
    ['stress', 'Stress', 'Rampa progresiva configurable hasta K6_STRESS_VUS_4.', 'Medir degradación por endpoint y punto donde falla la cadena de creación.'],
    ['spike', 'Spike', 'Pico repentino configurable con K6_SPIKE_*.', 'Medir absorción de pico por endpoint y recuperación posterior.'],
    ['soak', 'Soak', 'Carga moderada sostenida configurable K6_SOAK_DURATION.', 'Detectar fatiga, límites por ventana y degradación en flujo encadenado.'],
    ['collapse', 'Collapse', 'Ramping arrival rate destructivo controlado.', 'Identificar punto de ruptura del flujo y endpoint dominante del fallo.'],
    ['attack', 'Attack', 'Escalones instantáneos de VUs configurables K6_ATTACK_*.', 'Auditar saturación súbita, 429 y 5xx por endpoint.'],
    ['oneshot', 'One Shot', 'Ráfaga instantánea de VUs K6_ONESHOT_VUS.', 'Validar resistencia de gateway/API ante disparo masivo inicial.'],
  ].forEach(([cmd, escenario, datos, esperado]) => {
    add(
      'CP-REG-02',
      'REGINSA - Sanciones',
      `Caso 02 - Registrar Sanción (${escenario})`,
      escenario,
      `npm run ${cmd}:caso02`,
      datos,
      esperado,
    );
  });

  [
    ['smoke', 'Smoke', '1 VU / 4 iteraciones / reconsideración con sanciones.', 'Validar precondiciones, detalle y guardado funcional de reconsideración.'],
    ['audit', 'Audit Multi-IP', '9 IPs / 9 VUs / 4 iteraciones por VU / flujo de reconsideración.', 'Auditar por endpoint e IP: cabecera, detalle, actualización y guardado de reconsideración.'],
    ['load', 'Load', '9 VUs constantes / duración configurable K6_LOAD_DURATION.', 'Validar carga nominal sostenida del flujo de reconsideración.'],
    ['stress', 'Stress', 'Rampa progresiva configurable hasta K6_STRESS_VUS_4.', 'Medir degradación y rechazos funcionales por endpoint.'],
    ['spike', 'Spike', 'Pico repentino configurable con K6_SPIKE_*.', 'Medir absorción de pico y recuperación del flujo de reconsideración.'],
    ['soak', 'Soak', 'Carga moderada sostenida configurable K6_SOAK_DURATION.', 'Detectar fatiga o límites temporales en reconsideraciones.'],
    ['collapse', 'Collapse', 'Ramping arrival rate destructivo controlado.', 'Identificar punto de ruptura y endpoint dominante del fallo.'],
    ['attack', 'Attack', 'Escalones instantáneos de VUs configurables K6_ATTACK_*.', 'Auditar saturación súbita, 429 y 5xx por endpoint.'],
    ['oneshot', 'One Shot', 'Ráfaga instantánea de VUs K6_ONESHOT_VUS.', 'Validar resistencia a concurrencia inicial extrema.'],
  ].forEach(([cmd, escenario, datos, esperado]) => {
    add(
      'CP-REG-04',
      'REGINSA - Reconsideración',
      `Caso 04 - Reconsiderar con Sanciones (${escenario})`,
      escenario,
      `npm run ${cmd}:caso04`,
      datos,
      `${esperado} Requiere confirmar payload productivo en primera corrida controlada.`,
      'LISTO BASE',
    );
  });

  sheet.addRows(casos);

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1A237E' } };
    cell.font = { color: { argb: 'FFFFFF' }, bold: true, size: 11, name: 'Segoe UI' };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'medium', color: { argb: 'FF1A237E' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    };
  });
  headerRow.height = 35;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.font = { size: 10, name: 'Segoe UI' };

      if (cell.value === 'PENDIENTE') {
        cell.font = { color: { argb: 'E65100' }, bold: true, name: 'Segoe UI' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E5F5' } };
      }
    });
    row.height = 60;
  });

  sheet.getColumn('id_num').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getColumn('id').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getColumn('modulo').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet.getColumn('estado').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = 'A1:I1';

  const fileName = 'PLAN_DE_PRUEBAS_K6_REGINSA.xlsx';
  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const frameworkPath = path.join(__dirname, '..', fileName);
  const reportsPath = path.join(reportsDir, fileName);
  await workbook.xlsx.writeFile(frameworkPath);
  await workbook.xlsx.writeFile(reportsPath);

  console.log(`\n============================================================`);
  console.log(`✅ [EXITO] Plan de Pruebas con ${casos.length} casos generado.`);
  console.log(`Ruta Principal: ${frameworkPath}`);
  console.log(`Ruta Reports  : ${reportsPath}`);
  console.log(`============================================================\n`);
}

crearPlanPruebas().catch((err) => {
  console.error(err);
  process.exit(1);
});
