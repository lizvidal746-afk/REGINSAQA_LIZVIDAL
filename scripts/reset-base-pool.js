const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const root = path.resolve(__dirname, '..');
const reportesDir = path.join(root, 'reportes');
const poolPath = path.join(reportesDir, 'administrados-pool.json');
const reservadosPath = path.join(reportesDir, 'administrados-reservados.json');
const runPath = path.join(reportesDir, 'administrados-run.json');

const baseRucsTsvCandidates = [
  path.join(root, 'files', 'rucs_caso_01_base.tsv'),
  path.join(root, 'playwrigth', 'files', 'rucs_caso_01_base.tsv')
];

const baseRucsExcelCandidates = [
  path.join(root, 'Lista de administrados_real.xlsx'),
  path.join(root, 'test-files', 'Administrados_BD.xlsx'),
  path.join(root, 'playwrigth', 'test-files', 'Administrados_BD.xlsx')
];

const createdSources = [
  path.join(reportesDir, 'registros-administrados.json'),
  path.join(reportesDir, 'administrados-registrados.json'),
  path.join(reportesDir, 'historico', 'administrados-historico.json')
];

const targetArg = process.argv.find((arg) => /^--target=\d+$/i.test(arg));
const targetFromArg = targetArg ? Number(targetArg.split('=')[1]) : 0;
const targetFromEnv = Number(process.env.REGINSA_POOL_TARGET || 0);
const target = Number.isFinite(targetFromArg) && targetFromArg > 0
  ? targetFromArg
  : (Number.isFinite(targetFromEnv) && targetFromEnv > 0 ? targetFromEnv : 0);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
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

function cleanNombreComercial(razonSocial) {
  const suffixRegex = /\s+(S\.?A\.?C\.?|S\.?A\.?A\.?|S\.?A\.?|S\.?R\.?L\.?|E\.?I\.?R\.?L\.?|S\.?C\.?R\.?L\.?|COOP\.?|ASOC\.?|FUNDACION|CONSORCIO\s+S\.?A\.?C\.?)$/i;
  return String(razonSocial || '').replace(suffixRegex, '').trim() || String(razonSocial || '').trim();
}

function resolveFirstExisting(paths) {
  return paths.find((p) => fs.existsSync(p)) || null;
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

function fromAnyRecord(item) {
  const ruc = normalizeRuc(item?.ruc ?? item?.Ruc ?? item?.RUC ?? '');
  const razonSocial = String(item?.razonSocial ?? item?.RazonSocial ?? item?.RAZON_SOCIAL ?? '').trim();
  const nombreComercialRaw = String(item?.nombreComercial ?? item?.NombreComercial ?? item?.NOMBRE_COMERCIAL ?? '').trim();
  const nombreComercial = nombreComercialRaw || cleanNombreComercial(razonSocial);
  if (!ruc || !razonSocial) return null;
  return {
    ruc,
    razonSocial,
    nombreComercial,
    creadoEn: new Date().toISOString()
  };
}

function readBaseFromTsv() {
  const filePath = resolveFirstExisting(baseRucsTsvCandidates);
  if (!filePath) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map((h) => h.trim().toUpperCase());
  const idxRuc = headers.indexOf('RUC');
  const idxRazon = headers.indexOf('RAZON_SOCIAL');
  const idxNombre = headers.indexOf('NOMBRE_COMERCIAL');

  if (idxRuc < 0 || idxRazon < 0) return [];

  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    const item = fromAnyRecord({
      RUC: cols[idxRuc],
      RAZON_SOCIAL: cols[idxRazon],
      NOMBRE_COMERCIAL: idxNombre >= 0 ? cols[idxNombre] : ''
    });
    if (item) rows.push(item);
  }
  return rows;
}

function readBaseFromExcel() {
  const filePath = resolveFirstExisting(baseRucsExcelCandidates);
  if (!filePath) return [];

  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    for (const raw of data) {
      const item = fromAnyRecord(raw);
      if (item) rows.push(item);
    }
  }
  return rows;
}

function readCreatedData() {
  const rows = [];

  for (const src of createdSources) {
    const data = readJson(src, []);

    if (Array.isArray(data)) {
      for (const raw of data) {
        const item = fromAnyRecord(raw);
        if (item) rows.push(item);
      }
      continue;
    }

    if (Array.isArray(data?.registros)) {
      for (const raw of data.registros) {
        const item = fromAnyRecord(raw);
        if (item) rows.push(item);
      }
    }
  }

  return rows;
}

function dedupeRows(rows) {
  const seen = new Set();
  const unique = [];

  for (const row of rows) {
    const key = `${normalizeText(normalizeRuc(row.ruc))}|${normalizeText(row.razonSocial)}`;
    if (key === '|' || seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  return unique;
}

function maybeTrim(rows) {
  if (!target || rows.length <= target) return rows;
  return rows.slice(0, target);
}

function run() {
  ensureDir(reportesDir);

  const fromTsv = readBaseFromTsv();
  const fromExcel = readBaseFromExcel();
  const fromCreated = readCreatedData();

  const baseUnion = dedupeRows([...fromTsv, ...fromExcel]);
  const merged = dedupeRows([...baseUnion, ...fromCreated]);
  const finalPool = maybeTrim(merged);

  fs.writeFileSync(poolPath, JSON.stringify(finalPool, null, 2));

  if (fs.existsSync(reservadosPath)) {
    fs.unlinkSync(reservadosPath);
  }
  if (fs.existsSync(runPath)) {
    fs.unlinkSync(runPath);
  }

  console.log(`Base inicial TSV: ${fromTsv.length}`);
  console.log(`Base inicial Excel: ${fromExcel.length}`);
  console.log(`Creados + historico: ${fromCreated.length}`);
  console.log(`Pool reconstruido: ${finalPool.length}${target ? `/${target}` : ''}`);
  console.log(`Archivo generado: ${poolPath}`);
}

run();
