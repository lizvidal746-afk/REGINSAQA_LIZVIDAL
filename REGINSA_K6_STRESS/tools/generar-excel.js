/**
 * tools/generar-excel.js — REGINSA
 * 5 pestañas: Dashboard · Latencia · Endpoints · Red/Infra · Leyenda
 * Usa K6Reader como única fuente de datos.
 */
const path = require('node:path');
const _fs = require('node:fs');
const ExcelJS = require('exceljs');
const { K6Reader, fmtMs, fmtPct, resolveTargetJson } = require('./lib/k6-reader');

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

function _applyCell(cell, value, o = {}) {
  cell.value = value;
  cell.font = FONT({ bold: o.bold, color: o.color, size: o.size ?? 10 });
  cell.fill = o.fill ?? { type: 'pattern', pattern: 'none' };
  cell.alignment = ALIGN(o.align ?? 'center');
  cell.border = BORDERS;
}

function statusFill(pass) {
  return pass ? VEF_FILL : ROF_FILL;
}
function statusColor(pass) {
  return pass ? 'FF2E7D32' : 'FFC62828';
}

// ── Hoja 1: Dashboard KPIs ───────────────────────────────────────────────────
function buildDashboard(wb, r) {
  const ws = wb.addWorksheet('1-Dashboard KPIs');
  ws.columns = [{ width: 32 }, { width: 20 }, { width: 16 }, { width: 14 }];

  // Título
  ws.mergeCells('A1:D1');
  applyHdr(ws.getCell('A1'), 'REGINSA — MATRIZ DE AUDITORÍA DE RENDIMIENTO SUNEDU', HDR_FILL);
  ws.getRow(1).height = 28;

  // Metadatos
  ws.addRow([]);
  const metaHdr = ws.addRow(['METADATO', 'VALOR', '', '']);
  metaHdr.eachCell((c) => {
    c.fill = AZC_FILL;
    c.font = FONT({ bold: true, size: 10 });
    c.border = BORDERS;
  });

  const meta = [
    ['IP de Origen (Binding)', r.sourceIp],
    ['Sistema', 'REGINSA'],
    ['Tipo de Prueba', r.testName],
    ['Tiempo de Prueba', r.testRunDurationStr],
    ['ID de Ejecución', r.runId],
    ['VUs Máximos', String(r.vusMax)],
    ['Fecha de Generación', r.generatedAt],
    ['Responsable QA', 'Liz Vidal'],
    ['Estándares', 'ISTQB PT · ISO/IEC 25010 · ISO/IEC 25023 · Google SRE'],
  ];
  meta.forEach(([k, v]) => {
    const row = ws.addRow([k, v]);
    row.getCell(1).fill = GRS_FILL;
    row.getCell(1).font = FONT({ bold: true, size: 10 });
    row.getCell(2).font = FONT({ size: 10 });
    row.eachCell((c) => (c.border = BORDERS));
  });

  ws.addRow([]);
  const budget = r.errorBudget;
  const p95ok = r.p95 < r.slo.p95Ms;
  const p99ok = r.p99 < r.slo.p99Ms;
  const errOk = r.errorRate < r.slo.errorRate;
  const chkOk = r.checksRate >= r.slo.checksRate;
  const sessOk = r.sessionRate >= r.slo.checksRate;
  const apdexOk = r.apdex >= r.slo.apdexMin;

  // Cabecera KPIs
  const kpiHdr = ws.addRow(['KPI GLOBAL', 'VALOR ACTUAL', 'UMBRAL SLO', 'ESTADO']);
  kpiHdr.eachCell((c) => {
    applyHdr(c, c.value, HDR_FILL);
  });
  ws.getRow(kpiHdr.number).height = 20;

  const kpis = [
    ['Total Requests', r.totalRequests, '—', '🟢', null, null],
    ['Tiempo de Prueba', r.testRunDurationStr, '—', '🟢', null, null],
    ['RPS (Throughput)', `${r.rps.toFixed(2)} req/s`, '—', '🟢', null, null],
    ['Latencia p50 (Mediana)', fmtMs(r.p50), 'Ref.', '🟢', null, null],
    ['Latencia p90', fmtMs(r.p90), 'Ref.', '🟢', null, null],
    [
      'Latencia p95 ★ SLO',
      fmtMs(r.p95),
      '< 1 500 ms',
      p95ok ? '✅ OK' : '🔴 FALLA',
      statusFill(p95ok),
      statusColor(p95ok),
    ],
    [
      'Latencia p99 (Cola)',
      fmtMs(r.p99),
      '< 2 000 ms',
      p99ok ? '✅ OK' : '🔴 FALLA',
      statusFill(p99ok),
      statusColor(p99ok),
    ],
    [
      'Tasa de Errores',
      fmtPct(r.errorRate),
      '< 1%',
      errOk ? '✅ OK' : '🔴 FALLA',
      statusFill(errOk),
      statusColor(errOk),
    ],
    [
      'APDEX Score',
      r.apdex.toFixed(3),
      '≥ 0.90',
      apdexOk ? '✅ OK' : '🔴 FALLA',
      statusFill(apdexOk),
      statusColor(apdexOk),
    ],
    ['Checks OK', fmtPct(r.checksRate), '> 99%', chkOk ? '✅ OK' : '🔴 FALLA', statusFill(chkOk), statusColor(chkOk)],
    [
      'Session Success',
      fmtPct(r.sessionRate),
      '> 99%',
      sessOk ? '✅ OK' : '🔴 FALLA',
      statusFill(sessOk),
      statusColor(sessOk),
    ],
    ['Checks Aprobados', r.checksPasses, '—', '🟢', VEF_FILL, 'FF2E7D32'],
    [
      'Checks Fallidos',
      r.checksFails,
      '0',
      r.checksFails === 0 ? '✅ OK' : '🔴 FALLA',
      statusFill(r.checksFails === 0),
      statusColor(r.checksFails === 0),
    ],
    [
      'Error Budget Consumido',
      `${budget.consumedPct}%`,
      '< 80%',
      budget.consumedPct < 80 ? '✅ OK' : '⚠️ ALERTA',
      budget.consumedPct < 80 ? VEF_FILL : AMF_FILL,
      budget.consumedPct < 80 ? 'FF2E7D32' : 'FFF57F00',
    ],
    ['Error Budget Restante', `${budget.remainingPct}%`, '> 20%', '🟢', VEF_FILL, 'FF2E7D32'],
    ['Margen SLO disponible', fmtMs(budget.marginMs), `< ${budget.sloMs}ms`, '🟢', null, null],
    ['Data Recibida', `${r.dataRecvKB} KB`, '—', '🟢', null, null],
  ];

  kpis.forEach(([kpi, val, slo, estado, fill, color], i) => {
    const r2 = ws.addRow([kpi, val, slo, estado]);
    r2.getCell(1).fill = i % 2 === 0 ? GRS_FILL : { type: 'pattern', pattern: 'none' };
    r2.getCell(1).font = FONT({ bold: true, size: 10 });
    if (fill) r2.eachCell((c) => (c.fill = fill));
    if (color)
      [2, 3, 4].forEach((n) => {
        r2.getCell(n).font = FONT({ size: 10, bold: true, color });
      });
    r2.eachCell((c) => (c.border = BORDERS));
  });
}

