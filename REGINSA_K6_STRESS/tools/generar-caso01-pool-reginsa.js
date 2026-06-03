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

const args = process.argv.slice(2);
const sizeArg = args.find((arg) => /^--size=\d+$/i.test(arg));
const appendArg = args.find((arg) => /^--append=(0|1|true|false)$/i.test(arg));

const sizeFromArg = sizeArg ? Number.parseInt(sizeArg.split('=')[1], 10) : 0;
const sizeFromEnv = Number.parseInt(String(process.env.K6_CASO01_POOL_SIZE || ''), 10);
const size = Number.isFinite(sizeFromArg) && sizeFromArg > 0
  ? sizeFromArg
  : (Number.isFinite(sizeFromEnv) && sizeFromEnv > 0 ? sizeFromEnv : 500);
const appendRaw = String(appendArg?.split('=')[1] || process.env.K6_CASO01_POOL_APPEND || '1').toLowerCase();
const append = !['0', 'false', 'no'].includes(appendRaw);
const rucPrefix = String(process.env.K6_RUC_PREFIX || '20').replace(/\D/g, '').slice(0, 2) || '20';
const poolStartRaw = Number.parseInt(String(process.env.K6_CASO01_POOL_START || '87000000'), 10);
const poolStart = Number.isFinite(poolStartRaw) && poolStartRaw > 0 ? poolStartRaw : 87000000;
const estadoTexto = String(process.env.K6_CASO01_ESTADO || 'Licenciada').trim() || 'Licenciada';
const estadoIdRaw = Number.parseInt(String(process.env.K6_CASO01_ESTADO_ID || '1'), 10);
const estadoId = Number.isFinite(estadoIdRaw) && estadoIdRaw > 0 ? estadoIdRaw : 1;

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

function buildCandidate(index) {
  const seed = String((poolStart + index) % 100000000).padStart(8, '0');
  const ruc = buildValidRuc(`${rucPrefix}${seed}`);
  const suffix = ruc.slice(-6);
  const razonSocial = `REGINSA POOL QA ${suffix} S.A.C.`;
  return {
    ruc,
    razonSocial,
    nombreComercial: cleanNombreComercial(razonSocial),
    estado: estadoTexto,
    estadoId,
    source: 'reginsa_pool',
  };
}

function main() {
  ensureDir(reportsDir);

  const existing = append ? readJson(poolPath, []) : [];
  const rows = Array.isArray(existing) ? [...existing] : [];
  const usedRuc = new Set(rows.map((row) => normalizeRuc(row.ruc)).filter(Boolean));
  const usedRazon = new Set(rows.map((row) => normalizeText(row.razonSocial)).filter(Boolean));

  let index = rows.length;
  while (rows.length < size && index < size * 20) {
    const row = buildCandidate(index);
    index += 1;
    const ruc = normalizeRuc(row.ruc);
    const razon = normalizeText(row.razonSocial);
    if (!ruc || !razon || usedRuc.has(ruc) || usedRazon.has(razon)) continue;
    rows.push(row);
    usedRuc.add(ruc);
    usedRazon.add(razon);
  }

  fs.writeFileSync(poolPath, JSON.stringify(rows, null, 2));
  console.log(`[pool-reginsa-caso01] Pool propio generado: ${rows.length}/${size}`);
  console.log(`[pool-reginsa-caso01] Archivo: ${poolPath}`);

  if (rows.length < size) {
    throw new Error(`[pool-reginsa-caso01] No se pudo completar el pool solicitado (${rows.length}/${size}).`);
  }
}

main();
