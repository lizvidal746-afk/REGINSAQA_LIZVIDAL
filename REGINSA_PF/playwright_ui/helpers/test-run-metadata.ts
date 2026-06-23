import { Page, TestInfo } from '@playwright/test';
import * as allure from 'allure-js-commons';
import * as fs from 'fs';
import * as path from 'path';

// ─── Carga única del Changelog de QA (compartido con K6 y Word/Excel) ─────────
interface EndpointChange {
  nombre: string;
  caso: string;
  estadoK6: string;
  estadoPlaywright: string;
  impacto: string;
}
interface Defecto {
  id: string;
  nombre: string;
  prioridad: string;
  estadoUI: string;
  estadoK6: string;
  descripcion: string;
  paseActual?: string;
}
interface ReleaseChangelog {
  version: string;
  fechaEvaluacion: string;
  paseAnterior: string;
  paseActual: string;
  responsableQA: string;
  endpoints: EndpointChange[];
  defectos: Defecto[];
}

let _changelogCache: ReleaseChangelog | null | undefined = undefined;

function loadChangelog(): ReleaseChangelog | null {
  if (_changelogCache !== undefined) return _changelogCache;
  // Buscar changelog LOCAL dentro de playwright_ui (no depende de REGINSA_K6_STRESS)
  const candidates = [
    path.resolve(__dirname, '../config/release-changelog.json'),
    path.resolve(__dirname, '../../config/release-changelog.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        // Leer contenido raw y limpiar BOM si existe
        let raw = fs.readFileSync(p, 'utf-8');
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
        const parsed = JSON.parse(raw);

        // El JSON puede ser un array de versiones o un objeto singular
        let changelog: ReleaseChangelog;
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) {
            console.warn(`[QA Audit] release-changelog.json está vacío (array sin elementos): ${p}`);
            continue;
          }
          // Tomar la primera entrada (versión más reciente)
          changelog = parsed[0] as ReleaseChangelog;
          console.log(`[QA Audit] release-changelog.json es un array con ${parsed.length} versiones. Usando la más reciente: v${changelog.version || '?'}`);
        } else {
          changelog = parsed as ReleaseChangelog;
        }

        // Normalizar campos opcionales para evitar undefined.filter()
        if (!Array.isArray(changelog.endpoints)) {
          console.warn(`[QA Audit] changelog.endpoints no es un array — se usará array vacío. Tipo recibido: ${typeof changelog.endpoints}`);
          changelog.endpoints = [];
        }
        if (!Array.isArray(changelog.defectos)) {
          console.warn(`[QA Audit] changelog.defectos no es un array — se usará array vacío. Tipo recibido: ${typeof changelog.defectos}`);
          changelog.defectos = [];
        }

        _changelogCache = changelog;
        console.log(`[QA Audit] release-changelog.json cargado desde: ${p}`);
        return _changelogCache;
      } catch (err) {
        console.warn(`[QA Audit] Error parseando ${p}: ${err instanceof Error ? err.message : String(err)}`);
        // continuar buscando
      }
    }
  }
  _changelogCache = null;
  // Silencioso: no es error fatal si no existe changelog local
  return null;
}


export type ReginsaRunContext = {
  workerIndex: number;
  physicalWorkerIndex: number;
  repeatIndex: number;
  physicalRepeatIndex: number;
  slot: number;
  assignedIp: string;
  assignedUser: string;
  scenario: string;
  phase1Mode: string;
};

type ContextOptions = {
  scenario?: string;
  phase1Mode?: string;
  timeoutJustification?: string;
};