// ── Hoja 2: Descomposición de Latencia ───────────────────────────────────────
function buildLatencia(wb, r) {
  const ws = wb.addWorksheet('2-Latencia Desglosada');
  ws.columns = [{ width: 30 }, { width: 16 }, { width: 16 }, { width: 40 }, { width: 14 }];

  ws.mergeCells('A1:E1');
  applyHdr(ws.getCell('A1'), 'DESCOMPOSICIÓN DE LATENCIA — Diagnóstico de Infraestructura');
  ws.getRow(1).height = 24;

  const hdr = ws.addRow(['FASE DE LATENCIA', 'PROMEDIO (avg)', 'p95', 'DESCRIPCIÓN / DIAGNÓSTICO', 'UMBRAL REF.']);
  hdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));

  const rows = [
    [
      'TTFB — http_req_waiting',
      fmtMs(r.ttfb),
      fmtMs(r.ttfbP95),
      'Tiempo puro del backend/BD. Si sube sin aumentar RPS → cuello de botella en servidor.',
      '—',
    ],
    [
      'Bloqueo TCP — http_req_blocked',
      fmtMs(r.blockedAvg),
      fmtMs(r.blockedP95),
      'Espera de socket libre. Alto → saturación de red o balanceador.',
      '< 10 ms',
    ],
    [
      'TLS Handshake',
      fmtMs(r.tlsAvg),
      fmtMs(r.tlsP95),
      'Negociación SSL/TLS. Alto → problema de certificado o CPU de servidor saturada.',
      '< 50 ms',
    ],
    [
      'Conexión TCP — connecting',
      fmtMs(r.connectingAvg),
      '—',
      'Apertura de conexión TCP. En red interna debería ser < 5ms.',
      'Red',
    ],
    ['Envío — http_req_sending', fmtMs(r.sendingAvg), '—', 'Tiempo enviando el request HTTP (payload, headers).', '—'],
    ['Recepción — http_req_receiving', fmtMs(r.receivingAvg), '—', 'Tiempo recibiendo la respuesta del servidor.', '—'],
    [
      'Duración iteración completa',
      fmtMs(r.iterationAvg),
      '—',
      'Ciclo completo del VU: setup + request + teardown.',
      '—',
    ],
  ];

  rows.forEach((r2, i) => {
    const row = ws.addRow(r2);
    row.getCell(1).font = FONT({ bold: true, size: 10 });
    row.getCell(4).alignment = ALIGN('left');
    if (i % 2 === 0) row.eachCell((c) => (c.fill = GRS_FILL));
    row.eachCell((c) => (c.border = BORDERS));
  });
}

