const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportesDir = path.join(root, 'reportes');

const funcionalPath = path.join(reportesDir, 'registros-administrados.json');
const funcionalSeqPath = path.join(reportesDir, 'funcional-caso01-secuencia.json');
const funcionalStatePath = path.join(reportesDir, 'funcional-caso01-secuencia-state.json');
const k6DatasetPath = path.join(reportesDir, 'k6-caso01-dataset.json');
const k6SeqPath = path.join(reportesDir, 'k6-caso01-secuencia.json');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function extractPrefix(value, type) {
  const text = String(value || '').trim();
  if (!text) return '';
  const rx = type === 'F' ? /^(F\s\d{2})\b/i : /^(K6\s\d{2})\b/i;
  const m = text.match(rx);
  return m ? m[1].toUpperCase() : '';
}

function summarizeFunctional() {
  const rows = readJson(funcionalPath, []);
  const list = Array.isArray(rows) ? rows : [];

  const withPrefix = list
    .map((r) => ({
      razonSocial: String(r?.razonSocial || ''),
      prefix: extractPrefix(r?.razonSocial, 'F'),
      timestamp: String(r?.timestamp || '')
    }))
    .filter((r) => r.razonSocial);

  const last10 = withPrefix.slice(-10);
  const missing = last10.filter((r) => !r.prefix).length;
  const prefixes = [...new Set(last10.map((r) => r.prefix).filter(Boolean))];

  const seq = readJson(funcionalSeqPath, {});
  const state = readJson(funcionalStatePath, {});

  return {
    total: list.length,
    considered: last10.length,
    missing,
    prefixes,
    seqLast: Number(seq?.last || 0),
    stateSeq: Number(state?.sequence || 0),
    stateRunId: String(state?.runId || '')
  };
}

function summarizeK6() {
  const rows = readJson(k6DatasetPath, []);
  const list = Array.isArray(rows) ? rows : [];

  const withPrefix = list
    .map((r) => ({
      razonSocial: String(r?.razonSocial || ''),
      prefix: extractPrefix(r?.razonSocial, 'K6')
    }))
    .filter((r) => r.razonSocial);

  const missing = withPrefix.filter((r) => !r.prefix).length;
  const prefixes = [...new Set(withPrefix.map((r) => r.prefix).filter(Boolean))];
  const seq = readJson(k6SeqPath, {});

  return {
    total: list.length,
    missing,
    prefixes,
    seqLast: Number(seq?.last || 0)
  };
}

function main() {
  const f = summarizeFunctional();
  const k6 = summarizeK6();

  console.log('=== VALIDACION PREFIJOS CASO 01 ===');
  console.log(`Funcional: total=${f.total} | revisados(ultimos 10)=${f.considered} | sin prefijo=${f.missing}`);
  console.log(`Funcional prefijos detectados: ${f.prefixes.length ? f.prefixes.join(', ') : '(ninguno)'}`);
  console.log(`Funcional secuencia archivo: last=${f.seqLast} | run.sequence=${f.stateSeq}`);
  if (f.stateRunId) {
    console.log(`Funcional runId actual: ${f.stateRunId}`);
  }

  console.log(`K6 dataset: total=${k6.total} | sin prefijo=${k6.missing}`);
  console.log(`K6 prefijos detectados: ${k6.prefixes.length ? k6.prefixes.join(', ') : '(ninguno)'}`);
  console.log(`K6 secuencia archivo: last=${k6.seqLast}`);

  if (f.considered > 0 && f.missing === 0) {
    console.log('OK: Funcional tiene prefijo F XX en los ultimos registros revisados.');
  } else {
    console.log('WARN: Funcional tiene registros sin prefijo F XX o no hay suficientes datos.');
  }

  if (k6.total > 0 && k6.missing === 0) {
    console.log('OK: Dataset k6 tiene prefijo K6 XX.');
  } else {
    console.log('WARN: Dataset k6 tiene registros sin prefijo K6 XX o no existe dataset reciente.');
  }
}

main();
