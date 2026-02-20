const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const reportesDir = path.join(root, 'reportes');
const poolPath = path.join(reportesDir, 'administrados-pool.json');
const lockPath = path.join(reportesDir, 'administrados-pool.lock');
const registrosPath = path.join(reportesDir, 'registros-administrados.json');
const administradosPath = path.join(reportesDir, 'administrados-registrados.json');
const reservadosPath = path.join(reportesDir, 'administrados-reservados.json');
const historicoPath = path.join(reportesDir, 'historico', 'administrados-historico.json');

const args = process.argv.slice(2);
const isStatus = args.includes('--status');
const targetArg = args.find((arg) => /^--target=\d+$/i.test(arg));

const targetFromArg = targetArg ? Number(targetArg.split('=')[1]) : 0;
const targetFromEnv = Number(process.env.REGINSA_POOL_TARGET || 0);
const target = Number.isFinite(targetFromArg) && targetFromArg > 0
  ? targetFromArg
  : (Number.isFinite(targetFromEnv) && targetFromEnv > 0 ? targetFromEnv : 600);

const prefijosRazon = [
  'EMPRESA', 'CONSORCIO', 'UNIVERSIDAD', 'INDUSTRIA', 'CORPORACION', 'COMERCIO',
  'ALMACENES', 'INVERSIONES', 'SERVICIOS INTEGRALES', 'SOLUCIONES EMPRESARIALES',
  'TECNOLOGIAS APLICADAS', 'LOGISTICA NACIONAL', 'CONSULTORIA ESTRATEGICA',
  'IMPORTACIONES DEL PACIFICO', 'EXPORTACIONES ANDINAS', 'DISTRIBUCIONES GENERALES',
  'MERCADOS MAYORISTAS', 'PROYECTOS Y OBRAS', 'GESTION ADMINISTRATIVA', 'OPERACIONES INDUSTRIALES'
];

const tiposEntidad = [
  'ESTATAL', 'NACIONAL', 'PRIVADA', 'PUBLICA', 'PARTICULAR',
  'NO GUBERNAMENTAL', 'MUNICIPAL', 'REGIONAL', 'INTERNACIONAL'
];

const sufijos = [
  'S.A.C.', 'S.A.', 'S.R.L.', 'E.I.R.L.', 'S.A.A.', 'S.C.R.L.',
  'COOP.', 'ASOC.', 'GROUP S.A.C.', 'INVERSIONES S.A.C.', 'SERVICIOS GENERALES S.A.C.'
];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRuc(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11);
}

function readJson(filePath, fallback = []) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function readPool() {
  const data = readJson(poolPath, []);
  return Array.isArray(data) ? data : [];
}

function writePool(data) {
  ensureDir(reportesDir);
  fs.writeFileSync(poolPath, JSON.stringify(data, null, 2));
}

function collectUsed() {
  const usedRuc = new Set();
  const usedReason = new Set();

  const pool = readPool();
  pool.forEach((item) => {
    usedRuc.add(normalizeText(normalizeRuc(item.ruc)));
    usedReason.add(normalizeText(item.razonSocial));
    usedReason.add(normalizeText(item.nombreComercial));
  });

  const registros = readJson(registrosPath, []);
  if (Array.isArray(registros)) {
    registros.forEach((item) => {
      usedRuc.add(normalizeText(normalizeRuc(item.ruc)));
      usedReason.add(normalizeText(item.razonSocial));
      usedReason.add(normalizeText(item.nombreComercial));
    });
  }

  const administrados = readJson(administradosPath, {});
  const administradosRows = Array.isArray(administrados?.registros) ? administrados.registros : [];
  administradosRows.forEach((item) => {
    usedRuc.add(normalizeText(normalizeRuc(item.ruc)));
    usedReason.add(normalizeText(item.razonSocial));
    usedReason.add(normalizeText(item.nombreComercial));
  });

  const reservados = readJson(reservadosPath, []);
  if (Array.isArray(reservados)) {
    reservados.forEach((item) => {
      usedRuc.add(normalizeText(normalizeRuc(item.ruc)));
      usedReason.add(normalizeText(item.razonSocial));
    });
  }

  const historico = readJson(historicoPath, []);
  if (Array.isArray(historico)) {
    historico.forEach((item) => {
      usedRuc.add(normalizeText(normalizeRuc(item.ruc)));
      usedReason.add(normalizeText(item.razonSocial));
      usedReason.add(normalizeText(item.nombreComercial));
    });
  }

  return { usedRuc, usedReason };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildCandidate(iteration) {
  const prefix = String(randomInt(10, 19));
  const body = String(Date.now() + iteration).replace(/\D/g, '').slice(-9).padStart(9, '0');
  const ruc = `${prefix}${body}`;

  const p = prefijosRazon[iteration % prefijosRazon.length];
  const t = tiposEntidad[iteration % tiposEntidad.length];
  const s = sufijos[iteration % sufijos.length];
  const last5 = ruc.slice(-5);
  const razonSocial = `${p} ${t} ${last5} ${s}`;
  const nombreComercial = `${p} ${last5}`;

  return {
    ruc,
    razonSocial,
    nombreComercial,
    creadoEn: new Date().toISOString()
  };
}

function withLock(fn, timeoutMs = 20000, retryMs = 120) {
  ensureDir(reportesDir);
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      try {
        return fn();
      } finally {
        fs.closeSync(fd);
        if (fs.existsSync(lockPath)) {
          fs.unlinkSync(lockPath);
        }
      }
    } catch {
      const shared = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(shared, 0, 0, retryMs);
    }
  }

  throw new Error('No se pudo adquirir lock de pool.');
}

function runStatus() {
  const pool = readPool();
  console.log(`Pool actual: ${pool.length} registros en ${poolPath}`);
}

function runPrewarm() {
  withLock(() => {
    const pool = readPool();
    if (pool.length >= target) {
      console.log(`Pool ya preparado: ${pool.length}/${target}`);
      return;
    }

    const { usedRuc, usedReason } = collectUsed();
    let iteration = 0;
    let added = 0;
    const maxTries = target * 50;

    while (pool.length < target && iteration < maxTries) {
      const candidate = buildCandidate(iteration);
      const rucKey = normalizeText(normalizeRuc(candidate.ruc));
      const reasonKey = normalizeText(candidate.razonSocial);
      const comercialKey = normalizeText(candidate.nombreComercial);

      if (!usedRuc.has(rucKey) && !usedReason.has(reasonKey) && !usedReason.has(comercialKey)) {
        pool.push(candidate);
        usedRuc.add(rucKey);
        usedReason.add(reasonKey);
        usedReason.add(comercialKey);
        added += 1;
      }
      iteration += 1;
    }

    writePool(pool);
    console.log(`Pool actualizado: ${pool.length}/${target} (agregados: ${added})`);
  });
}

if (isStatus) {
  runStatus();
  process.exit(0);
}

runPrewarm();
