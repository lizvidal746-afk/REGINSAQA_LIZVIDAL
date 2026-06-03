/**
 * tools/extract-k6-metrics.js
 * Extrae métricas clave del JSON y las prepara para la herramienta de IA.
 * Usa K6Reader como fuente de datos (mismo contrato que Word/Excel).
 */
const path = require('node:path');
const fs = require('node:fs');
const { K6Reader, resolveTargetJson } = require('./lib/k6-reader');

const reportsDir = path.join(__dirname, '../reports');
const jsonPath = resolveTargetJson(reportsDir, process.argv[2]);
const r = new K6Reader(jsonPath);

const payload = r.toAiPayload();

const outPath = path.join(reportsDir, 'metrics_for_ai.json');
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
console.log(
  `[Extrayendo métricas para IA] ✅ Guardado: metrics_for_ai.json (${Buffer.byteLength(JSON.stringify(payload))} bytes)`,
);
console.log(
  `[Extrayendo métricas para IA] Requests: ${r.totalRequests} | p95: ${Math.round(r.p95)}ms | SLO: ${r.sloPass ? 'PASA' : 'FALLA'}`,
);
