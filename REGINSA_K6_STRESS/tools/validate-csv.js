const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CARNET_CSV = path.join(DATA_DIR, 'documentos_carnet.csv');
const GRADOS_CSV = path.join(DATA_DIR, 'documentos_grados.csv');

function validateCsv(filePath, requiredHeaders) {
  console.log(`\nValidando: ${path.basename(filePath)}`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ ERROR: El archivo no existe: ${filePath}`);
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    console.error(`❌ ERROR: El archivo debe tener al menos un header y una fila de datos.`);
    return false;
  }

  const headers = lines[0].split(',');

  for (const req of requiredHeaders) {
    if (!headers.includes(req)) {
      console.error(`❌ ERROR: Falta el header requerido '${req}'. Headers encontrados: ${headers.join(', ')}`);
      return false;
    }
  }

  const docIndex = headers.indexOf('numeroDocumento');
  const seenDocs = new Set();
  let hasErrors = false;

  for (let i = 1; i < lines.length; i++) {
    const columns = lines[i].split(',');
    if (columns.length !== headers.length) {
      console.error(
        `⚠️ Fila ${i + 1}: Cantidad de columnas inconsistente. Esperado ${headers.length}, Encontrado ${columns.length}`,
      );
      hasErrors = true;
      continue;
    }

    const doc = columns[docIndex];
    if (!doc) {
      console.error(`⚠️ Fila ${i + 1}: El documento está vacío.`);
      hasErrors = true;
    } else if (seenDocs.has(doc)) {
      console.warn(`⚠️ Fila ${i + 1}: Documento duplicado encontrado: ${doc}`);
      hasErrors = true;
    } else {
      seenDocs.add(doc);
    }
  }

  if (hasErrors) {
    console.log(`❌ Validación fallida para ${path.basename(filePath)} con advertencias/errores.`);
    return false;
  }

  console.log(`✅ OK: ${lines.length - 1} registros validados correctamente.`);
  return true;
}

console.log('=========================================');
console.log('  INICIANDO VALIDACIÓN DE DATOS (CSV)   ');
console.log('=========================================');

const isValidCarnet = validateCsv(CARNET_CSV, ['numeroDocumento']);
const isValidGrados = validateCsv(GRADOS_CSV, ['numeroDocumento']);

if (isValidCarnet && isValidGrados) {
  console.log(`\n🎉 Todos los archivos CSV son válidos.`);
  process.exit(0);
} else {
  console.error(`\n🚨 Hay errores en los datos. Por favor corrige los CSV antes de ejecutar k6.`);
  process.exit(1);
}
