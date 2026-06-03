// tools/generar-html.js — REGINSA
// HTML report generator aligned with Word/Excel TDR template & SRE Premium Standards

const path = require('node:path');
const fs = require('node:fs');
const { K6Reader, fmtMs, fmtPct } = require('./lib/k6-reader');

// ---- Google Font & premium styles ------------------------------------------------
const STYLE = `
  :root {
    --primary: #1A237E;
    --secondary: #3949AB;
    --bg: #eef0fb;
    --card: #ffffff;
    --text: #172033;
    --border: #c5cae9;
    --pass-bg: #E8F5E9;
    --pass-text: #2E7D32;
    --fail-bg: #FFEBEE;
    --fail-text: #C62828;
    --warn-bg: #FFF8E1;
    --warn-text: #F57F00;
    --info-bg: #E8EAF6;
    --info-text: #1A237E;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; background: #eef0fb; color: #172033; font-size: 12px; padding: 16px; border-top: 3px solid #283593; }

  /* === SI058 k6-shell / k6-panel layout === */
  .k6-shell { margin: 14px -16px 0; padding: 22px 0 28px; background: linear-gradient(135deg,#6b6bd6,#7a4ab0); }
  .k6-panel { max-width: 1400px; width: calc(100% - 48px); margin: 0 auto; border-radius: 10px; overflow: hidden; background: #fff; box-shadow: 0 12px 36px rgba(45,21,100,.28); }
  .k6-header { background: linear-gradient(135deg,#7c3aed,#5b21b6); color: #fff; padding: 18px 28px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .k6-mark { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 30px; background: #fff; color: #5b21b6; font-weight: 900; border-radius: 4px 14px 4px 4px; font-size: 14px; }
  .k6-body { padding: 22px; }

  .brand { display: flex; align-items: center; gap: 16px; min-width: 0; }
  .logo-box { background: #fff; border-radius: 8px; padding: 6px 10px; display: flex; align-items: center; }
  .logo-box img { height: 48px; width: auto; display: block; }
  .title { font-size: 15px; font-weight: 700; }
  .sub { font-size: 11px; opacity: .88; margin-top: 3px; }
  .std { text-align: right; font-size: 10px; opacity: .82; line-height: 1.35; white-space: nowrap; }

  .section { background: #fff; border-radius: 8px; border: 1px solid #c5cae9; overflow: hidden; margin-bottom: 14px; }
  .section-title, summary { background: #283593; color: #fff; padding: 9px 16px; font-weight: 700; font-size: 13px; cursor: default; }
  summary { list-style: none; cursor: pointer; position: relative; padding-left: 34px; }
  summary::before { content: "▾"; position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 12px; line-height: 1; }
  details:not([open]) > summary::before { content: "▸"; }
  details:not([open]) > summary { border-bottom: none; }
  summary::-webkit-details-marker { display: none; }
  .section-body { padding: 12px 16px; }
  .note { padding: 10px 16px; color: #455; line-height: 1.5; }

  table { width: 100%; border-collapse: collapse; background: #fff; font-size: 11px; margin-top: 8px; }
  th { background: linear-gradient(90deg,#6574df,#7047a8); color: #fff; padding: 9px 12px; border: 1px solid #283593; text-align: center; white-space: nowrap; font-size: 10px; text-transform: uppercase; }
  td { padding: 8px 12px; border: 1px solid #e4e7f4; text-align: center; }
  .text-left { text-align: left !important; }
  .strong { font-weight: bold; }
  .mono { font-family: Consolas, "Courier New", monospace; }
  .ok-row { background: #e8f5e9; color: #1b5e20; }
  .slo-head, .slo-cell { background: #d1d9ff !important; color: #1a237e !important; font-weight: 700; }
  .master th, .master td { font-size: 10px; padding: 5px 6px; }

  /* KPI Cards — 4 columnas, ícono decorativo (dot) como SI058 */
  .k6-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 22px; margin-bottom: 24px; }
  .k6-card { position: relative; border-radius: 8px; padding: 22px; color: white; min-height: 110px; box-shadow: 0 6px 14px rgba(0,0,0,.18); text-transform: uppercase; font-weight: 700; overflow: hidden; }
  .k6-card > div:first-child { opacity: .92; font-size: 12px; }
  .k6-card strong { display: block; margin-top: 10px; font-size: 34px; line-height: 1; }
  .k6-card-icon { position: absolute; right: 22px; top: 24px; opacity: .16; font-size: 56px; line-height: 1; }
  .k6-card.purple { background: linear-gradient(135deg,#6b6bd6,#6d4bb4); }
  .k6-card.green  { background: linear-gradient(135deg,#5cc98a,#48bb78); }
  .k6-card.red    { background: linear-gradient(135deg,#e57373,#c62828); }
  .k6-card.orange { background: linear-gradient(135deg,#ffb74d,#ef6c00); }

  .pill-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; text-align: center; }
  .pill-badge.pass { background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; }
  .pill-badge.fail { background: #ffebee; color: #c62828; border: 1px solid #ffcdd2; }
  .pill-badge.warn { background: #fff8e1; color: #f57f00; border: 1px solid #ffe0b2; }

  /* Gráficos — ocultos por defecto (igual que SI058) */
  .charts-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap: 24px; margin-bottom: 28px; }
  .chart-card { background: #fff; border-radius: 8px; border: 1px solid #dfe3f5; padding: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.03); }
  .chart-card h3 { margin-top: 0; color: #1a237e; font-size: 13px; border-bottom: 1px solid #dfe3f5; padding-bottom: 8px; margin-bottom: 16px; }
  .chart-card canvas { width: 100% !important; height: 280px !important; }
  .section-graphics { display: none; }

  .k6-check-ip { margin-bottom: 12px; border: 1px solid #dfe3f5; border-radius: 8px; overflow: hidden; background: #fff; }
  .k6-check-ip > summary { background: #f6f7ff; color: #1a237e; font-size: 11px; border-left: 4px solid #283593; font-weight: bold; padding: 10px 16px 10px 34px; }
  .k6-check-ip > summary::before { left: 14px; }

  /* TABS para k6-panel */
  .k6-tabs { display: flex; flex-wrap: wrap; margin-top: 24px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fafafa; }
  .k6-tabs input[type="radio"] { display: none; }
  .k6-tab-label { padding: 12px 24px; cursor: pointer; font-weight: bold; color: #5b21b6; border-bottom: 3px solid transparent; flex-grow: 1; text-align: center; }
  .k6-tab-label:hover { background: #f0ebf8; }
  .k6-tab-content { width: 100%; padding: 20px; background: #fff; border-top: 1px solid #e0e0e0; display: none; }
  #k6-tab-metrics:checked ~ .tab-label-metrics,
  #k6-tab-run:checked ~ .tab-label-run,
  #k6-tab-checks:checked ~ .tab-label-checks { border-bottom-color: #5b21b6; background: #fff; }
  #k6-tab-metrics:checked ~ .content-metrics,
  #k6-tab-run:checked ~ .content-run,
  #k6-tab-checks:checked ~ .content-checks { display: block; }

  .k6-detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px; }
  .k6-detail-card { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; padding: 16px; }
  .k6-detail-card h4 { margin: 0 0 10px 0; color: #495057; font-size: 13px; text-transform: uppercase; }
  .k6-detail-card div { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
  .k6-detail-card div span { color: #6c757d; }
  .k6-detail-card div strong { color: #212529; }

  .toc { background: #f8fafc; border: 1px solid #dfe3f5; padding: 16px; border-radius: 8px; margin: 14px 0 20px; }
  .toc h3 { margin-top: 0; color: #1a237e; font-size: 14px; }
  .toc ul { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px; }
  .toc li a { color: #3949ab; text-decoration: none; font-weight: 600; display: flex; align-items: center; }
  .toc li a:before { content: "→"; margin-right: 8px; opacity: 0.5; }
  .toc li a:hover { color: #1a237e; text-decoration: underline; }

  footer { text-align: center; padding: 14px; color: #718096; font-size: 11px; border-top: 1px solid #e2e8f0; background: #f7fafc; }
`;

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function generateHTML(jsonPath, outDir) {
  const r = new K6Reader(jsonPath);
  const fileName = `REGINSA_PERF-MULTI_IP_AUDIT_AUDITORIA_${r.filenameStamp}.html`;
  const outPath = path.join(outDir, fileName);

  const budget = r.errorBudget;
  const showMultiIp = true;

  // Extraer checks 
  const allChecksList = [];
  function extractChecksRecursively(group) {
    if (!group) return;
    if (group.checks) {
      Object.values(group.checks).forEach(c => allChecksList.push(c));
    }
    if (group.groups) {
      Object.values(group.groups).forEach(extractChecksRecursively);
    }
  }
  extractChecksRecursively(r._root);

  const errorSpectrum = {};
  let totalFails = 0;
  allChecksList.forEach(c => {
    if (c.fails > 0) {
      totalFails += c.fails;
      const match = c.name.match(/status\s*(?:===|is|=)?\s*(\d{3})/i) || c.name.match(/\\((\d{3})\\)/);
      if (match) {
        const code = match[1];
        errorSpectrum[code] = (errorSpectrum[code] || 0) + c.fails;
      } else {
        errorSpectrum['NET'] = (errorSpectrum['NET'] || 0) + c.fails;
      }
    }
  });

  const table = (headers, rows) => {
    const hdr = `<tr>` + headers.map(h => `<th>${esc(h)}</th>`).join('') + `</tr>`;
    const body = rows.map(rowItem => {
      if (rowItem && rowItem.cells) {
        return `<tr class="${rowItem.cls}">` + rowItem.cells.map((c, i) => `<td class="${i===0 ? 'text-left' : ''}">${esc(c)}</td>`).join('') + `</tr>`;
      }
      return `<tr>` + rowItem.map((c, i) => `<td class="${i===0 ? 'text-left' : ''}">${esc(c)}</td>`).join('') + `</tr>`;
    }).join('');
    return `<table>${hdr}${body}</table>`;
  };

  const statusCardClass = r.status === 'PASA' ? 'green' : (r.status === 'DEGRADADO' ? 'orange' : 'red');

  const sections = [
    { id: 'modo', title: '1. Modo de Ejecución' },
    { id: 'dashboard', title: '2. Dashboard Maestro de KPIs' },
    { id: 'latency', title: '3. Descomposición de Latencia' },
    { id: 'endpoints', title: '4. Análisis por Endpoint' },
    { id: 'network', title: '5. Red e Infraestructura' },
    { id: 'multiip', title: '6. Auditoría Multi‑IP' },
    { id: 'sre', title: '7. Distribución y Balanceo de Carga SRE' },
    { id: 'qa', title: '8. Criterios de Aceptación QA/SRE' },
    { id: 'http', title: '9. Resumen de Respuestas HTTP' },
    { id: 'diagnostics', title: '10. Diagnóstico SRE y Errores' },
    { id: 'granular', title: '11. Análisis Granular por Nodo' },
    { id: 'legend', title: '12. Leyenda de Métricas' },
    { id: 'recommendation', title: '13. Recomendación Técnica' }
  ];

  const indexHtml = `
    <div class="toc">
      <h3>Índice de Secciones</h3>
      <ul>${sections.map(s => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('')}</ul>
    </div>
  `;

  // 1. Modo de Ejecución
  const modoHtml = `
    <h2 id="modo">${sections[0].title}</h2>
    <div class="section-body">
      ${table(['Run', 'Escenario', 'Modo', 'IPs activas', 'Total requests', 'VUs max'], [
        [r.testName, 'multi_ip_audit', 'Multi-IP', r.sourceIp, r.totalRequests, r.vusMax]
      ])}
    </div>
  `;

  // 2. Dashboard Maestro
  const s1_p95 = r.p95 < r.slo.p95Ms ? {cls:'pass', txt:'✔ PASA'} : {cls:'fail', txt:'✖ FALLA'};
  const s1_err = r.errorRate < r.slo.errorRate ? {cls:'pass', txt:'✔ PASA'} : {cls:'fail', txt:'✖ FALLA'};
  const dashRows = [
    ['Total Requests', r.totalRequests, '—', '🟢'],
    ['RPS (Throughput)', `${r.rps.toFixed(2)} req/s`, '—', '🟢'],
    { cls: s1_p95.cls, cells: ['Latencia p95 ★ SLO', fmtMs(r.p95), `< ${r.slo.p95Ms} ms`, s1_p95.txt] },
    ['Latencia p99 (Cola)', fmtMs(r.p99), `< ${r.slo.p99Ms} ms`, r.p99 < r.slo.p99Ms ? '✔ PASA' : '✖ FALLA'],
    { cls: s1_err.cls, cells: ['Tasa de Errores', fmtPct(r.errorRate), `< ${fmtPct(r.slo.errorRate)}`, s1_err.txt] },
    { cls: budget.consumedPct > 80 ? 'warn' : 'pass', cells: ['Error Budget Consumido', `${budget.consumedPct}%`, '< 80%', budget.consumedPct <= 80 ? '✔ PASA' : '⚠️ ALERTA'] }
  ];
  const dashboardHtml = `<h2 id="dashboard">${sections[1].title}</h2>` + table(['KPI', 'Valor Actual', 'Umbral SLO', 'Estado'], dashRows);

  // 3. Latencia
  const latencyRows = [
    ['TTFB (http_req_waiting)', fmtMs(r.ttfb), fmtMs(r.ttfbP95), 'Tiempo puro de procesamiento en servidor/BD'],
    ['Bloqueo TCP (http_req_blocked)', fmtMs(r.blockedAvg), fmtMs(r.blockedP95), 'Espera de socket de red libre (< 10 ms)'],
    ['TLS Handshake', fmtMs(r.tlsAvg), fmtMs(r.tlsP95), 'Negociación de seguridad TLS (< 50 ms)']
  ];
  const latencyHtml = `<h2 id="latency">${sections[2].title}</h2>` + table(['Fase de Latencia', 'Promedio (AVG)', 'p95', 'Descripción Técnica'], latencyRows);

  // 4. Endpoints
  const epRows = r.endpointSummary.map(ep => [ep.endpoint, ep.reqs, fmtMs(ep.p95), fmtPct(ep.errorRate)]);
  const endpointHtml = `<h2 id="endpoints">${sections[3].title}</h2>` + table(['Endpoint', 'Requests', 'p95', 'Error %'], epRows);

  // 5. Red
  const networkHtml = `<h2 id="network">${sections[4].title}</h2>` + table(['Métrica', 'Valor'], [
    ['Data Enviada', `${r.dataSentKB} KB`],
    ['Data Recibida', `${r.dataRecvKB} KB`]
  ]);

  // 6. Auditoría Multi-IP
  const multiIpHtml = `<h2 id="multiip">${sections[5].title}</h2>` + table(
    ['IP Origen Cliente', 'Nodo', 'Requests', 'AVG', 'p50', 'p95 ★', 'p99', 'Error %', 'Duración Total', 'Estado'],
    r.ipSummary.map(ip => [ip.ip, ip.node, ip.requests, fmtMs(ip.avg), fmtMs(ip.p50), fmtMs(ip.p95), fmtMs(ip.p99), fmtPct(ip.error_rate), ip.duration, ip.error_rate < r.slo.errorRate ? '✔' : '✖'])
  );

  // 7. Balanceo SRE
  const sreHtml = `<h2 id="sre">${sections[6].title}</h2>` + table(
    ['Nodo', 'IP', 'Reqs', 'p50', 'p95', 'p99', 'Errores', 'TTFB', 'Blocked', 'TLS', 'APDEX', 'Estado'],
    r.ipSummary.map(ip => [ip.node, ip.ip, ip.requests, fmtMs(ip.p50), fmtMs(ip.p95), fmtMs(ip.p99), Math.round(ip.requests * ip.error_rate), fmtMs(ip.ttfb_avg), fmtMs(ip.blocked_avg), fmtMs(ip.tls_avg), ip.apdex, ip.error_rate < r.slo.errorRate ? '✔' : '✖'])
  );

  // 8. Criterios QA
  const qaHtml = `<h2 id="qa">${sections[7].title}</h2>` + table(['Criterio', 'Valor', 'Estado'], [
    ['Latencia p95', fmtMs(r.p95), r.p95 < r.slo.p95Ms ? '✔ PASA' : '✖ FALLA'],
    ['Error Rate', fmtPct(r.errorRate), r.errorRate < r.slo.errorRate ? '✔ PASA' : '✖ FALLA'],
    ['APDEX', r.apdex, r.apdex >= r.slo.apdexMin ? '✔ PASA' : '✖ FALLA']
  ]);

  // 9. Resumen HTTP
  const statSum = r.statusCodeSummary;
  let httpHtml = `<h2 id="http">${sections[8].title}</h2><div class="k6-cards">`;
  statSum.forEach(s => {
    const color = s.status.startsWith('2') ? 'green' : (s.status.startsWith('4') ? 'orange' : 'red');
    httpHtml += `<div class="k6-card ${color}"><div>HTTP ${s.status}</div><strong>${s.count}</strong></div>`;
  });
  httpHtml += `</div>`;

  // 10. Diagnóstico Errores
  let diagnosticsHtml = `<h2 id="diagnostics">${sections[9].title}</h2>`;
  if (totalFails > 0) {
    diagnosticsHtml += `<div class="section-graphics"><canvas id="errorDoughnutChart"></canvas></div>`;
  } else {
    diagnosticsHtml += `<p class="pill-badge pass">🎉 Certificado de Fiabilidad SRE: 100% de éxito.</p>`;
  }

  // 11. Análisis Granular
  const ipDist = r.ipResponseDistribution;
  let granularHtml = `<h2 id="granular">${sections[10].title}</h2>`;
  r.ipSummary.forEach(ip => {
    const dist = ipDist[ip.ip] || { success: 0, business: 0, rate_limited: 0, errors: 0 };
    granularHtml += `
      <details class="k6-check-ip" open>
        <summary>${ip.node} - ${ip.ip}</summary>
        <div class="section-body">
          <div class="sub-card">
             <div class="sub-card-title">KPIs de Rendimiento</div>
             ${table(['Latencia p95', 'Errores', 'APDEX'], [[fmtMs(ip.p95), fmtPct(ip.error_rate), ip.apdex]])}
          </div>
          <div class="sub-card">
             <div class="sub-card-title">Distribución HTTP</div>
             ${table(['Éxito (200)', 'Límite Negocio (400)', 'Rate Limit (429)', 'Errores (5xx/NET)'], [[dist.success, dist.business, dist.rate_limited, dist.errors]])}
          </div>
        </div>
      </details>
    `;
  });

  // 12. Leyenda
  const legendHtml = `<h2 id="legend">${sections[11].title}</h2>` + table(['Métrica SRE', 'Definición Técnica'], [
    ['p(50) — Mediana', '50% de usuarios recibe respuesta ≤ este tiempo.'],
    ['p(95) ★ SLO', '95% de usuarios recibe respuesta ≤ este tiempo.'],
    ['p(99) — Cola Larga', 'Para detectar timeouts extremos.'],
    ['APDEX Score', 'Índice de satisfacción (0 a 1).'],
    ['TTFB (Waiting)', 'Tiempo de procesamiento puro en servidor.'],
    ['Error Rate', 'Porcentaje de requests HTTP fallidos.']
  ]);

  // 13. Recomendación
  const recommendationHtml = `
    <h2 id="recommendation">${sections[12].title}</h2>
    <div class="section-body">
      <div class="note strong">Migrar a k6 + Grafana Cloud para tableros en tiempo real y correlación de métricas.</div>
    </div>
  `;

  // k6 Panel
  const k6PanelHtml = `
    <section class="k6-shell">
      <div class="k6-panel">
        <div class="k6-header"><span class="k6-mark">k6</span> REGINSA Auditoría</div>
        <div class="k6-body">
          <div class="k6-cards">
            <div class="k6-card purple"><div>Total Requests</div><strong>${r.totalRequests}</strong></div>
            <div class="k6-card green"><div>Failed Requests</div><strong>${r.counter('http_req_failed','count')}</strong></div>
            <div class="k6-card green"><div>Breached Thresholds</div><strong>0</strong></div>
            <div class="k6-card green"><div>Failed Checks</div><strong>${r.checksFails}</strong></div>
          </div>
          <div class="k6-tabs">
            <input id="k6-tab-metrics" name="k6-tabs" type="radio" checked>
            <input id="k6-tab-run" name="k6-tabs" type="radio">
            <input id="k6-tab-checks" name="k6-tabs" type="radio">

            <label class="k6-tab-label tab-label-metrics" for="k6-tab-metrics">Detailed Metrics</label>
            <label class="k6-tab-label tab-label-run" for="k6-tab-run">Test Run Details</label>
            <label class="k6-tab-label tab-label-checks" for="k6-tab-checks">Checks &amp; Groups</label>

            <div class="k6-tab-content content-metrics">
               <h4>Trends & Times</h4>
               ${table(['Metric', 'AVG', 'MIN', 'MED', 'MAX', 'P(90)', 'P(95)', 'P(99)', 'COUNT'], [
                  ['http_req_duration', fmtMs(r.avgDuration), fmtMs(r.minDuration), fmtMs(r.p50), fmtMs(r.maxDuration), fmtMs(r.p90), fmtMs(r.p95), fmtMs(r.p99), r.totalRequests]
               ])}
            </div>
            <div class="k6-tab-content content-run">
               <div class="k6-detail-grid">
                 <div class="k6-detail-card"><h4>Requests</h4><div><span>Total</span><strong>${r.totalRequests}</strong></div></div>
                 <div class="k6-detail-card"><h4>VUs</h4><div><span>Max</span><strong>${r.vusMax}</strong></div></div>
               </div>
            </div>
            <div class="k6-tab-content content-checks">
               ${table(['Check', 'Passes', 'Fails'], allChecksList.map(c => [c.name, c.passes, c.fails]))}
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  // Gráficos Chart.js
  const chartLabels = r.localIps;
  const chartP95Data = r.ipSummary.map(ip => ip.p95);
  const chartReqsData = r.ipSummary.map(ip => ip.requests);

  const ipsDataStr = JSON.stringify(r.ipSummary || []);
  const ipResDataStr = JSON.stringify((typeof r.ipResponseDistribution === 'function') ? r.ipResponseDistribution() : []);
  const errDataStr = JSON.stringify((typeof r.errorDiagnostics === 'function') ? r.errorDiagnostics() : []);

  const chartsScript = `
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
      document.addEventListener("DOMContentLoaded", function() {
        const ipsData = ${ipsDataStr};
        if (ipsData && ipsData.length > 0) {
          const sectionGraphics = document.getElementById('section-graphics');
          if(sectionGraphics) sectionGraphics.style.display = 'block';
          
          const latenciesCtx = document.getElementById('latenciesChart');
          if (latenciesCtx) {
            new Chart(latenciesCtx.getContext('2d'), {
              type: 'line',
              data: {
                labels: ipsData.map((_, i) => 'Nodo ' + (i + 1)),
                datasets: [
                  {
                    label: 'Percentil 95 (ms)',
                    data: ipsData.map(d => Math.round(d.p95 || 0)),
                    borderColor: '#3949ab',
                    backgroundColor: 'rgba(57, 73, 171, 0.1)',
                    borderWidth: 2,
                    tension: 0.2,
                    fill: true
                  },
                  {
                    label: 'Percentil 99 (ms) [Cola]',
                    data: ipsData.map(d => Math.round(d.p99 || 0)),
                    borderColor: '#b71c1c',
                    backgroundColor: 'rgba(183, 28, 28, 0.05)',
                    borderWidth: 2,
                    tension: 0.2,
                    fill: true
                  }
                ]
              },
              options: {
                responsive: true,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true, title: { display: true, text: 'Milisegundos' } } }
              }
            });
          }

          const balanceCtx = document.getElementById('balanceChart');
          if (balanceCtx) {
            const ipResData = ${ipResDataStr};
            new Chart(balanceCtx.getContext('2d'), {
              type: 'bar',
              data: {
                labels: ipResData.map((_, i) => 'Nodo ' + (i + 1)),
                datasets: [
                  { label: 'HTTP 200 - Éxito', data: ipResData.map(d => d.success), backgroundColor: '#43a047' },
                  { label: 'HTTP 200 - Límite Negocio', data: ipResData.map(d => d.business), backgroundColor: '#fb8c00' },
                  { label: 'HTTP 429 - Rate Limit', data: ipResData.map(d => d.gateway429), backgroundColor: '#1e88e5' },
                  { label: 'HTTP 4xx/5xx - Error', data: ipResData.map(d => d.unexpected), backgroundColor: '#e53935' }
                ]
              },
              options: {
                responsive: true,
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } },
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Cantidad de Requests' } } }
              }
            });
          }

          const canvasErrores = document.getElementById('errorDoughnutChart');
          if (canvasErrores) {
            const errData = ${errDataStr};
            if (errData && errData.length > 0) {
              const errorColors = { 400: '#ef5350', 401: '#ab47bc', 403: '#7e57c2', 404: '#26a69a', 429: '#ff7043', 500: '#d32f2f', 502: '#e91e63', 503: '#f57c00', 504: '#7b1fa2', NET: '#6a1b9a' };
              new Chart(canvasErrores.getContext('2d'), {
                type: 'doughnut',
                data: {
                  labels: errData.map(d => d.label || ('HTTP ' + d.code)),
                  datasets: [{ data: errData.map(d => d.count), backgroundColor: errData.map(d => errorColors[d.code] || '#78909c'), borderWidth: 2, borderColor: '#fff' }]
                },
                options: { responsive: true, plugins: { legend: { position: 'bottom' } }, cutout: '55%' }
              });
            }
          }
        }
      });
    </script>
  `;

  // HTML ensamblado
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${esc(r.testName)} – Dashboard SRE</title>
  <style>${STYLE}</style>
</head>
<body>
  <div class="k6-shell"><div class="k6-panel">
    <header class="k6-header">
      <div class="title">REGINSA - Registro de Infracciones y Sanciones</div>
    </header>
    <div class="k6-body">
      ${indexHtml}
      ${modoHtml}
      ${dashboardHtml}
      <div class="section-graphics">
         <div class="charts-grid">
           <div class="chart-card"><h3>Latencias por Nodo</h3><canvas id="latenciesChart"></canvas></div>
         </div>
      </div>
      ${multiIpHtml}
      ${sreHtml}
      ${qaHtml}
      ${httpHtml}
      ${diagnosticsHtml}
      ${granularHtml}
      ${latencyHtml}
      ${endpointHtml}
      ${networkHtml}
      ${legendHtml}
      ${recommendationHtml}
    </div>
  </div></div>
  ${k6PanelHtml}
  ${chartsScript}
</body>
</html>`;

  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`✅ [HTML] Reporte premium generado en: ${path.basename(outPath)}`);
}

if (require.main === module) {
  const jsonPath = process.argv[2] || resolveTargetJson(path.join(__dirname, '../reports'));
  generateHTML(jsonPath, path.dirname(jsonPath));
}

module.exports = { generateHTML };