function getEnv(name: string): string {
  return (process.env[name] || '').trim();
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = Number(getEnv(name));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

function resolverSlotFuncional(physicalWorkerIndex: number, physicalRepeatIndex: number): {
  workerIndex: number;
  repeatIndex: number;
  slot: number;
} {
  const workers = readPositiveIntEnv('REGINSA_LOGICAL_WORKERS', readPositiveIntEnv('PLAYWRIGHT_WORKERS', 1));
  const repeatEach = readPositiveIntEnv('REGINSA_REPEAT_EACH', 1);
  const playwrightRepeatEach = readPositiveIntEnv('PLAYWRIGHT_REPEAT_EACH', repeatEach);
  const usaRepartoFuncional = workers > 1 && playwrightRepeatEach >= workers;

  if (!usaRepartoFuncional) {
    return {
      workerIndex: physicalWorkerIndex,
      repeatIndex: physicalRepeatIndex,
      slot: physicalWorkerIndex + 1,
    };
  }

  const logicalWorkerIndex = physicalRepeatIndex % workers;
  const logicalRepeatIndex = Math.floor(physicalRepeatIndex / workers);
  return {
    workerIndex: logicalWorkerIndex,
    repeatIndex: logicalRepeatIndex,
    slot: logicalWorkerIndex + 1,
  };
}

async function agregarParametroAllure(name: string, value: string): Promise<void> {
  await Promise.resolve(allure.parameter(name, value)).catch(() => {});
}

export async function configurarContextoReginsa(
  page: Page,
  testInfo: TestInfo,
  options: ContextOptions = {}
): Promise<ReginsaRunContext> {
  const physicalWorkerIndex = testInfo.parallelIndex ?? testInfo.workerIndex;
  const physicalRepeatIndex = testInfo.repeatEachIndex ?? 0;
  const { workerIndex, repeatIndex, slot } = resolverSlotFuncional(physicalWorkerIndex, physicalRepeatIndex);
  const scenario = options.scenario || getEnv('SCENARIO') || 'manual';
  const phase1Mode = options.phase1Mode || getEnv('PHASE1_MODE') || 'N/A';
  const assignedIp = getEnv(`REGINSA_IP_${slot}`) || getEnv('REGINSA_IP_1') || 'Local';
  const assignedUser = getEnv(`REGINSA_USER_${slot}`) || getEnv('REGINSA_USER_1') || getEnv('REGINSA_USER') || 'N/D';

  if (assignedIp && assignedIp !== 'Local') {
    await page.setExtraHTTPHeaders({ 'X-Forwarded-For': assignedIp });
  }

  const context: ReginsaRunContext = {
    workerIndex,
    physicalWorkerIndex,
    repeatIndex,
    physicalRepeatIndex,
    slot,
    assignedIp,
    assignedUser,
    scenario,
    phase1Mode,
  };

  testInfo.annotations.push({ type: 'worker', description: String(workerIndex + 1) });
  testInfo.annotations.push({ type: 'workerFisico', description: String(physicalWorkerIndex + 1) });
  testInfo.annotations.push({ type: 'slot', description: String(slot) });
  testInfo.annotations.push({ type: 'ipAsignada', description: assignedIp });
  testInfo.annotations.push({ type: 'usuarioAsignado', description: assignedUser });
  testInfo.annotations.push({ type: 'escenario', description: scenario });
  testInfo.annotations.push({ type: 'phase1Mode', description: phase1Mode });
  testInfo.annotations.push({ type: 'repeatIndex', description: String(repeatIndex) });
  testInfo.annotations.push({ type: 'repeatIndexFisico', description: String(physicalRepeatIndex) });

  await agregarParametroAllure('worker', String(workerIndex + 1));
  await agregarParametroAllure('workerFisico', String(physicalWorkerIndex + 1));
  await agregarParametroAllure('slot', String(slot));
  await agregarParametroAllure('ipAsignada', assignedIp);
  await agregarParametroAllure('usuarioAsignado', assignedUser);
  await agregarParametroAllure('escenario', scenario);
  await agregarParametroAllure('phase1Mode', phase1Mode);

  if (options.timeoutJustification) {
    testInfo.annotations.push({
      type: 'timeoutJustificacion',
      description: options.timeoutJustification,
    });
  }

  await testInfo.attach('reginsa-contexto-ejecucion', {
    body: JSON.stringify(context, null, 2),
    contentType: 'application/json',
  });

  // ─── Inyección de Auditoría QA al reporte ───────────────────────────────────
  const changelog = loadChangelog();
  if (changelog) {
    const auditPase = `${changelog.paseAnterior} -> ${changelog.paseActual} | Fecha: ${changelog.fechaEvaluacion} | Responsable: ${changelog.responsableQA}`;
    // Cabecera de auditoría
    testInfo.annotations.push({
      type: '🔍 QA Audit — Pase',
      description: `${changelog.paseAnterior} → ${changelog.paseActual} | Fecha: ${changelog.fechaEvaluacion} | Responsable: ${changelog.responsableQA}`,
    });
    await agregarParametroAllure('QA Audit - Pase', auditPase);

    // Filtrar endpoints relevantes al caso de este test (si testInfo.title contiene el numero)
    const casoActual = testInfo.title.match(/CP-REG-(\d+)/i)?.[1] || '';
    const safeEndpoints = Array.isArray(changelog.endpoints) ? changelog.endpoints : [];
    const epRelevantes = safeEndpoints.filter(ep => {
      if (!casoActual) return true;
      return ep.caso?.includes(`0${casoActual}`) || ep.caso?.includes(casoActual);
    });

    epRelevantes.forEach(ep => {
      testInfo.annotations.push({
        type: `🔄 API: ${ep.nombre}`,
        description: `K6=${ep.estadoK6} | Playwright=${ep.estadoPlaywright} | ${ep.impacto}`,
      });
    });
    for (const ep of epRelevantes) {
      await agregarParametroAllure(
        `QA API - ${ep.nombre}`,
        `K6=${ep.estadoK6} | Playwright=${ep.estadoPlaywright} | ${ep.impacto}`
      );
    }

    // Siempre mostrar todos los defectos no resueltos
    const safeDefectos = Array.isArray(changelog.defectos) ? changelog.defectos : [];
    const defectosAbiertos = safeDefectos
      .filter(d => {
        const cerrado = /cerrado/i.test(d.paseActual || '') || /cerrado/i.test(d.estadoK6 || '');
        const corregidoUI = /corregido/i.test(d.estadoUI || '');
        return !cerrado && !corregidoUI;
      });
    defectosAbiertos.forEach(def => {
      testInfo.annotations.push({
        type: `⚠️ Defecto ${def.id} [${def.prioridad}]`,
        description: `${def.nombre} — Estado K6: ${def.estadoK6} | UI: ${def.estadoUI}`,
      });
    });
    for (const def of defectosAbiertos) {
      await agregarParametroAllure(
        `QA Defecto - ${def.id}`,
        `${def.nombre} | Prioridad=${def.prioridad} | K6=${def.estadoK6} | UI=${def.estadoUI}`
      );
    }

    // Adjuntar changelog completo como JSON (visible en Allure como attachment)
    await testInfo.attach('qa-audit-changelog', {
      body: JSON.stringify(changelog, null, 2),
      contentType: 'application/json',
    });
  }

  return context;
}

export { loadChangelog };

