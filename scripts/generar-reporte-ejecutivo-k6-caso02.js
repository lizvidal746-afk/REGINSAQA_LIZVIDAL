const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const raw = token.slice(2);
    const idx = raw.indexOf('=');
    if (idx === -1) {
      args[raw] = 'true';
    } else {
      args[raw.slice(0, idx)] = raw.slice(idx + 1);
    }
  }
  return args;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pct(value) {
  return `${(num(value, 0) * 100).toFixed(2)}%`;
}

function slug(value, fallback = 'na') {
  const txt = String(value || '').trim().toLowerCase();
  if (!txt) return fallback;
  return txt
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

function metric(metrics, name) {
  return metrics[name] || {};
}

function statusByLimits(name, value, testType) {
  const smoke = String(testType || '').toLowerCase().includes('smoke');
  if (name === 'registro_ok_rate') {
    const v = num(value, 0);
    if (smoke) return v >= 0.90 ? '🟢' : v >= 0.75 ? '🟡' : '🔴';
    return v >= 0.60 ? '🟢' : v >= 0.45 ? '🟡' : '🔴';
  }
  if (name === 'http_req_failed') {
    const v = num(value, 0);
    if (smoke) return v < 0.10 ? '🟢' : v < 0.20 ? '🟡' : '🔴';
    return v < 0.35 ? '🟢' : v < 0.50 ? '🟡' : '🔴';
  }
  if (name === 'http_req_duration_p95') {
    const v = num(value, 0);
    if (smoke) return v < 1200 ? '🟢' : v < 2000 ? '🟡' : '🔴';
    return v < 4000 ? '🟢' : v < 5500 ? '🟡' : '🔴';
  }
  if (name === 'rate_limited_requests') {
    const v = num(value, 0);
    if (smoke) return v <= 0.10 ? '🟢' : v <= 0.25 ? '🟡' : '🔴';
    return v <= 0.60 ? '🟢' : v <= 0.75 ? '🟡' : '🔴';
  }
  if (name === 'http_5xx_rate') {
    const v = num(value, 0);
    if (smoke) return v === 0 ? '🟢' : v <= 0.01 ? '🟡' : '🔴';
    return v <= 0.03 ? '🟢' : v <= 0.06 ? '🟡' : '🔴';
  }
  return '🟡';
}

(function main() {
  const args = parseArgs(process.argv.slice(2));
  const summaryPath = path.resolve(process.cwd(), args.summary || 'reportes/k6-caso02-summary.json');
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`No se encontró summary k6 caso 02: ${summaryPath}`);
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  const metrics = summary.metrics || {};

  const campaign = args.campaign || 'default';
  const testType = args['test-type'] || 'performance';
  const profile = args.profile || 'pipeline';
  const mode = args.mode || 'no-burst';
  const size = args.size || 'na';

  const httpReqs = num(metric(metrics, 'http_reqs').count, 0);
  const httpFailed = num(metric(metrics, 'http_req_failed').value, 0);
  const p95 = num(metric(metrics, 'http_req_duration')['p(95)'], 0);
  const rateLimited = num(metric(metrics, 'rate_limited_requests').value, 0);
  const okRate = num(metric(metrics, 'registro_ok_rate').value, 0);

  const c4xx = num(metric(metrics, 'http_4xx_total').count, 0);
  const c5xx = num(metric(metrics, 'http_5xx_total').count, 0);
  const c401 = num(metric(metrics, 'http_401_total').count, 0);
  const c429 = num(metric(metrics, 'http_429_total').count, 0);
  const cRegOk = num(metric(metrics, 'registro_ok_total').count, 0);

  const rate5xx = httpReqs > 0 ? c5xx / httpReqs : 0;

  const sOk = statusByLimits('registro_ok_rate', okRate, testType);
  const sFailed = statusByLimits('http_req_failed', httpFailed, testType);
  const sP95 = statusByLimits('http_req_duration_p95', p95, testType);
  const sRl = statusByLimits('rate_limited_requests', rateLimited, testType);
  const s5xx = statusByLimits('http_5xx_rate', rate5xx, testType);

  const statuses = [sOk, sFailed, sP95, sRl, s5xx];
  const decision = statuses.includes('🔴') ? 'NO-GO' : statuses.includes('🟡') ? 'GO con observaciones' : 'GO';

  const mtime = fs.statSync(summaryPath).mtime;
  const dt = new Date(mtime);
  const yyyy = String(dt.getFullYear());
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');

  const stamp = `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
  const outDir = path.resolve(process.cwd(), `reportes/ejecutivo/k6-caso02/${slug(campaign, 'default')}`);
  ensureDir(outDir);

  const reportName = `${stamp}_${slug(testType)}_${slug(profile)}_size-${slug(size)}.md`;
  const reportPath = path.join(outDir, reportName);

  const content = [
    '# Reporte Ejecutivo K6 Caso 02',
    '',
    `- Fecha/Hora: ${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`,
    `- Campaña: ${campaign}`,
    `- Tipo: ${testType}`,
    `- Perfil: ${profile}`,
    `- Modo: ${mode}`,
    `- Size: ${size}`,
    '',
    '## KPIs',
    '',
    `- registro_ok_rate: ${pct(okRate)} ${sOk}`,
    `- http_req_failed: ${pct(httpFailed)} ${sFailed}`,
    `- http_req_duration p95: ${p95.toFixed(2)} ms ${sP95}`,
    `- rate_limited_requests: ${pct(rateLimited)} ${sRl}`,
    `- %5xx: ${pct(rate5xx)} (${c5xx}/${httpReqs}) ${s5xx}`,
    '',
    '## Evidencia técnica',
    '',
    `- http_reqs: ${httpReqs}`,
    `- http_4xx_total: ${c4xx}`,
    `- http_5xx_total: ${c5xx}`,
    `- http_401_total: ${c401}`,
    `- http_429_total: ${c429}`,
    `- registro_ok_total: ${cRegOk}`,
    '',
    '## Decisión',
    '',
    `- Estado final: **${decision}**`,
    '',
    `- Fuente: ${summaryPath}`
  ].join('\n');

  fs.writeFileSync(reportPath, content, 'utf-8');

  const indexPath = path.join(outDir, 'index.md');
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, `# Índice campaña k6 caso 02: ${campaign}\n\n## Corridas\n\n`, 'utf-8');
  }

  fs.appendFileSync(
    indexPath,
    `- ${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} | tipo=${testType} | perfil=${profile} | size=${size} | decisión=${decision} | [reporte](./${reportName})\n`,
    'utf-8'
  );

  console.log('✅ Reporte ejecutivo caso 02 generado');
  console.log(`   - reporte: ${reportPath}`);
  console.log(`   - índice: ${indexPath}`);
})();