// ── Hoja 3: Endpoints ────────────────────────────────────────────────────────
function buildEndpoints(wb, r) {
  const ws = wb.addWorksheet('3-Endpoints');
  ws.columns = [
    { width: 24 },
    { width: 44 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 12 },
  ];

  ws.mergeCells('A1:K1');
  applyHdr(ws.getCell('A1'), 'ANÁLISIS POR ENDPOINT — Resultados de Latencia y Negocio');
  ws.getRow(1).height = 24;

  // Resumen agregado
  ws.addRow(['RESUMEN AGREGADO POR SERVICIO', '', '', '', '', '', '', '', '', '', '']).getCell(1).font = FONT({
    bold: true,
    size: 11,
  });
  const hdr1 = ws.addRow([
    'SERVICIO',
    'URL',
    'REQS',
    'AVG',
    'p50',
    'p95 ★',
    'p99',
    'MAX',
    'ERROR %',
    'CHECKS',
    'TASA CHK',
  ]);
  hdr1.eachCell((c) => applyHdr(c, c.value, SUB_FILL));

  const epSummary = r.endpointSummary;
  if (epSummary.length === 0) {
    ws.addRow(['Sin datos de endpoint en root_group', '', '', '', '', '', '', '', '', '', '']);
  } else {
    epSummary.forEach((ep) => {
      const sloOk = (ep.p95 ?? 9999) < r.slo.p95Ms && ep.errorRate < r.slo.errorRate;
      const pass = ep.fails === 0 && sloOk;
      const row = ws.addRow([
        ep.endpoint.replace('_', '/').toUpperCase(),
        ep.url,
        ep.reqs,
        fmtMs(ep.avg),
        fmtMs(ep.p50),
        fmtMs(ep.p95),
        fmtMs(ep.p99),
        fmtMs(ep.max),
        fmtPct(ep.errorRate),
        ep.passes,
        `${ep.successRate}%`,
      ]);
      row.eachCell((c) => {
        c.fill = pass ? VEF_FILL : ROF_FILL;
        c.font = FONT({ size: 10, bold: true, color: pass ? 'FF2E7D32' : 'FFC62828' });
        c.border = BORDERS;
      });
    });
  }

  // Detalle por iteración
  ws.addRow([]);
  ws.addRow(['DETALLE POR ITERACIÓN', '', '', '', '', '']).getCell(1).font = FONT({ bold: true, size: 11 });
  const hdr2 = ws.addRow(['ITERACIÓN', 'SERVICIO', 'URL (parcial)', 'CHECKS OK', 'CHECKS FAIL', '']);
  hdr2.eachCell((c) => applyHdr(c, c.value, SUB_FILL));

  r.endpointIterations.forEach((iter, i) => {
    const row = ws.addRow([
      iter.name.replace(/.*\(([^)]+)\)/, '$1').trim(),
      iter.endpoint.replace('_', '/').toUpperCase(),
      iter.url.substring(0, 60),
      iter.passes,
      iter.fails,
      '',
    ]);
    if (i % 2 === 0) row.eachCell((c) => (c.fill = GRS_FILL));
    if (iter.fails > 0) row.eachCell((c) => (c.fill = ROF_FILL));
    row.eachCell((c) => (c.border = BORDERS));
  });
}

