/**
 * tools/generar-excel.js — REGINSA Playwright UI
 * 8 hojas: Dashboard · Desglose · Workers · Errores · IPs · Mejoras · Leyenda · Espectro
 * Usa PlaywrightReader como única fuente de datos.
 */
const path = require('node:path');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const { PlaywrightReader, fmtMs, fmtPct, resolveTargetJson } = require('./lib/playwright-reader');
const { buildFallback } = require('./ai-prompts');

// ── Estilos reutilizables ────────────────────────────────────────────────────
const FILL = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const FONT = (o = {}) => ({
  bold: o.bold,
  size: o.size ?? 11,
  color: { argb: o.color ?? 'FF111111' },
  name: 'Calibri',
});
const BORDER = { style: 'thin', color: { argb: 'FFCCCCCC' } };
const BORDERS = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
const ALIGN = (h = 'center', v = 'middle') => ({ horizontal: h, vertical: v, wrapText: true });

const HDR_FILL = FILL('FF1A237E');
const HDR_FONT = FONT({ bold: true, color: 'FFFFFFFF', size: 10 });
const SUB_FILL = FILL('FF3949AB');
const GRS_FILL = FILL('FFF5F5F5');
const VEF_FILL = FILL('FFE8F5E9');
const ROF_FILL = FILL('FFFFEBEE');
const AMF_FILL = FILL('FFFFF8E1');
const AZC_FILL = FILL('FFE8EAF6');

function applyHdr(cell, text, fillStyle = HDR_FILL) {
  cell.value = text;
  cell.fill = fillStyle;
  cell.font = HDR_FONT;
  cell.alignment = ALIGN();
  cell.border = BORDERS;
}

function statusFill(pass) {
  return pass ? VEF_FILL : ROF_FILL;
}

function annotationValue(test, type, fallback = 'N/A') {
  const ann = Array.isArray(test.annotations)
    ? test.annotations.find((item) => item && item.type === type)
    : null;
  return ann && ann.description ? ann.description : fallback;
}

