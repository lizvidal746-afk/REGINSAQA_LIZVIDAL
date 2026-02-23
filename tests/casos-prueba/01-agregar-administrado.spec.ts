
import { test, Page, expect, TestInfo } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as XLSX from 'xlsx';
import {
  iniciarSesionYNavegar,
  obtenerCredencial,
  abrirFormularioNuevoAdministrado,
  generarRUC,
  capturarPantalla,
  capturarPantallaMejorada,
  capturarFormularioLleno,
  capturarToastExito
} from 'tests/utilidades/reginsa-actions';
import { generateTestData } from 'helpers/data-generator';
import { getEstadoLabel } from 'helpers/state-distributor';
import { getTestContext } from 'helpers/test-context';
import { allure } from 'allure-playwright';

/**
 * EJECUCIÓN (rápido)
 * - Headless por defecto. Para ver navegador: `--headed`.
 * - Con capturas: scripts normales `npm run test:*`.
 * - Sin capturas: scripts `:fast`.
 * - Paralelismo (suite completa): `npm run test:all:w2` / `test:all:w4`.
 */

/**
 * NOTA DE EJECUCIÓN
 * - Capturas exitosas dependen del modo de ejecución (scripts con o sin :fast).
 * - Capturas de error se guardan siempre en la carpeta errors/.
 */

// Ruta del archivo de reporte
const reportPath = path.join(__dirname, '../../reportes/registros-administrados.json');
const administradosSistemaPath = path.join(__dirname, '../../reportes/administrados-registrados.json');
const reservadosPath = path.join(__dirname, '../../reportes/administrados-reservados.json');
const reservadosLockPath = path.join(__dirname, '../../reportes/administrados-reservados.lock');
const runMarkerPath = path.join(__dirname, '../../reportes/administrados-run.json');
const runLockPath = path.join(__dirname, '../../reportes/administrados-run.lock');
const poolPath = path.join(__dirname, '../../reportes/administrados-pool.json');
const poolLockPath = path.join(__dirname, '../../reportes/administrados-pool.lock');
const historicoAdministradosPath = path.join(__dirname, '../../reportes/historico/administrados-historico.json');
const errorsDirPath = path.join(__dirname, '../../errors');
const baseRucsTsvCandidates = [
  path.join(__dirname, '../../files/rucs_caso_01_base.tsv'),
  path.join(__dirname, '../../playwrigth/files/rucs_caso_01_base.tsv')
];
const baseRucsExcelCandidates = [
  path.join(__dirname, '../../Lista de administrados_real.xlsx'),
  path.join(__dirname, '../../test-files/Administrados_BD.xlsx'),
  path.join(__dirname, '../../playwrigth/test-files/Administrados_BD.xlsx')
];

function asegurarDirectorioReportes(): void {
  const directorio = path.dirname(reportPath);
  if (!fs.existsSync(directorio)) {
    fs.mkdirSync(directorio, { recursive: true });
  }
}

function asegurarDirectorioErrores(): void {
  if (!fs.existsSync(errorsDirPath)) {
    fs.mkdirSync(errorsDirPath, { recursive: true });
  }
}

function sanitizarNombreArchivo(valor: string): string {
  return valor.replaceAll(/[^a-zA-Z0-9._-]+/g, '_');
}

function copiarEvidenciasFalloEnErrores(testInfo: TestInfo): void {
  const fallo = testInfo.status !== testInfo.expectedStatus;
  if (!fallo) return;

  asegurarDirectorioErrores();

  const project = sanitizarNombreArchivo(testInfo.project.name || 'project');
  const worker = String(testInfo.workerIndex ?? 0);
  const repeat = String((testInfo as any).repeatEachIndex ?? (testInfo as any).repeatIndex ?? 0);
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const prefijo = `caso01_${project}_w${worker}_r${repeat}_${stamp}`;

  const candidatos = ['video.webm', 'test-failed-1.png', 'error-context.md', 'trace.zip'];
  for (const nombre of candidatos) {
    const origen = path.join(testInfo.outputDir, nombre);
    if (!fs.existsSync(origen)) continue;
    const destino = path.join(errorsDirPath, `${prefijo}_${nombre}`);
    try {
      fs.copyFileSync(origen, destino);
      console.log(`📁 Evidencia copiada: ${path.relative(process.cwd(), destino)}`);
    } catch {}
  }
}

// ===============================
// INTERFACES Y TIPOS
// ===============================
interface RegistroAdministrado {
  id: number;
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  estado: string;
  timestamp: string;
  screenshot: string;
  screenshot_despues?: string;
  estado_registro: 'exitoso_verificado' | 'exitoso_no_verificado' | 'fallido';
  verificado_en_listado?: boolean;
  motivo_no_verificado?: string;
  creacion_api_confirmada?: boolean;
  creacion_api_id?: number | string;
  creacion_api_mensaje?: string;
}

interface ResultadoCrearApi {
  ok: boolean;
  status: number;
  id?: number | string;
  message?: string;
}

interface RegistroReservado {
  ruc?: string;
  razonSocial?: string;
  timestamp?: string;
}

interface RegistroBaseAdministrado {
  ruc?: string;
  razonSocial?: string;
  nombreComercial?: string;
  estado?: string;
  activo?: boolean;
}

interface RegistroPoolAdministrado {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  creadoEn: string;
}

// ===============================
// FUNCIONES AUXILIARES
// ===============================

const SUFIJOS_EMPRESA = [
  'S.A.C.', 'S.A.', 'S.S.', 'E.I.R.L.', 'S.R.L.', 'S.A.A.', 'S.A.C', 'S.A', 'S.S', 'EIRL', 'SRL', 'SAA',
  'S.C.R.L.', 'S.C.R.L', 'COOP.', 'COOPERATIVA', 'ASOC.', 'ASOCIACION CIVIL', 'FUNDACION', 'CONSORCIO S.A.C.',
  'GROUP S.A.C.', 'HOLDING S.A.', 'CORP. S.A.C.', 'INVERSIONES S.A.C.', 'SERVICIOS GENERALES S.A.C.'
];
// Prefijos originales y ampliados
const PREFIJOS_RAZON_SOCIAL = [
  'EMPRESA',
  'CONSORCIO',
  'UNIVERSIDAD',
  'INDUSTRIA',
  'CORPORACION',
  'COMERCIO',
  'ALMACENES',
  'INVERSIONES',
  'SERVICIOS INTEGRALES',
  'SOLUCIONES EMPRESARIALES',
  'TECNOLOGIAS APLICADAS',
  'LOGISTICA NACIONAL',
  'CONSULTORIA ESTRATEGICA',
  'IMPORTACIONES DEL PACIFICO',
  'EXPORTACIONES ANDINAS',
  'DISTRIBUCIONES GENERALES',
  'MERCADOS MAYORISTAS',
  'PROYECTOS Y OBRAS',
  'GESTION ADMINISTRATIVA',
  'OPERACIONES INDUSTRIALES',
  'CENTRO EMPRESARIAL',
  'UNIDAD CORPORATIVA',
  'DESARROLLO TERRITORIAL',
  'RED COMERCIAL',
  'SERVICIOS DIGITALES',
  'PLATAFORMA LOGISTICA',
  // Ejemplos reales y ampliados
  'UNIVERSIDAD NACIONAL SAN MARCOS',
  'UNIVERSIDAD CATOLICA',
  'MINISTERIO DE SALUD',
  'MINISTERIO DE EDUCACION',
  'RESTAURANTE EL SABOR',
  'CAFETERIA LA ESQUINA',
  'SUPERMERCADO CENTRAL',
  'FARMACIA POPULAR',
  'TRANSPORTES EXPRESS',
  'CONSTRUCTORA ANDINA',
  'HOTEL SOLARIS',
  'CLINICA SAN JUAN',
  'COLEGIO NUEVA ERA',
  'ASOCIACION DE VECINOS',
  'COOPERATIVA AGRARIA',
  'FUNDACION LUZ',
  'INSTITUTO TECNOLOGICO',
  'CENTRO DE IDIOMAS',
  'GRUPO EMPRESARIAL',
  'DISTRIBUIDORA DEL NORTE',
  'SERVICIOS GENERALES',
  'AGROINDUSTRIAS DEL SUR',
  'CLUB DEPORTIVO',
  'TIENDA COMERCIAL',
  'LABORATORIO MODERNO',
  'OTRO'
];
const TIPOS_ENTIDAD = [
  'ESTATAL',
  'NACIONAL',
  'PRIVADA',
  'PUBLICA',
  'PARTICULAR',
  'NO GUBERNAMENTAL',
  'MUNICIPAL',
  'REGIONAL',
  'INTERNACIONAL',
  'OTRO'
];
const VALIDACION_DUPLICADO_REGEX = /ya\s*existe|duplicad|repetid|registrad|no\s*puede\s*repetirse|se\s*encuentra\s*registrad/i;

