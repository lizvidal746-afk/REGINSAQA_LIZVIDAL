const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportesDir = path.join(root, 'reportes');
const datasetPath = path.join(reportesDir, 'k6-caso01-dataset.json');
const outputPath = path.join(reportesDir, 'k6-caso01-persistencia.json');
const summaryCandidates = [
  path.join(reportesDir, 'k6-caso01-summary-local.json'),
  path.join(reportesDir, 'k6-caso01-summary.json')
];

function normalizeRuc(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length >= 11 ? digits : digits.padStart(11, '0');
}

function resolveApiBase() {
  const fromApiUrl = String(process.env.REGINSA_API_URL || '').trim();
  if (fromApiUrl) return fromApiUrl.replace(/\/$/, '');

  const fromBaseUrl = String(process.env.BASE_URL || process.env.REGINSA_URL || '').trim();
  if (!fromBaseUrl) return '';

  try {
    const url = new URL(fromBaseUrl);
    if (url.pathname.toLowerCase().startsWith('/api')) {
      return `${url.origin}${url.pathname}`.replace(/\/$/, '');
    }
    return `${url.origin}/api`;
  } catch {
    return fromBaseUrl.replace(/\/$/, '');
  }
}

function resolveAuthHeader() {
  const explicit = String(process.env.K6_AUTH_HEADER || '').trim();
  if (explicit) return explicit;

  let token = String(process.env.TOKEN || process.env.TOKEN1 || process.env.TOKEN2 || '').trim();
  if (token.startsWith('<') && token.endsWith('>')) token = token.slice(1, -1);
  if (!token) return '';
  if (!token.startsWith('Bearer ')) token = `Bearer ${token}`;
  return token;
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function findSummaryMetrics() {
  for (const candidate of summaryCandidates) {
    const data = readJson(candidate, null);
    if (data && typeof data === 'object') {
      return {
        file: candidate,
        metrics: data.metrics || {}
      };
    }
  }
  return { file: null, metrics: {} };
}

function metricCount(metrics, key) {
  const value = metrics?.[key]?.values?.count;
  return Number.isFinite(value) ? Number(value) : 0;
}

async function fetchListado(apiBase, authHeader) {
  const url = `${apiBase}/Entidad/Listar`;
  const headers = { accept: 'application/json' };
  if (authHeader) headers.authorization = authHeader;

  const response = await fetch(url, { method: 'GET', headers });
  const text = await response.text();

  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }

  return { response, body, raw: text };
}

async function run() {
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`No existe dataset de k6 caso01: ${datasetPath}`);
  }

  const dataset = readJson(datasetPath, []);
  if (!Array.isArray(dataset) || dataset.length === 0) {
    throw new Error('Dataset vacío. Ejecuta primero la generación/ejecución de caso01.');
  }

  const apiBase = resolveApiBase();
  if (!apiBase) {
    throw new Error('No se pudo resolver API base. Define BASE_URL o REGINSA_API_URL.');
  }

  const authHeader = resolveAuthHeader();
  const listado = await fetchListado(apiBase, authHeader);
  if (!listado.response.ok) {
    throw new Error(`Falló Entidad/Listar: HTTP ${listado.response.status}`);
  }

  const entidades = Array.isArray(listado.body?.oData) ? listado.body.oData : [];
  const presentes = new Set(
    entidades
      .map((row) => normalizeRuc(row?.Ruc ?? row?.ruc ?? ''))
      .filter((ruc) => ruc.length > 0)
  );

  const evaluacion = dataset.map((row) => {
    const ruc = normalizeRuc(row?.ruc || '');
    return {
      ruc,
      razonSocial: String(row?.razonSocial || '').trim(),
      persisted: ruc ? presentes.has(ruc) : false
    };
  });

  const found = evaluacion.filter((x) => x.persisted);
  const missing = evaluacion.filter((x) => !x.persisted);
  const persistRate = evaluacion.length > 0 ? found.length / evaluacion.length : 0;

  const summaryInfo = findSummaryMetrics();
  const metrics = summaryInfo.metrics;
  const k6Business = {
    createHttp200: metricCount(metrics, 'create_http_200_total'),
    createHttp201: metricCount(metrics, 'create_http_201_total'),
    createHttp409: metricCount(metrics, 'create_http_409_total'),
    createBusinessOk: metricCount(metrics, 'create_business_ok_total'),
    createBusinessFail: metricCount(metrics, 'create_business_fail_total'),
    createBsuccessFalse: metricCount(metrics, 'create_bsuccess_false_total'),
    createDuplicate409: metricCount(metrics, 'create_duplicate_409_total'),
    http429: metricCount(metrics, 'http_429_total')
  };

  const report = {
    generatedAt: new Date().toISOString(),
    apiBase,
    datasetPath,
    listCount: entidades.length,
    sampleSize: evaluacion.length,
    found: found.length,
    missing: missing.length,
    persistRate,
    k6SummaryFile: summaryInfo.file,
    k6Business,
    missingSample: missing.slice(0, 25)
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(`[persistencia] sample=${report.sampleSize} encontrados=${report.found} faltantes=${report.missing} rate=${(persistRate * 100).toFixed(1)}%`);
  if (summaryInfo.file) {
    console.log(`[persistencia] métricas k6 leídas de: ${summaryInfo.file}`);
    console.log(`[persistencia] k6 negocio: ok=${k6Business.createBusinessOk} fail=${k6Business.createBusinessFail} bSuccessFalse=${k6Business.createBsuccessFalse} dup409=${k6Business.createDuplicate409} 429=${k6Business.http429}`);
  }
  console.log(`[persistencia] reporte: ${outputPath}`);

  const failOnMissing = String(process.env.K6_FAIL_ON_MISSING || '0') === '1';
  const minRateRaw = Number(process.env.K6_PERSIST_MIN_RATE || '0');
  const minRate = Number.isFinite(minRateRaw) && minRateRaw > 0 ? minRateRaw : 0;

  if (minRate > 0 && persistRate < minRate) {
    console.error(`[persistencia] rate ${persistRate.toFixed(4)} < mínimo ${minRate.toFixed(4)}`);
    process.exit(1);
  }

  if (failOnMissing && missing.length > 0) {
    console.error('[persistencia] se encontraron registros faltantes y K6_FAIL_ON_MISSING=1');
    process.exit(1);
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[persistencia] error: ${message}`);
  process.exit(1);
});