function collectQualityFindings(r) {
  const findings = [];
  const reportFindings = Array.isArray(r._raw?.hallazgosTecnicos) ? r._raw.hallazgosTecnicos : [];
  for (const finding of reportFindings) {
    if (finding?.id === 'HAL-CP01-ENTIDAD-CREAR-NET-ERR-FAILED') {
      findings.push([
        finding.id,
        finding.severidad || 'Alta',
        finding.tipo || 'Hallazgo funcional/técnico',
        finding.descripcion || '',
        finding.recomendacion || '',
      ]);
    }
  }
  const cp01NetErrTests = r.testList.filter((test) => (test.errors || []).some((err) => String(err.message || err).includes('Entidad/Crear') && String(err.message || err).includes('net::ERR_FAILED')));
  if (cp01NetErrTests.length > 0 && !findings.some((row) => row[0] === 'HAL-CP01-ENTIDAD-CREAR-NET-ERR-FAILED')) {
    const causa = process.env.REGINSA_CP01_NET_ERR_FAILED_CAUSA ? ` Causa indicada por el proyecto: ${process.env.REGINSA_CP01_NET_ERR_FAILED_CAUSA}${process.env.REGINSA_CP01_NET_ERR_FAILED_FUENTE ? ` (fuente: ${process.env.REGINSA_CP01_NET_ERR_FAILED_FUENTE})` : ''}.` : ' Causa no parametrizada por QA; requiere análisis del equipo responsable del sistema.';
    findings.push([
      'HAL-CP01-ENTIDAD-CREAR-NET-ERR-FAILED-DIRECT',
      'Alta',
      'Hallazgo funcional/técnico CP-REG-01',
      `CP-REG-01 presentó abortos de red en Entidad/Crear con net::ERR_FAILED, sin código HTTP de respuesta.${causa}`,
      'Endpoint Entidad/Crear debe responder siempre con HTTP controlado; registrar RUC, usuario, IP, timestamp, request id y causa. Si existe límite/rate limit, devolver 429 o mensaje claro. Angular debe bloquear doble envío y mostrar error técnico visible. Revisar Proxy/WAF/IIS/API Gateway.',
    ]);
  }
  const caseTests = r.testList.filter((test) => /registrar sanción|registrar sancion|sanción|sancion/i.test(test.title));

  caseTests.forEach((test) => {
    const sanciones = Number(annotationValue(test, 'sancionesEjecutadas', 'NaN'));
    const registroId = annotationValue(test, 'registroId', '');
    const timeoutNote = annotationValue(test, 'timeoutJustificacion', '');
    const negativeExpected = annotationValue(test, 'defectoEsperadoSiPermiteGuardar', '');

    if (test.status === 'passed' && Number.isFinite(sanciones) && sanciones < 1 && registroId) {
      findings.push([
        'DEF-FUNC-SIN-SANCION',
        'Crítica',
        'Regla de negocio',
        `El sistema permitió persistir el registro ${registroId} sin al menos 1 sanción.`,
        'Bloquear en backend el guardado de cabecera si no existe detalle de sanción asociado.',
      ]);
    }

    if ((test.status === 'failed' || test.status === 'timedOut') && !registroId) {
      findings.push([
        'DEF-EVID-NO-CREADO',
        'Alta',
        'Persistencia / evidencia',
        'La prueba no creó caso en el sistema o no llegó a confirmar ID real del backend.',
        'Revisar trace/video y mantener la regla: sin ID real + persistencia no hay aprobación funcional.',
      ]);
    }

    if (timeoutNote && test.durationMs > 120000) {
      findings.push([
        'OBS-TIEMPO-SMOKE',
        'Media',
        'Rendimiento funcional / estabilidad UI',
        `Se amplió el timeout porque ${timeoutNote}`,
        'Medir tiempos por paso y levantar defecto de rendimiento/UX si supera el umbral acordado.',
      ]);
    }

    if (negativeExpected) {
      findings.push([
        'CTRL-NEG-SIN-SANCION',
        'Crítica',
        'Control negativo',
        negativeExpected,
        'Ejecutar este control como prueba negativa separada y documentar evidencia si el backend persiste el registro.',
      ]);
    }
  });

  const seen = new Set();
  return findings.filter((row) => {
    const key = row.join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classifyPersistencia(attempts) {
  let confirmadas = 0;
  let indeterminadas = 0;
  let noConfirmadas = 0;
  const indetList = [];

  for (const a of attempts) {
    const hasReg = !!a.registroId;
    const hasFunctionalEvidence = !!(a.functionalEvidence || a.apiEndpoint || a.evidenciaFuncional || a.operacionFuncional);
    const errorsStr = (a.errors || []).join(' ').toLowerCase();
    const isFailed = a.status !== 'passed';
    
    if (hasReg || (a.status === 'passed' && hasFunctionalEvidence)) {
      confirmadas++;
    } else if (isFailed) {
      const isIndet = a.apiEndpoint || errorsStr.includes('no se capturó un id real') || errorsStr.includes('toast de éxito');
      if (isIndet) {
        indeterminadas++;
        indetList.push(a);
      } else {
        noConfirmadas++;
      }
    }
  }

  return { confirmadas, indeterminadas, noConfirmadas, indetList };
}

function buildDashboard(wb, r, aiReport) {
  const ws = wb.addWorksheet('1-Dashboard');
  ws.columns = [{ width: 38 }, { width: 26 }, { width: 22 }, { width: 55 }];

  ws.mergeCells('A1:D1');
  applyHdr(ws.getCell('A1'), 'REGINSA PLAYWRIGHT UI — MATRIZ DE AUDITORÍA FUNCIONAL');
  ws.getRow(1).height = 28;

  ws.addRow([]);
  const metaHdr = ws.addRow(['METADATO', 'VALOR', '', '']);
  metaHdr.eachCell((c) => {
    c.fill = AZC_FILL;
    c.font = FONT({ bold: true, size: 10 });
    c.border = BORDERS;
  });

  const meta = [
    ['Sistema', 'REGINSA'],
    ['Tipo de Prueba', 'Pruebas Funcionales UI — Playwright'],
    ['IP de Origen', r.sourceIp],
    ['Tiempo de Prueba', r.durationStr],
    ['ID de Ejecución', r.runId],
    ['Workers', String(r.functionalWorkerList?.length || r.workerList.length)],
    ['Fecha de Generación', r.generatedAt],
    ['Responsable QA', 'Liz Vidal'],
    ['Estándares', 'ISTQB CTFL · ISO/IEC 25010 · IEEE 829 · ISO/IEC/IEEE 29119'],
  ];
  meta.forEach(([k, v]) => {
    const row = ws.addRow([k, v]);
    row.getCell(1).fill = GRS_FILL;
    row.getCell(1).font = FONT({ bold: true, size: 10 });
    row.getCell(2).font = FONT({ size: 10 });
    row.eachCell((c) => (c.border = BORDERS));
  });

  const dual = r.dualView;
  const { testListFinal, attemptList, integridad } = dual;
  const pClass = classifyPersistencia(attemptList);

  const testsUnicos = testListFinal.length;
  const testsFuncionales = integridad.testsFuncionales ?? testsUnicos;
  const intentosTotales = attemptList.length;
  const retriesTotal = integridad.retriesTotal;
  const passedLimpios = testListFinal.filter(t => !t.hadRetries && (t.finalStatus === 'passed' || t.finalStatus === 'flaky')).length;
  const flakyCount = testListFinal.filter(t => t.hadRetries).length;
  const retryBurdenPct = testsUnicos > 0 ? ((retriesTotal / testsUnicos) * 100) : 0;
  const hasNoEndpoint = dual.endpointSummary.some(ep => ep.endpoint === 'NO_ENDPOINT');

  ws.addRow([]);
  const glosHdrRow = ws.addRow(['GLOSARIO DE MÉTRICAS — FUENTE ÚNICA DE VERDAD', '', '', '']);
  ws.mergeCells(`A${glosHdrRow.number}:D${glosHdrRow.number}`);
  applyHdr(glosHdrRow.getCell(1), 'GLOSARIO DE MÉTRICAS — FUENTE ÚNICA DE VERDAD', HDR_FILL);
  ws.getRow(glosHdrRow.number).height = 22;

  const glosColHdr = ws.addRow(['MÉTRICA', 'VALOR', 'UMBRAL / REFERENCIA', 'DEFINICIÓN (ISO 29119-3 / ISTQB)']);
  glosColHdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));
  ws.getRow(glosColHdr.number).height = 18;

  const retryBurdenOk = retryBurdenPct <= 15;
  const flakyRateOk = flakyCount / testsUnicos <= 0.15;
  const persistenciaFuncional = integridad.ratioPersistenciaFuncional ?? integridad.ratioPersistenciaUnica;
  const persistenciaOk = persistenciaFuncional >= 95;

  const glosData = [
    [
      'Tests Únicos',
      testsUnicos,
      '= total consolidado',
      'Resultado neto por caso de prueba. Sin duplicar retries. Referencia: ISTQB CTFL 4.4.',
      VEF_FILL, 'FF2E7D32'
    ],
    [
      'Intentos Totales (Ejecuciones Brutas)',
      intentosTotales,
      `> Tests Únicos si hay retries`,
      'Ejecuciones brutas incluyendo reintentos automáticos. Referencia: ISO 29119-3.',
      AZC_FILL, 'FF1A237E'
    ],
    [
      'Passed Limpio (sin retry)',
      passedLimpios,
      `Ideal ≥ ${testsUnicos}`,
      'Casos aprobados al primer intento, sin necesitar reintentos. Referencia: ISTQB CTAL-TAE.',
      passedLimpios === testsUnicos ? VEF_FILL : AMF_FILL,
      passedLimpios === testsUnicos ? 'FF2E7D32' : 'FFF57F00'
    ],
    [
      'Flaky — Tasa de Flakiness',
      `${flakyCount} tests (${(flakyCount / testsUnicos * 100).toFixed(2)}%)`,
      '≤ 15% tolerable',
      'Casos que pasaron tras necesitar retries. Indica inestabilidad técnica recuperable. Ref: ISTQB.',
      flakyRateOk ? AMF_FILL : ROF_FILL,
      flakyRateOk ? 'FFF57F00' : 'FFC62828'
    ],
    [
      'Retry Burden % ★ CLAVE',
      `${retryBurdenPct.toFixed(2)}%`,
      '≤ 15% recomendado',
      `Carga operacional de retries = (${retriesTotal} retries / ${testsUnicos} tests únicos) × 100. Un valor alto indica inestabilidad aunque el PASS sea 100%.`,
      retryBurdenPct <= 15 ? AMF_FILL : ROF_FILL,
      retryBurdenPct <= 15 ? 'FFF57F00' : 'FFC62828'
    ],
    [
      'Persistencia Funcional %',
      fmtPct(persistenciaFuncional / 100),
      '≥ 95% objetivo',
      `Registros con ID de BD confirmado vs. Tests Funcionales = (${integridad.registrosUnicos} / ${testsFuncionales}) × 100. Ref: ISO 25010.`,
      persistenciaOk ? VEF_FILL : AMF_FILL,
      persistenciaOk ? 'FF2E7D32' : 'FFF57F00'
    ],
  ];

  glosData.forEach(([k, v, ref, def, fill, color]) => {
    const row = ws.addRow([k, v, ref, def]);
    row.getCell(1).font = FONT({ bold: true, size: 10 });
    row.getCell(1).alignment = ALIGN('left');
    row.getCell(4).alignment = ALIGN('left');
    if (fill) row.eachCell((c) => (c.fill = fill));
    if (color) [2].forEach((n) => { row.getCell(n).font = FONT({ size: 11, bold: true, color }); });
    row.eachCell((c) => (c.border = BORDERS));
    row.height = 28;
  });

  if (hasNoEndpoint) {
    ws.addRow([]);
    const noEpHdr = ws.addRow(['⚠️ DEUDA DE OBSERVABILIDAD DETECTADA', '', '', '']);
    ws.mergeCells(`A${noEpHdr.number}:D${noEpHdr.number}`);
    applyHdr(noEpHdr.getCell(1), '⚠️ DEUDA DE OBSERVABILIDAD DETECTADA', FILL('FFFF6F00'));
    ws.getRow(noEpHdr.number).height = 22;

    const noEpRow = ws.addRow([
      'NO_ENDPOINT detectado',
      `${dual.endpointSummary.find(ep => ep.endpoint === 'NO_ENDPOINT')?.llamadasTotales ?? 0} intentos sin endpoint trazable`,
      '🔴 Requiere intervención',
      '⚠️ Deuda de Observabilidad — Requiere intervención en el test o en la API. Los intentos clasificados como NO_ENDPOINT no tienen trazabilidad de endpoint, lo que impide auditar la cadena completa de petición/respuesta/persistencia.'
    ]);
    noEpRow.eachCell((c) => {
      c.fill = AMF_FILL;
      c.font = FONT({ size: 10, bold: false });
      c.border = BORDERS;
      c.alignment = ALIGN('left');
    });
    noEpRow.getCell(1).font = FONT({ size: 10, bold: true, color: 'FFC62828' });
    noEpRow.height = 40;
  }

  ws.addRow([]);
  const integrityHdrRow = ws.addRow(['INTEGRIDAD DE PERSISTENCIA', '', '', '']);
  ws.mergeCells(`A${integrityHdrRow.number}:D${integrityHdrRow.number}`);
  applyHdr(integrityHdrRow.getCell(1), 'INTEGRIDAD DE PERSISTENCIA', HDR_FILL);
  ws.getRow(integrityHdrRow.number).height = 20;

  const integrityCols = ws.addRow(['MÉTRICA', 'VALOR', 'ESTADO', 'DETALLE TÉCNICO']);
  integrityCols.eachCell((c) => applyHdr(c, c.value, SUB_FILL));
  ws.getRow(integrityCols.number).height = 20;

  const integrityData = [
    ['Intentos Totales', pClass.confirmadas + pClass.indeterminadas + pClass.noConfirmadas, '🟢 OK', 'Total de intentos ejecutados (incluye retries).'],
    ['Tests Únicos Finales', testListFinal.length, '🟢 OK', 'Casos de prueba únicos consolidados.'],
    ['Evidencias funcionales', pClass.confirmadas, '🟢 OK', 'Intentos con endpoint, registroId o evidencia explícita confirmada.'],
    [
      'Indeterminadas (timeout/intercepción)',
      pClass.indeterminadas,
      pClass.indeterminadas === 0 ? '🟢 OK' : pClass.indeterminadas <= 2 ? '⚠️ ALERTA' : '🔴 CRÍTICO',
      'Llegaron al API pero el test no confirmó la respuesta (timeout/intercepción).',
      pClass.indeterminadas === 0 ? VEF_FILL : pClass.indeterminadas <= 2 ? AMF_FILL : ROF_FILL,
      pClass.indeterminadas === 0 ? 'FF2E7D32' : pClass.indeterminadas <= 2 ? 'FFF57F00' : 'FFC62828'
    ],
    [
      'No Confirmadas',
      pClass.noConfirmadas,
      pClass.noConfirmadas === 0 ? '🟢 OK' : '🔴 CRÍTICO',
      'Intentos fallidos sin llegar a persistir.',
      pClass.noConfirmadas === 0 ? VEF_FILL : ROF_FILL,
      pClass.noConfirmadas === 0 ? 'FF2E7D32' : 'FFC62828'
    ],
    [
      'Ratio Persistencia Funcional %',
      fmtPct(persistenciaFuncional / 100),
      persistenciaFuncional >= 95 ? '🟢 OK' : persistenciaFuncional >= 80 ? '⚠️ ALERTA' : '🔴 CRÍTICO',
      'Registros confirmados vs tests funcionales.',
      persistenciaFuncional >= 95 ? VEF_FILL : persistenciaFuncional >= 80 ? AMF_FILL : ROF_FILL,
      persistenciaFuncional >= 95 ? 'FF2E7D32' : persistenciaFuncional >= 80 ? 'FFF57F00' : 'FFC62828'
    ],
    [
      'Flaky Rate %',
      fmtPct(r.flakyRate),
      r.flakyRate <= 0.05 ? '🟢 OK' : r.flakyRate <= 0.15 ? '⚠️ ALERTA' : '🔴 CRÍTICO',
      'Tests con resultado intermitente (flakiness).',
      r.flakyRate <= 0.05 ? VEF_FILL : r.flakyRate <= 0.15 ? AMF_FILL : ROF_FILL,
      r.flakyRate <= 0.05 ? 'FF2E7D32' : r.flakyRate <= 0.15 ? 'FFF57F00' : 'FFC62828'
    ]
  ];

  integrityData.forEach(([k, v, est, det, fill, color], i) => {
    const row = ws.addRow([k, v, est, det]);
    row.getCell(1).fill = i % 2 === 0 ? GRS_FILL : { type: 'pattern', pattern: 'none' };
    row.getCell(1).font = FONT({ bold: true, size: 10 });
    if (fill) row.eachCell((c) => (c.fill = fill));
    if (color) {
      [2, 3].forEach((n) => {
        row.getCell(n).font = FONT({ size: 10, bold: true, color });
      });
    }
    row.eachCell((c) => (c.border = BORDERS));
  });

  ws.addRow([]);
  const budget = r.errorBudget;
  const passRateOk = r.passRate >= r.slo.passRate;
  const flakyOk = r.flakyRate <= r.slo.flakyRate;
  const failOk = r.failedTests === 0;

  const kpiHdr = ws.addRow(['KPI GLOBAL', 'VALOR ACTUAL', 'UMBRAL SLO', 'ESTADO']);
  kpiHdr.eachCell((c) => applyHdr(c, c.value, HDR_FILL));
  ws.getRow(kpiHdr.number).height = 20;

  const kpis = [
    ['Tests Únicos', testsUnicos, '—', '🟢', AZC_FILL, 'FF1A237E'],
    ['Intentos Totales (brutos)', intentosTotales, '—', '🟢', AZC_FILL, 'FF1A237E'],
    ['Passed Limpio (sin retry)', passedLimpios, `= ${testsUnicos} ideal`, passedLimpios === testsUnicos ? '✅ OK' : '⚠️ REVISAR', passedLimpios === testsUnicos ? VEF_FILL : AMF_FILL, passedLimpios === testsUnicos ? 'FF2E7D32' : 'FFF57F00'],
    ['Flaky (con retry, PASS final)', flakyCount, '0 ideal', flakyCount === 0 ? '✅ OK' : '⚠️ ALERTA', flakyCount === 0 ? VEF_FILL : AMF_FILL, flakyCount === 0 ? 'FF2E7D32' : 'FFF57F00'],
    ['Retry Burden %', `${retryBurdenPct.toFixed(2)}%`, '≤ 15%', retryBurdenPct <= 15 ? '✅ OK' : '⚠️ ALERTA', retryBurdenPct <= 15 ? VEF_FILL : AMF_FILL, retryBurdenPct <= 15 ? 'FF2E7D32' : 'FFF57F00'],
    ['Tasa de Éxito ★ SLO', fmtPct(r.passRate), `≥ ${fmtPct(r.slo.passRate)}`, passRateOk ? '✅ OK' : '🔴 FALLA', statusFill(passRateOk), passRateOk ? 'FF2E7D32' : 'FFC62828'],
    ['Tests Fallidos', r.failedTests, '0', failOk ? '✅ OK' : '🔴 FALLA', statusFill(failOk), failOk ? 'FF2E7D32' : 'FFC62828'],
    ['Tasa de Flakiness', fmtPct(r.flakyRate), `≤ ${fmtPct(r.slo.flakyRate)}`, flakyOk ? '✅ OK' : '⚠️ ALERTA', flakyOk ? VEF_FILL : AMF_FILL, flakyOk ? 'FF2E7D32' : 'FFF57F00'],
    ['Tests Skipped', r.skippedTests, '—', '🟢', null, null],
    ['Error Budget Consumido', `${budget.consumedPct}%`, '< 80%', budget.consumedPct < 80 ? '✅ OK' : '⚠️ ALERTA', budget.consumedPct < 80 ? VEF_FILL : AMF_FILL, budget.consumedPct < 80 ? 'FF2E7D32' : 'FFF57F00'],
    ['Error Budget Restante', `${budget.remainingPct}%`, '> 20%', '🟢', VEF_FILL, 'FF2E7D32'],
    ['Duración Total', r.durationStr, '—', '🟢', null, null],
    ['Workers', r.functionalWorkerList?.length || r.workerList.length, '—', '🟢', null, null],
  ];

  kpis.forEach(([kpi, val, slo, estado, fill, color], i) => {
    const r2 = ws.addRow([kpi, val, slo, estado]);
    r2.getCell(1).fill = i % 2 === 0 ? GRS_FILL : { type: 'pattern', pattern: 'none' };
    r2.getCell(1).font = FONT({ bold: true, size: 10 });
    if (fill) r2.eachCell((c) => (c.fill = fill));
    if (color) [2, 3, 4].forEach((n) => {
      r2.getCell(n).font = FONT({ size: 10, bold: true, color });
    });
    r2.eachCell((c) => (c.border = BORDERS));
  });

  // ── ADVERTENCIA EDITORIAL ISTQB ──────────────────────────────────────────
  ws.addRow([]);
  const warnRow = ws.addRow([
    '⚠️ ADVERTENCIA EDITORIAL',
    'Un 100% de éxito final (PASS) funcional no garantiza estabilidad si existen IP inestables o Retry Burden elevado.',
    '',
    ''
  ]);
  ws.mergeCells(`B${warnRow.number}:D${warnRow.number}`);
  warnRow.getCell(1).fill = FILL('FFFF6F00');
  warnRow.getCell(1).font = FONT({ bold: true, size: 10, color: 'FFFFFFFF' });
  warnRow.getCell(1).alignment = ALIGN('center');
  warnRow.getCell(2).fill = AMF_FILL;
  warnRow.getCell(2).font = FONT({ bold: true, size: 10, color: 'FF7B3800' });
  warnRow.getCell(2).alignment = ALIGN('left');
  warnRow.eachCell((c) => (c.border = BORDERS));
  warnRow.height = 30;

  // Conclusión
  ws.addRow([]);
  const conclusion = aiReport.reporte_profesional?.['3.0_resumen_ejecutivo']?.conclusion || `Tasa de éxito: ${fmtPct(r.passRate)}`;
  const concRow = ws.addRow(['CONCLUSIÓN', conclusion, '', '']);
  ws.mergeCells(`B${concRow.number}:D${concRow.number}`);
  concRow.getCell(1).font = FONT({ bold: true, size: 10 });
  concRow.getCell(2).alignment = ALIGN('left');
  concRow.eachCell((c) => (c.border = BORDERS));
}

function buildDesglose(wb, r) {
  const ws = wb.addWorksheet('2-Desglose Tests');
  ws.columns = [
    { width: 38 }, { width: 50 }, { width: 10 }, { width: 24 }, { width: 18 }, { width: 42 }, { width: 18 }, { width: 36 }, { width: 15 }, { width: 14 }, { width: 18 }
  ];

  ws.mergeCells('A1:K1');
  applyHdr(ws.getCell('A1'), 'DESGLOSE DE PRUEBAS — Resultados Individuales');
  ws.getRow(1).height = 24;

  const hdr = ws.addRow(['SUITE', 'TEST', 'WORKER', 'USUARIO', 'IP', 'EXPEDIENTE', 'REGISTRO ID', 'API GUARDADO', 'DURACIÓN', 'ESTADO', 'PROYECTO']);
  hdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));

  r.testList.forEach((test) => {
    const isPass = test.status === 'passed';
    
    // Extraer registroId si existe en las anotaciones
    let registroId = 'N/A';
    if (test.annotations && test.annotations.length > 0) {
       const ann = test.annotations.find(a => a.type === 'registroId');
       if (ann) registroId = ann.description;
    }
    let expediente = 'N/A';
    let apiEndpoint = 'N/A';
    if (test.annotations && test.annotations.length > 0) {
       const exp = test.annotations.find(a => a.type === 'expediente');
       const api = test.annotations.find(a => a.type === 'apiEndpoint');
       if (exp) expediente = exp.description;
       if (api) apiEndpoint = api.description;
    }

    const row = ws.addRow([
      test.suite || 'Desconocido',
      test.title,
      test.workerIndex,
      test.assignedUser,
      test.assignedIp,
      expediente,
      registroId,
      apiEndpoint,
      test.durationStr,
      test.status.toUpperCase(),
      test.projectName || 'ui-regression'
    ]);
    row.eachCell((c) => {
      c.font = { size: 10, name: 'Calibri' };
      c.alignment = ALIGN('center');
      c.border = BORDERS;
      c.fill = isPass ? VEF_FILL : test.status === 'failed' || test.status === 'timedOut' ? ROF_FILL : { type: 'pattern', pattern: 'none' };
    });
    row.getCell(1).alignment = ALIGN('left');
    row.getCell(2).alignment = ALIGN('left');
  });
}