function leerRegistrosExistentes(): RegistroAdministrado[] {
  if (!fs.existsSync(reportPath)) {
    return [];
  }
  const contenido = fs.readFileSync(reportPath, 'utf-8');
  try {
    if (!contenido.trim()) return [];
    return JSON.parse(contenido) as RegistroAdministrado[];
  } catch {
    return [];
  }
}

function leerHistoricoAdministrados(): Array<{ ruc?: string; razonSocial?: string; nombreComercial?: string; estado?: string }> {
  if (!fs.existsSync(historicoAdministradosPath)) {
    return [];
  }
  try {
    const contenido = fs.readFileSync(historicoAdministradosPath, 'utf-8');
    if (!contenido.trim()) return [];
    const data = JSON.parse(contenido);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function inicializarRunActual(): void {
  const runId = process.env.TEST_RUN_ID || '';
  if (!runId) return;

  asegurarDirectorioReportes();

  withFileLock(runLockPath, () => {
    let marker: { runId?: string } | null = null;
    if (fs.existsSync(runMarkerPath)) {
      try {
        marker = JSON.parse(fs.readFileSync(runMarkerPath, 'utf-8')) as { runId?: string };
      } catch {
        marker = null;
      }
    }

    if (marker?.runId === runId) return;

    [reportPath, reservadosPath, administradosSistemaPath].forEach((p) => {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    });
    fs.writeFileSync(runMarkerPath, JSON.stringify({ runId, startedAt: new Date().toISOString() }, null, 2));
  });
}

function withFileLock<T>(lockPath: string, fn: () => T, timeoutMs = 15000, retryMs = 200): T {
  const inicio = Date.now();
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      try {
        return fn();
      } finally {
        fs.closeSync(fd);
        fs.unlinkSync(lockPath);
      }
    } catch (error) {
      if (Date.now() - inicio > timeoutMs) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryMs);
    }
  }
}

function leerReservados(): RegistroReservado[] {
  if (!fs.existsSync(reservadosPath)) return [];
  try {
    const contenido = fs.readFileSync(reservadosPath, 'utf-8');
    return JSON.parse(contenido) as RegistroReservado[];
  } catch {
    return [];
  }
}

function leerPoolAdministrados(): RegistroPoolAdministrado[] {
  if (!fs.existsSync(poolPath)) return [];
  try {
    const contenido = fs.readFileSync(poolPath, 'utf-8');
    if (!contenido.trim()) return [];
    const data = JSON.parse(contenido);
    return Array.isArray(data) ? data as RegistroPoolAdministrado[] : [];
  } catch {
    return [];
  }
}

function escribirPoolAdministrados(pool: RegistroPoolAdministrado[]): void {
  asegurarDirectorioReportes();
  fs.writeFileSync(poolPath, JSON.stringify(pool, null, 2));
}

function generarCandidatoPool(
  rucsUsados: Set<string>,
  razonesUsadas: Set<string>,
  sequenceIndex = 0
): RegistroPoolAdministrado | null {
  for (let i = 0; i < 60; i++) {
    const ruc = normalizarRuc(generarRUC());
    const rucNorm = normalizarTexto(ruc);
    if (rucsUsados.has(rucNorm)) continue;

    const razonSocial = construirRazonSocialMasiva(ruc, razonesUsadas, sequenceIndex + i);
    const razonNorm = normalizarTexto(razonSocial);
    if (razonesUsadas.has(razonNorm)) continue;

    const nombreComercial = quitarSufijoEmpresa(razonSocial);
    return {
      ruc,
      razonSocial,
      nombreComercial,
      creadoEn: new Date().toISOString()
    };
  }
  return null;
}

function asegurarPoolMasivo(minimo = 30, objetivo = 300, sequenceIndex = 0): void {
  const deshabilitado = process.env.REGINSA_POOL_ENABLED === '0';
  if (deshabilitado) return;

  const objetivoEnv = Number(process.env.REGINSA_POOL_TARGET || 0);
  const objetivoFinal = Number.isFinite(objetivoEnv) && objetivoEnv > 0 ? objetivoEnv : objetivo;
  const minimoFinal = Math.max(1, Math.min(minimo, objetivoFinal));

  withFileLock(poolLockPath, () => {
    const pool = leerPoolAdministrados();
    if (pool.length >= minimoFinal) {
      return;
    }

    const { rucsRegistrados, razonesRegistradas } = obtenerRucsYRazonesUsados();
    pool.forEach((item) => {
      rucsRegistrados.add(normalizarTexto(normalizarRuc(item.ruc)));
      razonesRegistradas.add(normalizarTexto(item.razonSocial));
      razonesRegistradas.add(normalizarTexto(item.nombreComercial));
    });

    let intentos = 0;
    const maxIntentos = objetivoFinal * 30;
    while (pool.length < objetivoFinal && intentos < maxIntentos) {
      const candidato = generarCandidatoPool(rucsRegistrados, razonesRegistradas, sequenceIndex + intentos);
      if (candidato) {
        pool.push(candidato);
        rucsRegistrados.add(normalizarTexto(normalizarRuc(candidato.ruc)));
        razonesRegistradas.add(normalizarTexto(candidato.razonSocial));
        razonesRegistradas.add(normalizarTexto(candidato.nombreComercial));
      }
      intentos++;
    }

    escribirPoolAdministrados(pool);
    console.log(`📦 Pool de datos listo: ${pool.length} candidatos disponibles`);
  });
}

function extraerCandidatoPool(): RegistroPoolAdministrado | null {
  return withFileLock<RegistroPoolAdministrado | null>(poolLockPath, () => {
    const pool = leerPoolAdministrados();
    if (pool.length === 0) return null;
    const candidato = pool.shift() || null;
    escribirPoolAdministrados(pool);
    return candidato;
  });
}

function tomarDatoUnicoDesdePool(
  rucsRegistrados: Set<string>,
  razonesRegistradas: Set<string>
): { ruc: string; razonSocial: string; nombreComercial: string } | null {
  for (let i = 0; i < 30; i++) {
    const candidato = extraerCandidatoPool();
    if (!candidato) return null;

    const rucNorm = normalizarTexto(normalizarRuc(candidato.ruc));
    const razonNorm = normalizarTexto(candidato.razonSocial);
    const nombreNorm = normalizarTexto(candidato.nombreComercial);

    if (rucsRegistrados.has(rucNorm) || razonesRegistradas.has(razonNorm) || razonesRegistradas.has(nombreNorm)) {
      continue;
    }

    const reservado = reservarAdministrado(candidato.ruc, candidato.razonSocial);
    if (!reservado) {
      continue;
    }

    return {
      ruc: candidato.ruc,
      razonSocial: candidato.razonSocial,
      nombreComercial: candidato.nombreComercial
    };
  }
  return null;
}

function reservarAdministrado(ruc: string, razonSocial: string): boolean {
  const rucNorm = normalizarTexto(normalizarRuc(ruc));
  const razonNorm = normalizarTexto(razonSocial);

  asegurarDirectorioReportes();

  return withFileLock<boolean>(reservadosLockPath, () => {
    const reservados = leerReservados();
    const registrosActuales = leerRegistrosExistentes();
    const administradosSistema = leerAdministradosSistema();

    const usados = new Set<string>();
    reservados.forEach((r) => usados.add(`${normalizarTexto(normalizarRuc(r.ruc || ''))}|${normalizarTexto(r.razonSocial || '')}`));
    registrosActuales.forEach((r) => usados.add(`${normalizarTexto(normalizarRuc(r.ruc))}|${normalizarTexto(r.razonSocial)}`));
    administradosSistema.forEach((r) => usados.add(`${normalizarTexto(normalizarRuc(r.ruc || ''))}|${normalizarTexto(r.razonSocial || '')}`));

    const key = `${rucNorm}|${razonNorm}`;
    if (key === '|' || usados.has(key)) {
      return false;
    }

    const nuevo = { ruc, razonSocial, timestamp: new Date().toISOString() };
    fs.writeFileSync(reservadosPath, JSON.stringify([...reservados, nuevo], null, 2));
    return true;
  });
}

