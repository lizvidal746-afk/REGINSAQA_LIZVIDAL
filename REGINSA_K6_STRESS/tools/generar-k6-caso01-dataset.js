const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportsDir = path.join(root, 'reports');
const envPath = path.join(root, '.env');

function loadDotEnv() {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const text = line.trim();
    if (!text || text.startsWith('#') || !text.includes('=')) return;
    const idx = text.indexOf('=');
    const key = text.slice(0, idx).trim();
    let value = text.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
}

loadDotEnv();

const poolFile = String(process.env.K6_CASO01_POOL_FILE || 'reginsa-caso01-administrados-pool.json').trim();
const poolPath = path.join(reportsDir, poolFile);
const datasetPath = path.join(reportsDir, 'k6-caso01-dataset.json');
const usedPath = path.join(reportsDir, 'k6-caso01-usados.json');

const args = process.argv.slice(2);
const sizeArg = args.find((arg) => /^--size=\d+$/i.test(arg));
const strategyArg = args.find((arg) => /^--strategy=(mixed|fresh|pool)$/i.test(arg));
const reserveArg = args.find((arg) => /^--reserve=(0|1|true|false)$/i.test(arg));

const scenario = String(process.env.SCENARIO || 'smoke').toLowerCase();
const strategy = String(strategyArg?.split('=')[1] || process.env.K6_DATASET_STRATEGY || 'mixed').toLowerCase();
const reserveRaw = String(reserveArg?.split('=')[1] || process.env.K6_DATASET_RESERVE || '1').toLowerCase();
const reserveDataset = !['0', 'false', 'no'].includes(reserveRaw);
const failFast = !['0', 'false', 'no'].includes(String(process.env.K6_DATASET_FAIL_FAST || '1').toLowerCase());
const runLabel = String(process.env.K6_RUN_LABEL || 'K6 00').trim();
const runSlug = String(process.env.K6_RUN_SLUG || runLabel.replace(/\s+/g, '-')).trim();
const runSeed = String(process.env.K6_RUN_SEED || Date.now()).replace(/\D/g, '') || String(Date.now());
const rucPrefix = String(process.env.K6_RUC_PREFIX || '20').replace(/\D/g, '').slice(0, 2) || '20';
const estadoTexto = String(process.env.K6_CASO01_ESTADO || 'Licenciada').trim() || 'Licenciada';
const estadoIdRaw = Number.parseInt(String(process.env.K6_CASO01_ESTADO_ID || '1'), 10);
const estadoId = Number.isFinite(estadoIdRaw) && estadoIdRaw > 0 ? estadoIdRaw : 1;

function intEnv(name, fallback) {
  const n = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function defaultSize() {
  if (scenario === 'multi_ip_audit') return 9 * intEnv('K6_ITER_PER_VU', 4);
  if (scenario === 'smoke') return 4;
  if (scenario === 'one_shot') return intEnv('K6_ONESHOT_VUS', 50);
  return intEnv('K6_TOTAL_REGISTROS', 200);
}

const sizeFromArg = sizeArg ? Number.parseInt(sizeArg.split('=')[1], 10) : 0;
const size = Number.isFinite(sizeFromArg) && sizeFromArg > 0 ? sizeFromArg : defaultSize();

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeRuc(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 11 ? digits : '';
}

function normalizeText(value) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function cleanNombreComercial(razonSocial) {
  return String(razonSocial || '')
    .replace(/\bS\.?\s*A\.?\s*C\.?\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildValidRuc(firstTenDigits) {
  const cleaned = String(firstTenDigits || '').replace(/\D/g, '').slice(0, 10).padEnd(10, '0');
  const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cleaned[i]) * factors[i];
  const diff = 11 - (sum % 11);
  const checkDigit = diff === 10 ? 0 : (diff === 11 ? 1 : diff);
  return `${cleaned}${checkDigit}`;
}

function prefixed(text) {
  const value = String(text || '').trim();
  if (!value) return `${runLabel} SIN-NOMBRE`;
  return normalizeText(value).startsWith(normalizeText(runLabel)) ? value : `${runLabel} ${value}`;
}

function usedSets() {
  const state = readJson(usedPath, { rucs: [], razones: [], registros: [] });
  const rucs = new Set((state.rucs || []).map(normalizeRuc).filter(Boolean));
  const razones = new Set((state.razones || []).map(normalizeText).filter(Boolean));
  return { state, rucs, razones };
}

function buildSynthetic(index, seenRucs, seenRazones) {
  const base = Number.parseInt(runSeed.slice(-8), 10) || 1;
  for (let offset = 0; offset < 100000; offset += 1) {
    const seed = String((base + index + offset) % 100000000).padStart(8, '0');
    const ruc = buildValidRuc(`${rucPrefix}${seed}`);
    const razonSocial = prefixed(`EMPRESA QA REGINSA ${ruc} S.A.C.`);
    const razonNorm = normalizeText(razonSocial);
    if (seenRucs.has(ruc) || seenRazones.has(razonNorm)) continue;
    return {
      ruc,
      razonSocial,
      nombreComercial: cleanNombreComercial(razonSocial),
      estado: estadoTexto,
      estadoId,
      source: 'synthetic',
      runLabel,
      runSlug,
    };
  }
  return null;
}

function reserve(rows, used) {
  const registros = Array.isArray(used.state.registros) ? used.state.registros : [];
  rows.forEach((row) => {
    const ruc = normalizeRuc(row.ruc);
    const razon = normalizeText(row.razonSocial);
    if (ruc) used.rucs.add(ruc);
    if (razon) used.razones.add(razon);
    registros.push({
      ruc,
      razonSocial: row.razonSocial,
      nombreComercial: row.nombreComercial,
      estado: row.estado,
      estadoId: row.estadoId,
      runLabel,
      runSlug,
      source: row.source,
      reservedAt: new Date().toISOString(),
    });
  });
  fs.writeFileSync(
    usedPath,
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      rucs: Array.from(used.rucs).sort(),
      razones: Array.from(used.razones).sort(),
      registros,
    }, null, 2),
  );
}