// ── Hoja 4: Red e Infraestructura ────────────────────────────────────────────
function buildRed(wb, r) {
  const ws = wb.addWorksheet('4-Red e Infraestructura');
  ws.columns = [{ width: 28 }, { width: 16 }, { width: 16 }, { width: 30 }, { width: 14 }];

  ws.mergeCells('A1:E1');
  applyHdr(ws.getCell('A1'), 'MÉTRICAS DE RED E INFRAESTRUCTURA');
  ws.getRow(1).height = 24;

  const hdr = ws.addRow(['KPI DE RED', 'VALOR AVG', 'VALOR p95', 'DESCRIPCIÓN', 'UMBRAL REF.']);
  hdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));

  const netRows = [
    ['IP de Origen', r.sourceIp, '—', 'IP que origina los requests (network binding)', '—'],
    ['VUs Máximos', String(r.vusMax), '—', 'Usuarios virtuales concurrentes en este run', '1 (Smoke)'],
    ['TTFB (http_req_waiting)', fmtMs(r.ttfb), fmtMs(r.ttfbP95), 'Tiempo de procesamiento del backend puro', '—'],
    [
      'Bloqueo TCP (http_req_blocked)',
      fmtMs(r.blockedAvg),
      fmtMs(r.blockedP95),
      'Espera de conexión libre en la red',
      '< 10 ms',
    ],
    ['TLS Handshake', fmtMs(r.tlsAvg), fmtMs(r.tlsP95), 'Negociación de seguridad TLS/SSL', '< 50 ms'],
    ['Conexión TCP (connecting)', fmtMs(r.connectingAvg), '—', 'Apertura de conexión TCP', 'Red interna'],
    ['Envío (sending)', fmtMs(r.sendingAvg), '—', 'Tiempo enviando el request', '—'],
    ['Recepción (receiving)', fmtMs(r.receivingAvg), '—', 'Tiempo recibiendo la respuesta', '—'],
    ['Data Recibida', `${r.dataRecvKB} KB`, '—', 'Total datos descargados del servidor', '—'],
    ['Data Enviada', `${r.dataSentKB} KB`, '—', 'Total datos enviados al servidor', '—'],
    ['RPS (Throughput)', `${r.rps.toFixed(2)}/s`, '—', 'Requests por segundo promedio del run', '—'],
  ];

  netRows.forEach((r2, i) => {
    const row = ws.addRow(r2);
    if (i % 2 === 0) row.eachCell((c) => (c.fill = GRS_FILL));
    row.getCell(1).font = FONT({ bold: true, size: 10 });
    row.getCell(4).alignment = ALIGN('left');
    row.eachCell((c) => (c.border = BORDERS));
  });
}