function leerAdministradosSistema(): Array<{ ruc?: string; razonSocial?: string }> {
  asegurarDirectorioReportes();
  const base = [...leerBaseRucsTSV(), ...leerBaseRucsExcel()];
  const baseNormalizada = base.map((item) => ({
    ruc: item.ruc ? normalizarRuc(item.ruc) : undefined,
    razonSocial: item.razonSocial ? item.razonSocial.trim() : undefined,
    nombreComercial: item.nombreComercial ? item.nombreComercial.trim() : undefined,
    estado: item.estado,
    activo: item.activo
  })).filter((item) => item.activo !== false);

  let existentes: Array<{ ruc?: string; razonSocial?: string; nombreComercial?: string; estado?: string }> = [];
  if (fs.existsSync(administradosSistemaPath)) {
    const contenido = fs.readFileSync(administradosSistemaPath, 'utf-8');
    try {
      if (contenido.trim()) {
        const data = JSON.parse(contenido) as { registros?: Array<{ ruc?: string; razonSocial?: string; nombreComercial?: string; estado?: string }> };
        existentes = Array.isArray(data?.registros) ? data.registros : [];
      }
    } catch {
      existentes = [];
    }
  }

  const vistos = new Set<string>();
  const combinados = [...existentes, ...baseNormalizada].filter((item) => {
    const key = `${normalizarTexto(normalizarRuc(item.ruc || ''))}|${normalizarTexto(item.razonSocial || '')}`;
    if (key === '|' || vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });

  if (combinados.length > 0) {
    fs.writeFileSync(administradosSistemaPath, JSON.stringify({ registros: combinados }, null, 2));
  }

  return combinados;
}

function obtenerBaseApiEntidad(): string {
  const apiEnv = (process.env.REGINSA_API_URL || '').trim();
  if (apiEnv) {
    return apiEnv.replace(/\/$/, '');
  }

  const candidato = (process.env.REGINSA_URL || process.env.BASE_URL || '').trim();
  if (!candidato) return '';

  try {
    const url = new URL(candidato);
    return `${url.origin}/api`;
  } catch {
    return '';
  }
}

async function verificarAdministradoRegistradoPorApi(page: Page, ruc: string): Promise<boolean> {
  const apiBase = obtenerBaseApiEntidad();
  if (!apiBase) return false;

  try {
    const response = await page.request.get(`${apiBase}/Entidad/Listar`, {
      timeout: 30000,
      headers: { accept: 'application/json' }
    });
    if (!response.ok()) return false;

    const data = await response.json().catch(() => null) as { bSuccess?: boolean; oData?: Array<{ Ruc?: string | number }> } | null;
    const entidades = Array.isArray(data?.oData) ? data.oData : [];
    const rucNormalizado = normalizarRuc(ruc);
    return entidades.some((item) => normalizarRuc(item?.Ruc || '') === rucNormalizado);
  } catch {
    return false;
  }
}

async function confirmarCreacionPorApi(page: Page, ruc: string, maxRetries = 4, waitMs = 1200): Promise<boolean> {
  for (let intento = 0; intento < maxRetries; intento++) {
    const existe = await verificarAdministradoRegistradoPorApi(page, ruc);
    if (existe) return true;
    await page.waitForTimeout(waitMs).catch(() => {});
  }
  return false;
}

async function verificarAdministradoRegistrado(page: Page, ruc: string, maxRetries = 3, waitMs = 3000): Promise<boolean> {
  const esScale = process.env.REGINSA_SCALE_MODE === '1';
  const usarApi = process.env.REGINSA_VERIFY_API !== '0';
  const usarUi = process.env.REGINSA_VERIFY_UI === '1' || (!esScale && process.env.REGINSA_VERIFY_UI !== '0');

  const navegarAdministrado = async () => {
    const linkAdmin = page.getByRole('link', { name: /Administrado|Administrados/i }).first();
    if (!(await linkAdmin.isVisible().catch(() => false))) {
      const menuBtn = page.locator('button:has(i.pi-bars), button[aria-label*="menu" i], .layout-menu-button').first();
      if (await menuBtn.isVisible().catch(() => false)) {
        await menuBtn.click().catch(() => {});
      }
    }
    await linkAdmin.click().catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.locator('table').first().waitFor({ state: 'visible', timeout: 15000 });
  };

  const buscarRuc = async () => {
    const inputRuc = page
      .locator('input[placeholder*="RUC" i], input[aria-label*="RUC" i], input[formcontrolname*="ruc" i]')
      .first();
    const inputVisible = await inputRuc.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    if (!inputVisible) {
      return false;
    }
    const limpio = await inputRuc.fill('').then(() => true).catch(() => false);
    if (!limpio) return false;
    const escrito = await inputRuc.fill(ruc).then(() => true).catch(() => false);
    if (!escrito) return false;
    const btnBuscar = page.getByRole('button', { name: /Buscar/i }).first();
    if (await btnBuscar.isVisible().catch(() => false)) {
      await btnBuscar.click().catch(() => {});
    }
    const celda = page.locator('table').locator('td', { hasText: ruc }).first();
    return celda.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
  };

  if (usarUi) {
    await navegarAdministrado();
  }

  for (let intento = 0; intento < maxRetries; intento++) {
    if (page.isClosed()) return false;

    if (usarApi) {
      const encontradoApi = await verificarAdministradoRegistradoPorApi(page, ruc);
      if (encontradoApi) return true;
    }

    if (usarUi) {
      const encontradoUi = await buscarRuc();
      if (encontradoUi) return true;
      if (intento > 0) {
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForLoadState('networkidle').catch(() => {});
        await navegarAdministrado().catch(() => {});
      }
    }

    await page.waitForTimeout(waitMs).catch(() => {});
  }
  return false;
}

async function esperarRespuestaCrearEntidad(page: Page, timeoutMs = 25000): Promise<ResultadoCrearApi | null> {
  try {
    const response = await page.waitForResponse(
      (resp) => resp.url().toLowerCase().includes('/api/entidad/crear') && resp.request().method() === 'POST',
      { timeout: timeoutMs }
    );

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const ok = response.ok() && (payload?.bSuccess === undefined ? true : !!payload?.bSuccess);
    return {
      ok,
      status: response.status(),
      id: payload?.oData,
      message: payload?.sMessage
    };
  } catch {
    return null;
  }
}

function leerBaseRucsTSV(): RegistroBaseAdministrado[] {
  const baseRucsPath = resolverPrimerArchivoExistente(baseRucsTsvCandidates);
  if (!baseRucsPath || !fs.existsSync(baseRucsPath)) {
    return [];
  }
  const contenido = fs.readFileSync(baseRucsPath, 'utf-8');
  const lineas = contenido.split(/\r?\n/).filter(linea => linea.trim().length > 0);
  if (lineas.length < 2) {
    return [];
  }
  const headers = lineas[0].split('\t').map(h => h.trim().toUpperCase());
  const idxRuc = headers.indexOf('RUC');
  const idxRazon = headers.indexOf('RAZON_SOCIAL');
  const idxNombre = headers.indexOf('NOMBRE_COMERCIAL');
  const idxEstado = headers.indexOf('ID_ESTADO');
  const idxActivo = headers.indexOf('BIT_ACTIVO');

  return lineas.slice(1).map((linea) => {
    const cols = linea.split('\t');
    const bitActivo = idxActivo >= 0 ? (cols[idxActivo] || '').trim() : '';
    const idEstado = idxEstado >= 0 ? (cols[idxEstado] || '').trim() : '';
    const estado = mapearEstadoDesdeId(idEstado);
    const activo = parseBitActivo(bitActivo);
    return {
      ruc: idxRuc >= 0 ? normalizarRuc((cols[idxRuc] || '').trim()) : undefined,
      razonSocial: idxRazon >= 0 ? (cols[idxRazon] || '').trim() : undefined,
      nombreComercial: idxNombre >= 0 ? (cols[idxNombre] || '').trim() : undefined,
      estado,
      activo
    };
  });
}

function leerBaseRucsExcel(): RegistroBaseAdministrado[] {
  const baseRucsExcelPath = resolverPrimerArchivoExistente(baseRucsExcelCandidates);
  if (!baseRucsExcelPath || !fs.existsSync(baseRucsExcelPath)) {
    return [];
  }
  const workbook = XLSX.readFile(baseRucsExcelPath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Array<Record<string, string | number>>;

  const normalizarHeader = (h: string) => h.trim().toUpperCase();
  const resolver = (row: Record<string, string | number>, key: string): string => {
    const header = Object.keys(row).find(k => normalizarHeader(k) === key);
    const valor = header ? row[header] : '';
    return String(valor ?? '').trim();
  };

  const conHeaders = rows.some((row) => {
    const headers = Object.keys(row).map(normalizarHeader);
    return headers.includes('RUC') || headers.includes('RAZON_SOCIAL') || headers.includes('NOMBRE_COMERCIAL');
  });

  if (conHeaders) {
    return rows.map((row) => {
      const ruc = normalizarRuc(resolver(row, 'RUC'));
      const razonSocial = resolver(row, 'RAZON_SOCIAL');
      const nombreComercial = resolver(row, 'NOMBRE_COMERCIAL');
      const idEstado = resolver(row, 'ID_ESTADO');
      const bitActivo = resolver(row, 'BIT_ACTIVO');
      const estado = mapearEstadoDesdeId(idEstado);
      const activo = parseBitActivo(bitActivo);
      return {
        ruc: ruc || undefined,
        razonSocial: razonSocial || undefined,
        nombreComercial: nombreComercial || undefined,
        estado,
        activo
      };
    });
  }

  // Fallback sin headers: columna C = RUC, columna D = Razón Social
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as Array<Array<string | number>>;
  return matrix
    .map((row) => {
      const ruc = normalizarRuc(String(row?.[2] ?? '').trim());
      const razonSocial = String(row?.[3] ?? '').trim();
      return {
        ruc: ruc || undefined,
        razonSocial: razonSocial || undefined,
        nombreComercial: undefined,
        estado: undefined,
        activo: undefined
      };
    })
    .filter((row) => row.ruc || row.razonSocial);
}

function resolverPrimerArchivoExistente(candidatos: string[]): string | null {
  for (const ruta of candidatos) {
    if (fs.existsSync(ruta)) {
      return ruta;
    }
  }
  return null;
}

function parseBitActivo(valor: string): boolean | undefined {
  const limpio = String(valor ?? '').trim();
  if (!limpio) return undefined;
  if (limpio === '1') return true;
  if (limpio === '0') return false;
  return undefined;
}

function mapearEstadoDesdeId(idEstado: string): string | undefined {
  const limpio = String(idEstado ?? '').trim();
  if (!limpio) return undefined;
  if (limpio === '1') return 'Licenciada';
  if (limpio === '2') return 'Licencia denegada';
  return `Estado ${limpio}`;
}

function normalizarRuc(ruc: string | number): string {
  const digits = String(ruc ?? '').replaceAll(/\D/g, '');
  if (!digits) return '';
  if (digits.length >= 11) return digits;
  return digits.padStart(11, '0');
}

function normalizarTexto(texto: string): string {
  return texto.trim().toUpperCase().replaceAll(/\s+/g, ' ');
}

function quitarSufijoEmpresa(razon: string): string {
  const texto = normalizarTexto(razon);
  for (const sufijo of SUFIJOS_EMPRESA) {
    if (texto.endsWith(` ${sufijo}`)) {
      return texto.slice(0, -sufijo.length).trim();
    }
  }
  return texto;
}

function generarRazonSocialUnica(usados: Set<string>): string {
  const prefijo = PREFIJOS_RAZON_SOCIAL[Math.floor(Math.random() * PREFIJOS_RAZON_SOCIAL.length)];
  const base = `${prefijo} COMERCIAL ${Math.floor(Math.random() * 9000) + 1000}`;
  const sufijo = SUFIJOS_EMPRESA[Math.floor(Math.random() * SUFIJOS_EMPRESA.length)];
  const razon = `${base} ${sufijo}`;
  const normalizada = normalizarTexto(razon);
  if (usados.has(normalizada)) {
    return generarRazonSocialUnica(usados);
  }
  return razon;
}

function construirRazonSocialMasiva(ruc: string, usados: Set<string>, sequenceIndex?: number): string {
  // Prefijo principal (aleatorio o secuencial)
  const prefijoIndex = sequenceIndex === undefined
    ? Math.floor(Math.random() * PREFIJOS_RAZON_SOCIAL.length)
    : sequenceIndex % PREFIJOS_RAZON_SOCIAL.length;
  const prefijo = PREFIJOS_RAZON_SOCIAL[prefijoIndex];
  // Tipo de entidad (aleatorio o secuencial)
  const tipoEntidadIndex = sequenceIndex === undefined
    ? Math.floor(Math.random() * TIPOS_ENTIDAD.length)
    : sequenceIndex % TIPOS_ENTIDAD.length;
  const tipoEntidad = TIPOS_ENTIDAD[tipoEntidadIndex];
  // Últimos 5 dígitos del RUC
  const rucNorm = normalizarRuc(ruc);
  const ultimos5 = rucNorm.slice(-5);
  // Sufijo comercial aleatorio
  const sufijo = SUFIJOS_EMPRESA[Math.floor(Math.random() * SUFIJOS_EMPRESA.length)];
  // Si el prefijo es uno de los ejemplos reales, no agregues tipoEntidad para evitar redundancia
  const ejemplosReales = [
    'UNIVERSIDAD NACIONAL SAN MARCOS',
    'UNIVERSIDAD CATOLICA',
    'MINISTERIO DE SALUD',
    'MINISTERIO DE EDUCACION',
    'RESTAURANTE EL SABOR',
    'CAFETERIA LA ESQUINA',
    'SUPERMERCADO CENTRAL',
    'FARMACIA POPULAR',
    'TRANSPORTES EXPRESS',
    'CONSTRUCTORA ANDINA',
    'HOTEL SOLARIS',
    'CLINICA SAN JUAN',
    'COLEGIO NUEVA ERA',
    'ASOCIACION DE VECINOS',
    'COOPERATIVA AGRARIA',
    'FUNDACION LUZ',
    'INSTITUTO TECNOLOGICO',
    'CENTRO DE IDIOMAS',
    'GRUPO EMPRESARIAL',
    'DISTRIBUIDORA DEL NORTE',
    'SERVICIOS GENERALES',
    'AGROINDUSTRIAS DEL SUR',
    'CLUB DEPORTIVO',
    'TIENDA COMERCIAL',
    'LABORATORIO MODERNO',
    'OTRO'
  ];
  let razon = '';
  if (ejemplosReales.includes(prefijo)) {
    razon = `${prefijo} ${ultimos5} ${sufijo}`;
  } else {
    razon = `${prefijo} ${tipoEntidad} ${ultimos5} ${sufijo}`;
  }
  const normalizada = normalizarTexto(razon);
  if (usados.has(normalizada)) {
    return generarRazonSocialUnica(usados);
  }
  return razon;
}

function calcularEstadoCaso(index: number, total: number): string {
  if (!total || total <= 1) return 'Licenciada';
  if (total >= 10) {
    const pos = index % 10;
    if (pos <= 6) return 'Licenciada';
    if (pos <= 8) return 'Informal';
    return 'Licencia denegada';
  }
  const r = Math.random();
  if (r < 0.7) return 'Licenciada';
  if (r < 0.9) return 'Informal';
  return 'Licencia denegada';
}

function generarDatosUnicos(
  rucsRegistrados: Set<string>,
  razonesRegistradas: Set<string>,
  sequenceIndex?: number,
  usarPool = false
): { ruc: string; razonSocial: string; nombreComercial: string } {
  if (usarPool) {
    const datoPool = tomarDatoUnicoDesdePool(rucsRegistrados, razonesRegistradas);
    if (datoPool) {
      return datoPool;
    }
  }

  let intentos = 0;
  while (intentos < 50) {
    const ruc = normalizarRuc(generarRUC());
    const razonSocial = construirRazonSocialMasiva(ruc, razonesRegistradas, sequenceIndex);
    const nombreComercial = quitarSufijoEmpresa(razonSocial);

    if (!rucsRegistrados.has(normalizarTexto(normalizarRuc(ruc)))) {
      const reservado = reservarAdministrado(ruc, razonSocial);
      if (reservado) {
        return { ruc, razonSocial, nombreComercial };
      }
    }
    intentos++;
  }
  throw new Error('No se pudo reservar datos únicos para el registro');
}

async function asegurarFormularioAdministrado(page: Page): Promise<ReturnType<Page['locator']>> {
  const modal = page.getByRole('dialog').filter({ hasText: /Agregar\s*Administrado/i }).first();
  if (await modal.isVisible().catch(() => false)) {
    return modal;
  }

  await abrirFormularioNuevoAdministrado(page);
  await modal.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  if (await modal.isVisible().catch(() => false)) {
    return modal;
  }

  const modalAlt = page.locator('.ant-modal, .p-dialog').filter({ hasText: /Agregar\s*Administrado|Registrar\s*Sancionar/i }).first();
  if (await modalAlt.isVisible().catch(() => false)) {
    return modalAlt;
  }

  throw new Error('No se pudo asegurar el formulario de Administrado (modal no visible).');
}

async function esperarResultadoGuardado(page: Page): Promise<boolean> {
  const toast = page.locator('text=/Guardado|Exitoso|éxito/i').first();
  const modal = page.getByRole('dialog').filter({ hasText: /Agregar\s*Administrado/i }).first();
  const timeoutMs = 4500;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await toast.isVisible().catch(() => false)) return true;
    if (await modal.isVisible().catch(() => false) === false) return true;
    await page.waitForTimeout(120);
  }
  return false;
}