function getHallazgosVigentes() {
  return [
    {
      id: 'HV-API-001',
      estado: 'vigente',
      tipo: 'cambio_contrato',
      severidad: 'ALTA',
      titulo: 'Cambio de método en listado de infracciones',
      detalle: '/Infraccion/Listar opera ahora con método GET en lugar de POST.',
      criterio: 'Hecho observado en integración; mantener visible hasta nueva validación de calidad.'
    },
    {
      id: 'HV-API-002',
      estado: 'vigente',
      tipo: 'endpoint_deprecado',
      severidad: 'ALTA',
      titulo: 'Endpoints anteriores no disponibles en la forma previamente utilizada',
      detalle: '/CabeceraInfraccionSancion/Crear, /MedidaCorrectiva/Crear y /DetalleInfraccionSancion/Crear ya no se encuentran disponibles en la forma anterior.',
      criterio: 'Hecho observado en integración; requiere actualización de scripts, pruebas API/K6 y documentación operacional.'
    },
    {
      id: 'HV-API-003',
      estado: 'vigente',
      tipo: 'nuevo_endpoint',
      severidad: 'ALTA',
      titulo: 'Nuevo endpoint de creación con detalles',
      detalle: 'El flujo observado apunta al uso de /CabeceraInfraccionSancion/CrearConDetalles.',
      criterio: 'Mantener como estado actual conocido hasta reconfirmación en siguiente pase a calidad.'
    },
    {
      id: 'HV-API-004',
      estado: 'vigente',
      tipo: 'contrato_respuesta',
      severidad: 'MEDIA',
      titulo: 'Identificador de respuesta en RESULTADO',
      detalle: 'La respuesta expone el identificador en el campo RESULTADO.',
      criterio: 'Los extractores de ID deben priorizar RESULTADO and conservar compatibilidad defensiva con contratos anteriores si aplica.'
    },
    {
      id: 'HV-DEF-001',
      estado: 'seguimiento',
      tipo: 'hipotesis_operativa',
      severidad: 'MEDIA',
      titulo: 'Defecto de expedientes huérfanos en observación',
      detalle: 'El defecto queda en seguimiento: probablemente mitigado por cambio arquitectónico, pendiente de reconfirmación en el siguiente pase de calidad.',
      criterio: 'No marcar como resuelto mientras solo exista inferencia indirecta; cerrar únicamente con evidencia nueva de calidad.'
    }
  ];
}

