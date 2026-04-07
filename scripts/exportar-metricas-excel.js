/**
 * exportar-metricas-excel.js
 *
 * Exporta el ultimo reporte de metricas mensuales JSON a un archivo Excel .xlsx
 * usando el paquete `xlsx` (ya incluido en devDependencies).
 *
 * Uso:
 *   node scripts/exportar-metricas-excel.js
 *   node scripts/exportar-metricas-excel.js --mes=2026-03
 *   node scripts/exportar-metricas-excel.js --output=Informe-QA-Abril.xlsx
 *
 * npm script: npm run report:metrics:excel
 */

'use strict';

const path  = require('path');
const fs    = require('fs');
const XLSX  = require('xlsx');

// ── Argumentos CLI ────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    })
);

const projectRoot = path.resolve(__dirname, '..');
const reportsDir  = path.join(projectRoot, 'reportes');

// ── Resolver archivo de metricas ──────────────────────────────────────────────
function findMetricsFile(mes) {
  if (mes) {
    const candidate = path.join(reportsDir, `metricas-mensuales-${mes}.json`);
    if (fs.existsSync(candidate)) return candidate;
    console.error(`❌  No se encontro: ${candidate}`);
    process.exit(1);
  }
  // Buscar el mas reciente
  const files = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith('metricas-mensuales-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) {
    console.error('❌  No hay archivos metricas-mensuales-*.json en reportes/');
    console.error('    Ejecuta primero: npm run report:metrics:monthly');
    process.exit(1);
  }
  return path.join(reportsDir, files[0]);
}

const metricsFile = findMetricsFile(args['mes']);
const outputName  = args['output'] || `reginsa-metricas-${path.basename(metricsFile, '.json').replace('metricas-mensuales-', '')}.xlsx`;
const outputPath  = path.isAbsolute(outputName) ? outputName : path.join(reportsDir, outputName);

console.log(`📂  Leyendo: ${metricsFile}`);
const data = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));

