const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportesDir = path.join(root, 'reportes');
const statusPath = path.join(reportesDir, 'k6-presentacion-status.json');
const outJson = path.join(reportesDir, 'k6-presentacion-00-04-resumen.json');
const outMd = path.join(reportesDir, 'k6-presentacion-00-04-resumen.md');

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function pickSummary(candidates) {
  const files = candidates
    .map((p) => path.join(reportesDir, p))
    .filter((p) => fs.existsSync(p))
    .map((p) => ({ p, mtime: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? files[0].p : '';
}

function metric(metrics, key, valueKey) {
  const m = metrics && metrics[key] && metrics[key].values;
  if (!m) return null;
  const value = m[valueKey];
  return Number.isFinite(value) ? Number(value) : null;
}

function pct(rate) {
  if (!Number.isFinite(rate)) return '-';
  return `${(rate * 100).toFixed(2)}%`;
}

function ms(n) {
  if (!Number.isFinite(n)) return '-';
  return `${n.toFixed(2)} ms`;
}

const status = readJson(statusPath, {});

const caseMap = {
  '00': ['k6-caso00-login-summary.json'],
  '01': ['k6-caso01-summary-local.json', 'k6-caso01-summary.json'],
  '02': ['k6-caso02-summary-local.json', 'k6-caso02-summary.json'],
  '03': ['k6-caso03-fast-summary.json', 'k6-caso03-smoke-summary.json', 'k6-caso03-summary.json'],
  '04': ['k6-caso04-fast-summary.json', 'k6-caso04-smoke-summary.json', 'k6-caso04-summary.json']
};

const rows = [];
for (const caseId of Object.keys(caseMap)) {
  const summaryPath = pickSummary(caseMap[caseId]);
  const summary = summaryPath ? readJson(summaryPath, {}) : {};
  const metrics = summary.metrics || {};

  const httpReqs = metric(metrics, 'http_reqs', 'count');
  const failRate = metric(metrics, 'http_req_failed', 'rate');
  const p95 = metric(metrics, 'http_req_duration', 'p(95)');
  const avg = metric(metrics, 'http_req_duration', 'avg');

  const customRateKey = Object.keys(metrics).find((k) => /_ok_rate$/.test(k)) || '';
  const customRate = customRateKey ? metric(metrics, customRateKey, 'rate') : null;

  const statusCase = status && status.casos && status.casos[caseId] ? status.casos[caseId] : null;

  rows.push({
    caseId,
    executed: Boolean(statusCase),
    ok: statusCase ? Boolean(statusCase.ok) : null,
    summaryFile: summaryPath ? path.relative(root, summaryPath).replace(/\\/g, '/') : '',
    httpReqs,
    failRate,
    p95,
    avg,
    customRateKey,
    customRate
  });
}

const totals = {
  totalCases: rows.length,
  executed: rows.filter((r) => r.executed).length,
  passed: rows.filter((r) => r.ok === true).length,
  failed: rows.filter((r) => r.ok === false).length,
  withSummary: rows.filter((r) => r.summaryFile).length,
  totalHttpReqs: rows.reduce((acc, r) => acc + (Number.isFinite(r.httpReqs) ? r.httpReqs : 0), 0)
};

const output = {
  generatedAt: new Date().toISOString(),
  run: {
    output: status.output || '',
    cantidad: status.cantidad || null,
    sleepSeconds: status.sleepSeconds,
    vus: status.vus || null
  },
  totals,
  cases: rows
};

if (!fs.existsSync(reportesDir)) fs.mkdirSync(reportesDir, { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(output, null, 2));

const md = [];
md.push('# Resumen K6 Presentacion Casos 00-04');
md.push('');
md.push(`Generado: ${output.generatedAt}`);
md.push(`Output: ${output.run.output || '-'} | Cantidad: ${output.run.cantidad ?? '-'} | Sleep: ${output.run.sleepSeconds ?? '-'} | VUs: ${output.run.vus ?? '-'}`);
md.push('');
md.push(`- Casos ejecutados: ${totals.executed}/${totals.totalCases}`);
md.push(`- Casos aprobados: ${totals.passed}`);
md.push(`- Casos fallidos: ${totals.failed}`);
md.push(`- Resumenes k6 encontrados: ${totals.withSummary}`);
md.push(`- Total http_reqs: ${totals.totalHttpReqs}`);
md.push('');
md.push('| Caso | Estado | http_reqs | http_req_failed | p95 | avg | KPI negocio | Resumen |');
md.push('|---|---|---:|---:|---:|---:|---:|---|');

for (const r of rows) {
  const estado = r.ok === true ? 'OK' : (r.ok === false ? 'FAIL' : 'N/A');
  const reqs = Number.isFinite(r.httpReqs) ? r.httpReqs : '-';
  const fail = Number.isFinite(r.failRate) ? pct(r.failRate) : '-';
  const p95Text = ms(r.p95);
  const avgText = ms(r.avg);
  const kpi = Number.isFinite(r.customRate) ? `${r.customRateKey}: ${pct(r.customRate)}` : '-';
  const resumen = r.summaryFile || '-';
  md.push(`| ${r.caseId} | ${estado} | ${reqs} | ${fail} | ${p95Text} | ${avgText} | ${kpi} | ${resumen} |`);
}

fs.writeFileSync(outMd, `${md.join('\n')}\n`);

console.log(`Resumen JSON: ${path.relative(root, outJson).replace(/\\/g, '/')}`);
console.log(`Resumen MD: ${path.relative(root, outMd).replace(/\\/g, '/')}`);
