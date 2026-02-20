const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const reportPath = path.join(root, 'test-results', 'results.json');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró el reporte JSON de Playwright: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function walkSuites(suites, acc) {
  if (!Array.isArray(suites)) return;

  for (const suite of suites) {
    if (Array.isArray(suite.suites)) {
      walkSuites(suite.suites, acc);
    }

    if (!Array.isArray(suite.specs)) continue;

    for (const spec of suite.specs) {
      if (!Array.isArray(spec.tests)) continue;

      for (const test of spec.tests) {
        const outcome = String(test.outcome || '').toLowerCase();
        const results = Array.isArray(test.results) ? test.results : [];
        const lastStatus = results.length ? String(results[results.length - 1].status || '').toLowerCase() : '';

        if (outcome === 'flaky') {
          acc.flaky += 1;
          acc.passed += 1;
          continue;
        }

        if (outcome === 'expected' || lastStatus === 'passed') {
          acc.passed += 1;
          continue;
        }

        if (outcome === 'skipped' || lastStatus === 'skipped') {
          acc.skipped += 1;
          continue;
        }

        if (outcome === 'unexpected' || outcome === 'failed' || lastStatus === 'failed' || lastStatus === 'timedout' || lastStatus === 'interrupted') {
          acc.failed += 1;
          continue;
        }

        if (results.some((r) => String(r.status || '').toLowerCase() === 'passed')) {
          acc.flaky += 1;
          acc.passed += 1;
        } else {
          acc.failed += 1;
        }
      }
    }
  }
}

function summarize(report) {
  const stats = report?.stats || {};
  const hasStats = typeof stats.expected === 'number' || typeof stats.unexpected === 'number' || typeof stats.flaky === 'number';

  if (hasStats) {
    return {
      passed: Number(stats.expected || 0),
      failed: Number(stats.unexpected || 0),
      flaky: Number(stats.flaky || 0),
      skipped: Number(stats.skipped || 0)
    };
  }

  const acc = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
  walkSuites(report?.suites || [], acc);
  return acc;
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

  console.log(`[pw-summary] passed=${summary.passed} flaky=${summary.flaky} failed=${summary.failed} skipped=${summary.skipped}`);

  if (summary.flaky > 0) {
    logWarning(`Se detectaron ${summary.flaky} tests flaky (reintentados).`);
  }

  if (summary.failed > 0) {
    logError(`Se detectaron ${summary.failed} tests fallidos.`);
    process.exit(1);
  }
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logError(message);
  process.exit(1);
}
