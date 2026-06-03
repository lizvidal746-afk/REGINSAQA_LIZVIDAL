const fs = require('node:fs');
const path = require('node:path');

const CARNET_CSV = path.join(__dirname, '..', 'data', 'documentos_carnet.csv');

const content = fs.readFileSync(CARNET_CSV, 'utf-8');
const lines = content
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.length > 0);

const headers = lines[0];
const dataLines = lines.slice(1);

const seenDocs = new Set();
const uniqueLines = [];

for (const line of dataLines) {
  const doc = line.split(',')[0]; // numeroDocumento es la primera (y única) columna
  if (doc && !seenDocs.has(doc)) {
    seenDocs.add(doc);
    uniqueLines.push(line);
  }
}

const newContent = `${[headers, ...uniqueLines].join('\n')}\n`;
fs.writeFileSync(CARNET_CSV, newContent);

console.log(`✅ Limpieza completada.`);
console.log(`   - Filas originales (con header): ${lines.length}`);
console.log(`   - Filas únicas (con header): ${uniqueLines.length + 1}`);
console.log(`   - Duplicados eliminados: ${lines.length - (uniqueLines.length + 1)}`);