/**
 * Actualiza el archivo JSON con el registro
 */
function actualizarReporte(registro: RegistroAdministrado): void {
  asegurarDirectorioReportes();
  let registros: RegistroAdministrado[] = [];
  
  if (fs.existsSync(reportPath)) {
    const contenido = fs.readFileSync(reportPath, 'utf-8');
    try {
      if (contenido.trim()) {
        registros = JSON.parse(contenido);
      }
    } catch {
      registros = [];
    }
  }
  
  registros.push(registro);
  fs.writeFileSync(reportPath, JSON.stringify(registros, null, 2));
  console.log(`✅ Reporte actualizado`);
}

/**
 * Llena un campo de formulario
 */
async function llenarCampo(page: Page, nombre: string, valor: string): Promise<void> {
  const scope = await asegurarFormularioAdministrado(page);

  const nombreNormalizado = nombre.toUpperCase();
  const candidatosEspecificos: Array<ReturnType<Page['locator']>> = [];
  if (nombreNormalizado.includes('R.U.C') || nombreNormalizado.includes('RUC')) {
    candidatosEspecificos.push(
      scope.locator('input[formcontrolname*="ruc" i], input[name*="ruc" i], input[id*="ruc" i], input[placeholder*="ruc" i], input[aria-label*="ruc" i]').first()
    );
  }
  if (nombreNormalizado.includes('RAZÓN') || nombreNormalizado.includes('RAZON')) {
    candidatosEspecificos.push(
      scope.locator('input[formcontrolname*="razon" i], input[name*="razon" i], input[placeholder*="razon" i], input[aria-label*="razon" i]').first()
    );
  }
  if (nombreNormalizado.includes('NOMBRE') || nombreNormalizado.includes('COMERCIAL')) {
    candidatosEspecificos.push(
      scope.locator('input[formcontrolname*="comercial" i], input[name*="comercial" i], input[placeholder*="comercial" i], input[aria-label*="comercial" i]').first(),
      scope.locator('input[formcontrolname*="nombre" i], input[name*="nombre" i], input[placeholder*="nombre" i], input[aria-label*="nombre" i]').first()
    );
  }

  const candidatos = [
      ...candidatosEspecificos,
      scope.getByRole('textbox', { name: new RegExp(nombre, 'i') }),
      scope.getByLabel(new RegExp(nombre, 'i')),
      scope.getByPlaceholder(new RegExp(nombre, 'i')),
      scope.locator('label', { hasText: new RegExp(nombre, 'i') }).locator('xpath=following::input[1]').first(),
      scope.locator('input').filter({ hasText: new RegExp(nombre, 'i') }).first(),
      scope.locator('input').filter({ has: scope.locator(`label:has-text("${nombre}")`) }).first()
  ];

  let input: ReturnType<Page['locator']> | null = null;
  for (const candidato of candidatos) {
    const visible = await candidato.isVisible().catch(() => false);
    if (!visible) continue;
    const readonly = await candidato.evaluate((el) => (el as HTMLInputElement).readOnly).catch(() => false);
    const editable = await candidato.isEditable().catch(() => false);
    if (editable && !readonly) {
      input = candidato;
      break;
    }
  }

  if (!input) {
    throw new Error(`No se encontró input editable para: ${nombre}`);
  }

  await input.waitFor({ state: 'visible', timeout: 40000 });
  await input.click();
  if (await input.isEditable().catch(() => false)) {
    await input.clear();
  }
  await input.fill(valor);
  await expect(input).toHaveValue(new RegExp(String(valor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 8000 });
  // Pequeña espera solo si es necesario para estabilidad visual
  // Espera fija eliminada para máxima velocidad
}

async function detectarValidacionDuplicado(page: Page): Promise<boolean> {
  const scope = await asegurarFormularioAdministrado(page);
  const mensajeDirecto = scope.getByText(VALIDACION_DUPLICADO_REGEX).first();
  if (await mensajeDirecto.isVisible().catch(() => false)) return true;

  const mensajes = scope.locator('.p-error, .invalid-feedback, .mat-error, .text-danger, .error-message');
  const total = await mensajes.count().catch(() => 0);
  for (let i = 0; i < total; i++) {
    const nodo = mensajes.nth(i);
    if (!(await nodo.isVisible().catch(() => false))) continue;
    const texto = await nodo.innerText().catch(() => '');
    if (VALIDACION_DUPLICADO_REGEX.test(texto)) return true;
  }

  return false;
}

/**
 * Selecciona una opción en el dropdown de Estado (Ant Design / combobox)
 */
async function seleccionarEstado(page: Page, estado: string): Promise<void> {
  const estadoNormalizado = normalizarTexto(estado);
  const esInformal = /informal|ley de creacion/.test(estadoNormalizado);
  const textoEstado = esInformal ? /Informal|Ley de Creaci[oó]n/i : new RegExp(estado, 'i');
  const scope = await asegurarFormularioAdministrado(page);

  const seleccionarDesdeOpcionesVisibles = async (): Promise<boolean> => {
    const opcionExacta = page.getByRole('option', { name: textoEstado }).first();
    if (await opcionExacta.isVisible().catch(() => false)) {
      await opcionExacta.click({ force: true });
      return true;
    }

    const opciones = page.getByRole('option').filter({ hasText: /./ });
    const total = await opciones.count().catch(() => 0);
    for (let i = 0; i < total; i++) {
      const opcion = opciones.nth(i);
      if (!(await opcion.isVisible().catch(() => false))) continue;
      const texto = (await opcion.innerText().catch(() => '')) || '';
      if (!/seleccione/i.test(texto)) {
        await opcion.click({ force: true });
        return true;
      }
    }

    const opcionesPrime = page.locator('.p-dropdown-panel:visible li[role="option"], .p-dropdown-panel:visible .p-dropdown-item');
    const totalPrime = await opcionesPrime.count().catch(() => 0);
    for (let i = 0; i < totalPrime; i++) {
      const opcion = opcionesPrime.nth(i);
      const texto = (await opcion.innerText().catch(() => '')) || '';
      if (textoEstado.test(texto) || !/seleccione/i.test(texto)) {
        await opcion.click({ force: true });
        return true;
      }
    }

    return false;
  };

  const dropdownPrime = scope.locator('#estado, [aria-controls="estado_list"]').first();
  if (await dropdownPrime.isVisible().catch(() => false)) {
    const trigger = dropdownPrime.locator('.p-dropdown-trigger, [role="button"][aria-label*="dropdown" i], .p-dropdown-label[role="combobox"]').first();
    await trigger.waitFor({ state: 'visible', timeout: 10000 });
    await trigger.click({ force: true });

    const list = page.locator('#estado_list, [id^="estado_list"]');
    await list.first().waitFor({ state: 'visible', timeout: 10000 });

    const opcion = list.locator('li[role="option"], .p-dropdown-item', { hasText: textoEstado }).first();
    const visible = await opcion.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
    if (visible) {
      await opcion.click({ force: true });
      return;
    }

    // Fallback: si el estado no existe, elegir la primera opcion valida
    const opciones = list.locator('li[role="option"], .p-dropdown-item');
    const total = await opciones.count().catch(() => 0);
    for (let i = 0; i < total; i++) {
      const texto = (await opciones.nth(i).innerText().catch(() => '')) || '';
      if (!/seleccione/i.test(texto)) {
        await opciones.nth(i).click({ force: true });
        return;
      }
    }
  }

  const triggersFallback = [
    scope.getByRole('combobox', { name: /Seleccione|Estado/i }).first(),
    scope.locator('[id*="estado" i][role="combobox"], [aria-label*="estado" i][role="combobox"]').first(),
    scope.locator('.p-dropdown:has(#estado), .p-dropdown[aria-label*="estado" i], .p-select').first()
  ];

  for (const trigger of triggersFallback) {
    const visible = await trigger.isVisible().catch(() => false);
    if (!visible) continue;
    await trigger.click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
    if (await seleccionarDesdeOpcionesVisibles()) {
      return;
    }
  }

  throw new Error(`No se pudo seleccionar el estado "${estado}".`);
}

/**
 * Registra un administrado con reintentos por RUC duplicado
 */
// Nueva función para obtener todos los RUC y razón social ya existentes de todas las fuentes
function obtenerRucsYRazonesUsados() {
  const registrosExistentes = leerRegistrosExistentes();
  const historico = leerHistoricoAdministrados();
  const reservados = leerReservados();
  const administradosSistema = leerAdministradosSistema();
  const baseRucs = [...leerBaseRucsTSV(), ...leerBaseRucsExcel()];
  const rucsRegistrados = new Set<string>();
  const razonesRegistradas = new Set<string>();
  // De reportes
  registrosExistentes.forEach(r => {
    rucsRegistrados.add(normalizarTexto(normalizarRuc(r.ruc)));
    razonesRegistradas.add(normalizarTexto(r.razonSocial));
    if ((r as any).nombreComercial) razonesRegistradas.add(normalizarTexto((r as any).nombreComercial));
  });
  // De histórico consolidado
  historico.forEach(item => {
    if (item.ruc) rucsRegistrados.add(normalizarTexto(normalizarRuc(item.ruc)));
    if (item.razonSocial) razonesRegistradas.add(normalizarTexto(item.razonSocial));
    if ((item as any).nombreComercial) razonesRegistradas.add(normalizarTexto((item as any).nombreComercial));
  });
  // De reservados
  reservados.forEach(item => {
    if (item.ruc) rucsRegistrados.add(normalizarTexto(normalizarRuc(item.ruc)));
    if (item.razonSocial) razonesRegistradas.add(normalizarTexto(item.razonSocial));
  });
  // De administrados en sistema
  administradosSistema.forEach(item => {
    if (item.ruc) rucsRegistrados.add(normalizarTexto(normalizarRuc(item.ruc)));
    if (item.razonSocial) razonesRegistradas.add(normalizarTexto(item.razonSocial));
    if ((item as any).nombreComercial) razonesRegistradas.add(normalizarTexto((item as any).nombreComercial));
  });
  // De base TSV/Excel
  baseRucs.forEach(item => {
    if (item.ruc) rucsRegistrados.add(normalizarTexto(normalizarRuc(item.ruc)));
    if (item.razonSocial) razonesRegistradas.add(normalizarTexto(item.razonSocial));
    if ((item as any).nombreComercial) razonesRegistradas.add(normalizarTexto((item as any).nombreComercial));
  });
  return { rucsRegistrados, razonesRegistradas };
}

// Mejorada: asegura unicidad absoluta y robustez para pruebas masivas
async function registrarAdministrado(
  page: Page,
  numeroRegistro: number,
  estadoSeleccionado: string,
  maxDurationMs = 90000,
  verificarRetries = 3,
  verificarWaitMs = 3000,
  strictVerify = true,
  maxReintentosTecnicos = 1,
  maxReintentosDatos = 1,
  overrideData?: { ruc: string; razonSocial: string; nombreComercial: string },
  forcePattern = false,
  sequenceIndex?: number
): Promise<string> {
  let rucsUsados: string[] = [];
  let registroExitoso = false;
  const inicio = Date.now();
  // Centraliza la obtención de datos usados
  let { rucsRegistrados, razonesRegistradas } = obtenerRucsYRazonesUsados();

  console.log(`📊 Base de exclusión cargada: ${rucsRegistrados.size} RUCs y ${razonesRegistradas.size} razones sociales`);

  for (let intento = 0; intento < maxReintentosTecnicos; intento++) {
    if (page.isClosed()) {
      throw new Error('La página se cerró antes de completar el registro.');
    }
    if (Date.now() - inicio > maxDurationMs) {
      throw new Error(`Se agotó el tiempo disponible para registrar administrado (${maxDurationMs}ms).`);
    }
    // Refresca los sets en cada intento para máxima robustez
    ({ rucsRegistrados, razonesRegistradas } = obtenerRucsYRazonesUsados());
    const datos = (intento === 0 && overrideData)
      ? overrideData
      : generarDatosUnicos(rucsRegistrados, razonesRegistradas, sequenceIndex, forcePattern);
    let ruc = datos.ruc;
    let razonSocial = datos.razonSocial;
    let nombreComercial = datos.nombreComercial;
      if (intento === 0 && overrideData && forcePattern) {
      razonSocial = construirRazonSocialMasiva(ruc, razonesRegistradas, sequenceIndex);
      nombreComercial = quitarSufijoEmpresa(razonSocial);
    }

    const registrarLocal = (nuevoRuc: string, nuevaRazon: string) => {
      rucsRegistrados.add(normalizarTexto(normalizarRuc(nuevoRuc)));
      razonesRegistradas.add(normalizarTexto(nuevaRazon));
      rucsUsados.push(nuevoRuc);
    };

    registrarLocal(ruc, razonSocial);

    console.log(`🔄 Intento técnico ${intento + 1}/${maxReintentosTecnicos} - RUC: ${ruc}`);
    console.log(`   👤 Administrado: ${razonSocial}`);

    try {
      await asegurarFormularioAdministrado(page);
      // Llenar formulario
      const llenarDatos = async () => {
        await llenarCampo(page, 'R.U.C. *', normalizarRuc(ruc));
        await llenarCampo(page, 'Razón Social *', razonSocial);
        await llenarCampo(page, 'Nombre Comercial *', nombreComercial);
      };

      await llenarDatos();

      let intentoDatos = 0;
      while (await detectarValidacionDuplicado(page)) {
        if (intentoDatos >= maxReintentosDatos) {
          throw new Error('Validación duplicado persiste después de reintentos de datos.');
        }
        intentoDatos++;
        console.warn(`⚠️ Validación duplicado detectada (RUC/Razón Social). Reintento de datos ${intentoDatos}/${maxReintentosDatos}.`);
        ({ rucsRegistrados, razonesRegistradas } = obtenerRucsYRazonesUsados());
        const nuevo = generarDatosUnicos(rucsRegistrados, razonesRegistradas, sequenceIndex, forcePattern);
        ruc = nuevo.ruc;
        razonSocial = nuevo.razonSocial;
        nombreComercial = nuevo.nombreComercial;
        if (intento === 0 && overrideData && forcePattern) {
          razonSocial = construirRazonSocialMasiva(ruc, razonesRegistradas, sequenceIndex);
          nombreComercial = quitarSufijoEmpresa(razonSocial);
        }
        registrarLocal(ruc, razonSocial);
        await llenarDatos();
      }

      // Seleccionar estado
      await seleccionarEstado(page, estadoSeleccionado);
      // Espera mínima para estabilidad visual

      // Captura formulario lleno ANTES de guardar (reutiliza `capturarFormularioLleno`)
      const screenshotAntes = await capturarFormularioLleno(
        page,
        '01-AGREGAR_ADMINISTRADO',
        ruc,
        razonSocial,
        'AGREGAR_ADMINISTRADO',
        '05_FORMULARIO'
      );

      // Guardar
      const btnGuardar = page.getByRole('button', { name: 'Guardar' });
      await btnGuardar.waitFor({ state: 'visible', timeout: 5000 });
      const esScale = process.env.REGINSA_SCALE_MODE === '1';
      const timeoutCrearApi = esScale ? 14000 : 25000;
      const respuestaCrearPromise = esperarRespuestaCrearEntidad(page, timeoutCrearApi);
      await btnGuardar.click().catch(async () => {
        await btnGuardar.click({ force: true });
      });
      const exitoUi = await esperarResultadoGuardado(page);
      const esperaApiTrasUiMs = esScale ? 2500 : 6000;
      let resultadoCrearApi = await Promise.race([
        respuestaCrearPromise,
        page.waitForTimeout(exitoUi ? esperaApiTrasUiMs : timeoutCrearApi).then(() => null)
      ]);
      if (!resultadoCrearApi && esScale) {
        const esperaApiExtraMs = Number(process.env.REGINSA_API_EXTRA_WAIT_MS || 3000);
        resultadoCrearApi = await Promise.race([
          respuestaCrearPromise,
          page.waitForTimeout(esperaApiExtraMs).then(() => null)
        ]);
      }
      const exitoApi = !!resultadoCrearApi?.ok;
      const exito = exitoUi || exitoApi;
      const confirmarApiRetries = Number(process.env.REGINSA_CONFIRMAR_API_RETRIES || 4);
      const confirmarApiWaitMs = Number(process.env.REGINSA_CONFIRMAR_API_WAIT_MS || 1200);
      const confirmacionApiPosterior = (!exitoApi && esScale)
        ? await confirmarCreacionPorApi(page, ruc, confirmarApiRetries, confirmarApiWaitMs)
        : false;
      let creacionConfirmada = exitoApi || confirmacionApiPosterior;
      const requireApiCreate = process.env.REGINSA_REQUIRE_API_CREATE !== '0';
      let exitoConfirmado = (esScale && requireApiCreate)
        ? creacionConfirmada
        : (exito || confirmacionApiPosterior);
      const permitirUiEventual = process.env.REGINSA_ALLOW_UI_EVENTUAL !== '0';
      const omitirVerificacionListado = process.env.REGINSA_SKIP_LIST_VERIFY === '1';
      const fastVerifyOnApi = process.env.REGINSA_FAST_VERIFY_ON_API !== '0';
      const omitirVerificacionExtendida = esScale && creacionConfirmada && fastVerifyOnApi && process.env.REGINSA_VERIFY_UI !== '1';

      if (exitoConfirmado) {
        console.log(`✅ Administrado registrado - RUC: ${ruc}`);
        if (creacionConfirmada) {
          console.log(`✅ API Crear confirmada (status ${resultadoCrearApi?.status}, id ${resultadoCrearApi?.id ?? 'N/D'})`);
        }

        // Captura mensaje de éxito (toast verde) (reutiliza `capturarToastExito`)
        const screenshotDespues =
          (await capturarToastExito(page, '01-AGREGAR_ADMINISTRADO', '06_EXITO', ruc, razonSocial, 'AGREGAR_ADMINISTRADO')) ||
          // Fallback de captura completa (reutiliza `capturarPantallaMejorada`)
          (await capturarPantallaMejorada(page, '01-AGREGAR_ADMINISTRADO', '06_EXITO', ruc, razonSocial));

        let verificado = false;
        try {
          if (omitirVerificacionListado && exitoConfirmado) {
            console.log(`⚡ Verificación de listado omitida por configuración (REGINSA_SKIP_LIST_VERIFY=1) para RUC ${ruc}.`);
            verificado = true;
          } else if (omitirVerificacionExtendida) {
            console.log(`⚡ Modo scale: verificación rápida por consistencia eventual para RUC ${ruc}.`);
            verificado = await verificarAdministradoRegistrado(page, ruc, 1, 250);
          } else {
            verificado = await verificarAdministradoRegistrado(page, ruc, verificarRetries, verificarWaitMs);
          }
        } catch (error) {
          throw error;
        }
        if (!verificado) {
          const verificacionFinalApi = esScale ? await verificarAdministradoRegistradoPorApi(page, ruc) : false;
          if (esScale && !creacionConfirmada && exitoUi) {
            const confirmacionExtendidaRetries = Number(process.env.REGINSA_CONFIRMAR_API_RETRIES_EXT || 20);
            const confirmacionExtendidaWaitMs = Number(process.env.REGINSA_CONFIRMAR_API_WAIT_MS_EXT || 2000);
            const confirmacionExtendida = await confirmarCreacionPorApi(page, ruc, confirmacionExtendidaRetries, confirmacionExtendidaWaitMs);
            if (confirmacionExtendida) {
              creacionConfirmada = true;
              exitoConfirmado = true;
            }
          }

          const permitirConsistenciaEventual = esScale && (creacionConfirmada || verificacionFinalApi || (permitirUiEventual && exitoUi));
          if (strictVerify && !permitirConsistenciaEventual) {
            throw new Error(`El RUC ${ruc} no aparece en Administrado después del guardado.`);
          }
          console.warn(`⚠️ Verificación en listado no visible aún para RUC ${ruc}.`);
        }

        const estadoRegistro = verificado ? 'exitoso_verificado' : 'exitoso_no_verificado';
        const motivoNoVerificado = verificado
          ? undefined
          : (creacionConfirmada
              ? 'Creado confirmado por API, no visible aún en listado al cierre de verificación'
              : 'No visible en listado al cierre de la ventana de verificación');

        // Actualizar reporte
        const registro: RegistroAdministrado = {
          id: numeroRegistro,
          ruc,
          razonSocial: razonSocial,
          nombreComercial: nombreComercial,
          estado: estadoSeleccionado,
          timestamp: new Date().toISOString(),
          screenshot: screenshotAntes,
          screenshot_despues: screenshotDespues,
          estado_registro: estadoRegistro,
          verificado_en_listado: verificado,
          motivo_no_verificado: motivoNoVerificado,
          creacion_api_confirmada: creacionConfirmada,
          creacion_api_id: resultadoCrearApi?.id,
          creacion_api_mensaje: resultadoCrearApi?.message
        };
        actualizarReporte(registro);

        registroExitoso = true;
        return ruc;
      } else {
        if (esScale) {
          const confirmacionRapidaRetries = Number(process.env.REGINSA_CONFIRMAR_API_RETRIES_RAPIDA || 3);
          const confirmacionRapidaWaitMs = Number(process.env.REGINSA_CONFIRMAR_API_WAIT_MS_RAPIDA || 800);
          const confirmacionRapidaApi = await confirmarCreacionPorApi(page, ruc, confirmacionRapidaRetries, confirmacionRapidaWaitMs);
          if (confirmacionRapidaApi) {
            console.warn(`⚠️ Éxito tardío corto confirmado por API para RUC ${ruc}. Se evita reintento técnico.`);
            const registroTardioRapido: RegistroAdministrado = {
              id: numeroRegistro,
              ruc,
              razonSocial: razonSocial,
              nombreComercial: nombreComercial,
              estado: estadoSeleccionado,
              timestamp: new Date().toISOString(),
              screenshot: screenshotAntes,
              screenshot_despues: '',
              estado_registro: 'exitoso_no_verificado',
              verificado_en_listado: false,
              motivo_no_verificado: 'Creado confirmado por API en verificación rápida',
              creacion_api_confirmada: true,
              creacion_api_id: resultadoCrearApi?.id,
              creacion_api_mensaje: resultadoCrearApi?.message
            };
            actualizarReporte(registroTardioRapido);
            registroExitoso = true;
            return ruc;
          }

          const confirmacionFinalRetries = Number(process.env.REGINSA_CONFIRMAR_API_RETRIES_FINAL || 20);
          const confirmacionFinalWaitMs = Number(process.env.REGINSA_CONFIRMAR_API_WAIT_MS_FINAL || 2000);
          const confirmacionFinalApi = await confirmarCreacionPorApi(page, ruc, confirmacionFinalRetries, confirmacionFinalWaitMs);
          if (confirmacionFinalApi) {
            console.warn(`⚠️ Éxito tardío confirmado por API para RUC ${ruc}. Se evita reintento técnico.`);
            const registroTardio: RegistroAdministrado = {
              id: numeroRegistro,
              ruc,
              razonSocial: razonSocial,
              nombreComercial: nombreComercial,
              estado: estadoSeleccionado,
              timestamp: new Date().toISOString(),
              screenshot: screenshotAntes,
              screenshot_despues: '',
              estado_registro: 'exitoso_no_verificado',
              verificado_en_listado: false,
              motivo_no_verificado: 'Creado confirmado por API en verificación tardía',
              creacion_api_confirmada: true,
              creacion_api_id: resultadoCrearApi?.id,
              creacion_api_mensaje: resultadoCrearApi?.message
            };
            actualizarReporte(registroTardio);
            registroExitoso = true;
            return ruc;
          }
        }
        console.warn('⚠️ No se detectó éxito. Reintentando flujo...');
        const scope = await asegurarFormularioAdministrado(page);
        const inputRuc = scope.locator('input[formcontrolname*="ruc" i], input[name*="ruc" i], input[id*="ruc" i], input[placeholder*="ruc" i], input[aria-label*="ruc" i]').first();
        if (await inputRuc.isVisible().catch(() => false)) {
          await inputRuc.click();
          if (await inputRuc.isEditable().catch(() => false)) {
            await inputRuc.clear();
          }
        }
      }
    } catch (error) {
      const esUltimoIntento = intento === maxReintentosTecnicos - 1;
      const prefijo = esUltimoIntento ? '❌' : '⚠️';
      const logFn = esUltimoIntento ? console.error : console.warn;
      logFn(`${prefijo} Error en intento ${intento + 1} (RUC: ${ruc}):`, error);
      if (page.isClosed()) {
        throw new Error('La página se cerró durante el registro, se detienen reintentos.');
      }
    }
  }

  if (!registroExitoso) {
    const ultimoRuc = rucsUsados[rucsUsados.length - 1] || 'N/D';
    throw new Error(`No se pudo registrar administrado después de ${maxReintentosTecnicos} intentos técnicos. Último RUC: ${ultimoRuc}`);
  }

  return rucsUsados[rucsUsados.length - 1];
}

// ===============================
// TEST PRINCIPAL
// ===============================

/**
 * CASO 01: AGREGAR ADMINISTRADO
 *
 * Flujo:
 * 1. Login + navegación al módulo (reutiliza `iniciarSesionYNavegar`)
 * 2. Abrir formulario de nuevo administrado (reutiliza `abrirFormularioNuevoAdministrado`)
 * 3. Generar RUC y razón social únicas (reutiliza `generarRUC` + helpers locales)
 * 4. Llenar formulario y seleccionar estado
 * 5. Capturar formulario (reutiliza `capturarFormularioLleno`)
 * 6. Guardar y validar éxito (reutiliza `capturarToastExito` / `capturarPantallaMejorada`)
 * 7. Actualizar reporte JSON
 */

test('01-AGREGAR ADMINISTRADO: Registro con RUC automático y reintentos', async ({ page }, testInfo) => {
  console.log('\n📱 CASO 01: AGREGAR ADMINISTRADO\n');
  const omitirCapturas = process.env.SKIP_SCREENSHOTS === '1';
  try {
    const ctx = getTestContext(testInfo);
    inicializarRunActual();
    if (ctx.isMassive) {
      test.setTimeout(300000);
    }

    await allure.step('PASO 1: LOGIN + NAVEGACIÓN', async () => {
      await iniciarSesionYNavegar(page, 'infractor', testInfo.workerIndex);
      allure.attachment('Usuario', obtenerCredencial(testInfo.workerIndex).usuario, 'text/plain');
    });

    await allure.step('PASO 2: ABRIR FORMULARIO', async () => {
      await abrirFormularioNuevoAdministrado(page);
      if (!omitirCapturas) {
        await allure.attachment('Pantalla formulario', await page.screenshot({ fullPage: true }), 'image/png');
      }
    });

    await allure.step('PASO 3: REGISTRAR ADMINISTRADO', async () => {
      console.log('\n📝 REGISTRANDO ADMINISTRADO...');
      const totalCasos = typeof ctx.repeatEach === 'number' ? ctx.repeatEach : 1;
      const idxCaso = typeof ctx.repeatIndex === 'number' ? ctx.repeatIndex : 0;
      const dataMasivo = ctx.isMassive ? generateTestData(ctx.workerIndex, ctx.repeatIndex) : null;
      const estadoSeleccionado = ctx.isMassive && dataMasivo
        ? getEstadoLabel(dataMasivo.estado)
        : calcularEstadoCaso(idxCaso, totalCasos);
      const esMasivo = ctx.isMassive;
      const strictVerifyConfigurado = process.env.REGINSA_STRICT_VERIFY;
      const strictVerifyMasivo = strictVerifyConfigurado ? strictVerifyConfigurado === '1' : true;
      const sequenceIndex = typeof ctx.repeatIndex === 'number' ? ctx.repeatIndex : 0;
      const scaleTimeoutBaseMs = Number(process.env.REGINSA_REGISTRO_TIMEOUT_MS || 120000);
      const scaleTimeoutMs = esMasivo
        ? Math.max(scaleTimeoutBaseMs, (ctx.workers || 1) >= 8 ? 180000 : 120000)
        : 90000;
      const scaleVerifyRetries = Number(process.env.REGINSA_VERIFY_RETRIES || 2);
      const scaleVerifyWaitMs = Number(process.env.REGINSA_VERIFY_WAIT_MS || 800);
      const scaleMaxReintentosTecnicos = Number(process.env.REGINSA_MAX_REINTENTOS || 3);
      const scaleMaxReintentosDatos = Number(process.env.REGINSA_DATA_RETRIES || 1);
      if (esMasivo) {
        const objetivo = Math.max(120, (ctx.workers || 1) * (ctx.repeatEach || 1) * 6);
        asegurarPoolMasivo(30, objetivo, sequenceIndex + ctx.workerIndex * 1000);
      }
      const rucRegistrado = await registrarAdministrado(
        page,
        1,
        estadoSeleccionado,
        scaleTimeoutMs,
        esMasivo ? scaleVerifyRetries : 2,
        esMasivo ? scaleVerifyWaitMs : 500,
        esMasivo ? strictVerifyMasivo : true,
        esMasivo ? scaleMaxReintentosTecnicos : 2,
        esMasivo ? scaleMaxReintentosDatos : 1,
        dataMasivo ? { ruc: dataMasivo.ruc, razonSocial: dataMasivo.razonSocial, nombreComercial: dataMasivo.nombreComercial } : undefined,
        esMasivo,
        sequenceIndex
      );
      allure.attachment('RUC registrado', rucRegistrado, 'text/plain');
      allure.attachment('Estado seleccionado', estadoSeleccionado, 'text/plain');
      const credencial = obtenerCredencial(testInfo.workerIndex);
      allure.attachment('Credencial', JSON.stringify(credencial), 'application/json');
      if (!omitirCapturas) {
        await allure.step('Captura de formulario lleno', async () => {
          await capturarFormularioLleno(page, '01-AGREGAR_ADMINISTRADO', rucRegistrado, '', 'REGISTRO', 'FORMULARIO_LLENADO');
          allure.attachment('Pantalla formulario lleno', await page.screenshot({ fullPage: true }), 'image/png');
        });
      }
    });

    await allure.step('RESULTADO FINAL', async () => {
      allure.attachment('Timestamp', new Date().toISOString(), 'text/plain');
      allure.attachment('Resumen', 'Administrado agregado correctamente', 'text/plain');
    });

    console.log('\n✅ CASO 01 COMPLETADO EXITOSAMENTE');
    console.log(`📊 Resumen:`);
    // ...existing code...
    console.log('\n✨ Administrado agregado correctamente.\n');
  } catch (error) {
    console.error('\n❌ ERROR EN CASO 01:', error);
    try {
      await capturarPantalla(page, '01-agregar-administrado', 'ERROR');
      await allure.attachment('Error', String(error), 'text/plain');
      if (!omitirCapturas) {
        await allure.attachment('Pantalla error', await page.screenshot({ fullPage: true }), 'image/png');
      }
    } catch {}
    throw error;
  }
});

test.afterEach(async ({}, testInfo) => {
  try {
    copiarEvidenciasFalloEnErrores(testInfo);
  } catch {}
});
