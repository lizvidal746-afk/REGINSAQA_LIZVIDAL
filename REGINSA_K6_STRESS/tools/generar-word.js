/**
 * tools/generar-word.js — REGINSA
 * Genera el Informe TDR completo usando K6Reader como única fuente de datos.
 * Secciones: Portada · Índice · 1-Intro · 2-Dashboard · 3-Latencia ·
 *            4-Error Budget · 5-Endpoints · 6-Checks · 7-Recomendaciones · 8-Leyenda
 */

const path = require('node:path');
const fs = require('node:fs');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  ShadingType,
  PageNumber,
  Footer,
  BorderStyle,
  VerticalAlign,
  ImageRun,
} = require('docx');

const { K6Reader, fmtMs, fmtPct, resolveTargetJson, safeReadJson } = require('./lib/k6-reader');

// ── Paleta SUNEDU ────────────────────────────────────────────────────────────
const C = {
  AZU: '1A237E',
  AZM: '3949AB',
  AZC: 'E8EAF6',
  BLA: 'FFFFFF',
  GRS: 'F5F5F5',
  VEF: 'E8F5E9',
  ROF: 'FFEBEE',
  AMF: 'FFF8E1',
  VER: '2E7D32',
  ROJ: 'C62828',
  AMA: 'F9A825',
};

// ── Helpers de construcción docx ─────────────────────────────────────────────
const txt = (t, o = {}) =>
  new TextRun({
    text: String(t ?? ''),
    bold: o.bold,
    italic: o.italic,
    color: o.color ?? '111111',
    size: (o.size ?? 9.5) * 2,
    font: 'Calibri',
  });

const para = (children, o = {}) =>
  new Paragraph({
    children: Array.isArray(children) ? children : [children],
    alignment: o.align,
    spacing: { before: o.sb ?? 80, after: o.sa ?? 80 },
    heading: o.heading,
  });

