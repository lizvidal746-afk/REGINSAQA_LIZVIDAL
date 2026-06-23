const fs = require('fs');
const path = require('path');

const reportRoot = path.resolve(__dirname, '..', 'reportes');
const explicitRun = process.argv[2];

function findLatestRun() {
  if (explicitRun) return path.resolve(explicitRun);
  return fs
    .readdirSync(reportRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^CP-REG-01_PF_.*_RUN_/.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(reportRoot, entry.name);
      return { fullPath, mtime: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)[0]?.fullPath;
}

function walkSuite(suite, tests) {
  for (const spec of suite.specs || []) {
    const title = `${spec.title || ''} ${spec.tests?.[0]?.title || ''}`;
    if (!/RUC y Razon Social/i.test(title)) continue;
    for (const test of spec.tests || []) tests.push(test);
  }
  for (const child of suite.suites || []) walkSuite(child, tests);
}

function annotation(test, name) {
  return (test.annotations || []).find((item) => item.type === name)?.description || '';
}

function allErrorText(test) {
  return (test.results || [])
    .flatMap((result) => result.errors || [])
    .map((error) => error.message || error.stack || '')
    .join('\n');
}

function inc(target, key, field = 'total') {
  target[key] ||= { total: 0 };
  target[key][field] = (target[key][field] || 0) + 1;
}

const runDir = findLatestRun();
if (!runDir) {
  console.error('No se encontro corrida CP-REG-01 en reportes.');
  process.exit(1);
}

const resultsPath = path.join(runDir, '_technical', 'playwright-report', 'results.json');
if (!fs.existsSync(resultsPath)) {
  console.error(`No se encontro results.json: ${resultsPath}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const tests = [];
for (const suite of data.suites || []) walkSuite(suite, tests);

const rows = tests.map((test) => {
  const text = allErrorText(test);
  return {
    status: test.outcome || test.results?.at(-1)?.status || 'unknown',
    ip: annotation(test, 'ipAsignada') || 'SIN_IP',
    user: annotation(test, 'usuarioAsignado') || 'SIN_USUARIO',
    slot: annotation(test, 'slot') || 'SIN_SLOT',
    ruc: annotation(test, 'ruc') || '',
    submitSI: /SubmitRequest=SI/.test(text),
    submitNO: /SubmitRequest=NO/.test(text),
    createResponseSI: /CreateResponse=SI/.test(text),
    createResponseNO: /CreateResponse=NO/.test(text),
    requestFailed: !/RequestFailed=NO/.test(text) && /RequestFailed=/.test(text),
    timeout60: /Timeout 60000ms|60000ms exceeded|timeout 60000/i.test(text),
    filas0: /filas=0/.test(text),
    statusCode: (text.match(/CreateResponse=SI status=(\d+)/) || [])[1] || '',
    error: (text.match(/Error:.*|TimeoutError:.*/) || [''])[0].slice(0, 260),
  };
});

const byIp = {};
const byStatusCode = {};
for (const row of rows) {
  inc(byIp, row.ip);
  if (row.status === 'passed' || row.status === 'flaky') inc(byIp, row.ip, 'created');
  if (row.status === 'failed') inc(byIp, row.ip, 'failed');
  if (row.timeout60) inc(byIp, row.ip, 'timeout60');
  if (row.submitSI) inc(byIp, row.ip, 'submitSI');
  if (row.createResponseSI) inc(byIp, row.ip, 'createResponseSI');
  if (row.createResponseNO) inc(byIp, row.ip, 'createResponseNO');
  if (row.requestFailed) inc(byIp, row.ip, 'requestFailed');
  if (row.statusCode) inc(byStatusCode, row.statusCode);
}

const summary = {
  runDir,
  total: rows.length,
  created: rows.filter((row) => row.status === 'passed' || row.status === 'flaky').length,
  failed: rows.filter((row) => row.status === 'failed').length,
  submitSI: rows.filter((row) => row.submitSI).length,
  submitNO: rows.filter((row) => row.submitNO).length,
  createResponseSI: rows.filter((row) => row.createResponseSI).length,
  createResponseNO: rows.filter((row) => row.createResponseNO).length,
  requestFailed: rows.filter((row) => row.requestFailed).length,
  timeout60: rows.filter((row) => row.timeout60).length,
  filas0: rows.filter((row) => row.filas0).length,
  byStatusCode,
  byIp,
  failedSamples: rows.filter((row) => row.status === 'failed').slice(0, 12),
};

console.log(JSON.stringify(summary, null, 2));