function main() {
  ensureDir(reportsDir);

  if (!fs.existsSync(poolPath) && strategy !== 'fresh') {
    console.warn(`[dataset-caso01] Pool propio no encontrado: ${poolPath}. Se completara con datos sinteticos.`);
  }

  const used = usedSets();
  const seenRucs = new Set(used.rucs);
  const seenRazones = new Set(used.razones);
  const rows = [];
  const pool = readJson(poolPath, []);

  if (strategy === 'mixed' || strategy === 'pool') {
    for (const item of Array.isArray(pool) ? pool : []) {
      if (rows.length >= size) break;
      const ruc = normalizeRuc(item?.ruc);
      const razonBase = String(item?.razonSocial || '').trim();
      if (!ruc || !razonBase || seenRucs.has(ruc)) continue;
      const razonSocial = prefixed(razonBase);
      const razonNorm = normalizeText(razonSocial);
      if (!razonNorm || seenRazones.has(razonNorm)) continue;
      const row = {
        ruc,
        razonSocial,
        nombreComercial: cleanNombreComercial(razonSocial),
        estado: estadoTexto,
        estadoId,
        source: 'pool',
        runLabel,
        runSlug,
      };
      rows.push(row);
      seenRucs.add(ruc);
      seenRazones.add(razonNorm);
    }
  }

  if (strategy !== 'pool') {
    let index = 0;
    while (rows.length < size && index < size * 200) {
      const row = buildSynthetic(index, seenRucs, seenRazones);
      index += 1;
      if (!row) continue;
      rows.push(row);
      seenRucs.add(row.ruc);
      seenRazones.add(normalizeText(row.razonSocial));
    }
  }

  fs.writeFileSync(datasetPath, JSON.stringify(rows, null, 2));
  if (reserveDataset) reserve(rows, used);

  const uniqueRucs = new Set(rows.map((row) => normalizeRuc(row.ruc)).filter(Boolean));
  const uniqueRazones = new Set(rows.map((row) => normalizeText(row.razonSocial)).filter(Boolean));
  const errors = [];
  if (rows.length !== size) errors.push(`dataset ${rows.length}/${size}`);
  if (uniqueRucs.size !== rows.length) errors.push(`RUC duplicado ${uniqueRucs.size}/${rows.length}`);
  if (uniqueRazones.size !== rows.length) errors.push(`razon social duplicada ${uniqueRazones.size}/${rows.length}`);

  console.log(`[dataset-caso01] Dataset generado: ${rows.length}/${size}`);
  console.log(`[dataset-caso01] Corrida: ${runSlug} | estrategia=${strategy} | reserva=${reserveDataset ? 'ON' : 'OFF'}`);
  console.log(`[dataset-caso01] Pool propio: ${poolPath}`);
  console.log(`[dataset-caso01] Pool: ${rows.filter((row) => row.source === 'pool').length} | Sinteticos: ${rows.filter((row) => row.source === 'synthetic').length}`);
  console.log(`[dataset-caso01] Archivo: ${datasetPath}`);

  if (errors.length) {
    const message = `[dataset-caso01] Validacion fallo: ${errors.join(' | ')}`;
    if (failFast) throw new Error(message);
    console.warn(message);
  }
}

main();