const cell = (content, o = {}) =>
  new TableCell({
    children: [
      new Paragraph({
        children: [txt(content, { bold: o.bold, size: o.size ?? 8.5, color: o.color })],
        alignment: o.align ?? AlignmentType.CENTER,
      }),
    ],
    shading: o.bg ? { type: ShadingType.SOLID, color: o.bg } : undefined,
    width: { size: o.w ?? 25, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    verticalAlign: VerticalAlign.CENTER,
  });

const row = (cells, o = {}) =>
  new TableRow({
    children: cells.map((c, i) =>
      cell(c, {
        bold: o.bold,
        bg: o.bg ?? (o.header ? C.AZU : undefined),
        color: o.header ? C.BLA : o.color,
        size: o.size,
        align: o.align,
        w: o.ws?.[i],
      }),
    ),
  });

const table = (rows, widthPct = 100) =>
  new Table({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    rows,
  });

const h2 = (text) => para([txt(text, { bold: true, size: 11, color: C.AZM })], { sb: 320, sa: 80 });

const statusBg = (pass) => (pass ? C.VEF : C.ROF);
const statusColor = (pass) => (pass ? C.VER : C.ROJ);

// ── Leyenda de métricas ──────────────────────────────────────────────────────
const LEGEND = [
  ['p(50) — Mediana', 'El 50% de usuarios recibe respuesta en ≤ este tiempo.', '—', 'ISO/IEC 25023 §7.3'],
  ['p(90)', 'El 90% de usuarios recibe respuesta en ≤ este tiempo.', '—', 'ISTQB PT'],
  [
    'p(95) ★ SLO Principal',
    'El 95% de usuarios recibe respuesta en ≤ este tiempo.',
    '< 1 500 ms',
    'Google SRE · ISO 25023',
  ],
  ['p(99) — Cola larga', 'El 99% de usuarios. Detecta timeouts y extremos.', '< 2 000 ms', 'ISTQB PT - Tail Latency'],
  ['avg — Promedio', '⚠️ Engañoso como métrica principal; usar solo de referencia.', 'Ref.', 'ISO/IEC 25023 ⚠️'],
  ['http_req_failed', '% requests con error HTTP (4xx/5xx) o de red.', '< 1%', 'ISO/IEC 25010 Fiabilidad'],
  ['TTFB (http_req_waiting)', 'Tiempo puro de procesamiento del backend.', '—', 'Google SRE Latency'],
  ['http_req_blocked', 'Tiempo esperando socket TCP libre.', '< 10 ms', 'ISO/IEC 25023'],
  ['http_req_tls_handshaking', 'Negociación TLS/SSL.', '< 50 ms', 'ISO/IEC 25010 Seguridad'],
  ['APDEX Score', 'Índice de satisfacción 0-1. 1.0=todos satisfechos.', '≥ 0.90', 'ISO/IEC 25023 §7.4'],
  ['checks', 'Validaciones funcionales (HTTP 200 + JSON válido).', '> 99%', 'ISTQB PT Aceptación'],
  ['session_success_rate', '% sesiones completas sin error.', '> 99%', 'ISO/IEC 25010 Disponibilidad'],
];

// ── Función principal ────────────────────────────────────────────────────────
async function main() {
  const reportsDir = path.join(__dirname, '../reports');
  const jsonPath = resolveTargetJson(reportsDir, process.argv[2]);
  const r = new K6Reader(jsonPath);
  const budget = r.errorBudget;
  const epSummary = r.endpointSummary;
  const epIters = r.endpointIterations;

  const changelogPath = path.join(__dirname, '../config/release-changelog.json');
  let changelog = null;
  if (fs.existsSync(changelogPath)) {
    changelog = safeReadJson(changelogPath);
    if (Array.isArray(changelog)) changelog = changelog[0];
  }

  // Logo SUNEDU (opcional)
  const logoPath = path.join(__dirname, '../assets/sunedu-logo.png');
  let logoImage;
  if (fs.existsSync(logoPath)) {
    logoImage = new ImageRun({ data: fs.readFileSync(logoPath), transformation: { width: 120, height: 50 } });
  }

  // ── Estado y umbrales ────────────────────────────────────────────────────
  const p95ok = r.p95 < r.slo.p95Ms;
  const p99ok = r.p99 < r.slo.p99Ms;
  const errOk = r.errorRate < r.slo.errorRate;
  const chkOk = r.checksRate >= r.slo.checksRate;
  const sessOk = r.sessionRate >= r.slo.checksRate;
  const apdexOk = r.apdex >= r.slo.apdexMin;

  const doc = new Document({
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              para(
                [
                  txt('REGINSA SUNEDU | QA Rendimiento | '),
                  new TextRun({ children: ['Pág. ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES] }),
                ],
                { align: AlignmentType.CENTER },
              ),
            ],
          }),
        },
        children: [
          // ═══════════════════════════════════════════════════════════════════
          // PORTADA
          // ═══════════════════════════════════════════════════════════════════
          ...(logoImage ? [para([logoImage], { align: AlignmentType.CENTER, sb: 200 })] : []),
          para([txt('INFORME TÉCNICO DE RENDIMIENTO', { bold: true, size: 16, color: C.AZU })], {
            align: AlignmentType.CENTER,
            sb: 400,
          }),
          para([txt('AUDITORÍA TDR — SUNEDU', { bold: true, size: 13, color: C.AZM })], {
            align: AlignmentType.CENTER,
            sa: 400,
          }),

          table([
            row(['Entidad', 'SUNEDU — Superintendencia Nacional de Educación Superior Universitaria'], {
              bg: C.AZC,
              bold: true,
              ws: [30, 70],
            }),
            row(['Sistema', 'REGINSA'], { ws: [30, 70] }),
            row(['IP de Origen', r.sourceIp], { bg: C.AZC, bold: true, ws: [30, 70] }),
            row(['Tipo de Prueba', r.testName], { ws: [30, 70] }),
            row(['Tiempo de Prueba', r.testRunDurationStr], { bg: C.AZC, bold: true, ws: [30, 70] }),
            row(['ID de Ejecución', r.runId], { ws: [30, 70] }),
            row(['Fecha y Hora', r.generatedAt], { bg: C.AZC, ws: [30, 70] }),
            row(['Responsable QA', 'Liz Vidal'], { ws: [30, 70] }),
            row(['Estándares Aplicados', 'ISTQB PT · ISO/IEC 25010 · ISO/IEC 25023 · Google SRE'], {
              bg: C.AZC,
              ws: [30, 70],
            }),
            row(['Estado Final', `${r.statusEmoji} ${r.status}`], {
              bold: true,
              bg: r.sloPass ? C.VEF : C.ROF,
              color: r.sloPass ? C.VER : C.ROJ,
              ws: [30, 70],
            }),
          ]),

          para([txt('CONFIDENCIAL — PROPIEDAD DE SUNEDU', { italic: true, size: 8, color: '757575' })], {
            align: AlignmentType.CENTER,
            sb: 200,
          }),

          // ─── ÍNDICE ───────────────────────────────────────────────────────
          para([txt('ÍNDICE', { bold: true, size: 12, color: C.AZU })], { sb: 400 }),
          ...[
            '1. Introducción y Objetivos',
            '2. Dashboard Maestro de KPIs',
            '3. Descomposición de Latencia',
            '4. Error Budget y Análisis SLO',
            '5. Análisis por Endpoint',
            '6. Espectro de Respuestas HTTP',
            '7. Análisis de Carga por Origen IP',
            '8. Registro de Auditoría: Cambios API y Defectos QA',
            '9. Validaciones Funcionales (Checks)',
            '10. Criterios de Salida y Recomendaciones',
            '11. Leyenda Técnica y Estándares',
          ].map((s) => para([txt(s, { color: C.AZM })], { sb: 40, sa: 40 })),

          // ═══════════════════════════════════════════════════════════════════
          // S1 — INTRODUCCIÓN
          // ═══════════════════════════════════════════════════════════════════
          h2('1. Introducción y Objetivos de la Prueba'),
          para([
            txt(
              'El presente informe consolida los resultados de la prueba de rendimiento ejecutada sobre ' +
                'REGINSA de SUNEDU. La prueba evalúa la capacidad de ' +
                'respuesta, fiabilidad y seguridad de los servicios institucionales bajo los ' +
                'estándares ISTQB Performance Testing, ISO/IEC 25010, ISO/IEC 25023 y Google SRE.',
            ),
          ]),
          para([
            txt(
              `Modalidad de ejecución: ${r.vusMax} VU(s) · IP de origen: ${r.sourceIp} · ` +
                `Endpoints evaluados: Múltiples endpoints configurados según caso de prueba.`,
            ),
          ]),

          // ═══════════════════════════════════════════════════════════════════
          // S2 — DASHBOARD MAESTRO
          // ═══════════════════════════════════════════════════════════════════
          h2('2. Dashboard Maestro de KPIs (Vista Ejecutiva)'),
          table([
            row(['KPI', 'Valor Medido', 'Umbral SLO', 'Estado'], { header: true }),
            row(['Total Requests', String(r.totalRequests), '—', '🟢'], {}),
            row(['Tiempo de Prueba', r.testRunDurationStr, '—', '🟢'], { bg: C.GRS }),
            row(['RPS (Throughput)', `${r.rps.toFixed(2)} req/s`, '—', '🟢'], {}),
            row(['Latencia p50 (Mediana)', fmtMs(r.p50), 'Ref.', '🟢'], { bg: C.GRS }),
            row(['Latencia p95 ★ SLO', fmtMs(r.p95), '< 1 500 ms', p95ok ? '✅ OK' : '🔴 FALLA'], {
              bold: true,
              bg: statusBg(p95ok),
              color: statusColor(p95ok),
            }),
            row(['Latencia p99 (Cola)', fmtMs(r.p99), '< 2 000 ms', p99ok ? '✅ OK' : '🔴 FALLA'], {
              bg: statusBg(p99ok),
              color: statusColor(p99ok),
            }),
            row(['Tasa de Errores', fmtPct(r.errorRate), '< 1%', errOk ? '✅ OK' : '🔴 FALLA'], {
              bold: true,
              bg: statusBg(errOk),
              color: statusColor(errOk),
            }),
            row(['APDEX Score', r.apdex.toFixed(3), '≥ 0.90', apdexOk ? '✅ OK' : '🔴 FALLA'], {
              bg: statusBg(apdexOk),
              color: statusColor(apdexOk),
            }),
            row(['Checks OK', fmtPct(r.checksRate), '> 99%', chkOk ? '✅ OK' : '🔴 FALLA'], {
              bg: statusBg(chkOk),
              color: statusColor(chkOk),
            }),
            row(['Session Success', fmtPct(r.sessionRate), '> 99%', sessOk ? '✅ OK' : '🔴 FALLA'], { bg: C.GRS }),
            row(['VUs Máximos', String(r.vusMax), '—', '🟢'], {}),
            row(['Data Recibida', `${r.dataRecvKB} KB`, '—', '🟢'], { bg: C.GRS }),
          ]),

          // ═══════════════════════════════════════════════════════════════════
          // S3 — DESCOMPOSICIÓN DE LATENCIA
          // ═══════════════════════════════════════════════════════════════════
          h2('3. Descomposición de Latencia (Diagnóstico de Infraestructura)'),
          para([
            txt(
              'La latencia total se descompone en fases. Esta vista permite distinguir si un problema ' +
                'de latencia es de red (TLS/TCP), de backend (TTFB) o de transferencia (sending/receiving).',
            ),
          ]),
          table([
            row(['Fase de Latencia', 'Promedio (avg)', 'p95', 'Descripción', 'Umbral Ref.'], {
              header: true,
              ws: [25, 15, 15, 35, 10],
            }),
            row(
              [
                'TTFB (http_req_waiting)',
                fmtMs(r.ttfb),
                fmtMs(r.ttfbP95),
                'Tiempo puro de procesamiento del backend/BD',
                '—',
              ],
              { ws: [25, 15, 15, 35, 10] },
            ),
            row(
              [
                'Bloqueo TCP (http_req_blocked)',
                fmtMs(r.blockedAvg),
                fmtMs(r.blockedP95),
                'Espera de socket libre. Alto = saturación de red',
                '< 10 ms',
              ],
              { bg: C.GRS, ws: [25, 15, 15, 35, 10] },
            ),
            row(
              [
                'TLS Handshake',
                fmtMs(r.tlsAvg),
                fmtMs(r.tlsP95),
                'Negociación SSL/TLS. Alto = problema certificado',
                '< 50 ms',
              ],
              { ws: [25, 15, 15, 35, 10] },
            ),
            row(['Conexión TCP', fmtMs(r.connectingAvg), '—', 'Apertura de conexión TCP', 'Red'], {
              bg: C.GRS,
              ws: [25, 15, 15, 35, 10],
            }),
            row(['Envío (sending)', fmtMs(r.sendingAvg), '—', 'Tiempo enviando el request HTTP', '—'], {
              ws: [25, 15, 15, 35, 10],
            }),
            row(
              ['Recepción (receiving)', fmtMs(r.receivingAvg), '—', 'Tiempo recibiendo la respuesta del servidor', '—'],
              { bg: C.GRS, ws: [25, 15, 15, 35, 10] },
            ),
            row(
              [
                'Duración de Iteración',
                fmtMs(r.iterationAvg),
                '—',
                'Ciclo completo de VU (setup + request + teardown)',
                '—',
              ],
              { ws: [25, 15, 15, 35, 10] },
            ),
          ]),

          // ═══════════════════════════════════════════════════════════════════
          // S4 — ERROR BUDGET
          // ═══════════════════════════════════════════════════════════════════
          h2('4. Error Budget y Análisis SLO'),
          table([
            row(['Parámetro', 'Valor'], { header: true }),
            row(['SLO p95 objetivo', `< ${budget.sloMs} ms`], { bg: C.GRS }),
            row(['p95 medido', `${budget.p95Ms} ms`], {}),
            row(['Error Budget consumido', `${budget.consumedPct}%`], {
              bold: true,
              bg: budget.consumedPct > 80 ? C.ROF : C.VEF,
              color: budget.consumedPct > 80 ? C.ROJ : C.VER,
            }),
            row(['Error Budget restante', `${budget.remainingPct}%`], { bold: true, bg: C.VEF, color: C.VER }),
            row(['Margen disponible', `${budget.marginMs} ms`], { bg: C.GRS }),
            row(['Estado SLO', `${r.statusEmoji} ${r.status}`], { bold: true }),
          ]),
          para([
            txt(
              `El sistema consumió el ${budget.consumedPct}% de su presupuesto de error SLO ` +
                `(p95 = ${budget.p95Ms}ms vs umbral ${budget.sloMs}ms). ` +
                `Margen restante: ${budget.marginMs}ms. ` +
                (budget.remainingPct > 50
                  ? 'El sistema tiene amplio margen para escalar a Load/Stress.'
                  : 'Se recomienda optimizar antes de ejecutar pruebas de carga completa.'),
            ),
          ]),

          // ═══════════════════════════════════════════════════════════════════
          // S5 — ANÁLISIS POR ENDPOINT
          // ═══════════════════════════════════════════════════════════════════
          h2('5. Análisis por Endpoint'),

          // 5a — Resumen agregado
          ...(epSummary.length > 0
            ? [
                para([txt('5.1 Dashboard por Servicio', { bold: true, color: C.AZM })], { sb: 120 }),
                table([
                  row(['Servicio', 'Reqs', 'avg', 'p50', 'p95 ★', 'p99', 'max', 'Error %', 'Checks'], {
                    header: true,
                    ws: [20, 10, 10, 10, 10, 10, 10, 10, 10],
                  }),
                  ...epSummary.map((ep) => {
                    const sloOk = (ep.p95 ?? 9999) < r.slo.p95Ms && ep.errorRate < r.slo.errorRate;
                    const pass = ep.fails === 0 && sloOk;
                    return row(
                      [
                        ep.endpoint.replace('_', '/').toUpperCase(),
                        String(ep.reqs),
                        fmtMs(ep.avg),
                        fmtMs(ep.p50),
                        fmtMs(ep.p95),
                        fmtMs(ep.p99),
                        fmtMs(ep.max),
                        fmtPct(ep.errorRate),
                        `${ep.successRate}%`,
                      ],
                      {
                        bg: pass ? C.VEF : C.ROF,
                        color: pass ? C.VER : C.ROJ,
                        bold: true,
                        ws: [20, 10, 10, 10, 10, 10, 10, 10, 10],
                      },
                    );
                  }),
                ]),
              ]
            : [
                para([
                  txt(
                    '⚠️ No se encontraron grupos de endpoint en root_group. Verifique que el script k6 usa group() con nombres de endpoint.',
                    { color: C.ROJ },
                  ),
                ]),
              ]),

          // 5b — Detalle por iteración
          ...(epIters.length > 0
            ? [
                para([txt('5.2 Detalle por Iteración', { bold: true, color: C.AZM })], { sb: 120 }),
                table([
                  row(['Iteración', 'Servicio', 'URL', 'Checks OK', 'Checks Fail'], {
                    header: true,
                    ws: [20, 15, 40, 12, 13],
                  }),
                  ...epIters.map((iter) =>
                    row(
                      [
                        iter.name.replace(/.*\(([^)]+)\).*/, '$1') || iter.name.substring(0, 30),
                        iter.endpoint.replace('_', '/').toUpperCase(),
                        iter.url.substring(0, 50),
                        String(iter.passes),
                        String(iter.fails),
                      ],
                      {
                        bg: iter.fails === 0 ? C.GRS : C.ROF,
                        ws: [20, 15, 40, 12, 13],
                      },
                    ),
                  ),
                ]),
              ]
            : []),

          // ═══════════════════════════════════════════════════════════════════
          // S6 — ESPECTRO HTTP
          // ═══════════════════════════════════════════════════════════════════
          ...(() => {
            const statusCounts = [];
            Object.keys(r._m).forEach((key) => {
              const match = key.match(/^http_reqs\{status:(\d{3})\}$/);
              if (match) {
                const status = parseInt(match[1], 10);
                const count = r.metricValues(key).count || 0;
                if (count > 0) {
                  let type = 'Desconocido',
                    color = C.GRS,
                    textC = '757575',
                    emoji = '❔';
                  if (status >= 200 && status < 300) {
                    type = 'Éxito (OK)';
                    color = C.VEF;
                    textC = C.VER;
                    emoji = '✅';
                  } else if (status >= 300 && status < 400) {
                    type = 'Redirección';
                    color = C.AZC;
                    textC = C.AZM;
                    emoji = '↪️';
                  } else if (status >= 400 && status < 500) {
                    type = 'Error de Cliente';
                    color = C.AMF;
                    textC = 'E65100';
                    emoji = '⚠️';
                  } else if (status >= 500) {
                    type = 'Error de Servidor';
                    color = C.ROF;
                    textC = C.ROJ;
                    emoji = '🔴';
                  }
                  if (status === 429) {
                    type = 'Too Many Requests (Rate Limit)';
                    emoji = '⏸️';
                  }
                  statusCounts.push({ status, count, type, color, textC, emoji });
                }
              }
            });

            if (statusCounts.length === 0) return [];
            statusCounts.sort((a, b) => a.status - b.status);

            return [
              h2('6. Distribución de Respuestas HTTP (Espectro de Códigos)'),
              para([
                txt(
                  'A continuación se detallan los códigos de estado HTTP emitidos por el servidor. Un alto volumen de errores 4xx o 5xx indica que el sistema entró en estado de saturación o colapso bajo la carga.',
                ),
              ]),
              table([
                row(['Código HTTP', 'Clasificación', 'Frecuencia'], { header: true, ws: [25, 50, 25] }),
                ...statusCounts.map((st, _idx) =>
                  row([`${st.emoji} HTTP ${st.status}`, st.type, String(st.count)], {
                    bg: st.color,
                    color: st.textC,
                    bold: true,
                    ws: [25, 50, 25],
                  }),
                ),
              ]),
            ];
          })(),

          // ═══════════════════════════════════════════════════════════════════
          // S7 — ANÁLISIS MULTI-IP
          // ═══════════════════════════════════════════════════════════════════
          ...(r.localIps.length > 1
            ? [
                h2('7. Análisis de Carga por Origen IP (Auditoría Multi-IP)'),
                para([
                  txt(
                    `Se ejecutó la prueba utilizando un pool de ${r.localIps.length} direcciones IP locales. ` +
                      `Este análisis permite verificar si el WAF o los balanceadores de carga están aplicando ` +
                      `restricciones de Rate Limiting (HTTP 429) de manera equitativa o si alguna IP presenta ` +
                      `comportamientos anómalos de latencia.`,
                  ),
                ]),
                table([
                  row(
                    [
                      'IP Origen (Cliente PC)',
                      'Reqs',
                      'avg',
                      'p50',
                      'p95 ★ SLO',
                      'p99',
                      'Error %',
                      'TTFB',
                      'Tiempo Prueba',
                    ],
                    { header: true, ws: [20, 8, 8, 8, 12, 8, 10, 11, 15] },
                  ),
                  ...r.localIps.map((ip) => {
                    const m = r.getMetricsByIp(ip);
                    const p95 = m.dur['p(95)'] ?? 9999;
                    const errRate = m.fail.rate ?? m.fail.value ?? 0;
                    const pass = p95 < r.slo.p95Ms && errRate < r.slo.errorRate;

                    return row(
                      [
                        ip,
                        String(m.dur.count ?? 0),
                        fmtMs(m.dur.avg),
                        fmtMs(m.dur.med),
                        fmtMs(m.dur['p(95)']),
                        fmtMs(m.dur['p(99)']),
                        fmtPct(errRate),
                        fmtMs(m.ttfb.avg),
                        r.testRunDurationStr,
                      ],
                      {
                        bg: pass ? C.VEF : C.ROF,
                        color: pass ? C.VER : C.ROJ,
                        bold: true,
                        ws: [20, 8, 8, 8, 12, 8, 10, 11, 15],
                      },
                    );
                  }),
                ]),
                para([
                  txt(
                    'Nota: Si una IP presenta una tasa de errores del 100% o latencias drásticamente superiores, ' +
                      'es indicativo de una regla de seguridad restrictiva o un problema de ruteo específico para ese segmento.',
                    { italic: true, size: 8 },
                  ),
                ]),
              ]
            : []),

          // ═══════════════════════════════════════════════════════════════════
          // S7B — FLUJO FUNCIONAL CASO 02
          // ═══════════════════════════════════════════════════════════════════
          h2('7.1 Lectura Funcional del Caso 02: Consulta vs Creación'),
          para([
            txt(
              'Este caso combina una consulta de catálogo con operaciones de creación encadenadas. ' +
                'Para reportarlo correctamente, la consulta debe leerse como precondición y las creaciones como embudo: cabecera, medida y detalle de sanción.',
            ),
          ]),
          table([
            row(['Tipo', 'Paso', 'Endpoint', 'Aceptadas 2xx', '429', 'Error/Red', 'Creadas final'], {
              header: true,
              ws: [12, 22, 28, 10, 8, 10, 10],
            }),
            ...r.functionalFlow.map((item) =>
              row(
                [
                  item.type,
                  item.step,
                  item.endpoint,
                  String(item.counts.success),
                  String(item.counts.rateLimited),
                  String(item.counts.error + item.counts.network),
                  item.created == null ? 'N/A' : String(item.created || item.counts.success),
                ],
                {
                  bg: item.counts.rateLimited || item.counts.error || item.counts.network ? C.AMF : C.VEF,
                  ws: [12, 22, 28, 10, 8, 10, 10],
                },
              ),
            ),
          ]),

          // ═══════════════════════════════════════════════════════════════════
          // S8 — AUDITORIA DE CAMBIOS Y DEFECTOS (CHANGELOG)
          // ═══════════════════════════════════════════════════════════════════
          ...(changelog ? [
            h2(`8. Registro de Auditoría: Cambios API y Defectos QA (Pase ${changelog.paseAnterior} a ${changelog.paseActual})`),
            para([
              txt(
                `Esta sección documenta el seguimiento y resolución de defectos entre versiones, y los cambios arquitectónicos de API que justifican el comportamiento actual de las pruebas de carga. (Generado al ${changelog.fechaEvaluacion} por ${changelog.responsableQA})`
              ),
            ]),
            para([txt('8.1 Resolución de Defectos Críticos (QA Tracking)', { bold: true, color: C.AZM })], { sb: 120 }),
            table([
              row(['Defecto ID', 'Descripción', 'Estado Playwright (UI)', 'Estado K6 (Backend/Carga)', 'Impacto/Prioridad'], { header: true, ws: [15, 30, 20, 20, 15] }),
              ...changelog.defectos.map((d) => {
                const bgSt = d.paseActual.includes('CERRADO') || d.estadoK6.toUpperCase().includes('CORREGIDO') ? C.VEF : C.AMF;
                return row([
                  d.id,
                  d.descripcion,
                  d.estadoUI,
                  d.estadoK6,
                  `${d.prioridad}\n${d.paseAnterior} -> ${d.paseActual}`
                ], { bg: bgSt, ws: [15, 30, 20, 20, 15] });
              })
            ]),

            para([txt('8.2 Matriz de Cambios de API y Arquitectura', { bold: true, color: C.AZM })], { sb: 120 }),
            table([
              row(['Endpoint Actual', 'Método', 'Cambio Respecto al Pase Anterior', 'Impacto en Tests K6'], { header: true, ws: [30, 10, 30, 30] }),
              ...changelog.endpoints.map((ep) => {
                const bgSt = ep.estadoK6.toUpperCase().includes('CORREGIDO') || ep.estadoK6.toUpperCase().includes('OK') || ep.estadoK6.toUpperCase().includes('SIN CAMBIOS') ? C.VEF : C.AMF;
                return row([
                  ep.ahora.url,
                  ep.ahora.metodo,
                  `Antes: ${ep.antes.url}\n${ep.impacto}`,
                  ep.estadoK6
                ], { bg: bgSt, ws: [30, 10, 30, 30] });
              })
            ])
          ] : []),

          // ═══════════════════════════════════════════════════════════════════
          // S9 — VALIDACIONES FUNCIONALES
          // ═══════════════════════════════════════════════════════════════════
          h2('9. Validaciones Funcionales (Checks)'),
          table([
            row(['Métrica', 'Valor', 'Umbral', 'Estado'], { header: true }),
            row(['Total Checks ejecutados', String(r.checksPasses + r.checksFails), '—', '🟢'], {}),
            row(['Checks aprobados', String(r.checksPasses), '—', '🟢'], { bg: C.VEF, color: C.VER }),
            row(['Checks fallidos', String(r.checksFails), '0', r.checksFails === 0 ? '✅ OK' : '🔴 FALLA'], {
              bg: r.checksFails === 0 ? C.GRS : C.ROF,
            }),
            row(['Tasa de éxito (%)', fmtPct(r.checksRate), '> 99%', chkOk ? '✅ OK' : '🔴 FALLA'], {
              bold: true,
              bg: statusBg(chkOk),
              color: statusColor(chkOk),
            }),
            row(['Session Success Rate', fmtPct(r.sessionRate), '> 99%', sessOk ? '✅ OK' : '🔴 FALLA'], {
              bg: statusBg(sessOk),
              color: statusColor(sessOk),
            }),
          ]),

          // ═══════════════════════════════════════════════════════════════════
          // S10 — CRITERIOS DE SALIDA Y RECOMENDACIONES
          // ═══════════════════════════════════════════════════════════════════
          h2('10. Criterios de Salida ISTQB y Recomendaciones'),
          table([
            row(['Criterio ISTQB PT', 'SLO / Umbral', 'Resultado', 'Estado'], { header: true }),
            row(['Latencia p95 < 1 500 ms', '< 1 500 ms', fmtMs(r.p95), p95ok ? '✅ PASA' : '🔴 FALLA'], {
              bg: statusBg(p95ok),
            }),
            row(['Tasa de errores < 1%', '< 1%', fmtPct(r.errorRate), errOk ? '✅ PASA' : '🔴 FALLA'], {
              bg: statusBg(errOk),
            }),
            row(['Checks funcionales > 99%', '> 99%', fmtPct(r.checksRate), chkOk ? '✅ PASA' : '🔴 FALLA'], {
              bg: statusBg(chkOk),
            }),
            row(['APDEX Score ≥ 0.90', '≥ 0.90', r.apdex.toFixed(3), apdexOk ? '✅ PASA' : '🔴 FALLA'], {
              bg: statusBg(apdexOk),
            }),
            row(
              [
                'Error Budget < 80% consumido',
                '< 80%',
                `${budget.consumedPct}%`,
                budget.consumedPct < 80 ? '✅ PASA' : '⚠️ ALERTA',
              ],
              { bg: budget.consumedPct < 80 ? C.VEF : C.AMF },
            ),
          ]),
          para([txt('Recomendaciones:', { bold: true, color: C.AZM })], { sb: 160 }),
          ...[
            `• TTFB = ${Math.round(r.ttfb)}ms: El backend procesa en ~${Math.round(r.ttfb)}ms. ` +
              (r.ttfb > 400 ? 'Revisar queries de BD o caché en el endpoint. ' : 'Dentro de parámetros normales. ') +
              'Optimizar consultas si se supera 500ms en prueba de carga.',
            `• TLS = ${Math.round(r.tlsAvg)}ms avg: ${r.tlsAvg < 50 ? 'Dentro del umbral < 50ms. TLS configurado correctamente.' : 'Supera 50ms. Revisar configuración de certificado TLS.'}`,
            `• Error Budget consumido: ${budget.consumedPct}%. ` +
              (budget.consumedPct < 50
                ? 'Margen amplio para escalar a Load/Stress con confianza.'
                : 'Optimizar latencia antes de prueba de carga.'),
            `• Próximo paso recomendado: ${r.sloPass ? 'Ejecutar prueba de CARGA (Load) — el Smoke fue exitoso.' : 'Corregir los thresholds que fallaron antes de escalar.'}`,
          ].map((t) => para([txt(t)], { sb: 60, sa: 60 })),

          // ═══════════════════════════════════════════════════════════════════
          // S11 — LEYENDA TÉCNICA
          // ═══════════════════════════════════════════════════════════════════
          h2('11. Leyenda Técnica y Estándares Internacionales'),
          table([
            row(['Métrica', '¿Qué mide?', 'Umbral', 'Estándar'], { header: true, ws: [22, 48, 12, 18] }),
            ...LEGEND.map((l, i) => row(l, { bg: i % 2 === 0 ? C.GRS : undefined, ws: [22, 48, 12, 18] })),
          ]),
        ], // fin children
      },
    ], // fin sections
  });

  const outPath = path.join(r.outDir, `REGINSA_${r.testName}_INFORME_TDR_${r.filenameStamp}.docx`);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buffer);
  console.log(`✅ [WORD] Informe TDR generado: ${path.basename(outPath)}`);
}

main().catch((err) => {
  console.error('❌ [WORD]', err.message);
  process.exit(1);
});