// ── Hoja 5: Leyenda Maestra ──────────────────────────────────────────────────
function buildLeyenda(wb) {
  const ws = wb.addWorksheet('5-Leyenda Maestra');
  ws.columns = [{ width: 26 }, { width: 36 }, { width: 44 }, { width: 14 }, { width: 30 }];

  ws.mergeCells('A1:E1');
  applyHdr(ws.getCell('A1'), 'LEYENDA DE MÉTRICAS — ISO/IEC 25010 · ISO/IEC 25023 · ISTQB PT · Google SRE');
  ws.getRow(1).height = 24;

  const hdr = ws.addRow(['MÉTRICA', 'QUÉ MIDE', 'POR QUÉ IMPORTA / CRITERIO', 'UMBRAL', 'ESTÁNDAR']);
  hdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));

  const legend = [
    [
      'p(50) — Mediana',
      'El 50% de usuarios recibe respuesta en ≤ este tiempo.',
      'Más honesto que el avg. Representa la experiencia del usuario típico.',
      'Ref.',
      'ISO/IEC 25023 §7.3',
    ],
    [
      'p(90)',
      'El 90% de usuarios recibe respuesta en ≤ este tiempo.',
      'Buena señal general sin los extremos del p99.',
      'Ref.',
      'ISTQB PT',
    ],
    [
      'p(95) ★ SLO',
      'El 95% de usuarios recibe respuesta en ≤ este tiempo.',
      'Métrica clave para SLAs. Si supera 1500ms, 1 de cada 20 usuarios sufre degradación.',
      '< 1 500 ms',
      'Google SRE · ISO 25023',
    ],
    [
      'p(99) — Cola larga',
      'El 99% de usuarios recibe respuesta en ≤ este tiempo.',
      'Detecta timeouts extremos. 1 de 100 usuarios sufre lentitud crítica.',
      '< 2 000 ms',
      'ISTQB PT - Tail Latency',
    ],
    [
      'avg — Promedio',
      'Suma de latencias / total requests.',
      '⚠️ Engañoso: un solo outlier de 10s eleva el avg aunque el 99% sea < 400ms.',
      'Ref.',
      'ISO 25023 ⚠️',
    ],
    [
      'http_req_failed',
      '% requests con error HTTP (4xx/5xx) o de red.',
      'Mide Fiabilidad (ISO 25010). > 1% bajo carga normal es crítico.',
      '< 1%',
      'ISO/IEC 25010 Fiabilidad',
    ],
    [
      'TTFB (http_req_waiting)',
      'Time To First Byte. Tiempo de procesamiento del backend.',
      'Si sube sin aumentar RPS → cuello de botella en BD o lógica de negocio.',
      '—',
      'Google SRE Latency',
    ],
    [
      'http_req_blocked',
      'Tiempo esperando socket TCP libre.',
      'Alto → saturación de conexiones en cliente, gateway o balanceador.',
      '< 10 ms',
      'ISO/IEC 25023',
    ],
    [
      'http_req_tls_handshaking',
      'Tiempo de negociación TLS/SSL.',
      'Alto → problema en certificados o CPU del servidor saturada.',
      '< 50 ms',
      'ISO/IEC 25010 Seguridad',
    ],
    [
      'APDEX Score',
      'Índice de satisfacción 0-1.',
      '1.0=todos satisfechos (<800ms). 0.85-0.94=Bueno. <0.7=Inaceptable.',
      '≥ 0.90',
      'ISO/IEC 25023 §7.4',
    ],
    [
      'checks',
      'Validaciones funcionales (HTTP 200 + JSON válido).',
      'Confirma que el servicio responde CORRECTAMENTE, no solo RÁPIDO.',
      '> 99%',
      'ISTQB PT Aceptación',
    ],
    [
      'session_success_rate',
      '% sesiones completas sin error alguno.',
      'Disponibilidad percibida por el usuario final.',
      '> 99%',
      'ISO/IEC 25010 Disponibilidad',
    ],
    [
      'Error Budget',
      '% del presupuesto SLO consumido.',
      'p95_actual / p95_SLO. > 80% → optimizar antes de escalar a carga.',
      '< 80%',
      'Google SRE Workbook §2',
    ],
  ];

  legend.forEach((l, i) => {
    const row = ws.addRow(l);
    if (i % 2 === 0) row.eachCell((c) => (c.fill = GRS_FILL));
    row.getCell(1).font = FONT({ bold: true, size: 10 });
    [2, 3, 4, 5].forEach((n) => {
      row.getCell(n).alignment = ALIGN('left');
      row.getCell(n).font = FONT({ size: 10 });
    });
    row.eachCell((c) => (c.border = BORDERS));
    row.height = 30;
  });
}
// ── Hoja 6: Auditoría por IP ─────────────────────────────────────────────────
function buildAuditoriaIp(wb, r) {
  const ips = new Set();
  Object.keys(r._m).forEach((k) => {
    const match = k.match(/source_ip:([^}]+)/);
    if (match) ips.add(match[1]);
  });
  const localIps = Array.from(ips).sort();

  if (localIps.length <= 1) return;

  const ws = wb.addWorksheet('6-Auditoria por IP');
  ws.columns = [
    { width: 20 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 16 },
  ];

  ws.mergeCells('A1:K1');
  applyHdr(ws.getCell('A1'), `AUDITORÍA MULTI-IP — Desglose de carga para ${localIps.length} clientes simulados`);
  ws.getRow(1).height = 24;

  const hdr = ws.addRow([
    'IP ORIGEN (PC)',
    'REQUESTS',
    'AVG',
    'p50',
    'p90',
    'p95 ★ SLO',
    'p99',
    'ERROR %',
    'TTFB AVG',
    'TLS AVG',
    'TIEMPO PRUEBA',
  ]);
  hdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));

  localIps.forEach((ip, _i) => {
    const dur = r.metricValues(`http_req_duration{source_ip:${ip}}`);
    const fail = r.metricValues(`http_req_failed{source_ip:${ip}}`);
    const ttfb = r.metricValues(`ttfb_ms{source_ip:${ip}}`);
    const tls = r.metricValues(`http_req_tls_handshaking{source_ip:${ip}}`);

    const count = dur.count ?? 0;
    if (count === 0) return;

    const errRate = fail.rate ?? fail.value ?? 0;
    const p95 = dur['p(95)'] ?? 9999;
    const pass = p95 < r.slo.p95Ms && errRate < r.slo.errorRate;

    const row = ws.addRow([
      ip,
      count,
      fmtMs(dur.avg),
      fmtMs(dur.med),
      fmtMs(dur['p(90)']),
      fmtMs(dur['p(95)']),
      fmtMs(dur['p(99)']),
      fmtPct(errRate),
      fmtMs(ttfb.avg),
      fmtMs(tls.avg),
      r.testRunDurationStr,
    ]);

    row.eachCell((c) => {
      c.fill = pass ? VEF_FILL : ROF_FILL;
      c.font = FONT({ size: 10, bold: true, color: pass ? 'FF2E7D32' : 'FFC62828' });
      c.border = BORDERS;
    });
  });
}