function buildWorkers(wb, r) {
  const ws = wb.addWorksheet('3-Workers');
  ws.columns = [
    { width: 12 }, { width: 10 }, { width: 24 }, { width: 18 }, { width: 22 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 20 },
  ];

  ws.mergeCells('A1:I1');
  applyHdr(ws.getCell('A1'), 'ANÁLISIS POR WORKER — Asignación y Rendimiento');
  ws.getRow(1).height = 24;

  const noteRow = ws.addRow([r.workerContextNote]);
  ws.mergeCells(`A${noteRow.number}:I${noteRow.number}`);
  noteRow.getCell(1).alignment = ALIGN('left');
  noteRow.getCell(1).font = FONT({ size: 10, italic: true });
  noteRow.height = 20;

  ws.addRow([]);

  const hdr = ws.addRow(['WORKER', 'SLOT', 'USUARIO', 'IP', 'TIPO IP', 'TOTAL TESTS', 'PASADOS', 'FALLIDOS', 'DURACIÓN']);
  hdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));
  ws.getRow(hdr.number).height = 20;

  r.workerList.forEach((worker) => {
    const totalTests = worker.tests ? worker.tests.length : 0;
    const passRate = totalTests > 0 ? worker.passed / totalTests : 1;
    const pass = passRate >= 0.95;
    const row = ws.addRow([
      `Worker ${worker.index}`,
      worker.slot || 'N/A',
      worker.assignedUser || 'N/A',
      worker.assignedIp || 'N/A',
      worker.ipMode || 'N/A',
      totalTests,
      worker.passed,
      worker.failed,
      fmtMs(worker.totalDurationMs)
    ]);
    row.eachCell((c) => {
      c.font = { size: 10, name: 'Calibri' };
      c.border = BORDERS;
      c.alignment = ALIGN('center');
      c.fill = pass ? VEF_FILL : ROF_FILL;
    });
    row.getCell(3).alignment = ALIGN('left');
    row.getCell(4).alignment = ALIGN('left');
  });
}

