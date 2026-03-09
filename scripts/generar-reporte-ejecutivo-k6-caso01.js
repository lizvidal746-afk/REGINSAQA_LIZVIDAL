const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq === -1) {
      args[body] = 'true';
    } else {
      const key = body.slice(0, eq);
      const value = body.slice(eq + 1);
      args[key] = value;
    }
  }
  return args;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeSlug(value, fallback = 'na') {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return fallback;
  return text
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function pct(value) {
  return `${(asNumber(value, 0) * 100).toFixed(2)}%`;
}

function num(value, digits = 2) {
  return asNumber(value, 0).toFixed(digits);
}

function getMetric(metrics, name) {
  return metrics && metrics[name] ? metrics[name] : {};
}

function computeKpiStatus(metricName, value, testType) {
  const isSmoke = String(testType || '').toLowerCase().includes('smoke');
  if (metricName === 'create_business_ok_rate') {
    const v = asNumber(value, 0);
    if (isSmoke) return v >= 0.95 ? '🟢' : v >= 0.85 ? '🟡' : '🔴';
    return v >= 0.70 ? '🟢' : v >= 0.50 ? '🟡' : '🔴';
  }

  if (metricName === 'http_req_failed') {
    const v = asNumber(value, 0);
    if (isSmoke) return v < 0.05 ? '🟢' : v < 0.10 ? '🟡' : '🔴';
    return v < 0.20 ? '🟢' : v < 0.30 ? '🟡' : '🔴';
  }

  if (metricName === 'http_req_duration_p95') {
    const v = asNumber(value, 0);
    if (isSmoke) return v < 1000 ? '🟢' : v < 1500 ? '🟡' : '🔴';
    return v < 3000 ? '🟢' : v < 4500 ? '🟡' : '🔴';
  }

  if (metricName === 'rate_429') {
    const v = asNumber(value, 0);
    if (isSmoke) return v <= 0.05 ? '🟢' : v <= 0.15 ? '🟡' : '🔴';
    return v <= 0.30 ? '🟢' : v <= 0.45 ? '🟡' : '🔴';
  }

  if (metricName === 'rate_5xx') {
    const v = asNumber(value, 0);
    if (isSmoke) return v === 0 ? '🟢' : v <= 0.01 ? '🟡' : '🔴';
    return v <= 0.02 ? '🟢' : v <= 0.05 ? '🟡' : '🔴';
  }

  if (metricName === 'create_http_409_total') {
    const v = asNumber(value, 0);
    return v === 0 ? '🟢' : '🔴';
  }

  return '🟡';
}

function decisionFromStatuses(statuses) {
  if (statuses.some((item) => item === '🔴')) return 'NO-GO';
  if (statuses.some((item) => item === '🟡')) return 'GO con observaciones';
  return 'GO';
}

(function main() {
  const args = parseArgs(process.argv.slice(2));

  const summaryPath = path.resolve(process.cwd(), args.summary || 'reportes/k6-caso01-summary.json');
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`No se encontró summary k6: ${summaryPath}`);
  }

  const raw = fs.readFileSync(summaryPath, 'utf-8');
  const summary = JSON.parse(raw);
  const metrics = summary.metrics || {};

  const campaign = args.campaign || 'default';
  const testType = args['test-type'] || args.testType || 'performance';
  const profile = args.profile || 'pipeline';
  const mode = args.mode || 'no-burst';
  const size = args.size || 'na';
  const caseName = args.case || 'caso01';

  const fixedVus = args.vus || '';
  const fixedIterations = args.iterations || '';
  const burstIterPerVu = args['burst-iter-per-vu'] || args.burstIterPerVu || '';
  const sleepSeconds = args.sleep || '';
  const strictUnique = args['strict-unique'] || args.strictUnique || '';
  const runUrl = args['run-url'] || args.runUrl || '';

  const metricHttpReqs = getMetric(metrics, 'http_reqs');
  const metricHttpFailed = getMetric(metrics, 'http_req_failed');
  const metricHttpDuration = getMetric(metrics, 'http_req_duration');
  const metricBusinessRate = getMetric(metrics, 'create_business_ok_rate');
  const metric429 = getMetric(metrics, 'http_429_total');
  const metric5xx = getMetric(metrics, 'create_http_5xx_total');
  const metric4xx = getMetric(metrics, 'create_http_4xx_total');
  const metric401 = getMetric(metrics, 'create_http_401_total');
  const metric409 = getMetric(metrics, 'create_http_409_total');
  const metricBusinessOkTotal = getMetric(metrics, 'create_business_ok_total');
  const metricChecks = getMetric(metrics, 'checks');

  const httpReqs = asNumber(metricHttpReqs.count, 0);
  const httpFailedRate = asNumber(metricHttpFailed.value, 0);
  const businessRate = asNumber(metricBusinessRate.value, 0);
  const p95 = asNumber(metricHttpDuration['p(95)'], 0);
  const p95Ms = `${num(p95, 2)} ms`;

  const count429 = asNumber(metric429.count, 0);
  const count5xx = asNumber(metric5xx.count, 0);
  const count4xx = asNumber(metric4xx.count, 0);
  const count401 = asNumber(metric401.count, 0);
  const count409 = asNumber(metric409.count, 0);
  const countBusinessOk = asNumber(metricBusinessOkTotal.count, 0);

  const rate429 = httpReqs > 0 ? count429 / httpReqs : 0;
  const rate5xx = httpReqs > 0 ? count5xx / httpReqs : 0;

  const sBusiness = computeKpiStatus('create_business_ok_rate', businessRate, testType);
  const sFailed = computeKpiStatus('http_req_failed', httpFailedRate, testType);
  const sP95 = computeKpiStatus('http_req_duration_p95', p95, testType);
  const s429 = computeKpiStatus('rate_429', rate429, testType);
  const s5xx = computeKpiStatus('rate_5xx', rate5xx, testType);
  const s409 = computeKpiStatus('create_http_409_total', count409, testType);
  const decision = decisionFromStatuses([sBusiness, sFailed, sP95, s429, s5xx, s409]);

  const stat = fs.statSync(summaryPath);
  const runDate = new Date(stat.mtime);
  const yyyy = String(runDate.getFullYear());
  const mm = String(runDate.getMonth() + 1).padStart(2, '0');
  const dd = String(runDate.getDate()).padStart(2, '0');
  const hh = String(runDate.getHours()).padStart(2, '0');
  const mi = String(runDate.getMinutes()).padStart(2, '0');
  const ss = String(runDate.getSeconds()).padStart(2, '0');

  const stamp = `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;

  const baseOutDir = path.resolve(process.cwd(), 'reportes/ejecutivo/k6-caso01');
  const campaignSlug = safeSlug(campaign, 'default');
  const campaignDir = path.join(baseOutDir, campaignSlug);
  ensureDir(campaignDir);

  const reportFileName = `${stamp}_${safeSlug(testType)}_${safeSlug(profile)}_size-${safeSlug(size)}.md`;
  const reportPath = path.join(campaignDir, reportFileName);

  const content = [
    `# Reporte Ejecutivo K6 Caso 01`,
    '',
    `- Fecha/Hora: ${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`,
    `- Campaña: ${campaign}`,
    `- Caso: ${caseName}`,
    `- Tipo: ${testType}`,
    `- Perfil: ${profile}`,
    `- Modo: ${mode}`,
    `- Size: ${size}`,
    runUrl ? `- Run URL Grafana: ${runUrl}` : `- Run URL Grafana: (completar)`,
    '',
    `## Configuración`,
    '',
    `- VUs: ${fixedVus || '(no informado)'}`,
    `- Iteraciones: ${fixedIterations || '(no informado)'}`,
    `- Burst iter/VU: ${burstIterPerVu || '(no aplica/no informado)'}`,
    `- Sleep: ${sleepSeconds || '(no informado)'}`,
    `- Strict unique: ${strictUnique || '(no informado)'}`,
    '',
    `## KPIs semáforo`,
    '',
    `- create_business_ok_rate: ${pct(businessRate)} ${sBusiness}`,
    `- http_req_failed: ${pct(httpFailedRate)} ${sFailed}`,
    `- http_req_duration p95: ${p95Ms} ${sP95}`,
    `- %429: ${pct(rate429)} (${count429}/${httpReqs}) ${s429}`,
    `- %5xx: ${pct(rate5xx)} (${count5xx}/${httpReqs}) ${s5xx}`,
    `- create_http_409_total: ${count409} ${s409}`,
    '',
    `## Evidencia técnica`,
    '',
    `- http_reqs: ${httpReqs}`,
    `- create_http_4xx_total: ${count4xx}`,
    `- create_http_5xx_total: ${count5xx}`,
    `- create_http_401_total: ${count401}`,
    `- create_business_ok_total: ${countBusinessOk}`,
    `- checks: ${asNumber(metricChecks.passes, 0)} passed / ${asNumber(metricChecks.fails, 0)} failed`,
    '',
    `## Decisión`,
    '',
    `- Estado final: **${decision}**`,
    '',
    `## Fuente`,
    '',
    `- Summary: ${summaryPath}`
  ].join('\n');

  fs.writeFileSync(reportPath, content, 'utf-8');

  const indexPath = path.join(campaignDir, 'index.md');
  if (!fs.existsSync(indexPath)) {
    const header = [
      `# Índice de campaña k6 caso 01: ${campaign}`,
      '',
      `- Carpeta: ${campaignDir}`,
      '',
      `## Corridas`,
      ''
    ].join('\n');
    fs.writeFileSync(indexPath, header, 'utf-8');
  }

  const indexLine = `- ${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} | tipo=${testType} | perfil=${profile} | size=${size} | decisión=${decision} | [reporte](./${reportFileName})\n`;
  fs.appendFileSync(indexPath, indexLine, 'utf-8');

  console.log('✅ Reporte ejecutivo generado');
  console.log(`   - reporte: ${reportPath}`);
  console.log(`   - índice campaña: ${indexPath}`);
})();
