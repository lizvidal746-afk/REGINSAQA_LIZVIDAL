const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const reportesDir = path.join(root, 'reportes');
const poolPath = path.join(reportesDir, 'administrados-pool.json');
const outputPath = path.join(reportesDir, 'k6-caso01-dataset.json');

const args = process.argv.slice(2);
const sizeArg = args.find((arg) => /^--size=\d+$/i.test(arg));
const sizeFromArg = sizeArg ? Number(sizeArg.split('=')[1]) : 0;
const strategyArg = args.find((arg) => /^--strategy=(mixed|fresh)$/i.test(arg));
const strategyFromArg = strategyArg ? String(strategyArg.split('=')[1]).toLowerCase() : '';
const strategyFromEnv = String(process.env.K6_DATASET_STRATEGY || '').toLowerCase();
const strategy = (strategyFromArg || strategyFromEnv || 'mixed') === 'fresh' ? 'fresh' : 'mixed';
const failFastArg = args.find((arg) => /^--fail-fast=(0|1|true|false)$/i.test(arg));
const failFastRaw = failFastArg ? String(failFastArg.split('=')[1]).toLowerCase() : String(process.env.K6_DATASET_FAIL_FAST || '1').toLowerCase();
const failFast = !['0', 'false', 'no'].includes(failFastRaw);
const runTag = String(process.env.K6_RUN_TAG || Date.now());
const rucPrefixInput = String(process.env.K6_RUC_PREFIX || '20').replace(/\D/g, '').slice(0, 2);
const rucPrefix = rucPrefixInput.length === 2 ? rucPrefixInput : '20';
const sizeFromEnv = Number(process.env.K6_TOTAL_REGISTROS || 0);
const size = Number.isFinite(sizeFromArg) && sizeFromArg > 0
  ? sizeFromArg
  : (Number.isFinite(sizeFromEnv) && sizeFromEnv > 0 ? sizeFromEnv : 200);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function normalizeRuc(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 11 ? digits : '';
}

function normalizeText(value) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
}

function readPool() {
  if (!fs.existsSync(poolPath)) return [];
  try {
    const raw = fs.readFileSync(poolPath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function buildSynthetic(index) {
  const runNumber = Number.parseInt(String(runTag).replace(/\D/g, '').slice(-8) || '1', 10);
  const seed = (runNumber + index).toString().replace(/\D/g, '').slice(-8).padStart(8, '0');
  const rucBase10 = `${rucPrefix}${seed}`;
  const ruc = buildValidRuc(rucBase10);
  const suf = ruc.slice(-6);
  const runSuffix = String(runTag).slice(-6);
  return {
    ruc,
    razonSocial: `K6 R${runSuffix} EMPRESA ${suf} S.A.C.`,
    nombreComercial: `K6 R${runSuffix} ${suf}`,
    estado: 1,
    source: 'synthetic'
  };
}

function buildValidRuc(firstTenDigits) {
  const cleaned = String(firstTenDigits || '').replace(/\D/g, '').slice(0, 10).padEnd(10, '0');
  const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(cleaned[i]) * factors[i];
  }

  const diff = 11 - (sum % 11);
  const checkDigit = diff === 10 ? 0 : (diff === 11 ? 1 : diff);
  return `${cleaned}${checkDigit}`;
}

function main() {
  ensureDir(reportesDir);

  const usedRuc = new Set();
  const usedRazon = new Set();
  const dataset = [];
  const pool = readPool();

  if (strategy === 'mixed') {
    for (const item of pool) {
      if (dataset.length >= size) break;
      const ruc = normalizeRuc(item?.ruc);
      if (!ruc || usedRuc.has(ruc)) continue;

      const razonSocial = String(item?.razonSocial || '').trim();
      const razonSocialNorm = normalizeText(razonSocial);
      const nombreComercial = String(item?.nombreComercial || '').trim() || razonSocial;

      if (!razonSocial || !razonSocialNorm || usedRazon.has(razonSocialNorm)) continue;

      dataset.push({
        ruc,
        razonSocial,
        nombreComercial,
        estado: 1,
        source: 'pool'
      });
      usedRuc.add(ruc);
      usedRazon.add(razonSocialNorm);
    }
  }

  let syntheticCount = 0;
  let idx = 0;
  while (dataset.length < size && idx < size * 20) {
    const candidate = buildSynthetic(idx);
    idx += 1;
    if (usedRuc.has(candidate.ruc)) continue;
    const razonNorm = normalizeText(candidate.razonSocial);
    if (!razonNorm || usedRazon.has(razonNorm)) continue;
    dataset.push(candidate);
    usedRuc.add(candidate.ruc);
    usedRazon.add(razonNorm);
    syntheticCount += 1;
  }

  fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2));

  const uniqueRucCount = new Set(dataset.map((item) => normalizeRuc(item?.ruc || '')).filter(Boolean)).size;
  const uniqueRazonCount = new Set(dataset.map((item) => normalizeText(item?.razonSocial || '')).filter(Boolean)).size;
  const invalidRucCount = dataset.filter((item) => !/^\d{11}$/.test(String(item?.ruc || ''))).length;

  const validations = [];
  if (dataset.length !== size) validations.push(`dataset.length (${dataset.length}) != size (${size})`);
  if (uniqueRucCount !== dataset.length) validations.push(`RUC no único (${uniqueRucCount}/${dataset.length})`);
  if (uniqueRazonCount !== dataset.length) validations.push(`razón social no única (${uniqueRazonCount}/${dataset.length})`);
  if (invalidRucCount > 0) validations.push(`RUC inválido de longitud en ${invalidRucCount} registros`);

  console.log(`📦 Dataset k6 caso 01 generado: ${dataset.length}`);
  console.log(`   - strategy: ${strategy}`);
  console.log(`   - rucPrefix: ${rucPrefix}`);
  console.log(`   - runTag: ${runTag}`);
  console.log(`   - únicos RUC: ${uniqueRucCount} | razón social: ${uniqueRazonCount}`);
  console.log(`   - failFast: ${failFast ? 'ON' : 'OFF'}`);
  console.log(`   - desde pool: ${strategy === 'mixed' ? dataset.length - syntheticCount : 0}`);
  console.log(`   - sintéticos: ${syntheticCount}`);
  console.log(`   - archivo: ${outputPath}`);

  if (dataset.length < size) {
    console.warn(`⚠️ Dataset menor al objetivo solicitado (${dataset.length}/${size}).`);
  }

  if (validations.length > 0) {
    const message = `❌ Validación dataset falló: ${validations.join(' | ')}`;
    if (failFast) {
      throw new Error(message);
    }
    console.warn(message);
  }
}

main();
