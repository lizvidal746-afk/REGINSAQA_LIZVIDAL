const path = require('path');
const Excel = require('exceljs');

const excelPath = path.resolve('D:/SUNEDU/AUTOMATIZACION/REGINSA/REGINSA_PF/playwright_ui/tools/PLAN_DE_PRUEBAS_FUNCIONALES_REGINSA.xlsx');

(async () => {
  const workbook = new Excel.Workbook();
  try {
    await workbook.xlsx.readFile(excelPath);
    console.log('Loaded existing workbook');
  } catch (e) {
    console.log('Workbook not found or corrupt, creating new');
  }

  // Ensure a sheet named "Casos" exists
  let casosSheet = workbook.getWorksheet('Casos');
  if (!casosSheet) {
    casosSheet = workbook.addWorksheet('Casos');
    casosSheet.columns = [
      { header: 'ID Caso', key: 'id', width: 15 },
      { header: 'Nombre del Flujo', key: 'nombre', width: 30 },
      { header: 'Prioridad', key: 'prioridad', width: 12 },
      { header: 'Fase de Ejecución', key: 'fase', width: 20 },
      { header: 'Workers / Usuarios', key: 'workers', width: 15 },
      { header: 'Registros Esperados', key: 'registros', width: 18 }
    ];
  }

  const casosData = [
    ['CP-REG-01', 'Agregar administrado', 'Alta', 'Smoke', 1, 1],
    ['CP-REG-01', 'Agregar administrado', 'Alta', 'Fase 1', 9, 9],
    ['CP-REG-02', 'Registrar sancion', 'Crítica', 'Smoke', 1, 1],
    ['CP-REG-02', 'Registrar sancion', 'Crítica', 'Fase 1', 9, 9],
    ['CP-REG-02', 'Registrar sancion', 'Crítica', 'Fase 2', 9, 36],
    ['CP-REG-02', 'Registrar sancion', 'Crítica', 'Regresión', 9, 9],
    ['CP-REG-02', 'Registrar sancion', 'Crítica', 'Cross-Browser', 9, 9],
    ['CP-REG-02', 'Registrar sancion', 'Alta', 'Accesibilidad (a11y)', 1, 0],
    ['CP-REG-02', 'Registrar sancion', 'Alta', 'Seguridad UI (XSS)', 1, 0],
    ['CP-REG-04', 'Reconsiderar con sanciones', 'Alta', 'Smoke', 1, 1],
    ['CP-REG-04', 'Reconsiderar con sanciones', 'Alta', 'Fase 1', 9, 9]
  ];

  // Insert rows if not present (simple check by ID+Fase)
  casosData.forEach(row => {
    const [id, nombre, prioridad, fase, workers, registros] = row;
    const exists = casosSheet.findRow(r => r.getCell('A').value === id && r.getCell('D').value === fase);
    if (!exists) {
      casosSheet.addRow({ id, nombre, prioridad, fase, workers, registros });
    }
  });

  // Ensure a sheet named "KPIs" exists
  let kpiSheet = workbook.getWorksheet('KPIs');
  if (!kpiSheet) {
    kpiSheet = workbook.addWorksheet('KPIs');
    kpiSheet.columns = [
      { header: 'Categoría', key: 'cat', width: 20 },
      { header: 'Métrica / KPI', key: 'kpi', width: 30 },
      { header: 'Por qué es importante', key: 'por_que', width: 50 },
      { header: 'Criterio de Éxito (Go/No-Go)', key: 'criterio', width: 45 }
    ];
  }

  const kpiData = [
    ['Confiabilidad', 'Tasa de éxito funcional', 'Asegura que el flujo crítico se completa de fin a fin sin errores', '>= 95% de éxito en flujos críticos'],
    ['Integridad de Datos', 'Completitud de registros (Go/No-Go)', 'Si se lanzan N workers, deben haber N registros creados en BD/UI.', '100% de registros esperados creados'],
    ['Aislamiento', 'Tasa de aislamiento por usuario/IP', 'Evita colisión de sesiones, cachés o datos cruzados al ejecutar en paralelo.', '0 colisiones de datos o sesiones'],
    ['Estabilidad', 'Tasa de Flakiness', 'Tests que fallan aleatoriamente ocultan errores reales e incrementan falsos positivos.', '< 5% de flakiness admitido'],
    ['Resiliencia', 'Presión de Retries', 'Un test que requiere 3 retries para pasar revela problemas de estabilidad en el entorno/UI.', 'Máximo 1 retry tolerable en CI'],
    ['Trazabilidad', 'Completitud de Evidencia', 'Para auditoría, cada fallo debe tener screenshot/trace asignado a su worker.', '100% de fallos documentados automáticamente'],
    ['Performance UX', 'Duración P95 del Flujo Completo', 'Si el registro demora demasiado bajo concurrencia leve, hay cuellos de botella.', 'Tiempo total del flujo funcional < Umbral aceptable']
  ];

  kpiData.forEach(row => {
    const [cat, kpi, por, crit] = row;
    const exists = kpiSheet.findRow(r => r.getCell('A').value === cat && r.getCell('B').value === kpi);
    if (!exists) {
      kpiSheet.addRow({ cat, kpi, por_que: por, criterio: crit });
    }
  });

  // Add placeholder sheets for IP metrics and Leyenda if not present
  if (!workbook.getWorksheet('IP_Metricas')) {
    const ipSheet = workbook.addWorksheet('IP_Metricas');
    ipSheet.columns = [
      { header: 'IP', key: 'ip', width: 15 },
      { header: 'Métrica 1', key: 'm1', width: 20 },
      { header: 'Métrica 2', key: 'm2', width: 20 },
      { header: 'Métrica 3', key: 'm3', width: 20 },
      { header: 'Total', key: 'total', width: 12 }
    ];
    ipSheet.addRow({ ip: 'Ejemplo 1.2.3.4', m1: 0, m2: 0, m3: 0, total: 0 });
  }

  if (!workbook.getWorksheet('Leyenda')) {
    const leyenda = workbook.addWorksheet('Leyenda');
    leyenda.addRow(['Estándar', 'Descripción', 'Aplicación en Reporte']);
    const rows = [
      ['ISTQB CTFL', 'Certified Tester Foundation Level', 'Encabezado, contexto, KPIs'],
      ['ISO/IEC 25010', 'SQuaRE - Quality Model', 'Métricas de calidad'],
      ['IEEE 829-2008', 'Standard for Test Documentation', 'Estructura profesional del reporte'],
      ['ISO/IEC/IEEE 29119', 'Software Testing Standard', 'Estructura completa y trazabilidad']
    ];
    rows.forEach(r => leyenda.addRow(r));
  }

  await workbook.xlsx.writeFile(excelPath);
  console.log('✅ PLAN_DE_PRUEBAS_FUNCIONALES_REGINSA.xlsx actualizado con casos, KPIs, IP y Leyenda.');
})();