// ── Helpers ───────────────────────────────────────────────────────────────────
const STYLES = {
  header: { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1565C0' } }, alignment: { horizontal: 'center' } },
  title:  { font: { bold: true, sz: 14 }, fill: { fgColor: { rgb: 'E3F2FD' } } },
  good:   { fill: { fgColor: { rgb: 'C8E6C9' } } },
  warn:   { fill: { fgColor: { rgb: 'FFF9C4' } } },
  bad:    { fill: { fgColor: { rgb: 'FFCDD2' } } },
};

function makeHeader(cols) {
  return cols.map(c => ({ v: c, t: 's', s: STYLES.header }));
}

function rateStyle(rate) {
  if (rate >= 90) return STYLES.good;
  if (rate >= 70) return STYLES.warn;
  return STYLES.bad;
}

// ── Hoja 1: Resumen Ejecutivo ─────────────────────────────────────────────────
const wsResumen = XLSX.utils.aoa_to_sheet([
  [{ v: `Metricas Mensuales QA REGINSA — ${data.periodo}`, t: 's', s: STYLES.title }],
  [],
  ['Generado', data.generatedAt],
  ['Periodo',  data.periodo],
  [],
  ...makeHeader(['Herramienta', 'Indicador Principal', 'Valor', 'Estado']).map(h => [h]),
]);

// Flatten resumen ejecutivo
const resumenRows = [
  ['Playwright (Funcional)',   'Tests ejecutados',     data.playwright.executed,                   ''],
  ['Playwright (Funcional)',   'Tasa de exito (%)',    data.playwright.passRate + '%',              data.playwright.passRate >= 90 ? 'OK' : data.playwright.passRate >= 70 ? 'WARN' : 'FAIL'],
  ['Newman (API)',             'Collections',          data.newman.collections,                     ''],
  ['Newman (API)',             'Assertions totales',   data.newman.totalAssertions,                 ''],
  ['Newman (API)',             'Tasa de exito (%)',    data.newman.passRate + '%',                  data.newman.passRate >= 90 ? 'OK' : data.newman.passRate >= 70 ? 'WARN' : 'FAIL'],
  ['k6 (Rendimiento)',        'Casos ejecutados',     (data.k6.cases || []).length,               ''],
  ['SonarQube',               'Proyectos analizados', (data.sonarqube.projects || []).length,     ''],
  ['OWASP ZAP',               'Alertas High',         data.security.high,                          data.security.high === 0 ? 'OK' : 'FAIL'],
  ['OWASP ZAP',               'Alertas Medium',       data.security.medium,                        data.security.medium <= 3 ? 'WARN' : 'FAIL'],
  ['OWASP ZAP',               'Fecha escaneo',        data.security.scanDate,                      ''],
];

// Lighthouse (opcional)
if (data.lighthouse) {
  for (const url of (data.lighthouse.urls || [])) {
    resumenRows.push(['Lighthouse', `Performance ${url.url}`, url.performance + '/100', url.performance >= 60 ? 'WARN' : 'FAIL']);
    resumenRows.push(['Lighthouse', `Accessibility ${url.url}`, url.accessibility + '/100', url.accessibility >= 75 ? 'OK' : 'FAIL']);
  }
}

XLSX.utils.sheet_add_aoa(wsResumen, [
  makeHeader(['Herramienta', 'Indicador Principal', 'Valor', 'Estado']),
  ...resumenRows,
], { origin: 'A6' });

wsResumen['!cols'] = [{ wch: 24 }, { wch: 30 }, { wch: 18 }, { wch: 10 }];
wsResumen['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];

// ── Hoja 2: Playwright detalle ────────────────────────────────────────────────
const pw = data.playwright;
const wsPlaywright = XLSX.utils.aoa_to_sheet([
  [{ v: 'Resultados Playwright — Pruebas Funcionales', t: 's', s: STYLES.title }],
  [],
  makeHeader(['Metrica', 'Valor']),
  ['Tests ejecutados',  pw.executed],
  ['Exitosos',          pw.passed],
  ['Fallidos',          pw.failed],
  ['Omitidos',          pw.skipped],
  ['Tasa de exito (%)', pw.passRate + '%'],
]);
wsPlaywright['!cols'] = [{ wch: 22 }, { wch: 14 }];
wsPlaywright['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];

// ── Hoja 3: Newman / API ──────────────────────────────────────────────────────
const nm = data.newman;
const wsNewman = XLSX.utils.aoa_to_sheet([
  [{ v: 'Resultados Newman — Pruebas API', t: 's', s: STYLES.title }],
  [],
  makeHeader(['Metrica', 'Valor']),
  ['Colecciones ejecutadas',  nm.collections],
  ['Assertions totales',      nm.totalAssertions],
  ['Assertions fallidas',     nm.failedAssertions],
  ['Assertions exitosas',     nm.totalAssertions - nm.failedAssertions],
  ['Tasa de exito (%)',        nm.passRate + '%'],
]);
wsNewman['!cols'] = [{ wch: 25 }, { wch: 14 }];
wsNewman['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];

// ── Hoja 4: k6 Rendimiento ────────────────────────────────────────────────────
const k6Rows = (data.k6.cases || []).map(c => [
  c.file, c.p95, c.avg, c.failRate + '%', c.iterations,
]);
const wsK6 = XLSX.utils.aoa_to_sheet([
  [{ v: 'Metricas k6 — Rendimiento por Caso', t: 's', s: STYLES.title }],
  [],
  makeHeader(['Archivo', 'p95 (ms)', 'Avg (ms)', 'Fail Rate', 'Iteraciones']),
  ...k6Rows,
]);
if (k6Rows.length === 0) {
  XLSX.utils.sheet_add_aoa(wsK6, [['Sin datos k6 disponibles']], { origin: 'A4' });
}
wsK6['!cols'] = [{ wch: 36 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
wsK6['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];

// ── Hoja 5: SonarQube ─────────────────────────────────────────────────────────
const sonarRows = (data.sonarqube.projects || []).map(p => [
  p.projectKey, p.qualityGate, p.bugs, p.vulnerabilities, p.codeSmells, p.coverage + '%', p.duplications + '%',
]);
const wsSonar = XLSX.utils.aoa_to_sheet([
  [{ v: 'Calidad de Codigo — SonarQube', t: 's', s: STYLES.title }],
  [],
  makeHeader(['Proyecto', 'Quality Gate', 'Bugs', 'Vulnerabilities', 'Code Smells', 'Coverage', 'Duplications']),
  ...sonarRows,
]);
if (sonarRows.length === 0) {
  XLSX.utils.sheet_add_aoa(wsSonar, [['Sin datos SonarQube disponibles']], { origin: 'A4' });
}
wsSonar['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
wsSonar['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];

// ── Hoja 6: Seguridad / OWASP ────────────────────────────────────────────────
const sec = data.security;
const wsSeguridad = XLSX.utils.aoa_to_sheet([
  [{ v: 'Seguridad — OWASP ZAP', t: 's', s: STYLES.title }],
  [],
  makeHeader(['Severidad', 'Alertas']),
  ['High',   sec.high],
  ['Medium', sec.medium],
  ['Low',    sec.low],
  ['Info',   sec.info],
  [],
  ['Ultimo escaneo', sec.scanDate],
]);
wsSeguridad['!cols'] = [{ wch: 18 }, { wch: 10 }];
wsSeguridad['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];

// ── Hoja 7: Lighthouse (si existe) ────────────────────────────────────────────
const wsLighthouse = (() => {
  const lh = data.lighthouse;
  if (!lh || !lh.urls || lh.urls.length === 0) {
    return XLSX.utils.aoa_to_sheet([
      [{ v: 'Lighthouse — Sin datos (ejecutar: npm run lighthouse:run)', t: 's' }],
    ]);
  }
  const lhRows = lh.urls.map(u => [
    u.url, u.performance, u.accessibility, u.bestPractices, u.seo,
    u.fcp_ms, u.lcp_ms, u.tbt_ms, u.cls,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([
    [{ v: 'Lighthouse CI — Web Performance', t: 's', s: STYLES.title }],
    [{ v: `Perfil: ${lh.preset || 'desktop'}  |  Target: ${lh.target}  |  Assert: ${lh.assertStatus}`, t: 's' }],
    [],
    makeHeader(['URL', 'Performance', 'Accessibility', 'Best Practices', 'SEO', 'FCP (ms)', 'LCP (ms)', 'TBT (ms)', 'CLS']),
    ...lhRows,
    [],
    ['Umbral Performance', '>= 60 (warn)'],
    ['Umbral Accessibility', '>= 75 (error)'],
  ]);
  ws['!cols'] = [{ wch: 40 }, { wch: 13 }, { wch: 15 }, { wch: 15 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
  return ws;
})();

// ── Ensamblar workbook ────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, wsResumen,     'Resumen Ejecutivo');
XLSX.utils.book_append_sheet(wb, wsPlaywright,  'Playwright');
XLSX.utils.book_append_sheet(wb, wsNewman,      'Newman - API');
XLSX.utils.book_append_sheet(wb, wsK6,          'k6 - Rendimiento');
XLSX.utils.book_append_sheet(wb, wsSonar,       'SonarQube');
XLSX.utils.book_append_sheet(wb, wsSeguridad,   'OWASP ZAP');
XLSX.utils.book_append_sheet(wb, wsLighthouse,  'Lighthouse');

XLSX.writeFile(wb, outputPath);

console.log(`✅  Excel generado: ${outputPath}`);
console.log(`   Hojas: Resumen Ejecutivo, Playwright, Newman, k6, SonarQube, OWASP ZAP, Lighthouse`);
