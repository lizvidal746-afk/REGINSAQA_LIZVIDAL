/**
 * generar-excel-metricas.js
 *
 * Genera un libro Excel profesional con 10 hojas, tablas, formato condicional
 * y gráficos a partir del JSON de hallazgos consolidados.
 *
 * Dependencia: exceljs (instalado via npm install -D exceljs)
 *
 * Uso:
 *   node scripts/generar-excel-metricas.js
 *   node scripts/generar-excel-metricas.js --fecha=2026-04-04
 *   node scripts/generar-excel-metricas.js --tipo=Seguridad
 *
 * npm script: npm run report:excel
 *
 * Autora: Liz Vidal | Sistema: REGINSA | Estándar: ISTQB · ISO/IEC 25010
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const ExcelJS = require('exceljs');

// ── Argumentos CLI ─────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);

const ROOT       = path.resolve(__dirname, '..');
const INFORMES   = path.join(ROOT, 'reportes', 'informes');
fs.mkdirSync(INFORMES, { recursive: true });

const now = new Date();
const pad = n => String(n).padStart(2, '0');
const fechaHoy   = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
const fechaHora  = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });

// ── Buscar hallazgos JSON ──────────────────────────────────────────────────
function findHallazgosJson(fecha) {
  if (fecha) {
    const f = path.join(INFORMES, `hallazgos-consolidados-${fecha}.json`);
    if (fs.existsSync(f)) return f;
    console.error(`❌  No encontrado: ${f}`);
    console.error('    Ejecuta primero: npm run report:extraer');
    process.exit(1);
  }
  const files = fs.readdirSync(INFORMES)
    .filter(f => f.startsWith('hallazgos-consolidados-') && f.endsWith('.json'))
    .sort().reverse();
  if (!files.length) {
    console.error('❌  No hay archivo hallazgos-consolidados-*.json en reportes/informes/');
    console.error('    Ejecuta primero: npm run report:extraer');
    process.exit(1);
  }
  return path.join(INFORMES, files[0]);
}

const jsonPath = findHallazgosJson(args.fecha);
const raw      = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const meta     = raw.meta;
const todos    = raw.hallazgos ?? [];

// Cargar registros k6 (opcional)
function loadK6Regs(casoNum) {
  const p = path.join(ROOT, 'reportes', `k6-caso0${casoNum}-registros.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { return null; }
}
const k6RegsC01 = loadK6Regs(1);
const k6RegsC02 = loadK6Regs(2);
const k6RegsC04 = loadK6Regs(4);

// Filtrar por tipo si se solicita
const hallazgos = args.tipo
  ? todos.filter(h => h.tipo_prueba?.toLowerCase().includes(args.tipo.toLowerCase()))
  : todos;

// Carpeta fechada alineada con el JSON consolidado
const jsonStamp = (path.basename(jsonPath).match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})/) || [])[1] || fechaHoy;
const INFORME_DIR = path.join(INFORMES, jsonStamp);
fs.mkdirSync(INFORME_DIR, { recursive: true });
const outFile = path.join(INFORME_DIR, `METRICAS_QA_REGINSA_${fechaHoy}.xlsx`);

// ── Paleta de colores ──────────────────────────────────────────────────────
const C = {
  azulOsc:   { argb: 'FF003087' },
  azulMed:   { argb: 'FF1565C0' },
  azulClar:  { argb: 'FFE3F2FD' },
  blanco:    { argb: 'FFFFFFFF' },
  grisClar:  { argb: 'FFF5F5F5' },
  grisOsc:   { argb: 'FF757575' },
  rojo:      { argb: 'FFDC143C' },
  rojoFondo: { argb: 'FFFDECEA' },
  naranja:   { argb: 'FFFF6F00' },
  narFondo:  { argb: 'FFFFF3E0' },
  amarillo:  { argb: 'FFF9A825' },
  amFondo:   { argb: 'FFFFFDE7' },
  verde:     { argb: 'FF2E7D32' },
  verFondo:  { argb: 'FFF1F8E9' },
  dorado:    { argb: 'FFFFD700' },
};

function sevColor(sev) {
  switch (sev) {
    case 'CRITICA': return { fgColor: C.rojo,    bgColor: C.rojoFondo };
    case 'ALTA':    return { fgColor: C.naranja,  bgColor: C.narFondo  };
    case 'MEDIA':   return { fgColor: C.amarillo, bgColor: C.amFondo   };
    default:        return { fgColor: C.verde,    bgColor: C.verFondo  };
  }
}

// ── Bordes estándar (usado en múltiples hojas) ───────────────────────────
const BORDERS = {
  top:    { style: 'thin' },
  bottom: { style: 'thin' },
  left:   { style: 'thin' },
  right:  { style: 'thin' },
};

// ── Helpers de estilo ──────────────────────────────────────────────────────
function hdrStyle(ws, row, cols, bgColor = C.azulOsc, fgColor = C.blanco) {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(row, c);
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: bgColor };
    cell.font  = { bold: true, color: fgColor, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  }
}

function setRowSev(ws, rowNum, sev, numCols) {
  const colors = sevColor(sev);
  for (let c = 1; c <= numCols; c++) {
    const cell = ws.getCell(rowNum, c);
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: colors.bgColor };
    cell.font  = { color: colors.fgColor, size: 9 };
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.border = {
      top: { style: 'hair' }, bottom: { style: 'hair' },
      left: { style: 'hair' }, right: { style: 'hair' },
    };
  }
}

function addMetaBlock(ws, startRow) {
  const metaBlock = [
    ['Sistema:', meta.sistema ?? 'REGINSA'],
    ['Autora:', meta.autora ?? 'Liz Vidal'],
    ['Área:', meta.area ?? 'Aseguramiento de Calidad de Software'],
    ['Fecha generación:', fechaHora],
    ['Estándares:', (meta.estandares ?? []).join(' · ')],
  ];
  metaBlock.forEach(([label, val], i) => {
    const r = startRow + i;
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font  = { bold: true, size: 9, color: C.azulMed };
    ws.getCell(r, 2).value = val;
    ws.getCell(r, 2).font  = { size: 9 };
  });
  return startRow + metaBlock.length + 1;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n📊  Generando Excel de métricas QA...\n');
  const wb = new ExcelJS.Workbook();
  wb.creator  = meta.autora ?? 'Liz Vidal';
  wb.lastModifiedBy = meta.autora ?? 'Liz Vidal';
  wb.created  = new Date();
  wb.modified = new Date();

  const critica = hallazgos.filter(h => h.severidad === 'CRITICA').length;
  const alta    = hallazgos.filter(h => h.severidad === 'ALTA').length;
  const media   = hallazgos.filter(h => h.severidad === 'MEDIA').length;
  const baja    = hallazgos.filter(h => h.severidad === 'BAJA').length;

  // ────────────────────────────────────────────────────────────────────────
  // HOJA 1 — Dashboard KPIs
  // ────────────────────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('1-Dashboard KPIs');
    ws.getColumn(1).width = 32;
    ws.getColumn(2).width = 18;
    ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 14;
    ws.getColumn(5).width = 14;

    // Título
    ws.mergeCells('A1:E1');
    const title = ws.getCell('A1');
    title.value     = `DASHBOARD KPIs — REGINSA | Autora: ${meta.autora} | ${fechaHora}`;
    title.font      = { bold: true, size: 13, color: C.blanco };
    title.fill      = { type: 'pattern', pattern: 'solid', fgColor: C.azulOsc };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;

    let r = addMetaBlock(ws, 3);

    // Resumen semáforo
    ws.getCell(r, 1).value = '━━ SEMÁFORO DE HALLAZGOS ━━';
    ws.getCell(r, 1).font  = { bold: true, size: 10, color: C.azulMed };
    r++;

    const semRows = [
      ['🔴 CRÍTICA', critica, 'Bloquea funcionalidad o representa riesgo de seguridad', 0, C.rojo],
      ['🟠 ALTA',    alta,    'Afecta flujos importantes, resolver antes del release',  3, C.naranja],
      ['🟡 MEDIA',   media,   'Afecta experiencia, resolver en sprint siguiente',       10, C.amarillo],
      ['🟢 BAJA',    baja,    'Mejora menor, planificar en backlog',                    null, C.verde],
    ];
    const hdrSemR = r;
    ws.getRow(hdrSemR).values = ['', 'Severidad', 'Cantidad', 'Descripción', 'Umbral'];
    hdrStyle(ws, hdrSemR, 5, C.azulMed);
    r++;

    semRows.forEach(([sev, cant, desc, umbral, color]) => {
      ws.getRow(r).values = ['', sev, cant, desc, umbral ?? 'N/A'];
      ws.getCell(r, 2).font = { bold: true, color: color, size: 10 };
      ws.getCell(r, 3).alignment = { horizontal: 'center' };
      const bg = sevColor(String(sev).replace(/[^ A-ZÁÉÍÓÚ]/g, '').trim().split(' ').pop() ?? 'BAJA');
      for (let c = 2; c <= 5; c++) {
        ws.getCell(r, c).fill   = { type: 'pattern', pattern: 'solid', fgColor: bg.bgColor };
        ws.getCell(r, c).border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
      }
      r++;
    });

    r++;
    ws.getCell(r, 1).value = '━━ KPIs PRINCIPALES ━━';
    ws.getCell(r, 1).font  = { bold: true, size: 10, color: C.azulMed };
    r++;

    const totalPw = hallazgos.filter(h => h.herramienta?.includes('Playwright')).length;
    const totalNw = hallazgos.filter(h => h.herramienta?.includes('Newman')).length;
    const totalSeg = hallazgos.filter(h => h.tipo_prueba === 'Seguridad').length;

    const kpiRows = [
      ['KPI', 'Valor Actual', 'Umbral', 'Estado'],
      [`Tests Funcionales con fallos`, totalPw, 0, totalPw === 0 ? '🟢 OK' : '🔴 REVISAR'],
      [`Fallos de API (Newman)`, totalNw, 0, totalNw === 0 ? '🟢 OK' : '🔴 REVISAR'],
      [`Hallazgos de Seguridad`, totalSeg, 5, totalSeg <= 5 ? '🟢 OK' : '🔴 REVISAR'],
      [`Hallazgos CRÍTICOS`, critica, 0, critica === 0 ? '🟢 OK' : '🔴 CRÍTICO'],
      [`Hallazgos ALTOS`, alta, 3, alta <= 3 ? '🟡 ADVERTENCIA' : '🔴 REVISAR'],
      [`Total hallazgos ciclo`, hallazgos.length, 20, hallazgos.length <= 20 ? '🟢 OK' : '🟡 REVISAR'],
    ];

    kpiRows.forEach((row, i) => {
      ws.getRow(r).values = ['', ...row];
      if (i === 0) { hdrStyle(ws, r, 5, C.azulMed); }
      else {
        const estado = String(row[3]);
        const bgVal = estado.includes('🔴') ? C.rojoFondo : estado.includes('🟡') ? C.amFondo : C.verFondo;
        for (let c = 2; c <= 5; c++) {
          ws.getCell(r, c).fill   = { type: 'pattern', pattern: 'solid', fgColor: bgVal };
          ws.getCell(r, c).border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
          ws.getCell(r, c).font   = { size: 9 };
        }
        ws.getCell(r, 2).font = { bold: true, size: 9 };
      }
      r++;
    });

    // Nota: ExcelJS v4 no soporta API de gráficos integrada (wb.addChart).
    // El semáforo de colores en la tabla KPIs cumple la función visual equivalente.

    console.log('  ✅  Hoja 1: Dashboard KPIs');
  }

  // ────────────────────────────────────────────────────────────────────────
  // HOJA 2 — Hallazgos Maestro
  // ────────────────────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('2-Hallazgos Maestro');
    const cols = [
      { header: 'ID',                    key: 'id',                    width: 10 },
      { header: 'Fecha',                 key: 'fecha_deteccion',       width: 18 },
      { header: 'Herramienta',           key: 'herramienta',           width: 18 },
      { header: 'Tipo de Prueba',        key: 'tipo_prueba',           width: 16 },
      { header: 'ISO 25010',             key: 'caracteristica_iso25010', width: 20 },
      { header: 'Hallazgo',              key: 'hallazgo',              width: 42 },
      { header: 'Significado',           key: 'significado',           width: 65 },
      { header: 'Impacto Técnico',       key: 'impacto_tecnico',       width: 40 },
      { header: 'Impacto Negocio',       key: 'impacto_negocio',       width: 40 },
      { header: 'Severidad',             key: 'severidad',             width: 12 },
      { header: 'Componente',            key: 'componente_afectado',   width: 25 },
      { header: 'Responsable',           key: 'responsable_sugerido',  width: 20 },
      { header: 'Recomendación',         key: 'recomendacion',         width: 50 },
      { header: 'Estado',                key: 'estado',                width: 14 },
      { header: 'Sprint Objetivo',       key: 'sprint_objetivo',       width: 16 },
      { header: 'Fecha Cierre',          key: 'fecha_cierre',          width: 14 },
    ];
    ws.columns = cols;

    // Título
    ws.spliceRows(1, 0, []);
    ws.mergeCells(1, 1, 1, cols.length);
    const t = ws.getCell(1, 1);
    t.value = `TABLA MAESTRA DE HALLAZGOS — REGINSA | ${fechaHora} | Autora: ${meta.autora}`;
    t.font  = { bold: true, size: 11, color: C.blanco };
    t.fill  = { type: 'pattern', pattern: 'solid', fgColor: C.azulOsc };
    t.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 24;

    // Header row (row 2 after splice)
    hdrStyle(ws, 2, cols.length, C.azulMed);

    // Datos
    let rowNum = 3;
    for (const h of hallazgos) {
      const row = ws.getRow(rowNum);
      row.values = cols.map(c => h[c.key] ?? '');
      setRowSev(ws, rowNum, h.severidad, cols.length);
      row.height = 40;
      rowNum++;
    }

    // Auto-filter
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: rowNum - 1, column: cols.length } };

    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
    console.log(`  ✅  Hoja 2: Hallazgos Maestro (${hallazgos.length} registros)`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // HOJA 3 — Funcionales Playwright
  // ────────────────────────────────────────────────────────────────────────
  {
    const ws  = wb.addWorksheet('3-Funcionales');
    const fns = hallazgos.filter(h => h.tipo_prueba === 'Funcional');
    ws.columns = [
      { header: 'ID',           width: 10 },
      { header: 'Suite/Caso',   width: 45 },
      { header: 'Estado',       width: 14 },
      { header: 'Hallazgo',     width: 50 },
      { header: 'Severidad',    width: 12 },
      { header: 'Responsable',  width: 20 },
      { header: 'Recomendación',width: 50 },
    ];
    hdrStyle(ws, 1, 7);
    fns.forEach((h, i) => {
      const r = i + 2;
      ws.getRow(r).values = [h.id, h.componente_afectado, h.estado, h.hallazgo, h.severidad, h.responsable_sugerido, h.recomendacion];
      setRowSev(ws, r, h.severidad, 7);
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: fns.length + 1, column: 7 } };
    console.log(`  ✅  Hoja 3: Funcionales (${fns.length} hallazgos)`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // HOJA 4 — API Newman
  // ────────────────────────────────────────────────────────────────────────
  {
    const ws  = wb.addWorksheet('4-API Newman');
    const apis = hallazgos.filter(h => h.tipo_prueba === 'API');
    ws.columns = [
      { header: 'ID',              width: 10 },
      { header: 'Endpoint/Ítem',   width: 45 },
      { header: 'Detalles',        width: 50 },
      { header: 'Hallazgo',        width: 50 },
      { header: 'Severidad',       width: 12 },
      { header: 'Responsable',     width: 20 },
      { header: 'Recomendación',   width: 50 },
    ];
    hdrStyle(ws, 1, 7);
    apis.forEach((h, i) => {
      const r = i + 2;
      ws.getRow(r).values = [h.id, h.componente_afectado, h.impacto_tecnico, h.hallazgo, h.severidad, h.responsable_sugerido, h.recomendacion];
      setRowSev(ws, r, h.severidad, 7);
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: apis.length + 1, column: 7 } };
    console.log(`  ✅  Hoja 4: API Newman (${apis.length} hallazgos)`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // HOJA 5 — Performance k6
  // ────────────────────────────────────────────────────────────────────────
  {
    const ws  = wb.addWorksheet('5-Performance k6');
    const pf  = hallazgos.filter(h => h.tipo_prueba === 'Performance');
    ws.columns = [
      { header: 'ID',             width: 10 },
      { header: 'Hallazgo',       width: 55 },
      { header: 'Significado',    width: 55 },
      { header: 'Impacto',        width: 45 },
      { header: 'Severidad',      width: 12 },
      { header: 'Responsable',    width: 20 },
      { header: 'Recomendación',  width: 50 },
    ];
    hdrStyle(ws, 1, 7);
    pf.forEach((h, i) => {
      const r = i + 2;
      ws.getRow(r).values = [h.id, h.hallazgo, h.significado, h.impacto_negocio, h.severidad, h.responsable_sugerido, h.recomendacion];
      setRowSev(ws, r, h.severidad, 7);
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: pf.length + 1, column: 7 } };
    console.log(`  ✅  Hoja 5: Performance k6 (${pf.length} hallazgos)`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // HOJA 6 — Seguridad
  // ────────────────────────────────────────────────────────────────────────
  {
    const ws  = wb.addWorksheet('6-Seguridad');
    const seg = hallazgos.filter(h => h.tipo_prueba === 'Seguridad');
    ws.columns = [
      { header: 'ID',             width: 10 },
      { header: 'Herramienta',    width: 18 },
      { header: 'Hallazgo',       width: 50 },
      { header: 'Significado',    width: 55 },
      { header: 'Impacto Técnico',width: 45 },
      { header: 'Impacto Negocio',width: 45 },
      { header: 'Severidad',      width: 12 },
      { header: 'Componente',     width: 25 },
      { header: 'Responsable',    width: 20 },
      { header: 'Recomendación',  width: 55 },
      { header: 'Estado',         width: 14 },
    ];
    hdrStyle(ws, 1, 11);
    seg.forEach((h, i) => {
      const r = i + 2;
      ws.getRow(r).values = [h.id, h.herramienta, h.hallazgo, h.significado, h.impacto_tecnico, h.impacto_negocio, h.severidad, h.componente_afectado, h.responsable_sugerido, h.recomendacion, h.estado];
      setRowSev(ws, r, h.severidad, 11);
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: seg.length + 1, column: 11 } };
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    console.log(`  ✅  Hoja 6: Seguridad (${seg.length} hallazgos)`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // HOJA 7 — Lighthouse
  // ────────────────────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('7-Lighthouse');
    const lh = hallazgos.filter(h => h.herramienta === 'Lighthouse');
    ws.columns = [
      { header: 'ID',             width: 10 },
      { header: 'Categoría',      width: 22 },
      { header: 'Hallazgo',       width: 45 },
      { header: 'Significado',    width: 55 },
      { header: 'Severidad',      width: 12 },
      { header: 'Recomendación',  width: 55 },
    ];
    hdrStyle(ws, 1, 6);
    lh.forEach((h, i) => {
      const r = i + 2;
      ws.getRow(r).values = [h.id, h.componente_afectado, h.hallazgo, h.significado, h.severidad, h.recomendacion];
      setRowSev(ws, r, h.severidad, 6);
    });
    console.log(`  ✅  Hoja 7: Lighthouse (${lh.length} hallazgos)`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // HOJA 8 — Seguimiento Incidencias
  // ────────────────────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('8-Seguimiento');
    ws.columns = [
      { header: 'ID',              width: 10 },
      { header: 'Herramienta',     width: 18 },
      { header: 'Hallazgo',        width: 50 },
      { header: 'Severidad',       width: 12 },
      { header: 'Responsable',     width: 22 },
      { header: 'Sprint Asignado', width: 16 },
      { header: 'Estado',          width: 16 },
      { header: 'Fecha Límite',    width: 14 },
      { header: 'Fecha Cierre',    width: 14 },
      { header: 'Comentarios',     width: 45 },
    ];
    hdrStyle(ws, 1, 10, C.azulMed);

    hallazgos.forEach((h, i) => {
      const r = i + 2;
      ws.getRow(r).values = [
        h.id, h.herramienta, h.hallazgo, h.severidad,
        h.responsable_sugerido, h.sprint_objetivo ?? '',
        h.estado ?? 'ABIERTO', h.fecha_cierre ?? '', h.fecha_cierre ?? '', ''
      ];
      setRowSev(ws, r, h.severidad, 10);
    });

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: hallazgos.length + 1, column: 10 } };
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    // Resumen de seguimiento
    const startSeg = hallazgos.length + 4;
    ws.getCell(startSeg, 1).value     = 'RESUMEN DE SEGUIMIENTO';
    ws.getCell(startSeg, 1).font      = { bold: true, size: 10, color: C.azulMed };
    ws.getCell(startSeg + 1, 1).value = 'Abiertos:';
    ws.getCell(startSeg + 1, 2).value = hallazgos.filter(h => h.estado === 'ABIERTO').length;
    ws.getCell(startSeg + 2, 1).value = 'En Progreso:';
    ws.getCell(startSeg + 2, 2).value = hallazgos.filter(h => h.estado === 'EN PROGRESO').length;
    ws.getCell(startSeg + 3, 1).value = 'Cerrados:';
    ws.getCell(startSeg + 3, 2).value = hallazgos.filter(h => h.estado === 'CERRADO').length;

    console.log(`  ✅  Hoja 8: Seguimiento (${hallazgos.length} incidencias)`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // HOJA 9 — Distribución por Herramienta
  // ────────────────────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('9-Por Herramienta');
    const herramientas = [...new Set(hallazgos.map(h => h.herramienta))].sort();
    const severidades  = ['CRITICA', 'ALTA', 'MEDIA', 'BAJA'];

    ws.columns = [
      { header: 'Herramienta', width: 22 },
      { header: 'CRÍTICA',     width: 12 },
      { header: 'ALTA',        width: 12 },
      { header: 'MEDIA',       width: 12 },
      { header: 'BAJA',        width: 12 },
      { header: 'TOTAL',       width: 12 },
    ];
    hdrStyle(ws, 1, 6);

    let r = 2;
    herramientas.forEach(h => {
      const row_data = hallazgos.filter(x => x.herramienta === h);
      const counts = severidades.map(s => row_data.filter(x => x.severidad === s).length);
      ws.getRow(r).values = [h, ...counts, row_data.length];
      ws.getRow(r).eachCell((cell, c) => {
        cell.alignment = { horizontal: c === 1 ? 'left' : 'center' };
        cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
        cell.fill = r % 2 === 0
          ? { type: 'pattern', pattern: 'solid', fgColor: C.grisClar }
          : { type: 'pattern', pattern: 'solid', fgColor: C.blanco };
      });
      // Colorear columna CRÍTICA si > 0
      if (counts[0] > 0) ws.getCell(r, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: C.rojoFondo };
      r++;
    });

    // Totales
    ws.getRow(r).values = ['TOTAL', critica, alta, media, baja, hallazgos.length];
    hdrStyle(ws, r, 6, C.azulMed);

    console.log(`  ✅  Hoja 9: Distribución por Herramienta`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // HOJA 9b — CRÍTICOS por Herramienta (detalle)
  // ────────────────────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('9b-CRÍTICOS x Herramienta');
    const criticos = hallazgos.filter(h => h.severidad === 'CRITICA')
      .sort((a, b) => (a.herramienta || '').localeCompare(b.herramienta || ''));
    ws.columns = [
      { header: 'ID',                   key: 'id',                   width: 10 },
      { header: 'Herramienta',          key: 'herramienta',          width: 18 },
      { header: 'Tipo de prueba',       key: 'tipo_prueba',          width: 16 },
      { header: 'Hallazgo',             key: 'hallazgo',             width: 45 },
      { header: 'Significado',          key: 'significado',          width: 65 },
      { header: 'Componente',           key: 'componente_afectado',  width: 24 },
      { header: 'Recomendación',        key: 'recomendacion',        width: 50 },
      { header: 'Responsable',          key: 'responsable_sugerido', width: 20 },
      { header: 'Estado',               key: 'estado',               width: 14 },
    ];
    hdrStyle(ws, 1, ws.columns.length, C.rojo);
    let r = 2;
    for (const h of criticos) {
      ws.getRow(r).values = ws.columns.map(c => h[c.key] ?? '');
      ws.getRow(r).eachCell(cell => {
        cell.alignment = { wrapText: true, vertical: 'top' };
        cell.font = { size: 9 };
        cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: C.rojoFondo };
      });
      ws.getRow(r).height = 36;
      r++;
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(r - 1, 1), column: ws.columns.length } };
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    console.log(`  ✅  Hoja 9b: CRÍTICOS por Herramienta (${criticos.length} registros)`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // HOJA 9c — ALTOS por Herramienta (detalle)
  // ────────────────────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('9c-ALTOS x Herramienta');
    const altos = hallazgos.filter(h => h.severidad === 'ALTA')
      .sort((a, b) => (a.herramienta || '').localeCompare(b.herramienta || ''));
    ws.columns = [
      { header: 'ID',                   key: 'id',                   width: 10 },
      { header: 'Herramienta',          key: 'herramienta',          width: 18 },
      { header: 'Tipo de prueba',       key: 'tipo_prueba',          width: 16 },
      { header: 'Hallazgo',             key: 'hallazgo',             width: 45 },
      { header: 'Significado',          key: 'significado',          width: 65 },
      { header: 'Componente',           key: 'componente_afectado',  width: 24 },
      { header: 'Recomendación',        key: 'recomendacion',        width: 50 },
      { header: 'Responsable',          key: 'responsable_sugerido', width: 20 },
      { header: 'Estado',               key: 'estado',               width: 14 },
    ];
    hdrStyle(ws, 1, ws.columns.length, C.naranja);
    let r = 2;
    for (const h of altos) {
      ws.getRow(r).values = ws.columns.map(c => h[c.key] ?? '');
      ws.getRow(r).eachCell(cell => {
        cell.alignment = { wrapText: true, vertical: 'top' };
        cell.font = { size: 9 };
        cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: C.narFondo };
      });
      ws.getRow(r).height = 36;
      r++;
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(r - 1, 1), column: ws.columns.length } };
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    console.log(`  ✅  Hoja 9c: ALTOS por Herramienta (${altos.length} registros)`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // HOJA 10 — Recomendaciones Priorizadas
  // ────────────────────────────────────────────────────────────────────────
  {
    const ws = wb.addWorksheet('10-Recomendaciones');
    ws.columns = [
      { header: '#',              width: 6  },
      { header: 'Prioridad',      width: 14 },
      { header: 'Hallazgo',       width: 45 },
      { header: 'Recomendación',  width: 60 },
      { header: 'Responsable',    width: 22 },
      { header: 'Herramienta',    width: 18 },
      { header: 'Esfuerzo Est.',  width: 16 },
      { header: 'Sprint Sugerido',width: 16 },
    ];
    hdrStyle(ws, 1, 8);

    // Ordenar: CRITICA primero
    const sevOrder = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
    const sorted   = [...hallazgos].sort((a, b) => (sevOrder[a.severidad] ?? 4) - (sevOrder[b.severidad] ?? 4));

    sorted.forEach((h, i) => {
      const r    = i + 2;
      const sev  = h.severidad;
      const prio = sev === 'CRITICA' ? '🔴 INMEDIATA' : sev === 'ALTA' ? '🟠 ALTA' : sev === 'MEDIA' ? '🟡 MEDIA' : '🟢 BAJA';
      const esfuerzo = sev === 'CRITICA' ? '1-4 horas' : sev === 'ALTA' ? '4-8 horas' : '8-16 horas';
      const sprint   = sev === 'CRITICA' ? 'Sprint Actual' : sev === 'ALTA' ? 'Sprint N+1' : 'Sprint N+2';
      ws.getRow(r).values = [i + 1, prio, h.hallazgo, h.recomendacion, h.responsable_sugerido, h.herramienta, esfuerzo, sprint];
      setRowSev(ws, r, sev, 8);
    });

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: sorted.length + 1, column: 8 } };
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    console.log(`  ✅  Hoja 10: Recomendaciones Priorizadas (${sorted.length} items)`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // HOJAS 11x — Registros k6 por caso (si hay datos)
  // ────────────────────────────────────────────────────────────────────────

  // Helpers locales
  function cellStyle(ws, row, col, isBold, bgFgColor) {
    const c = ws.getCell(row, col);
    if (isBold) c.font = { bold: true, size: 10 };
    if (bgFgColor) c.fill = { type: 'pattern', pattern: 'solid', fgColor: bgFgColor };
    c.alignment = { horizontal: col === 1 ? 'center' : 'left', vertical: 'middle' };
    c.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
    return c;
  }
  function writeK6Rows(ws, rows, startRow, tieneIPs, colCount) {
    const statusColIdx = tieneIPs ? colCount - 1 : colCount - 1;
    rows.forEach((vals, i) => {
      const rowIdx = startRow + i;
      ws.getRow(rowIdx).values = vals;
      const baseFill = rowIdx % 2 === 0 ? C.grisClar : C.blanco;
      ws.getRow(rowIdx).eachCell((c, ci) => {
        const isStatus = ci === colCount;
        const statusVal = String(vals[colCount - 1] || '').toLowerCase();
        const sFill = statusVal === 'ok' ? C.verFondo : statusVal === 'parcial' ? C.narFondo : C.rojoFondo;
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: isStatus ? sFill : baseFill };
        c.alignment = { horizontal: ci === 1 ? 'center' : 'left', vertical: 'middle' };
        c.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
      });
    });
  }
  function addSummaryBlock(ws, d, startRow, col) {
    const regs = d.registros || [];
    const ok   = regs.filter(r => (r.resultado||r.status||'') === 'OK' || r.status === 'ok').length;
    ws.getCell(startRow,   col).value = 'Run ID:';    ws.getCell(startRow,   col+1).value = d.run_id || '';
    ws.getCell(startRow+1, col).value = 'Modo:';      ws.getCell(startRow+1, col+1).value = d.modo   || '';
    ws.getCell(startRow+2, col).value = 'Fecha:';     ws.getCell(startRow+2, col+1).value = d.fecha  || '';
    ws.getCell(startRow+3, col).value = 'Total:';     ws.getCell(startRow+3, col+1).value = regs.length;
    ws.getCell(startRow+4, col).value = 'Exitosos:';  ws.getCell(startRow+4, col+1).value = ok;
    ws.getCell(startRow+4, col+1).fill = { type: 'pattern', pattern: 'solid', fgColor: C.verFondo };
    ws.getCell(startRow+5, col).value = 'Con error:'; ws.getCell(startRow+5, col+1).value = regs.length - ok;
    if (d.ip_pool) { ws.getCell(startRow+6, col).value = 'IPs:'; ws.getCell(startRow+6, col+1).value = d.ip_pool; }
    for (let r = startRow; r <= startRow + 6; r++) {
      for (let c = col; c <= col+1; c++) {
        const cell = ws.getCell(r, c);
        if (!cell.font) cell.font = {};
        cell.alignment = { vertical: 'middle' };
        cell.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
      }
      ws.getCell(r, col).font = { bold: true, size: 9 };
    }
  }

  // HOJA 11-Caso01 Entidades
  if (k6RegsC01 && Array.isArray(k6RegsC01.registros) && k6RegsC01.registros.length > 0) {
    const regs = k6RegsC01.registros;
    const tieneIPs = regs.some(r => r.ip && r.ip !== 'local');
    const ws = wb.addWorksheet('11-Caso01 Entidades');
    const cols = tieneIPs
      ? [
          { header: 'N°',          key: 'n',    width: 6 },
          { header: 'IP',          key: 'ip',   width: 16 },
          { header: 'RUC',         key: 'ruc',  width: 14 },
          { header: 'Razón Social',key: 'rs',   width: 42 },
          { header: 'Resultado',   key: 'res',  width: 12 },
          { header: 'Timestamp',   key: 'ts',   width: 20 },
        ]
      : [
          { header: 'N°',          key: 'n',    width: 6 },
          { header: 'RUC',         key: 'ruc',  width: 14 },
          { header: 'Razón Social',key: 'rs',   width: 42 },
          { header: 'Resultado',   key: 'res',  width: 12 },
          { header: 'Timestamp',   key: 'ts',   width: 20 },
        ];
    ws.columns = cols;
    hdrStyle(ws, 1, cols.length);
    const dataRows = regs.map((r, i) => tieneIPs
      ? [i+1, r.ip||'local', r.ruc||'', r.razonSocial||'', r.resultado||'OK', (r.timestamp||'').replace('T',' ').slice(0,16)]
      : [i+1,                r.ruc||'', r.razonSocial||'', r.resultado||'OK', (r.timestamp||'').replace('T',' ').slice(0,16)]);
    writeK6Rows(ws, dataRows, 2, tieneIPs, cols.length);
    addSummaryBlock(ws, k6RegsC01, regs.length + 3, 1);
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    console.log(`  ✅  Hoja 11-Caso01 Entidades (${regs.length} registros)`);
  }

  // HOJA 11-Caso02 Sanciones
  if (k6RegsC02 && Array.isArray(k6RegsC02.registros) && k6RegsC02.registros.length > 0) {
    const regs = k6RegsC02.registros;
    const tieneIPs = regs.some(r => r.ip && r.ip !== 'local');
    const ws = wb.addWorksheet('11-Caso02 Sanciones');
    const cols = tieneIPs
      ? [
          { header: 'N°',              key: 'n',      width: 6  },
          { header: 'IP',              key: 'ip',     width: 16 },
          { header: 'Administrado N°', key: 'ent',    width: 14 },
          { header: 'N° Expediente',   key: 'exp',    width: 32 },
          { header: 'N° Resolución',   key: 'res',    width: 32 },
          { header: 'F. Resolución',   key: 'fres',   width: 13 },
          { header: 'F. Registro',     key: 'freg',   width: 18 },
          { header: 'ID Cabecera',     key: 'cab',    width: 12 },
          { header: 'Resultado',       key: 'status', width: 12 },
        ]
      : [
          { header: 'N°',              key: 'n',      width: 6  },
          { header: 'Administrado N°', key: 'ent',    width: 14 },
          { header: 'N° Expediente',   key: 'exp',    width: 32 },
          { header: 'N° Resolución',   key: 'res',    width: 32 },
          { header: 'F. Resolución',   key: 'fres',   width: 13 },
          { header: 'F. Registro',     key: 'freg',   width: 18 },
          { header: 'ID Cabecera',     key: 'cab',    width: 12 },
          { header: 'Resultado',       key: 'status', width: 12 },
        ];
    ws.columns = cols;
    hdrStyle(ws, 1, cols.length);
    const dataRows = regs.map((r, i) => {
      const fechaReg = (r.fechaRegistro||r.timestamp||'').replace('T',' ').slice(0,16);
      const res = r.status === 'ok' || r.resultado === 'OK' ? 'OK' : (r.status || r.resultado || 'Error');
      return tieneIPs
        ? [i+1, r.ip||'local', String(r.idEntidad||''), r.expediente||'', r.resolucion||'', r.fechaResolucion||'', fechaReg, r.cabeceraId||'', res]
        : [i+1,                String(r.idEntidad||''), r.expediente||'', r.resolucion||'', r.fechaResolucion||'', fechaReg, r.cabeceraId||'', res];
    });
    writeK6Rows(ws, dataRows, 2, tieneIPs, cols.length);
    addSummaryBlock(ws, k6RegsC02, regs.length + 3, 1);
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    console.log(`  ✅  Hoja 11-Caso02 Sanciones (${regs.length} registros)`);
  }

  // HOJA 11-Caso04 Reconsidera
  if (k6RegsC04 && Array.isArray(k6RegsC04.registros) && k6RegsC04.registros.length > 0) {
    const regs = k6RegsC04.registros;
    const tieneIPs = regs.some(r => r.ip && r.ip !== 'local');
    const ws = wb.addWorksheet('11-Caso04 Reconsidera');
    const cols = tieneIPs
      ? [
          { header: 'N°',                  key: 'n',    width: 6  },
          { header: 'IP',                  key: 'ip',   width: 16 },
          { header: 'ID Cabecera',         key: 'cab',  width: 12 },
          { header: 'N° Expediente',       key: 'exp',  width: 32 },
          { header: 'F. Modificación',     key: 'fmod', width: 14 },
          { header: 'N° Reconsideración',  key: 'nrec', width: 28 },
          { header: 'F. Reconsideración',  key: 'frec', width: 14 },
          { header: 'Resultado',           key: 'res',  width: 12 },
          { header: 'Timestamp',           key: 'ts',   width: 20 },
        ]
      : [
          { header: 'N°',                  key: 'n',    width: 6  },
          { header: 'ID Cabecera',         key: 'cab',  width: 12 },
          { header: 'N° Expediente',       key: 'exp',  width: 32 },
          { header: 'F. Modificación',     key: 'fmod', width: 14 },
          { header: 'N° Reconsideración',  key: 'nrec', width: 28 },
          { header: 'F. Reconsideración',  key: 'frec', width: 14 },
          { header: 'Resultado',           key: 'res',  width: 12 },
          { header: 'Timestamp',           key: 'ts',   width: 20 },
        ];
    ws.columns = cols;
    hdrStyle(ws, 1, cols.length);
    const dataRows = regs.map((r, i) => tieneIPs
      ? [i+1, r.ip||'local', String(r.idCabecera||''), r.expediente||'', r.fechaModificacion||'', r.numeroReconsideracion||'', r.fechaReconsideracion||'', r.resultado||'', (r.timestamp||'').replace('T',' ').slice(0,16)]
      : [i+1,                String(r.idCabecera||''), r.expediente||'', r.fechaModificacion||'', r.numeroReconsideracion||'', r.fechaReconsideracion||'', r.resultado||'', (r.timestamp||'').replace('T',' ').slice(0,16)]);
    writeK6Rows(ws, dataRows, 2, tieneIPs, cols.length);
    addSummaryBlock(ws, k6RegsC04, regs.length + 3, 1);
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    console.log(`  ✅  Hoja 11-Caso04 Reconsidera (${regs.length} registros)`);
  }

  // HOJA 11-Resumen IPs (si hay pool activo)
  {
    const allRegs = [
      ...(k6RegsC01?.registros || []).map(r => ({ ...r, caso: '01-Entidad' })),
      ...(k6RegsC02?.registros || []).map(r => ({ ...r, caso: '02-Sancion' })),
      ...(k6RegsC04?.registros || []).map(r => ({ ...r, caso: '04-Reconsidera' })),
    ];
    const tieneIPs = allRegs.some(r => r.ip && r.ip !== 'local');
    if (allRegs.length > 0) {
      const ws = wb.addWorksheet('11-Resumen IPs');

      // Tabla resumen por IP
      const ips = Array.from(new Set(allRegs.map(r => r.ip || 'local'))).sort();
      ws.columns = [
        { header: 'IP Origen',       key: 'ip',    width: 18 },
        { header: 'Caso 01 (Ent.)',  key: 'c01',   width: 14 },
        { header: 'Caso 02 (San.)',  key: 'c02',   width: 14 },
        { header: 'Caso 04 (Rec.)',  key: 'c04',   width: 14 },
        { header: 'Total',           key: 'total', width: 10 },
      ];
      hdrStyle(ws, 1, 5);
      ips.forEach((ip, i) => {
        const c01 = (k6RegsC01?.registros || []).filter(r => (r.ip||'local') === ip).length;
        const c02 = (k6RegsC02?.registros || []).filter(r => (r.ip||'local') === ip).length;
        const c04 = (k6RegsC04?.registros || []).filter(r => (r.ip||'local') === ip).length;
        const row = i + 2;
        ws.getRow(row).values = [ip, c01, c02, c04, c01+c02+c04];
        const bg = i % 2 === 0 ? C.grisClar : C.blanco;
        ws.getRow(row).eachCell((c, ci) => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: bg };
          c.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle' };
          c.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
          if (ci === 5) c.font = { bold: true };
        });
      });

      // Tabla detalle combinado (todos los casos)
      const detRow = ips.length + 4;
      ws.getCell(detRow, 1).value = 'Detalle combinado todos los casos';
      ws.getCell(detRow, 1).font = { bold: true, size: 10, color: C.azulMed };
      const detHdr = ['N°', 'Caso', 'IP', 'Referencia', 'Resultado', 'Timestamp'];
      detHdr.forEach((h, i) => {
        const c = ws.getCell(detRow + 1, i + 1);
        c.value = h; c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.azulMed.argb || '1565C0'}` } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
      ws.getColumn(1).width = 6; ws.getColumn(2).width = 16; ws.getColumn(3).width = 18;
      ws.getColumn(4).width = 36; ws.getColumn(5).width = 12; ws.getColumn(6).width = 20;

      allRegs.forEach((r, i) => {
        const rowIdx = detRow + 2 + i;
        const ref = r.caso === '01-Entidad'      ? `${r.ruc||''}  ${r.razonSocial||''}`
                  : r.caso === '02-Sancion'       ? `${r.expediente||''}  /  ${r.resolucion||''}`
                  : `${r.numeroReconsideracion||''}`;
        const res = r.resultado || r.status || '';
        ws.getRow(rowIdx).values = [i+1, r.caso, r.ip||'local', ref, res === 'ok' ? 'OK' : res, (r.timestamp||'').replace('T',' ').slice(0,16)];
        const bg = i % 2 === 0 ? C.grisClar : C.blanco;
        const sFill = res === 'OK' || res === 'ok' ? C.verFondo : res === 'PARCIAL' ? C.narFondo : C.rojoFondo;
        ws.getRow(rowIdx).eachCell((c, ci) => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: ci === 5 ? sFill : bg };
          c.alignment = { horizontal: ci === 1 ? 'center' : 'left', vertical: 'middle' };
          c.border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'hair' }, right: { style: 'hair' } };
        });
      });

      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
      console.log(`  ✅  Hoja 11-Resumen IPs (${ips.length} IPs, ${allRegs.length} registros totales)`);
    }
  }

  // ── HOJA 12 — SonarQube (SAST — condicional) ─────────────────────────
  {
    const sonarUrl   = process.env.SONAR_HOST_URL;
    const sonarToken = process.env.SONAR_TOKEN;
    const ws = wb.addWorksheet('12-SonarQube');

    // Título
    ws.mergeCells('A1:F1');
    const sqTitle = ws.getCell('A1');
    sqTitle.value     = `SONARQUBE — Calidad y Seguridad de Código (SAST) | ${fechaHora}`;
    sqTitle.font      = { bold: true, size: 12, color: C.blanco };
    sqTitle.fill      = { type: 'pattern', pattern: 'solid', fgColor: C.azulOsc };
    sqTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 26;

    ws.getColumn(1).width = 20;
    ws.getColumn(2).width = 18;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 50;
    ws.getColumn(5).width = 28;
    ws.getColumn(6).width = 22;

    if (!sonarUrl || !sonarToken) {
      ws.getCell('A3').value = 'SonarQube no configurado.';
      ws.getCell('A3').font  = { italic: true, color: C.grisOsc, size: 10 };
      ws.getCell('A4').value = 'Para activar, definir antes de ejecutar:';
      ws.getCell('A4').font  = { italic: true, color: C.grisOsc, size: 9 };
      ws.getCell('A5').value = '$env:SONAR_HOST_URL="http://localhost:9000" ; $env:SONAR_TOKEN="tu-token" ; npm run report:excel';
      ws.getCell('A5').font  = { color: C.azulMed, size: 9 };
      console.log('  ℹ️   Hoja 12-SonarQube: sin credenciales (env vars no definidas)');
    } else {
      const https = require('https');
      const http  = require('http');
      const projectKeys = ['si091reginsafrontend','si091reginsabackend','si091reginsaenlinea','si091reginsaconfig'];
      const basicAuth   = Buffer.from(`${sonarToken}:`).toString('base64');

      const fetchSq = (urlStr) => new Promise((resolve) => {
        const lib = urlStr.startsWith('https') ? https : http;
        lib.get(urlStr, { headers: { Authorization: `Basic ${basicAuth}` } }, (res) => {
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
        }).on('error', () => resolve(null));
      });

      try {
        // Quality Gate por proyecto
        let qgRow = 3;
        ws.getCell(qgRow, 1).value = 'Quality Gate por Proyecto';
        ws.getCell(qgRow, 1).font  = { bold: true, size: 10, color: C.azulMed };
        qgRow++;
        const qgHdrs = ['Proyecto', 'Quality Gate', 'Condiciones Fallidas', 'URL Dashboard'];
        qgHdrs.forEach((h, i) => {
          const cell = ws.getCell(qgRow, i + 1);
          cell.value = h;
          cell.font  = { bold: true, color: C.blanco, size: 9 };
          cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: C.azulMed };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = BORDERS;
        });
        qgRow++;

        for (const key of projectKeys) {
          const qgUrl  = `${sonarUrl.replace(/\/$/, '')}/api/qualitygates/project_status?projectKey=${key}`;
          const qgData = await fetchSq(qgUrl);
          const status = qgData?.projectStatus?.status ?? 'N/D';
          const failed = qgData?.projectStatus?.conditions?.filter(c => c.status === 'ERROR').length ?? 0;
          const label  = status === 'OK' ? '🟢 PASA' : '🔴 FALLA';
          const bgFill = status === 'OK' ? C.verFondo : C.rojoFondo;
          const rowVals = [
            key.replace('si091reginsa','').toUpperCase(),
            label,
            String(failed),
            `${sonarUrl}/dashboard?id=${key}`,
          ];
          rowVals.forEach((val, i) => {
            const cell   = ws.getCell(qgRow, i + 1);
            cell.value   = val;
            cell.fill    = { type: 'pattern', pattern: 'solid', fgColor: i === 1 ? bgFill : (qgRow % 2 === 0 ? C.grisClar : C.blanco) };
            cell.font    = { size: 9, bold: i === 0 };
            cell.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' };
            cell.border  = BORDERS;
          });
          qgRow++;
        }

        // Issues críticos/blocker
        let issRow = qgRow + 2;
        ws.getCell(issRow, 1).value = 'Top Issues CRITICAL / BLOCKER (por proyecto)';
        ws.getCell(issRow, 1).font  = { bold: true, size: 10, color: C.azulMed };
        issRow++;
        const issHdrs = ['Proyecto', 'Severidad', 'Mensaje', 'Archivo', 'Regla', 'Tipo'];
        issHdrs.forEach((h, i) => {
          const cell = ws.getCell(issRow, i + 1);
          cell.value = h;
          cell.font  = { bold: true, color: C.blanco, size: 9 };
          cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: C.azulMed };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = BORDERS;
        });
        issRow++;

        let totalIss = 0;
        for (const key of projectKeys) {
          const issUrl  = `${sonarUrl.replace(/\/$/, '')}/api/issues/search?componentKeys=${key}&severities=CRITICAL,BLOCKER&resolved=false&ps=10`;
          const issData = await fetchSq(issUrl);
          if (issData?.issues) {
            totalIss += issData.total || issData.issues.length;
            for (const iss of issData.issues.slice(0, 5)) {
              const sev   = iss.severity ?? '';
              const bg    = sev === 'BLOCKER' ? C.rojoFondo : sev === 'CRITICAL' ? C.narFondo : C.amFondo;
              const vals  = [
                key.replace('si091reginsa','').toUpperCase(),
                sev,
                iss.message   ?? '',
                (iss.component ?? '').split(':').pop(),
                iss.rule      ?? '',
                iss.type      ?? '',
              ];
              vals.forEach((val, i) => {
                const cell   = ws.getCell(issRow, i + 1);
                cell.value   = val;
                cell.fill    = { type: 'pattern', pattern: 'solid', fgColor: i === 1 ? bg : (issRow % 2 === 0 ? C.grisClar : C.blanco) };
                cell.font    = { size: 9, bold: i <= 1 };
                cell.alignment = { horizontal: i <= 1 ? 'center' : 'left', vertical: 'top', wrapText: true };
                cell.border  = BORDERS;
              });
              ws.getRow(issRow).height = 36;
              issRow++;
            }
          }
        }

        if (totalIss === 0) {
          ws.getCell(issRow, 1).value = '✅ No se encontraron issues CRITICAL/BLOCKER en ningún proyecto.';
          ws.getCell(issRow, 1).font  = { color: C.verde, size: 10 };
        }

        ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
        console.log(`  ✅  Hoja 12-SonarQube (${totalIss} issues críticos/blocker)`);
      } catch (err) {
        ws.getCell('A3').value = `Error consultando SonarQube: ${err.message}`;
        ws.getCell('A3').font  = { color: C.rojo, size: 10 };
        console.warn(`  ⚠️   SonarQube error: ${err.message}`);
      }
    }
  }

  // ── HOJA 13 — Inconsistencias Frontend vs Backend ─────────────────────
  {
    const fvbHalls = todos.filter(h => h.tipo_prueba === 'Inconsistencia-FvB');
    if (fvbHalls.length > 0) {
      const ws = wb.addWorksheet('13-Incons. F-B');
      ws.columns = [
        { header: 'N°',                   key: 'n',     width: 5  },
        { header: 'Subtipo',              key: 'sub',   width: 10 },
        { header: 'Flujo / Caso',         key: 'flujo', width: 18 },
        { header: 'Endpoint',             key: 'ep',    width: 36 },
        { header: 'Campo',                key: 'campo', width: 16 },
        { header: 'Validación Frontend',  key: 'vf',    width: 38 },
        { header: 'Comportamiento API',   key: 'api',   width: 38 },
        { header: 'Severidad',            key: 'sev',   width: 10 },
        { header: 'Responsable',          key: 'resp',  width: 14 },
        { header: 'Estado',               key: 'est',   width: 10 },
      ];

      // Cabecera
      const hdr = ws.getRow(1);
      hdr.eachCell(cell => {
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: C.azulOsc };
        cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = BORDERS;
      });
      hdr.height = 22;

      // Colores por severidad
      const SEV_COLOR = {
        CRITICA: 'FFFF0000',
        ALTA:    'FFFF6600',
        MEDIA:   'FFFFC000',
        BAJA:    'FF92D050',
      };

      fvbHalls.forEach((h, idx) => {
        const row = ws.addRow({
          n:     idx + 1,
          sub:   h.subtipo_fvb   ?? '',
          flujo: h.caso          ?? '',
          ep:    h.endpoint      ?? h.descripcion ?? '',
          campo: h.campo_afectado ?? '',
          vf:    h.titulo        ?? '',
          api:   h.comportamiento_api ?? '',
          sev:   h.severidad     ?? '',
          resp:  h.responsable   ?? 'Backend',
          est:   h.estado        ?? '',
        });
        row.height = 40;
        row.eachCell(cell => {
          cell.alignment = { vertical: 'top', wrapText: true };
          cell.border    = BORDERS;
        });
        const sevCell = row.getCell('sev');
        const color   = SEV_COLOR[h.severidad] ?? 'FFD9D9D9';
        sevCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        sevCell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        sevCell.alignment = { horizontal: 'center', vertical: 'top' };
      });

      ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
      console.log(`  ✅  Hoja 13-Incons. F-B (${fvbHalls.length} inconsistencias)`);
    }
  }

  // ── Guardar ────────────────────────────────────────────────────────────
  await wb.xlsx.writeFile(outFile);
  console.log(`\n  💾  Guardado: ${outFile}\n`);
  console.log(`  Siguiente paso: npm run report:word\n`);
}

main().catch(err => {
  console.error('\n❌  Error generando Excel:', err.message);
  process.exit(1);
});
