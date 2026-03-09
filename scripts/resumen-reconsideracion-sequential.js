const fs = require('node:fs');
const path = require('node:path');

const reportesDir = path.resolve(process.cwd(), 'reportes');
const logPath = path.resolve(reportesDir, 'reconsideracion-sequential-log.json');

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function pad(value, width) {
  const text = String(value ?? '');
  if (text.length >= width) return text;
  return text + ' '.repeat(width - text.length);
}

function truncate(text, max = 28) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function pickRunId(entries) {
  const fromArg = process.argv.find((arg) => arg.startsWith('--runId='));
  if (fromArg) return fromArg.split('=')[1] || '';
  if (process.env.TEST_RUN_ID) return process.env.TEST_RUN_ID;
  const sorted = [...entries].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  return sorted.length ? sorted[sorted.length - 1].runId : '';
}

function main() {
  const allEntries = readJsonArray(logPath);
  if (!allEntries.length) {
    console.log('No hay datos en reportes/reconsideracion-sequential-log.json');
    process.exit(0);
  }

  const runId = pickRunId(allEntries);
  if (!runId) {
    console.log('No se pudo determinar runId. Usa --runId=<id>.');
    process.exit(0);
  }

  const entries = allEntries
    .filter((item) => item && item.runId === runId)
    .sort((a, b) => Number(a.ordinal ?? 0) - Number(b.ordinal ?? 0) || String(a.timestamp).localeCompare(String(b.timestamp)));

  if (!entries.length) {
    console.log(`No hay registros para runId=${runId}`);
    process.exit(0);
  }

  const latestByCaseOrdinal = new Map();
  for (const item of entries) {
    const key = `${item.caseId}|${item.ordinal}`;
    latestByCaseOrdinal.set(key, item);
  }

  const rows = [...latestByCaseOrdinal.values()].sort((a, b) => {
    const caseCompare = String(a.caseId).localeCompare(String(b.caseId));
    if (caseCompare !== 0) return caseCompare;
    return Number(a.ordinal ?? 0) - Number(b.ordinal ?? 0);
  });

  const summary = rows.reduce((acc, item) => {
    const key = `${item.caseId}:${item.status}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log(`runId: ${runId}`);
  console.log(`total slots: ${rows.length}`);
  console.log('resumen:');
  for (const [key, value] of Object.entries(summary).sort()) {
    console.log(`  - ${key} = ${value}`);
  }

  console.log('');
  console.log(
    [
      pad('case', 8),
      pad('ordinal', 8),
      pad('status', 10),
      pad('page', 5),
      pad('row', 5),
      pad('worker', 7),
      pad('repeat', 7),
      pad('processed', 9),
      pad('expediente', 30),
      pad('resolucion', 24),
    ].join(' | ')
  );
  console.log('-'.repeat(150));

  for (const item of rows) {
    console.log(
      [
        pad(item.caseId || '', 8),
        pad(item.ordinal ?? '', 8),
        pad(item.status || '', 10),
        pad(item.page ?? '-', 5),
        pad(item.row ?? '-', 5),
        pad(item.workerIndex ?? '-', 7),
        pad(item.repeatIndex ?? '-', 7),
        pad(item.processed ?? '-', 9),
        pad(truncate(item.expediente ?? '-'), 30),
        pad(truncate(item.resolucion ?? '-'), 24),
      ].join(' | ')
    );
  }
}

main();