function buildErrores(wb, r) {
  const ws = wb.addWorksheet('4-Errores');
  ws.columns = [
    { width: 38 }, { width: 10 }, { width: 24 }, { width: 18 }, { width: 14 }, { width: 80 }
  ];

  ws.mergeCells('A1:F1');
  applyHdr(ws.getCell('A1'), 'DETALLE DE ERRORES Y DEFECTOS EN EJECUCIÓN');
  ws.getRow(1).height = 24;

  const erroresList = r.testList.filter((test) => test.status === 'failed' || test.status === 'timedOut');

  if (erroresList.length === 0) {
    const emptyRow = ws.addRow(['Sin errores registrados en esta corrida', '', '', '', '', '']);
    ws.mergeCells(`A${emptyRow.number}:F${emptyRow.number}`);
    emptyRow.eachCell((c) => {
      c.fill = VEF_FILL;
      c.font = FONT({ bold: true, size: 12, color: 'FF2E7D32' });
      c.alignment = ALIGN('center');
    });
  } else {
    const hdr = ws.addRow(['TEST', 'WORKER', 'USUARIO', 'IP', 'TIPO', 'MENSAJE DE ERROR']);
    hdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));

    erroresList.forEach((test) => {
      const errMsg = test.errors && test.errors.length > 0 ? String(test.errors[0].message || '').substring(0, 300) : 'Sin detalle';
      const row = ws.addRow([test.title, test.workerIndex, test.assignedUser, test.assignedIp, test.status.toUpperCase(), errMsg]);
      row.eachCell((c) => {
        c.font = { size: 10, name: 'Calibri' };
        c.fill = ROF_FILL;
        c.alignment = ALIGN('left', 'top');
        c.border = BORDERS;
      });
    });
  }

  ws.addRow([]);
  const hv = getHallazgosVigentes();
  const hvTitle = ws.addRow(['HALLAZGOS VIGENTES / ESTADO ACTUAL CONOCIDO', '', '', '', '', '']);
  ws.mergeCells(`A${hvTitle.number}:F${hvTitle.number}`);
  hvTitle.eachCell((c) => applyHdr(c, c.value || 'HALLAZGOS VIGENTES / ESTADO ACTUAL CONOCIDO', HDR_FILL));
  ws.getRow(hvTitle.number).height = 20;

  const hvHdr = ws.addRow(['ID', 'ESTADO', 'SEVERIDAD', 'HALLAZGO', 'DETALLE', 'CRITERIO']);
  hvHdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));
  ws.getRow(hvHdr.number).height = 20;

  hv.forEach((item) => {
    const row = ws.addRow([
      item.id,
      item.estado.toUpperCase(),
      item.severidad,
      item.titulo,
      item.detalle,
      item.criterio
    ]);
    row.eachCell((c) => {
      c.font = FONT({ size: 10 });
      c.border = BORDERS;
      c.alignment = ALIGN('left', 'top');
      c.fill = item.severidad === 'ALTA' ? ROF_FILL : AMF_FILL;
    });
  });

  ws.addRow([]);
  const findings = collectQualityFindings(r);
  const findingTitle = ws.addRow(['DEFECTOS, RIESGOS Y OBSERVACIONES FUNCIONALES DE ESTA CORRIDA', '', '', '', '', '']);
  ws.mergeCells(`A${findingTitle.number}:F${findingTitle.number}`);
  findingTitle.eachCell((c) => applyHdr(c, c.value || 'DEFECTOS, RIESGOS Y OBSERVACIONES FUNCIONALES DE ESTA CORRIDA', HDR_FILL));
  ws.getRow(findingTitle.number).height = 20;

  const findingHdr = ws.addRow(['ID', 'SEVERIDAD', 'TIPO', 'DESCRIPCION', 'RECOMENDACION', '']);
  findingHdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));
  ws.getRow(findingHdr.number).height = 20;

  if (findings.length === 0) {
    const row = ws.addRow(['Sin hallazgos adicionales', 'N/A', 'N/A', 'No se detectaron defectos funcionales adicionales a partir de las anotaciones de esta corrida.', 'Mantener control de ID real, persistencia y minimo una sancion.', '']);
    row.eachCell((c) => {
      c.fill = VEF_FILL;
      c.border = BORDERS;
      c.alignment = ALIGN('left', 'top');
    });
  } else {
    findings.forEach((finding) => {
      const row = ws.addRow([...finding, '']);
      row.eachCell((c) => {
        c.fill = finding[1] === 'Critica' || finding[1] === 'Alta' ? ROF_FILL : AMF_FILL;
        c.border = BORDERS;
        c.alignment = ALIGN('left', 'top');
      });
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Hoja 5: Auditoría por IP
// ══════════════════════════════════════════════════════════════════════════════
function buildAuditoriaIp(wb, r) {
  const ipSummary = r.ipSummary;
  if (ipSummary.length <= 1) return;

  const ws = wb.addWorksheet('5-Auditoria IP');
  ws.columns = [
    { width: 20 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 20 },
  ];

  ws.mergeCells('A1:G1');
  applyHdr(ws.getCell('A1'), `AUDITORÍA POR IP — Desglose para ${ipSummary.length} IPs`);
  ws.getRow(1).height = 24;

  const hdr = ws.addRow(['IP ORIGEN', 'NODO', 'TESTS', 'PASADOS', 'FALLIDOS', 'TASA ÉXITO', 'DURACIÓN']);
  hdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));

  ipSummary.forEach((ip) => {
    const pass = ip.passRate >= r.slo.passRate;
    const row = ws.addRow([ip.ip, ip.node, ip.tests, ip.passed, ip.failed, fmtPct(ip.passRate), ip.durationStr]);
    row.eachCell((c) => {
      c.fill = pass ? VEF_FILL : ROF_FILL;
      c.font = FONT({ size: 10, bold: true, color: pass ? 'FF2E7D32' : 'FFC62828' });
      c.border = BORDERS;
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Hoja 6: Mejoras y Recomendaciones
// ══════════════════════════════════════════════════════════════════════════════
function buildMejoras(wb, aiReport, r) {
  const ws = wb.addWorksheet('6-Mejoras');
  ws.columns = [{ width: 36 }, { width: 100 }];

  ws.mergeCells('A1:B1');
  applyHdr(ws.getCell('A1'), 'MEJORAS Y RECOMENDACIONES');
  ws.getRow(1).height = 24;

  const recPrio = aiReport.recomendacion_prioritaria || 'Continuar con la siguiente fase.';
  const mejoraData = aiReport.reporte_profesional?.['6.0_mejoras_y_recomendaciones'] || {};
  const rows = [
    ['RECOMENDACIÓN PRIORITARIA', recPrio],
    ['MEJORAS EN AUTOMATIZACIÓN', (mejoraData.mejoras_automation || []).join('; ')],
    ['COBERTURA FALTANTE', (mejoraData.cobertura_faltante || []).join('; ')],
    ['PRÓXIMOS PASOS', (mejoraData.proximos_pasos || []).join('; ')],
    ['HALLAZGOS DE LA CORRIDA', collectQualityFindings(r).map((finding) => `${finding[0]}: ${finding[4]}`).join('; ') || 'Sin hallazgos adicionales.'],
  ];
  rows.forEach((row) => {
    const wsRow = ws.addRow(row);
    wsRow.eachCell((c) => {
      c.font = FONT({ size: 10 });
      c.border = BORDERS;
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Hoja 7: Leyenda
// ══════════════════════════════════════════════════════════════════════════════
function buildLeyenda(wb) {
  const ws = wb.addWorksheet('7-Leyenda');
  ws.columns = [
    { width: 30 }, { width: 50 }, { width: 40 }, { width: 20 }, { width: 35 }
  ];

  ws.mergeCells('A1:E1');
  applyHdr(ws.getCell('A1'), 'LEYENDA DE MÉTDRICAS - ISO/IEC 25010 - ISTQB CTFL - IEEE 829');
  ws.getRow(1).height = 24;

  const hdr = ws.addRow(['METRICA', 'DEFINICION / QUE MIDE', 'FORMULA / METODO', 'UMBRAL SLO', 'ESTANDAR / NORMA PRACTICA']);
  hdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));

  const legend = [
    ['Tests únicos', 'Resultado final consolidado por caso, sin duplicar retries.', 'Casos finales consolidados', '—', 'ISTQB CTFL 4.4, IEEE 829'],
    ['Intentos totales', 'Ejecuciones brutas incluyendo reintentos.', 'Intento inicial + retries', '—', 'ISO 29119-3'],
    ['Passed limpio', 'Caso exitoso en primer intento, sin retries.', 'Passed con retry = 0', 'Ideal ≥95%', 'ISTQB CTAL-TAE'],
    ['Flaky rate', 'Casos exitosos que requirieron al menos un retry.', '(Tests flaky / tests únicos) × 100', 'Tolerable ≤15%', 'ISTQB CTAL-TAE'],
    ['Persistencia funcional', 'Registros confirmados respecto a los tests funcionales esperados. Excluye setup/auth.', '(Registros persistidos / tests funcionales) × 100', 'Objetivo ≥95%', 'ISO 25010 Adecuación funcional'],
    ['Error Budget', 'Porcentaje del presupuesto de fallos consumido.', '((1 - Tasa Éxito) / 0.05) × 100', '< 80%', 'SRE (Site Reliability Engineering)'],
    ['APDEX UI', 'Índice de satisfacción en ejecución funcional.', 'Passed / total tests', '>= 0.95', 'ISO 25010 (Eficiencia de desempeño)'],
    ['Mínimo una sanción', 'Presencia de detalle de sanción antes de guardar.', 'detalleInfraccionSancion.length >= 1', '>= 1', 'Regla de negocio crítica SUNEDU'],
  ];

  legend.forEach((item, index) => {
    const row = ws.addRow(item);
    if (index % 2 === 0) row.eachCell((c) => (c.fill = GRS_FILL));
    row.getCell(1).font = FONT({ bold: true, size: 10 });
    [2, 3, 4, 5].forEach((n) => {
      row.getCell(n).alignment = ALIGN('left');
    });
    row.eachCell((c) => (c.border = BORDERS));
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Hoja 8: Espectro de Errores
// ══════════════════════════════════════════════════════════════════════════════
function buildEspectro(wb, r) {
  const spectrum = r.errorSpectrum || {};
  if (Object.keys(spectrum).length === 0) return;

  const ws = wb.addWorksheet('8-Espectro Errores');
  ws.columns = [{ width: 24 }, { width: 16 }, { width: 50 }];

  ws.mergeCells('A1:C1');
  applyHdr(ws.getCell('A1'), 'ESPECTRO DE ERRORES - Clasificacion por Tipo');
  ws.getRow(1).height = 24;

  const hdr = ws.addRow(['TIPO DE ERROR', 'CANTIDAD', 'DESCRIPCION']);
  hdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));

  const descriptions = {
    TIMEOUT: 'El test excedio el tiempo maximo de espera.',
    ASSERTION: 'Fallo una validacion expect/assert.',
    LOCATOR: 'No se encontro o no estuvo listo un elemento de la pagina.',
    NETWORK: 'Error de red, API o conexion rechazada.',
    FAILED: 'Fallo funcional o tecnico no especializado.',
    OTHER: 'Error no clasificado.',
  };

  Object.entries(spectrum).forEach(([type, count]) => {
    const color = type === 'TIMEOUT' ? 'FFF57F00' : type === 'NETWORK' ? 'FFC62828' : 'FF1A237E';
    const row = ws.addRow([type, count, descriptions[type] || 'Error generico.']);
    row.eachCell((c) => {
      c.fill = type === 'TIMEOUT' ? AMF_FILL : type === 'NETWORK' ? ROF_FILL : AZC_FILL;
      c.font = FONT({ size: 10, bold: true, color });
      c.border = BORDERS;
      c.alignment = ALIGN('left', 'top');
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Hoja 9: Estándares y criterios de diseño funcional
// ══════════════════════════════════════════════════════════════════════════════
function buildEstandaresYCalidad(wb) {
  const ws = wb.addWorksheet('9-Estandares QA');
  ws.columns = [{ width: 28 }, { width: 36 }, { width: 90 }];
  ws.mergeCells('A1:C1');
  applyHdr(ws.getCell('A1'), 'MARCO NORMATIVO Y APLICACIÓN EN PLAYWRIGHT');
  ws.getRow(1).height = 24;
  const hdr = ws.addRow(['REFERENCIA', 'USO EN QA FUNCIONAL', 'APLICACIÓN EN REGINSA_PF']);
  hdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));
  const rows = [
    ['ISTQB Foundation Level', 'Diseño y priorización de pruebas', 'Casos positivos, negativos, regresión, criterios de entrada/salida, severidad y evidencias por defecto.'],
    ['ISO/IEC/IEEE 29119', 'Proceso y documentación formal de pruebas', 'Plan, caso, procedimiento, ejecución, incidencia, trazabilidad, reporte y cierre de pruebas.'],
    ['ISO/IEC 25010', 'Modelo de calidad del producto', 'Clasificación de hallazgos por adecuación funcional, fiabilidad, usabilidad, eficiencia, mantenibilidad y portabilidad.'],
    ['ISO 9001:2015', 'Gestión de calidad y mejora continua', 'Control documental, responsable, evidencia, acciones correctivas, criterio de cierre y seguimiento.'],
    ['IEEE 829', 'Referencia histórica de documentación', 'Estructura clásica de plan, especificación de casos, log de ejecución e informe de pruebas.'],
  ];
  rows.forEach((item) => {
    const row = ws.addRow(item);
    row.eachCell((c) => { c.font = FONT({ size: 10 }); c.border = BORDERS; c.alignment = ALIGN('left', 'top'); c.fill = AZC_FILL; });
  });
  ws.addRow([]);
  const hdr2 = ws.addRow(['CRITERIO', 'REGLA OPERATIVA', 'EVIDENCIA EN REPORTE']);
  hdr2.eachCell((c) => applyHdr(c, c.value, SUB_FILL));
  const criteria = [
    ['Trazabilidad', 'Requisito → caso Playwright → dato → usuario/IP → endpoint → evidencia → resultado.', 'Desglose, Auditoría IP, Endpoint, Hallazgos.'],
    ['Criterio funcional', 'Sin ID real o sin persistencia confirmada no existe aprobación funcional del guardado.', 'Resumen, Persistencia funcional, Detalle por test.'],
    ['Estabilidad', 'Passed limpio, flaky rate y retry burden separan éxito funcional de costo operativo.', 'Dashboard, Leyenda, Gráficas técnicas.'],
    ['Cierre de hallazgos', 'Todo hallazgo crítico mantiene recomendación y condición objetiva de cierre.', 'Defectos, riesgos y observaciones.'],
    ['Decisión ejecutiva', 'GO, GO con riesgo o NO GO se decide por tasa final, fallos, persistencia, flakiness y severidad.', 'Dashboard y Word ejecutivo.'],
  ];
  criteria.forEach((item) => {
    const row = ws.addRow(item);
    row.eachCell((c) => { c.font = FONT({ size: 10 }); c.border = BORDERS; c.alignment = ALIGN('left', 'top'); c.fill = GRS_FILL; });
  });
}
// ══════════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  const reportsDir = path.join(__dirname, '../playwright-report');
  let jsonPath = process.argv[2];
  const customOutDir = process.argv[3];

  try {
    jsonPath = resolveTargetJson(reportsDir, jsonPath);
  } catch (error) {
    if (!jsonPath) {
      console.error('ERROR [EXCEL] No se encontro results.json. Pasa la ruta como argumento.');
      process.exit(1);
    }
  }

  const r = new PlaywrightReader(jsonPath);
  const aiReport = buildFallback(r._raw);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'REGINSA QA Automation - SUNEDU';
  wb.created = new Date();

  buildDashboard(wb, r, aiReport);
  buildDesglose(wb, r);
  buildWorkers(wb, r);
  buildErrores(wb, r);
  buildAuditoriaIp(wb, r);
  buildMejoras(wb, aiReport, r);
  buildLeyenda(wb);
  buildEspectro(wb, r);
  buildEstandaresYCalidad(wb);

  const finalOutDir = customOutDir ? path.resolve(customOutDir) : r.outDir;
  if (!fs.existsSync(finalOutDir)) {
    fs.mkdirSync(finalOutDir, { recursive: true });
  }

  const outPath = path.join(finalOutDir, `REGINSA_PLAYWRIGHT_UI_AUDITORIA_${r.filenameStamp}.xlsx`);
  await wb.xlsx.writeFile(outPath);
  console.log(`OK [EXCEL] Matriz de Auditoria Playwright UI generada: ${path.basename(outPath)}`);
}

main().catch((error) => {
  console.error('ERROR [EXCEL]', error.message);
  process.exit(1);
});
