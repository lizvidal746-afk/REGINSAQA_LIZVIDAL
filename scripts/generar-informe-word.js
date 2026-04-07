/**
 * generar-informe-word.js
 *
 * Genera un Informe de Calidad profesional en formato .docx a partir del
 * JSON de hallazgos consolidados (generado por extraer-hallazgos.ps1).
 *
 * Dependencia: docx (ya instalado via npm install -D docx)
 *
 * Uso:
 *   node scripts/generar-informe-word.js
 *   node scripts/generar-informe-word.js --fecha=2026-04-04
 *   node scripts/generar-informe-word.js --tipo=Seguridad
 *   node scripts/generar-informe-word.js --ciclo="Sprint 12 - Abril 2026"
 *
 * npm script: npm run report:word
 *
 * Autora: Liz Vidal | Sistema: REGINSA | Estándar: ISTQB · ISO/IEC 25010
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
  PageNumber, Header, Footer, ImageRun, NumberFormat,
  convertInchesToTwip, TableLayoutType,
} = require('docx');

// ── CLI args ───────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);

const ROOT     = path.resolve(__dirname, '..');
const INFORMES = path.join(ROOT, 'reportes', 'informes');
fs.mkdirSync(INFORMES, { recursive: true });

const now = new Date();
const pad = n => String(n).padStart(2, '0');
const fechaHoy   = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
const fechaHora  = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' });
const ciclo      = args.ciclo ?? `Ciclo ${new Date().toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })}`;

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
    console.error('❌  No hay hallazgos-consolidados-*.json en reportes/informes/');
    console.error('    Ejecuta primero: npm run report:extraer');
    process.exit(1);
  }
  return path.join(INFORMES, files[0]);
}

const jsonPath  = findHallazgosJson(args.fecha);
const raw       = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const meta      = raw.meta;
const todosHall = raw.hallazgos ?? [];

// ── Cargar registros k6 (opcional — no falla si no existe) ────────────────
function loadK6Regs(casoNum) {
  const p = path.join(ROOT, 'reportes', `k6-caso0${casoNum}-registros.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}
const k6RegsC01 = loadK6Regs(1);
const k6RegsC02 = loadK6Regs(2);
const k6RegsC04 = loadK6Regs(4);

const hallazgos = args.tipo
  ? todosHall.filter(h => h.tipo_prueba?.toLowerCase().includes(args.tipo.toLowerCase()))
  : todosHall;

// ── Conteos ────────────────────────────────────────────────────────────────
const cnt = (sev) => hallazgos.filter(h => h.severidad === sev).length;
const critica = cnt('CRITICA'), alta = cnt('ALTA'), media = cnt('MEDIA'), baja = cnt('BAJA');
const semaforo = critica > 0 ? '🔴 ESTADO CRÍTICO' : alta > 0 ? '🟡 ESTADO ADVERTENCIA' : '🟢 ESTADO ACEPTABLE';

// ── Constantes de diseño ───────────────────────────────────────────────────
const AZUL_OSC  = '003087';
const AZUL_MED  = '1565C0';
const AZUL_CLAR = 'E3F2FD';
const BLANCO    = 'FFFFFF';
const GRIS      = 'F5F5F5';
const SEV_COLORS = {
  CRITICA: { bg: 'FDECEA', fg: 'DC143C' },
  ALTA:    { bg: 'FFF3E0', fg: 'FF6F00' },
  MEDIA:   { bg: 'FFFDE7', fg: 'F9A825' },
  BAJA:    { bg: 'F1F8E9', fg: '2E7D32' },
};

// ── Helpers de construcción ─────────────────────────────────────────────────
function txt(text, opts = {}) {
  return new TextRun({
    text: String(text ?? ''),
    bold: opts.bold ?? false,
    color: opts.color ?? '000000',
    size: (opts.size ?? 10) * 2,
    font: opts.font ?? 'Calibri',
    italics: opts.italic ?? false,
  });
}

function para(children, opts = {}) {
  return new Paragraph({
    children: Array.isArray(children) ? children : [children],
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: { before: opts.spaceBefore ?? 80, after: opts.spaceAfter ?? 80 },
    heading: opts.heading,
    style: opts.style,
  });
}

function h1(text) {
  return para([txt(text, { bold: true, size: 14, color: AZUL_OSC })], { heading: HeadingLevel.HEADING_1, spaceBefore: 200, spaceAfter: 120 });
}

function h2(text) {
  return para([txt(text, { bold: true, size: 11, color: AZUL_MED })], { heading: HeadingLevel.HEADING_2, spaceBefore: 160, spaceAfter: 80 });
}

function h3(text) {
  return para([txt(text, { bold: true, size: 10, color: AZUL_MED })], { heading: HeadingLevel.HEADING_3, spaceBefore: 120, spaceAfter: 60 });
}

function pageBreak() {
  return new Paragraph({ pageBreakBefore: true });
}

function cell(text, opts = {}) {
  return new TableCell({
    children: [para([txt(text ?? '', { bold: opts.header ?? false, size: opts.size ?? 9, color: opts.color ?? (opts.header ? BLANCO : '212121') })],
      { align: opts.align ?? AlignmentType.LEFT })],
    shading: opts.bg ? { type: ShadingType.SOLID, color: opts.bg } : undefined,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: opts.colSpan,
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
  });
}

function tableRow(values, isHeader = false, bgOverride) {
  return new TableRow({
    children: values.map((v, i) => {
      const background = bgOverride ?? (isHeader ? AZUL_OSC : (i % 2 === 0 ? GRIS : BLANCO));
      return cell(v, { header: isHeader, bg: background, size: isHeader ? 9 : 9 });
    }),
    tableHeader: isHeader,
  });
}

function severityRow(hall) {
  const c = SEV_COLORS[hall.severidad] ?? SEV_COLORS.BAJA;
  const cols = [
    hall.id, hall.herramienta, hall.hallazgo, hall.significado,
    hall.severidad, hall.componente_afectado, hall.responsable_sugerido,
    hall.recomendacion, hall.estado,
  ];
  return new TableRow({
    children: cols.map((v, idx) => {
      const isSev = idx === 4;
      return new TableCell({
        children: [new Paragraph({
          children: [txt(v ?? '', { size: 8, bold: isSev, color: isSev ? c.fg : '212121' })],
          spacing: { before: 40, after: 40 },
        })],
        shading: { type: ShadingType.SOLID, color: isSev ? c.bg : BLANCO },
        margins: { top: 40, bottom: 40, left: 60, right: 60 },
      });
    }),
  });
}

function infoTable(pairs) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: pairs.map(([label, value]) => new TableRow({
      children: [
        cell(label, { bold: true, bg: AZUL_CLAR, size: 9 }),
        cell(value ?? '', { bg: BLANCO, size: 9 }),
      ],
    })),
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// CONSTRUCCIÓN DEL DOCUMENTO
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n📄  Generando Informe Word profesional...\n');

  const sections = [];

  // ── PORTADA ────────────────────────────────────────────────────────────
  const portada = [
    para([], { spaceBefore: 400 }),
    para([txt('INFORME DE CALIDAD DE SOFTWARE', { bold: true, size: 22, color: AZUL_OSC })], { align: AlignmentType.CENTER }),
    para([txt('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', { color: AZUL_MED })], { align: AlignmentType.CENTER }),
    para([], { spaceBefore: 200 }),
    infoTable([
      ['Sistema',    'REGINSA — Registro Nacional de Sanciones a Docentes'],
      ['Versión',    '1.0'],
      ['Fecha',      fechaHora],
      ['Autora',     meta.autora ?? 'Liz Vidal'],
      ['Área',       meta.area ?? 'Aseguramiento de Calidad de Software'],
      ['Ciclo',      ciclo],
      ['Estándares', (meta.estandares ?? ['ISTQB', 'ISO/IEC 25010', 'NTP ISO/IEC 12207']).join(' · ')],
      ['Estado',     semaforo],
    ]),
    para([], { spaceBefore: 200 }),
    para([txt('CONFIDENCIAL — SOLO PARA USO INTERNO DEL EQUIPO DE DESARROLLO', { bold: true, size: 9, color: AZUL_MED })], { align: AlignmentType.CENTER }),
    pageBreak(),
  ];

  // ── SECCIÓN 1 — Información General ──────────────────────────────────
  const seccion1 = [
    h1('1. Información General del Informe'),
    para([txt('El presente informe documenta los resultados del ciclo de aseguramiento de calidad ejecutado sobre el Sistema REGINSA, aplicando prácticas formales alineadas a los estándares ISTQB, ISO/IEC 25010 e ISO/IEC 12207. Los hallazgos aquí reportados provienen de la ejecución automatizada de pruebas funcionales, de API, de rendimiento y de seguridad.')]),
    para([]),
    infoTable([
      ['Propósito',       'Documentar los resultados del ciclo de pruebas QA y proporcionar recomendaciones accionables al equipo de desarrollo.'],
      ['Generado el',     fechaHora],
      ['Autora',          meta.autora ?? 'Liz Vidal'],
      ['Área responsable', meta.area ?? 'Aseguramiento de Calidad de Software'],
      ['Estándares',      (meta.estandares ?? []).join(' · ')],
      ['Total hallazgos', String(hallazgos.length)],
      ['CRÍTICOS',        String(critica)],
      ['ALTOS',           String(alta)],
      ['MEDIOS',          String(media)],
      ['BAJOS',           String(baja)],
    ]),
    pageBreak(),
  ];

  // ── SECCIÓN 2 — Alcance ────────────────────────────────────────────────
  const seccion2 = [
    h1('2. Alcance de las Pruebas'),
    para([txt('El presente ciclo de pruebas cubre los siguientes módulos y tipos de verificación del sistema REGINSA:')]),
    para([]),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableRow(['Tipo de Prueba', 'Herramienta', 'Cobertura', 'Incluido'], true),
        tableRow(['Funcional E2E',  'Playwright/Allure', 'Login, Administrados, Sanciones, Reconsideración', '✓']),
        tableRow(['API REST',       'Newman/Postman',    'Todos los endpoints del sistema', '✓']),
        tableRow(['Performance',    'k6 / Grafana',      'Endpoints críticos bajo carga', '✓']),
        tableRow(['Seguridad Web',  'OWASP ZAP',         'Frontend + API REST', '✓']),
        tableRow(['Código',         'SonarQube',         'Repositorios fuente activos', '✓']),
        tableRow(['Dependencias',   'Trivy + DepCheck',  'Librerías npm y contenedores', '✓']),
        tableRow(['Accesibilidad',  'Lighthouse',        'Páginas principales del sistema', '✓']),
        tableRow(['Secretos',       'Gitleaks',          'Todos los repositorios GIT', '✓']),
        tableRow(['Análisis Est.', 'Semgrep / CodeQL',  'Código fuente (patrones inseguros)', '✓']),
        tableRow(['Val. Front/Back', 'Manual (QA)',      'Endpoints críticos vs. formularios Angular', '✓']),
      ],
    }),
    pageBreak(),
  ];

  // ── SECCIÓN 3 — Objetivos ──────────────────────────────────────────────
  const seccion3 = [
    h1('3. Objetivos de las Pruebas'),
    h2('3.1 Objetivo General'),
    para([txt('Verificar y validar que el Sistema REGINSA cumple con los requisitos funcionales, de rendimiento, de seguridad y de calidad de código establecidos, identificando hallazgos y proporcionando recomendaciones accionables alineadas a estándares internacionales (ISTQB, ISO/IEC 25010, ISO/IEC 29119, OWASP WSTG).')]),

    h2('3.2 Categorías de Prueba y Herramientas Utilizadas'),
    para([txt('El presente ciclo de pruebas cubre cinco categorías técnicas, diferenciadas por su naturaleza de ejecución y el tipo de artefacto evaluado:')]),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableRow(['Categoría', 'Naturaleza', 'Herramienta', 'Qué evalúa'], true),
        tableRow([
          'Pruebas Funcionales E2E',
          'Ejecución dinámica sobre navegador real',
          'Playwright + Allure',
          'Flujos completos de usuario: Login, Alta de Administrado, Registro de Sanción, Reconsideración. Simula la navegación manual del operador verificando que cada pantalla y formulario funcione según los requisitos.',
        ]),
        tableRow([
          'Pruebas de API REST',
          'Ejecución dinámica sobre endpoints HTTP',
          'Newman (Postman)',
          'Contratos de la API: estructura de request/response, códigos de estado HTTP, reglas de negocio y validaciones de campos en cada endpoint del backend. No depende del navegador.',
        ]),
        tableRow([
          'Pruebas de Rendimiento',
          'Ejecución dinámica con carga simulada',
          'k6 + Grafana Cloud',
          'Comportamiento del sistema bajo N usuarios concurrentes: tiempos de respuesta, tasa de éxito, estabilidad de la API bajo carga. Métricas alineadas a ISTQB PT.',
        ]),
        tableRow([
          'Seguridad de Aplicación Web',
          'Ejecución dinámica — escaneo activo/pasivo',
          'OWASP ZAP',
          'Vulnerabilidades en tiempo de ejecución real: inyección SQL/XSS, headers de seguridad, CSRF, exposición de endpoints. Ejecuta requests reales contra el servidor QA siguiendo la metodología OWASP WSTG. Evalúa la aplicación "desde fuera" como un atacante.',
        ]),
        tableRow([
          'Seguridad Estática de Código (SAST)',
          'Análisis estático — sin ejecutar la app',
          'SonarQube + Semgrep + Gitleaks',
          'El código fuente es analizado sin ejecutarse. SonarQube detecta deuda técnica, bugs y code smells en .NET/Angular. Semgrep aplica reglas OWASP sobre patrones inseguros en el código (SQL concatenado, secrets hardcoded, funciones peligrosas). Gitleaks escanea el historial Git en busca de credenciales y tokens expuestos. Ninguna de estas herramientas levanta ni conecta al servidor QA.',
        ]),
        tableRow([
          'Seguridad de Dependencias (SCA)',
          'Análisis estático — sin ejecutar la app',
          'Trivy + OWASP DepCheck',
          'Auditoría de librerías de terceros (npm, NuGet, contenedores Docker). Compara las versiones instaladas contra la base de datos CVE/NVD y reporta vulnerabilidades conocidas (CVSS). No ejecuta código ni realiza requests al servidor.',
        ]),
        tableRow([
          'Accesibilidad Web',
          'Ejecución dinámica sobre navegador real',
          'Lighthouse (Chromium)',
          'Evalúa las páginas principales contra las pautas WCAG 2.1 (contraste, ARIA, navegación por teclado). Complementa las pruebas funcionales con métricas de usabilidad para usuarios con discapacidad.',
        ]),
        tableRow([
          'Consistencia Frontend/Backend',
          'Análisis manual + evidencia de ejecución',
          'Revisión QA (k6 / Newman)',
          'Validaciones presentes en el formulario Angular que no tienen respaldo en el backend .NET. Detectadas durante las pruebas funcionales y de rendimiento al observar que la API acepta datos que el frontend rechazaría. Categorizadas según OWASP A05:2021 — Defense-in-Depth gap.',
        ]),
      ],
    }),
    para([]),

    h2('3.3 Objetivos Específicos'),
    para([txt('• Validar los flujos funcionales principales mediante pruebas E2E automatizadas (Playwright).')]),
    para([txt('• Verificar el comportamiento de los endpoints de la API REST bajo condiciones normales y de borde (Newman).')]),
    para([txt('• Medir el rendimiento del sistema bajo carga simulada e identificar cuellos de botella (k6).')]),
    para([txt('• Identificar vulnerabilidades en tiempo de ejecución mediante escaneo activo OWASP ZAP.')]),
    para([txt('• Detectar patrones inseguros en el código fuente mediante análisis estático SAST/SCA (SonarQube, Semgrep, Trivy).')]),
    para([txt('• Documentar inconsistencias de validación entre la capa Angular y la API .NET.')]),

    h2('3.4 Criterios de Entrada (ISTQB)'),
    para([txt('• Ambiente de pruebas QA disponible y estable.')]),
    para([txt('• Datos de prueba preparados (no productivos).')]),
    para([txt('• Scripts de prueba actualizados y sin errores de compilación.')]),
    h2('3.5 Criterios de Salida (ISTQB)'),
    para([txt('• Todos los casos de prueba críticos han sido ejecutados.')]),
    para([txt('• Los hallazgos CRÍTICOS tienen plan de acción asignado.')]),
    para([txt('• Se ha generado el presente informe con la evidencia correspondiente.')]),
    pageBreak(),
  ];

  // ── SECCIÓN 4 — Limitaciones ───────────────────────────────────────────
  const seccion4 = [
    h1('4. Limitaciones del Ciclo de Pruebas'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableRow(['Limitación', 'Descripción', 'Impacto'], true),
        tableRow(['Ambiente', 'Las pruebas se ejecutaron en el entorno QA, no en producción.', 'Bajo']),
        tableRow(['Datos', 'Se utilizaron datos de prueba sintéticos, no datos reales de producción.', 'Bajo']),
        tableRow(['Herramientas', 'Algunas herramientas de seguridad usan versiones gratuitas con funcionalidad limitada.', 'Medio']),
        tableRow(['Tiempo', 'Las pruebas de carga se ejecutaron con un número limitado de usuarios virtuales.', 'Bajo']),
        tableRow(['Dependencias', 'Los servicios externos no estuvieron disponibles durante algunas ejecuciones.', 'Medio']),
      ],
    }),
    pageBreak(),
  ];

  // ── SECCIÓN 5 — Resumen Ejecutivo ─────────────────────────────────────
  const seccion5 = [
    h1('5. Resumen Ejecutivo'),
    para([txt(`Estado general del ciclo: ${semaforo}`, { bold: true, size: 11, color: critica > 0 ? 'DC143C' : alta > 0 ? 'FF6F00' : '2E7D32' })]),
    para([]),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableRow(['Área de Calidad (ISO 25010)', 'Estado', 'Total', 'CRÍTICOS', 'ALTOS', 'MEDIOS', 'BAJOS'], true),
        ...['Funcional', 'API', 'Performance', 'Seguridad', 'Accesibilidad', 'Inconsistencia-FvB'].map(tipo => {
          const label = tipo === 'Inconsistencia-FvB' ? 'Val. Frontend-Only' : tipo;
          const ths = hallazgos.filter(h => h.tipo_prueba === tipo);
          const c0 = ths.filter(h => h.severidad === 'CRITICA').length;
          const c1 = ths.filter(h => h.severidad === 'ALTA'   ).length;
          const c2 = ths.filter(h => h.severidad === 'MEDIA'  ).length;
          const c3 = ths.filter(h => h.severidad === 'BAJA'   ).length;
          if (ths.length === 0) return null;
          const st = c0 > 0 ? '🔴 CRÍTICO' : c1 > 0 ? '🟡 ADVERTENCIA' : '🟢 OK';
          return tableRow([label, st, String(ths.length), String(c0), String(c1), String(c2), String(c3)]);
        }).filter(Boolean),
        tableRow(['TOTAL', semaforo, String(hallazgos.length), String(critica), String(alta), String(media), String(baja)], false, AZUL_CLAR),
      ],
    }),
    pageBreak(),
  ];

  // ── SECCIÓN 6 — Resultados por Tipo ───────────────────────────────────
  const seccion6 = [h1('6. Resultados por Tipo de Prueba')];

  // Subsecciones simples (sin split por herramienta)
  const tiposSimples = [
    { titulo: '6.1 Pruebas Funcionales (Playwright/Allure)', tipo: 'Funcional' },
    { titulo: '6.2 Pruebas de API (Newman/Postman)',         tipo: 'API'        },
    { titulo: '6.3 Pruebas de Performance (k6)',             tipo: 'Performance'},
  ];

  for (const { titulo, tipo } of tiposSimples) {
    const sub = hallazgos.filter(h => h.tipo_prueba === tipo);
    seccion6.push(h2(titulo));
    if (sub.length === 0) {
      seccion6.push(para([txt('Sin hallazgos registrados para este tipo de prueba en el ciclo actual.', { italic: true, color: '757575' })]));
    } else {
      const c0 = sub.filter(h => h.severidad === 'CRITICA').length;
      const c1 = sub.filter(h => h.severidad === 'ALTA'   ).length;
      const c2 = sub.filter(h => h.severidad === 'MEDIA'  ).length;
      const c3 = sub.filter(h => h.severidad === 'BAJA'   ).length;
      seccion6.push(infoTable([['Total hallazgos', String(sub.length)], ['CRÍTICOS', String(c0)], ['ALTOS', String(c1)], ['MEDIOS', String(c2)], ['BAJOS', String(c3)]]));
      seccion6.push(para([]));
      seccion6.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          tableRow(['ID', 'Hallazgo', 'Significado', 'Severidad', 'Responsable', 'Recomendación'], true),
          ...sub.map(h => { const c = SEV_COLORS[h.severidad] ?? SEV_COLORS.BAJA; return new TableRow({ children: [cell(h.id, { bg: BLANCO, size: 8 }), cell(h.hallazgo, { bg: BLANCO, size: 8 }), cell(h.significado, { bg: BLANCO, size: 8 }), cell(h.severidad, { bg: c.bg, color: c.fg, size: 8 }), cell(h.responsable_sugerido, { bg: BLANCO, size: 8 }), cell(h.recomendacion, { bg: BLANCO, size: 8 })], margins: { top: 40, bottom: 40 } }); }),
        ],
      }));
    }
    seccion6.push(para([]));
  }

  // ── 6.4 Seguridad Web — OWASP ZAP ─────────────────────────────────────
  {
    const subZap = hallazgos.filter(h => h.tipo_prueba === 'Seguridad' && (h.herramienta ?? '').toLowerCase().includes('zap'));
    seccion6.push(h2('6.4 Seguridad Web — OWASP ZAP'));
    if (subZap.length === 0) {
      seccion6.push(para([txt('Sin hallazgos OWASP ZAP registrados en el ciclo actual.', { italic: true, color: '757575' })]));
    } else {
      const c0 = subZap.filter(h => h.severidad === 'CRITICA').length;
      const c1 = subZap.filter(h => h.severidad === 'ALTA'   ).length;
      const c2 = subZap.filter(h => h.severidad === 'MEDIA'  ).length;
      const c3 = subZap.filter(h => h.severidad === 'BAJA'   ).length;
      seccion6.push(infoTable([['Total hallazgos ZAP', String(subZap.length)], ['CRÍTICOS', String(c0)], ['ALTOS', String(c1)], ['MEDIOS', String(c2)], ['BAJOS', String(c3)]]));
      seccion6.push(para([]));
      seccion6.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          tableRow(['ID', 'Alerta', 'Descripción', 'Riesgo', 'Responsable', 'Solución'], true),
          ...subZap.map(h => { const c = SEV_COLORS[h.severidad] ?? SEV_COLORS.BAJA; return new TableRow({ children: [cell(h.id, { bg: BLANCO, size: 8 }), cell(h.hallazgo, { bg: BLANCO, size: 8 }), cell(h.significado, { bg: BLANCO, size: 8 }), cell(h.severidad, { bg: c.bg, color: c.fg, size: 8 }), cell(h.responsable_sugerido, { bg: BLANCO, size: 8 }), cell(h.recomendacion, { bg: BLANCO, size: 8 })], margins: { top: 40, bottom: 40 } }); }),
        ],
      }));
    }
    seccion6.push(para([]));
  }

  // ── 6.5 Seguridad de Dependencias — Trivy ─────────────────────────────
  {
    const subTrivy = hallazgos.filter(h => h.tipo_prueba === 'Seguridad' && (h.herramienta ?? '').toLowerCase().includes('trivy'));
    seccion6.push(h2('6.5 Seguridad de Dependencias — Trivy'));
    if (subTrivy.length === 0) {
      seccion6.push(para([txt('Sin hallazgos Trivy registrados en el ciclo actual.', { italic: true, color: '757575' })]));
    } else {
      const c0 = subTrivy.filter(h => h.severidad === 'CRITICA').length;
      const c1 = subTrivy.filter(h => h.severidad === 'ALTA'   ).length;
      const c2 = subTrivy.filter(h => h.severidad === 'MEDIA'  ).length;
      const c3 = subTrivy.filter(h => h.severidad === 'BAJA'   ).length;
      seccion6.push(infoTable([['Total CVEs Trivy', String(subTrivy.length)], ['CRÍTICOS', String(c0)], ['ALTOS', String(c1)], ['MEDIOS', String(c2)], ['BAJOS', String(c3)]]));
      seccion6.push(para([]));
      seccion6.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          tableRow(['ID', 'CVE / Paquete', 'Descripción', 'Severidad', 'Componente', 'Actualizar a'], true),
          ...subTrivy.map(h => { const c = SEV_COLORS[h.severidad] ?? SEV_COLORS.BAJA; return new TableRow({ children: [cell(h.id, { bg: BLANCO, size: 8 }), cell(h.hallazgo, { bg: BLANCO, size: 8 }), cell(h.significado, { bg: BLANCO, size: 8 }), cell(h.severidad, { bg: c.bg, color: c.fg, size: 8 }), cell(h.componente ?? '', { bg: BLANCO, size: 8 }), cell(h.recomendacion, { bg: BLANCO, size: 8 })], margins: { top: 40, bottom: 40 } }); }),
        ],
      }));
    }
    seccion6.push(para([]));
  }

  // ── 6.6 Accesibilidad (Lighthouse) ────────────────────────────────────
  {
    const subAcc = hallazgos.filter(h => h.tipo_prueba === 'Accesibilidad');
    seccion6.push(h2('6.6 Accesibilidad (Lighthouse)'));
    if (subAcc.length === 0) {
      seccion6.push(para([txt('Sin hallazgos registrados para este tipo de prueba en el ciclo actual.', { italic: true, color: '757575' })]));
    } else {
      const c0 = subAcc.filter(h => h.severidad === 'CRITICA').length;
      const c1 = subAcc.filter(h => h.severidad === 'ALTA'   ).length;
      const c2 = subAcc.filter(h => h.severidad === 'MEDIA'  ).length;
      const c3 = subAcc.filter(h => h.severidad === 'BAJA'   ).length;
      seccion6.push(infoTable([['Total hallazgos', String(subAcc.length)], ['CRÍTICOS', String(c0)], ['ALTOS', String(c1)], ['MEDIOS', String(c2)], ['BAJOS', String(c3)]]));
      seccion6.push(para([]));
      seccion6.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          tableRow(['ID', 'Hallazgo', 'Significado', 'Severidad', 'Responsable', 'Recomendación'], true),
          ...subAcc.map(h => { const c = SEV_COLORS[h.severidad] ?? SEV_COLORS.BAJA; return new TableRow({ children: [cell(h.id, { bg: BLANCO, size: 8 }), cell(h.hallazgo, { bg: BLANCO, size: 8 }), cell(h.significado, { bg: BLANCO, size: 8 }), cell(h.severidad, { bg: c.bg, color: c.fg, size: 8 }), cell(h.responsable_sugerido, { bg: BLANCO, size: 8 }), cell(h.recomendacion, { bg: BLANCO, size: 8 })], margins: { top: 40, bottom: 40 } }); }),
        ],
      }));
    }
    seccion6.push(para([]));
  }

  // ── 6.7 Detalle de Registros k6 ───────────────────────────────────────
  {
    seccion6.push(h2('6.7 Detalle de Registros Ejecutados en k6'));

    const anyK6Data = k6RegsC01 || k6RegsC02 || k6RegsC04;
    if (!anyK6Data) {
      seccion6.push(para([txt('Sin datos de registros k6. Ejecuta uno de los casos k6:01-04 primero.', { italic: true, color: '757575' })]));
    } else {

      // ── Función interna: mini-tabla de metadata ──────────────────────
      function metaTable(d) {
        const regs = d.registros || [];
        const ok   = regs.filter(r => (r.resultado || r.status) === 'OK' || r.status === 'ok').length;
        const tieneIPs = regs.some(r => r.ip && r.ip !== 'local');
        return infoTable([
          ['Run ID',        d.run_id  || '—'],
          ['Modo',          d.modo    || '—'],
          ['Fecha',         d.fecha   || '—'],
          ['Total',         String(regs.length)],
          ['Exitosos',      String(ok)],
          ['Con error',     String(regs.length - ok)],
          ...(tieneIPs && d.ip_pool ? [['IPs usadas', d.ip_pool]] : []),
        ]);
      }

      // ── 6.7.1 Caso 01 — Alta de Administrado ─────────────────────────
      if (k6RegsC01 && Array.isArray(k6RegsC01.registros) && k6RegsC01.registros.length > 0) {
        seccion6.push(h3('6.7.1 Caso 01 — Alta de Administrado (Entidad)'));
        seccion6.push(metaTable(k6RegsC01));
        seccion6.push(para([]));
        const r01 = k6RegsC01.registros;
        const tieneIPs01 = r01.some(r => r.ip && r.ip !== 'local');
        const cols01 = tieneIPs01
          ? ['N°', 'IP', 'RUC', 'Razón Social', 'Resultado', 'Timestamp']
          : ['N°',       'RUC', 'Razón Social', 'Resultado', 'Timestamp'];
        const statusColor01 = s => (s === 'OK' || s === 'ok') ? '28A745' : 'DC143C';
        seccion6.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: cols01.map(c => cell(c, { header: true })), tableHeader: true }),
            ...r01.map((r, i) => {
              const res = r.resultado || r.status || '—';
              const ts  = (r.timestamp || '').replace('T', ' ').slice(0, 16);
              const vals = tieneIPs01
                ? [String(i+1), r.ip||'local', r.ruc||'—', r.razonSocial||'—', res, ts]
                : [String(i+1),                r.ruc||'—', r.razonSocial||'—', res, ts];
              const bg = i % 2 === 0 ? GRIS : BLANCO;
              return new TableRow({ children: vals.map((v, vi) => {
                const isStatus = vi === vals.length - 2;
                return cell(v, { bg: isStatus ? 'FFFFFF' : bg, color: isStatus ? statusColor01(res) : '212121', size: 8 });
              })});
            }),
          ],
        }));
        seccion6.push(para([]));
      }

      // ── 6.7.2 Caso 02 — Registro de Infracción/Sanción ───────────────
      if (k6RegsC02 && Array.isArray(k6RegsC02.registros) && k6RegsC02.registros.length > 0) {
        seccion6.push(h3('6.7.2 Caso 02 — Registro de Infracción / Sanción'));
        seccion6.push(metaTable(k6RegsC02));
        seccion6.push(para([]));
        const r02 = k6RegsC02.registros;
        const tieneIPs02 = r02.some(r => r.ip && r.ip !== 'local');
        const cols02 = tieneIPs02
          ? ['N°', 'IP', 'Administrado N°', 'N° Expediente', 'N° Resolución', 'F. Resolución', 'F. Registro', 'Resultado']
          : ['N°',       'Administrado N°', 'N° Expediente', 'N° Resolución', 'F. Resolución', 'F. Registro', 'Resultado'];
        const statusColor02 = s => (s === 'OK' || s === 'ok') ? '28A745' : 'DC143C';
        seccion6.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: cols02.map(c => cell(c, { header: true })), tableHeader: true }),
            ...r02.map((r, i) => {
              const res = r.status || r.resultado || '—';
              const fechaReg = (r.fechaRegistro || r.timestamp || '').replace('T', ' ').slice(0, 16);
              const vals = tieneIPs02
                ? [String(i+1), r.ip||'local', String(r.idEntidad||'—'), r.expediente||'—', r.resolucion||'—', r.fechaResolucion||'—', fechaReg, res === 'ok' ? 'OK' : res]
                : [String(i+1),               String(r.idEntidad||'—'), r.expediente||'—', r.resolucion||'—', r.fechaResolucion||'—', fechaReg, res === 'ok' ? 'OK' : res];
              const bg = i % 2 === 0 ? GRIS : BLANCO;
              return new TableRow({ children: vals.map((v, vi) => {
                const isStatus = vi === vals.length - 1;
                return cell(v, { bg: isStatus ? 'FFFFFF' : bg, color: isStatus ? statusColor02(res) : '212121', size: 8 });
              })});
            }),
          ],
        }));
        seccion6.push(para([]));
      }

      // ── 6.7.3 Caso 04 — Reconsideración de Sanciones ─────────────────
      if (k6RegsC04 && Array.isArray(k6RegsC04.registros) && k6RegsC04.registros.length > 0) {
        seccion6.push(h3('6.7.3 Caso 04 — Reconsideración de Cabecera + Sanciones'));
        seccion6.push(metaTable(k6RegsC04));
        seccion6.push(para([]));
        const r04 = k6RegsC04.registros;
        const tieneIPs04 = r04.some(r => r.ip && r.ip !== 'local');
        const cols04 = tieneIPs04
          ? ['N°', 'IP', 'ID Cab.', 'N° Expediente', 'F. Modificación', 'N° Reconsideración', 'F. Reconsideración', 'Resultado']
          : ['N°',       'ID Cab.', 'N° Expediente', 'F. Modificación', 'N° Reconsideración', 'F. Reconsideración', 'Resultado'];
        const statusColor04 = s => s === 'OK' ? '28A745' : s === 'PARCIAL' ? 'FF8C00' : 'DC143C';
        seccion6.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: cols04.map(c => cell(c, { header: true })), tableHeader: true }),
            ...r04.map((r, i) => {
              const res = r.resultado || '—';
              const vals = tieneIPs04
                ? [String(i+1), r.ip||'local', String(r.idCabecera||'—'), r.expediente||'—', r.fechaModificacion||'—', r.numeroReconsideracion||'—', r.fechaReconsideracion||'—', res]
                : [String(i+1),               String(r.idCabecera||'—'), r.expediente||'—', r.fechaModificacion||'—', r.numeroReconsideracion||'—', r.fechaReconsideracion||'—', res];
              const bg = i % 2 === 0 ? GRIS : BLANCO;
              return new TableRow({ children: vals.map((v, vi) => {
                const isStatus = vi === vals.length - 1;
                return cell(v, { bg: isStatus ? 'FFFFFF' : bg, color: isStatus ? statusColor04(res) : '212121', size: 8 });
              })});
            }),
          ],
        }));
        seccion6.push(para([]));
      }

      // ── Resumen por IP ────────────────────────────────────────────────
      const allIps = new Set([
        ...(k6RegsC01?.registros || []).map(r => r.ip || 'local'),
        ...(k6RegsC02?.registros || []).map(r => r.ip || 'local'),
        ...(k6RegsC04?.registros || []).map(r => r.ip || 'local'),
      ]);
      if (allIps.size > 1 || (allIps.size === 1 && !allIps.has('local'))) {
        seccion6.push(h3('6.7.4 Resumen por IP'));
        const ipRows = Array.from(allIps).sort().map(ip => {
          const c01 = (k6RegsC01?.registros || []).filter(r => (r.ip || 'local') === ip).length;
          const c02 = (k6RegsC02?.registros || []).filter(r => (r.ip || 'local') === ip).length;
          const c04 = (k6RegsC04?.registros || []).filter(r => (r.ip || 'local') === ip).length;
          return tableRow([ip, String(c01), String(c02), String(c04), String(c01 + c02 + c04)]);
        });
        seccion6.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            tableRow(['IP Origen', 'Caso 01', 'Caso 02', 'Caso 04', 'Total'], true),
            ...ipRows,
          ],
        }));
        seccion6.push(para([]));
      }
    }
  }

  // ── 6.8 Inconsistencias de Validación Frontend vs Backend ─────────────
  {
    const fvbHalls = hallazgos.filter(h => h.tipo_prueba === 'Inconsistencia-FvB');
    seccion6.push(h2('6.8 Inconsistencias de Validación Frontend vs Backend'));
    if (fvbHalls.length === 0) {
      seccion6.push(para([txt('Sin inconsistencias registradas en el ciclo actual. Para documentar nuevas, editar: reportes/inconsistencias-fvb.json', { italic: true, color: '757575' })]));
    } else {
      seccion6.push(para([txt(
        'Las siguientes validaciones existen SOLO en el frontend Angular (Reactive Forms) y no en la capa de API backend. ' +
        'Cualquier cliente con token JWT puede bypassear el formulario y enviar datos inválidos directamente al endpoint, ' +
        'comprometiendo la integridad del sistema (OWASP A05:2021 — Security Misconfiguration / Defense-in-Depth gap).',
        { italic: true, size: 9, color: '444444' }
      )]));
      seccion6.push(para([]));

      const sevC = (s) => s === 'CRITICA' ? 'DC143C' : s === 'ALTA' ? 'FF6F00' : s === 'MEDIA' ? 'F9A825' : '2E7D32';
      const sevB = (s) => SEV_COLORS[s]?.bg ?? 'F1F8E9';

      // Tabla de inconsistencias
      seccion6.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              cell('Subtipo', { header: true, width: 8 }),
              cell('Flujo / Caso', { header: true, width: 15 }),
              cell('Endpoint', { header: true, width: 18 }),
              cell('Campo', { header: true, width: 10 }),
              cell('Validación Frontend', { header: true, width: 20 }),
              cell('Comportamiento API', { header: true, width: 18 }),
              cell('Severidad', { header: true, width: 8 }),
              cell('Estado', { header: true, width: 8 }),
            ],
            tableHeader: true,
          }),
          ...fvbHalls.map((h, i) => {
            const bg = i % 2 === 0 ? GRIS : BLANCO;
            const sev = h.severidad;
            const subtipo   = h.subtipo_fvb   || h.hallazgo?.split(']')[0]?.replace('[','') || '—';
            const partes    = h.componente_afectado?.split(' — ') || [];
            const flujo     = partes[0] || '—';
            const endpoint  = partes[1] || h.endpoint || '—';
            const campo     = h.hallazgo?.match(/campo '([^']+)'/)?.[1] || '—';
            const valFront  = h.significado?.match(/Validacion Angular: (.+)$/)?.[1] || '—';
            const compApi   = h.comportamiento_api || '—';
            return new TableRow({ children: [
              cell(subtipo,   { bg, size: 8 }),
              cell(flujo,     { bg, size: 8 }),
              cell(endpoint,  { bg, size: 8 }),
              cell(campo,     { bg, size: 8 }),
              cell(valFront,  { bg, size: 8 }),
              cell(compApi,   { bg, size: 8 }),
              cell(sev,       { bg: sevB(sev), color: sevC(sev), size: 8 }),
              cell(h.estado || 'ABIERTO', { bg, size: 8 }),
            ]});
          }),
        ],
      }));
      seccion6.push(para([]));

      // Resumen de recomendaciones agrupadas por responsable
      const porBackend = fvbHalls.filter(h => (h.responsable_sugerido || '').toLowerCase().includes('backend'));
      if (porBackend.length > 0) {
        seccion6.push(h3('Recomendaciones para Backend (.NET / FluentValidation)'));
        porBackend.forEach((h, i) => {
          seccion6.push(para([txt(`${i+1}. [${h.subtipo_fvb || '—'}] ${h.recomendacion || ''}`, { size: 9 })]));
        });
        seccion6.push(para([]));
      }
    }
  }

  seccion6.push(pageBreak());

  // ── SECCIÓN 7 — Tabla Maestra ──────────────────────────────────────────
  const seccion7 = [
    h1('7. Tabla Maestra de Hallazgos'),
    para([txt(`Total: ${hallazgos.length} hallazgos ordenados por severidad.`)]),
    para([]),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableRow(['ID', 'Herramienta', 'Hallazgo', 'Significado', 'Severidad', 'Componente', 'Responsable', 'Recomendación', 'Estado'], true),
        ...hallazgos.map(h => severityRow(h)),
      ],
    }),
    pageBreak(),
  ];

  // ── SECCIÓN 8 — Seguimiento ────────────────────────────────────────────
  const seccion8 = [
    h1('8. Seguimiento de Incidencias'),
    para([txt('La siguiente tabla debe ser actualizada por el equipo de desarrollo al asignar y resolver hallazgos:', { italic: true })]),
    para([]),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableRow(['ID', 'Hallazgo', 'Severidad', 'Responsable', 'Sprint', 'Estado', 'Fecha Límite', 'Fecha Cierre'], true),
        ...hallazgos.filter(h => h.severidad !== 'BAJA').map(h =>
          tableRow([h.id, h.hallazgo.substring(0, 60) + '...', h.severidad, h.responsable_sugerido, '', h.estado ?? 'ABIERTO', '', ''])
        ),
      ],
    }),
    pageBreak(),
  ];

  // ── SECCIÓN 9 — KPIs ───────────────────────────────────────────────────
  const totalPw  = hallazgos.filter(h => h.tipo_prueba === 'Funcional').length;
  const totalApi = hallazgos.filter(h => h.tipo_prueba === 'API').length;
  const totalSeg = hallazgos.filter(h => h.tipo_prueba === 'Seguridad').length;

  // KPIs de ejecución k6
  const totalK6Iters  = (k6RegsC01?.registros?.length || 0) + (k6RegsC02?.registros?.length || 0) + (k6RegsC04?.registros?.length || 0);
  const totalK6Ok     = (k6RegsC01?.registros || []).filter(r => r.resultado === 'OK').length
                      + (k6RegsC02?.registros || []).filter(r => r.status === 'ok' || r.status === 'OK').length
                      + (k6RegsC04?.registros || []).filter(r => r.resultado === 'OK').length;
  const tasaExitoK6   = totalK6Iters > 0 ? Math.round((totalK6Ok / totalK6Iters) * 100) : null;

  // Conteo de administrados únicos en caso01 (RUC)
  const rucsUnicos = k6RegsC01?.registros
    ? new Set(k6RegsC01.registros.map(r => r.ruc).filter(Boolean)).size
    : 0;

  // IPs únicas en todos los casos
  const ipsUnicas = new Set([
    ...(k6RegsC01?.registros || []).map(r => r.ip || 'local'),
    ...(k6RegsC02?.registros || []).map(r => r.ip || 'local'),
    ...(k6RegsC04?.registros || []).map(r => r.ip || 'local'),
  ]);

  const seccion9 = [
    h1('9. KPIs de Calidad — ISTQB / ISO/IEC 25010'),

    h2('9.1 Calidad del Código y Hallazgos'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableRow(['KPI (ISTQB)', 'Valor Actual', 'Umbral', 'Norma', 'Estado'], true),
        tableRow(['Defect Detection Rate – Funcional',    String(totalPw),  '0',  'ISTQB TM-3.4', totalPw  === 0 ? '🟢 Aprobado' : '🔴 Revisar']),
        tableRow(['Defect Detection Rate – API',          String(totalApi), '0',  'ISTQB TM-3.4', totalApi === 0 ? '🟢 Aprobado' : '🔴 Revisar']),
        tableRow(['Defect Detection Rate – Seguridad',    String(totalSeg), '≤ 5','ISO 25010 §6.2', totalSeg <= 5 ? '🟢 Aprobado' : '🔴 Revisar']),
        tableRow(['Critical Defects',                     String(critica),  '0',  'ISTQB TM-3.2', critica  === 0 ? '🟢 Aprobado' : '🔴 Crítico']),
        tableRow(['High Defects',                         String(alta),     '≤ 3','ISTQB TM-3.2', alta     <= 3  ? '🟡 Advertencia' : '🔴 Revisar']),
        tableRow(['Total Defects Ciclo',                  String(hallazgos.length), '≤ 20', 'IEEE 829', hallazgos.length <= 20 ? '🟢 Aprobado' : '🟡 Revisar']),
      ],
    }),
    para([]),

    h2('9.2 Cobertura y Ejecución k6'),
    totalK6Iters > 0
      ? new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            tableRow(['KPI Performance', 'Valor Actual', 'Umbral', 'Norma', 'Estado'], true),
            tableRow(['Total iteraciones ejecutadas',          String(totalK6Iters), '≥ 1', 'ISTQB PT-2.1', totalK6Iters >= 1 ? '🟢 Aprobado' : '🔴 Sin datos']),
            tableRow(['Iteraciones exitosas (todos los casos)', String(totalK6Ok),   '—',   'ISTQB PT-2.2', '—']),
            tableRow(['Tasa de éxito k6',                      tasaExitoK6 !== null ? `${tasaExitoK6}%` : '—', '≥ 80%', 'ISTQB PT-2.3', tasaExitoK6 !== null ? (tasaExitoK6 >= 80 ? '🟢 Aprobado' : '🔴 Revisar') : '—']),
            tableRow(['Administrados agregados (Caso 01)',       String(k6RegsC01?.registros?.length || 0), '≥ 1', 'RF-01', (k6RegsC01?.registros?.length || 0) >= 1 ? '🟢 Aprobado' : '⚠ Sin datos']),
            tableRow(['RUC únicos procesados (Caso 01)',         String(rucsUnicos), '—', 'RF-01', '—']),
            tableRow(['Sanciones registradas (Caso 02)',         String(k6RegsC02?.registros?.length || 0), '≥ 1', 'RF-02', (k6RegsC02?.registros?.length || 0) >= 1 ? '🟢 Aprobado' : '⚠ Sin datos']),
            tableRow(['Reconsideraciones procesadas (Caso 04)',  String(k6RegsC04?.registros?.length || 0), '≥ 1', 'RF-04', (k6RegsC04?.registros?.length || 0) >= 1 ? '🟢 Aprobado' : '⚠ Sin datos']),
            tableRow(['IPs de origen utilizadas',               String(ipsUnicas.size), '≥ 1', 'ISO 25010 §6.6', ipsUnicas.size >= 1 ? '🟢 OK' : '—']),
          ],
        })
      : para([txt('No hay datos de ejecución k6 disponibles. Ejecute al menos un caso k6 antes de generar el informe.', { italic: true, color: '757575' })]),
    para([]),

    h2('9.3 Métricas de Proceso (ISO/IEC 29119)'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableRow(['Métrica', 'Descripción', 'Valor', 'Referencia'], true),
        tableRow(['Test Execution Rate',       'Pruebas ejecutadas / planificadas', `${totalK6Iters} iter.`, 'ISO 29119-4 §8.2']),
        tableRow(['Defect Severity Index',     'Puntaje ponderado (C×4+A×3+M×2+B×1)', String(critica*4 + alta*3 + media*2 + baja), 'ISTQB TM-3.5']),
        tableRow(['Defect Density',            'Hallazgos por área funcional', hallazgos.length > 0 ? `${hallazgos.length} hall.` : '0', 'IEEE 1044']),
        tableRow(['Regression Test Coverage',  'Casos automatizados vs. funciones RF', `${totalK6Iters > 0 ? '4/4 RF' : '0/4 RF'}`, 'ISTQB TA-3.2']),
        tableRow(['Security Compliance',       'Pruebas OWASP ZAP ejecutadas', `${totalSeg > 0 ? 'Sí' : 'No'}`, 'OWASP WSTG']),
      ],
    }),
    pageBreak(),
  ];

  // ── SECCIÓN 10 — Recomendaciones ──────────────────────────────────────
  const sevOrder = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
  const sorted   = [...hallazgos].sort((a, b) => (sevOrder[a.severidad] ?? 4) - (sevOrder[b.severidad] ?? 4));

  const seccion10 = [
    h1('10. Recomendaciones Priorizadas'),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        tableRow(['#', 'Prioridad', 'Recomendación', 'Responsable', 'Esfuerzo', 'Sprint'], true),
        ...sorted.map((h, i) => {
          const prio     = h.severidad === 'CRITICA' ? '🔴 INMEDIATA' : h.severidad === 'ALTA' ? '🟠 ALTA' : h.severidad === 'MEDIA' ? '🟡 MEDIA' : '🟢 BAJA';
          const esfuerzo = h.severidad === 'CRITICA' ? '1-4h' : h.severidad === 'ALTA' ? '4-8h' : '8-16h';
          const sprint   = h.severidad === 'CRITICA' ? 'Inmediato' : h.severidad === 'ALTA' ? 'Sprint N+1' : 'Sprint N+2';
          return tableRow([String(i + 1), prio, h.recomendacion, h.responsable_sugerido, esfuerzo, sprint]);
        }),
      ],
    }),
    pageBreak(),
  ];

  // ── SECCIÓN 11 — Conclusiones ─────────────────────────────────────────
  const seccion11 = [
    h1('11. Conclusiones'),
    h2('11.1 Estado General del Sistema'),
    para([txt(`El sistema REGINSA presenta un ${semaforo} en el ciclo evaluado (${ciclo}). Se identificaron ${hallazgos.length} hallazgos en total: ${critica} CRÍTICOS, ${alta} ALTOS, ${media} MEDIOS y ${baja} BAJOS.`)]),
    h2('11.2 Principales Fortalezas'),
    para([txt('• Cobertura automatizada de los flujos funcionales principales.')]),
    para([txt('• Pipeline de seguridad multi-herramienta implementado y operativo.')]),
    para([txt('• Métricas de rendimiento monitoreadas con k6 y Grafana.')]),
    h2('11.3 Principales Riesgos'),
    ...(critica > 0 ? [para([txt(`• ⚠️  Existen ${critica} hallazgos CRÍTICOS que requieren atención INMEDIATA antes del siguiente release.`, { bold: true, color: 'DC143C' })])] : []),
    ...(alta > 0    ? [para([txt(`• Existen ${alta} hallazgos ALTOS que deben resolverse en el sprint siguiente.`)])]                                                               : []),
    h2('11.4 Acciones Críticas para el Siguiente Release'),
    ...(critica + alta > 0
      ? sorted.filter(h => h.severidad !== 'BAJA' && h.severidad !== 'MEDIA').slice(0, 5).map((h, i) =>
          para([txt(`${i + 1}. [${h.severidad}] ${h.recomendacion}`, { bold: h.severidad === 'CRITICA' })])
        )
      : [para([txt('No se identificaron acciones críticas pendientes en este ciclo.', { color: '2E7D32' })])]),
  ];

  // ── Documento final ────────────────────────────────────────────────────
  const doc = new Document({
    creator: meta.autora ?? 'Liz Vidal',
    title: `Informe QA REGINSA — ${ciclo}`,
    subject: 'Informe de Calidad de Software',
    keywords: 'QA, ISTQB, ISO 25010, REGINSA, Calidad de Software',
    description: `Informe de aseguramiento de calidad generado automáticamente por el framework QA de REGINSA. Autora: ${meta.autora}. Fecha: ${fechaHora}.`,
    sections: [{
      properties: {
        page: { margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1.2) } },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [txt(`REGINSA | Informe de Calidad de Software | Autora: ${meta.autora} | ${fechaHoy}`, { size: 8, color: '757575' })],
            alignment: AlignmentType.RIGHT,
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              txt('REGINSA | Informe de Calidad | Autora: Liz Vidal | ', { size: 8, color: '757575' }),
              txt(fechaHoy, { size: 8, color: '757575' }),
              txt('          Confidencial — Solo para uso interno del equipo de desarrollo', { size: 8, color: '9E9E9E', italic: true }),
            ],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      children: [
        ...portada,
        ...seccion1,
        ...seccion2,
        ...seccion3,
        ...seccion4,
        ...seccion5,
        ...seccion6,
        ...seccion7,
        ...seccion8,
        ...seccion9,
        ...seccion10,
        ...seccion11,
      ],
    }],
  });

  const outFile = path.join(INFORMES, `INFORME_QA_REGINSA_${fechaHoy}.docx`);
  const buffer  = await Packer.toBuffer(doc);
  fs.writeFileSync(outFile, buffer);

  console.log(`  💾  Guardado: ${outFile}`);
  console.log(`\n  Hallazgos incluidos: ${hallazgos.length}`);
  console.log(`  Estado: ${semaforo}`);
  console.log(`\n  Para abrir: start "${outFile}"\n`);
}

main().catch(err => {
  console.error('\n❌  Error generando Word:', err.message);
  console.error('    Verifica que la dependencia "docx" está instalada: npm install -D docx');
  process.exit(1);
});
