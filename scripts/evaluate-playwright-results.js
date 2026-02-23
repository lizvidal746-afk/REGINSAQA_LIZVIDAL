const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportPath = path.join(root, 'test-results', 'results.json');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró el reporte JSON de Playwright: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function collectTests(suites) {
  const tests = [];
  const stack = [...asArray(suites)];

  while (stack.length > 0) {
    const suite = stack.pop();
    if (!suite) continue;

    const nestedSuites = asArray(suite.suites);
    if (nestedSuites.length > 0) {
      stack.push(...nestedSuites);
    }

    for (const spec of asArray(suite.specs)) {
      const specTests = asArray(spec?.tests);
      if (specTests.length > 0) {
        tests.push(...specTests);
      }
    }
  }

  return tests;
}

function computeRetryMetrics(tests) {
  const metrics = {
    totalAttempts: 0,
    totalRetries: 0,
    flakyRetries: 0
  };

  for (const test of tests) {
    const outcome = String(test?.outcome || '').toLowerCase();
    const results = asArray(test?.results);
    const attempts = results.length;
    const retriesUsed = Math.max(0, attempts - 1);

    metrics.totalAttempts += attempts;
    metrics.totalRetries += retriesUsed;
    if (outcome === 'flaky') {
      metrics.flakyRetries += retriesUsed;
    }
  }

  return metrics;
}

function computeOutcomeCounts(tests) {
  const counts = {
    passed: 0,
    failed: 0,
    flaky: 0,
    skipped: 0
  };

  for (const test of tests) {
    const outcome = String(test?.outcome || '').toLowerCase();
    const results = asArray(test?.results);
    const lastStatus = results.length
      ? String(results[results.length - 1]?.status || '').toLowerCase()
      : '';

    if (outcome === 'flaky') {
      counts.flaky += 1;
      counts.passed += 1;
      continue;
    }

    if (outcome === 'expected' || lastStatus === 'passed') {
      counts.passed += 1;
      continue;
    }

    if (outcome === 'skipped' || lastStatus === 'skipped') {
      counts.skipped += 1;
      continue;
    }

    if (outcome === 'unexpected' || outcome === 'failed' || lastStatus === 'failed' || lastStatus === 'timedout' || lastStatus === 'interrupted') {
      counts.failed += 1;
      continue;
    }

    const hasPassedAttempt = results.some((result) => String(result?.status || '').toLowerCase() === 'passed');
    if (hasPassedAttempt) {
      counts.flaky += 1;
      counts.passed += 1;
    } else {
      counts.failed += 1;
    }
  }

  return counts;
}

function summarize(report) {
  const stats = report?.stats || {};
  const hasStats = typeof stats.expected === 'number' || typeof stats.unexpected === 'number' || typeof stats.flaky === 'number';
  const tests = collectTests(report?.suites || []);
  const retryMetrics = computeRetryMetrics(tests);

  if (hasStats) {
    return {
      passed: Number(stats.expected || 0),
      failed: Number(stats.unexpected || 0),
      flaky: Number(stats.flaky || 0),
      skipped: Number(stats.skipped || 0),
      flakyRetries: retryMetrics.flakyRetries,
      totalRetries: retryMetrics.totalRetries,
      totalAttempts: retryMetrics.totalAttempts
    };
  }

  const outcomeCounts = computeOutcomeCounts(tests);
  return {
    passed: outcomeCounts.passed,
    failed: outcomeCounts.failed,
    flaky: outcomeCounts.flaky,
    skipped: outcomeCounts.skipped,
    flakyRetries: retryMetrics.flakyRetries,
    totalRetries: retryMetrics.totalRetries,
    totalAttempts: retryMetrics.totalAttempts
  };
}

function logWarning(message) {
  console.warn(message);
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::warning::${message}`);
  }
  if (process.env.TF_BUILD === 'True') {
    console.log(`##vso[task.logissue type=warning]${message}`);
  }
}

function logError(message) {
  console.error(message);
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::error::${message}`);
  }
  if (process.env.TF_BUILD === 'True') {
    console.log(`##vso[task.logissue type=error]${message}`);
  }
}

function run() {
  const report = readJson(reportPath);
  const summary = summarize(report);
  const gateMode = String(process.env.REGINSA_GATE_MODE || 'strict').toLowerCase();
  const maxFailedAllowedRaw = Number(process.env.REGINSA_MAX_FAILED_ALLOWED || 0);
  const maxFailedAllowed = Number.isFinite(maxFailedAllowedRaw) && maxFailedAllowedRaw >= 0 ? Math.floor(maxFailedAllowedRaw) : 0;

  // passed = casos que terminaron exitosos (incluye flaky recuperados)
  // flaky = cantidad de casos que necesitaron reintento y luego pasaron
  // flakyRetries = cantidad de reintentos realmente ejecutados en esos flaky
  // failed = casos que terminaron sin pasar
  console.log(
    `[pw-summary] passed=${summary.passed} flaky=${summary.flaky} flakyRetries=${summary.flakyRetries} totalRetries=${summary.totalRetries} failed=${summary.failed} skipped=${summary.skipped}`
  );

  if (summary.flaky > 0) {
    logWarning(`Se detectaron ${summary.flaky} tests flaky (reintentados).`);
  }

  if (summary.failed > maxFailedAllowed) {
    logError(`Se detectaron ${summary.failed} tests fallidos.`);
    process.exit(1);
  }

  if (summary.failed > 0 && gateMode === 'tolerant') {
    logWarning(`Modo tolerante activo: ${summary.failed} fallos dentro del umbral permitido (${maxFailedAllowed}).`);
  }
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logError(message);
  process.exit(1);
}