// ── Hoja 7: Espectro HTTP ──────────────────────────────────────────────────────
function buildHttpSpectrum(wb, r) {
  const statusCounts = [];
  Object.keys(r._m).forEach((key) => {
    const match = key.match(/^http_reqs\{status:(\d{3})\}$/);
    if (match) {
      const status = parseInt(match[1], 10);
      const count = r.metricValues(key).count || 0;
      if (count > 0) {
        let type = 'Desconocido',
          color = 'FF757575',
          fill = GRS_FILL;
        if (status >= 200 && status < 300) {
          type = 'Éxito (OK)';
          color = 'FF1B5E20';
          fill = VEF_FILL;
        } else if (status >= 300 && status < 400) {
          type = 'Redirección';
          color = 'FF0D47A1';
          fill = AZC_FILL;
        } else if (status >= 400 && status < 500) {
          type = 'Error de Cliente';
          color = 'FFE65100';
          fill = AMF_FILL;
        } else if (status >= 500) {
          type = 'Error de Servidor';
          color = 'FFB71C1C';
          fill = ROF_FILL;
        }

        if (status === 429) {
          type = 'Too Many Requests (Rate Limit)';
        }

        statusCounts.push({ status, count, type, color, fill });
      }
    }
  });

  if (statusCounts.length === 0) return;
  statusCounts.sort((a, b) => a.status - b.status);

  const ws = wb.addWorksheet('7-Espectro HTTP');
  ws.columns = [{ width: 20 }, { width: 40 }, { width: 20 }];

  ws.mergeCells('A1:C1');
  applyHdr(ws.getCell('A1'), 'DISTRIBUCIÓN DE RESPUESTAS HTTP (ESPECTRO DE CÓDIGOS)');
  ws.getRow(1).height = 24;

  const hdr = ws.addRow(['CÓDIGO HTTP', 'CLASIFICACIÓN', 'FRECUENCIA (COUNT)']);
  hdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));

  statusCounts.forEach((st) => {
    const row = ws.addRow([`HTTP ${st.status}`, st.type, st.count]);
    row.getCell(1).font = FONT({ bold: true, color: st.color });
    row.getCell(2).font = FONT({ bold: true });
    row.getCell(3).font = FONT({ bold: true, color: st.color });
    row.eachCell((c) => {
      c.fill = st.fill;
      c.border = BORDERS;
      c.alignment = ALIGN('center');
    });
    row.getCell(2).alignment = ALIGN('left');
  });
}

