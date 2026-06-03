/**
 * results-aggregator.js
 *
 * Lee todos los archivos JSON del directorio results/
 * y los consolida en unified-report-data.json.
 */

const fs = require('fs');
const path = require('path');

const resultsDir = path.resolve(__dirname, '../results');
const outputFile = path.join(resultsDir, 'unified-report-data.json');

console.log('==================================================');
console.log('       AGGREGATOR: CONSOLIDANDO REPORTES         ');
console.log('==================================================');

const aggregated = {
  project: "REGINSA_EVOLUTION",
  timestamp: new Date().toISOString(),
  addons: {}
};

try {
  const files = fs.readdirSync(resultsDir);
  let count = 0;

  files.forEach(file => {
    // Evitar leer el esquema y el propio archivo de salida
    if (file.endsWith('.json') && file !== 'addon-result-schema.json' && file !== 'unified-report-data.json') {
      const filePath = path.join(resultsDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);

        if (data.addonName) {
          aggregated.addons[data.addonName.toLowerCase()] = data;
          count++;
          console.log(`➕ Agregado reporte del addon: ${data.addonName}`);
        }
      } catch (err) {
        console.error(`⚠️ Error al leer o parsear ${file}:`, err.message);
      }
    }
  });

  fs.writeFileSync(outputFile, JSON.stringify(aggregated, null, 2), 'utf8');
  console.log('--------------------------------------------------');
  console.log(`✅ Consolidación terminada con éxito (${count} addons).`);
  console.log(`💾 Reporte final guardado en: ${outputFile}`);
  console.log('==================================================');

} catch (error) {
  console.error('[ERROR] Error durante la agregación de resultados:', error.message);
}