// ── Hoja 8: Flujo funcional Caso 02 ─────────────────────────────────────────
function buildFlujoCaso02(wb, r) {
  const ws = wb.addWorksheet('8-Flujo Caso 02');
  ws.columns = [
    { width: 16 },
    { width: 30 },
    { width: 42 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
  ];

  ws.mergeCells('A1:H1');
  applyHdr(ws.getCell('A1'), 'FLUJO FUNCIONAL CASO 02 — Consulta vs Creación');
  ws.getRow(1).height = 24;

  const hdr = ws.addRow(['TIPO', 'PASO', 'ENDPOINT', 'ACEPTADAS 2xx', 'NEGOCIO 4xx', 'RATE LIMIT 429', 'ERROR/RED', 'CREADAS FINAL']);
  hdr.eachCell((c) => applyHdr(c, c.value, SUB_FILL));

  r.functionalFlow.forEach((item) => {
    const row = ws.addRow([
      item.type,
      item.step,
      item.endpoint,
      item.counts.success,
      item.counts.business,
      item.counts.rateLimited,
      item.counts.error + item.counts.network,
      item.created == null ? 'N/A' : item.created || item.counts.success,
    ]);
    row.eachCell((c) => {
      c.border = BORDERS;
      c.alignment = ALIGN('center');
    });
    row.getCell(2).alignment = ALIGN('left');
    row.getCell(3).alignment = ALIGN('left');
    row.getCell(4).fill = VEF_FILL;
    row.getCell(6).fill = AZC_FILL;
    row.getCell(7).fill = (item.counts.error + item.counts.network) > 0 ? ROF_FILL : GRS_FILL;
    row.getCell(8).font = FONT({ bold: true, size: 10 });
  });

  ws.addRow([]);
  const note = ws.addRow([
    'LECTURA',
    'La consulta prepara el catálogo. Las creaciones deben leerse como embudo: cabecera -> medida -> detalle. Para sanciones completas, priorice el conteo final del detalle.',
  ]);
  note.getCell(1).font = FONT({ bold: true, color: 'FF1A237E' });
  note.getCell(2).alignment = ALIGN('left');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const reportsDir = path.join(__dirname, '../reports');
  const jsonPath = resolveTargetJson(reportsDir, process.argv[2]);
  const r = new K6Reader(jsonPath);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'REGINSA QA Performance — SUNEDU';
  wb.created = new Date();

  buildDashboard(wb, r);
  buildLatencia(wb, r);
  buildEndpoints(wb, r);
  buildRed(wb, r);
  buildAuditoriaIp(wb, r);
  buildLeyenda(wb);
  buildHttpSpectrum(wb, r);
  buildFlujoCaso02(wb, r);

  const outPath = path.join(r.outDir, `REGINSA_${r.testName}_AUDITORIA_${r.filenameStamp}.xlsx`);
  await wb.xlsx.writeFile(outPath);
  console.log(`✅ [EXCEL] Matriz de Auditoría generada: ${path.basename(outPath)}`);
}

main().catch((err) => {
  console.error('❌ [EXCEL]', err.message);
  process.exit(1);
});
