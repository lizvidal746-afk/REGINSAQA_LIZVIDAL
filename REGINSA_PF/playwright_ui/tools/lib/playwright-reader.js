/**
 * tools/lib/playwright-reader.js
 * ══════════════════════════════════════════════════════════════════════════════
 * Adaptador canónico para el JSON generado por Playwright (results.json).
 *
 * PROPÓSITO: Única fuente de verdad para extraer métricas de pruebas UI.
 *   Todos los generadores (HTML, Excel, IA) importan ESTE módulo.
 *   Ningún generador accede al JSON directamente.
 *
 * CONTRATO DE DATOS Playwright results.json:
 *   - stats: { expected, unexpected, flaky, skipped, duration, startTime }
 *   - suites[]: estructura jerárquica con specs, tests y results
 *   - config: metadatos de Playwright
 *
 * ESCALABILIDAD:
 *   Diseñado para multi-worker con asignación de IPs y usuarios por slot.
 * ══════════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ── SLOs institucionales SUNEDU para UI ──────────────────────────────────────
const DEFAULT_SLO = {
  passRate: 0.95,      // 95% tasa de éxito mínima
  flakyRate: 0.05,     // 5% flakiness máximo
  maxDurationPerTestMs: 60000, // 60s por test máximo
  crashRate: 0.0,      // 0% crashes tolerados
};

// ── Utilidades de formato ────────────────────────────────────────────────────
function fmtMs(v) {
  if (v == null || v === 0) return '—';
  return `${Math.round(v)} ms`;
}

function fmtPct(v) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

function fmtPctStr(v) {
  return `${(v * 100).toFixed(2)}%`;
}

// ── Helpers para Dual View y Análisis Avanzado ────────────────────────────────

function classifyError(messages = []) {
  const text = messages.join(' | ').toLowerCase();
  
  if (text.includes('tobevisible') && text.includes('numeroexpediente')) {
    return {
      category: 'UI',
      audience: 'Frontend',
      pattern: 'toBeVisible numeroExpediente',
      recommendation: 'Agregar esperas explícitas y revisar carga asíncrona de componentes.'
    };
  }
  
  if (text.includes('timeout') && (text.includes('api') || text.includes('post') || text.includes('get'))) {
    return {
      category: 'API',
      audience: 'Backend',
      pattern: 'API timeout',
      recommendation: 'Revisar SLA del endpoint y tiempos de respuesta de backend.'
    };
  }
  
  if (text.includes('entidad/crear') && text.includes('net::err_failed')) {
    return {
      category: 'API',
      audience: 'Backend/Infraestructura/Frontend',
      pattern: 'Entidad/Crear net::ERR_FAILED',
      recommendation: 'El endpoint Entidad/Crear debe devolver una respuesta HTTP controlada y trazable; revisar backend, proxy/WAF/IIS/API Gateway y manejo de error en Angular.'
    };
  }
    if (text.includes('id real') || text.includes('toast') || text.includes('evidencia api')) {
    return {
      category: 'PERSISTENCIA',
      audience: 'Backend/DBA',
      pattern: 'ID no capturado',
      recommendation: 'Revisar interceptación, contrato de respuesta y persistencia transaccional.'
    };
  }
  
  if (text.includes('test timeout') || text.includes('exceeded')) {
    return {
      category: 'TIMEOUT',
      audience: 'DevOps/Infra',
      pattern: 'Test timeout exceeded',
      recommendation: 'Revisar latencia de infraestructura, red y datos de prueba.'
    };
  }
  
  return {
    category: 'OTRO',
    audience: 'QA',
    pattern: 'Otro',
    recommendation: 'Revisar traza detallada del error y clasificar manualmente.'
  };
}

function percentile95(values = []) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, idx)];
}

function normalizeTestId(test, spec, suiteTitles = []) {
  return [...suiteTitles, spec?.title, test?.title].filter(Boolean).join(' > ').trim();
}

function getAnnotationsFromResult(result) {
  return Array.isArray(result?.annotations) ? result.annotations : [];
}

function getLocalIP() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  } catch (e) { /* fallback */ }
  return '127.0.0.1';
}

// ── Resolución de workers multi-usuario ──────────────────────────────────────
function collectIndexedEnv(prefix) {
  return Object.keys(process.env)
    .map((key) => {
      const match = new RegExp(`^${prefix}(\\d+)$`).exec(key);
      if (!match) return null;
      const slot = Number(match[1]);
      const value = String(process.env[key] || '').trim();
      if (!value) return null;
      return { slot, value };
    })
    .filter(Boolean)
    .sort((a, b) => a.slot - b.slot);
}

function extractSlotHint(...values) {
  for (const value of values) {
    const match = /\[slot\s+(\d+)\]/i.exec(String(value || ''));
    if (match) return Number(match[1]);
  }
  return null;
}

function findAnnotation(annotations, type) {
  if (!Array.isArray(annotations)) return null;
  const item = annotations.find((entry) => entry && entry.type === type);
  return item && item.description ? String(item.description).trim() : null;
}

function isTechnicalSetupTest(test) {
  const text = `${test?.testId || ''} ${test?.suite || ''} ${test?.title || ''}`.toLowerCase();
  return /auth\.setup|autenticaci[oó]n multi-usuario|setup/.test(text);
}

function parseAnnotationNumber(annotations, type, fallback = null) {
  const value = Number(findAnnotation(annotations, type));
  return Number.isFinite(value) ? value : fallback;
}

function resolveWorkerIdentity(workerIndex, sourceIp, slotHint = null) {
  const userPool = collectIndexedEnv('REGINSA_USER_');
  const ipPool = collectIndexedEnv('REGINSA_IP_');

  const fallbackUser =
    String(process.env.REGINSA_USER || process.env.REGINSA_USER_1 || '').trim() || 'N/D';
  const normalizedWorkerIndex = Number.isFinite(workerIndex) ? Number(workerIndex) : 0;
  const normalizedSlotHint = Number.isFinite(slotHint) ? Number(slotHint) : null;

  const resolvedUser =
    userPool.length > 0
      ? (
          userPool.find((entry) => entry.slot === normalizedSlotHint) ||
          userPool[normalizedWorkerIndex % userPool.length]
        )
      : { slot: 1, value: fallbackUser };
  const resolvedIp =
    ipPool.length > 0
      ? (
          ipPool.find((entry) => entry.slot === resolvedUser.slot) ||
          ipPool[normalizedWorkerIndex % ipPool.length]
        )
      : { slot: resolvedUser.slot, value: sourceIp };

  return {
    workerIndex: normalizedWorkerIndex,
    slot: resolvedUser.slot,
    assignedUser: resolvedUser.value,
    assignedIp: resolvedIp.value,
    ipMode: ipPool.length > 0 ? 'dedicada-configurada' : 'host-compartido',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// CLASE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
class PlaywrightReader {
  /**
   * @param {string} jsonPath - Ruta absoluta al results.json de Playwright
   * @param {Partial<typeof DEFAULT_SLO>} [sloOverrides]
   * @throws {Error} Si el archivo no existe o el JSON es inválido
   */
  constructor(jsonPath, sloOverrides = {}) {
    this.jsonPath = path.resolve(jsonPath);
    this.slo = { ...DEFAULT_SLO, ...sloOverrides };

    if (!fs.existsSync(this.jsonPath)) {
      throw new Error(`[PlaywrightReader] Archivo no encontrado: ${this.jsonPath}`);
    }

    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'));
    } catch (e) {
      throw new Error(`[PlaywrightReader] JSON inválido en "${path.basename(this.jsonPath)}": ${e.message}`);
    }

    this._raw = raw;
    this._m = raw; // alias para compatibilidad con generadores

    // ── Metadatos del run ──────────────────────────────────────────────────
    this.runId = path.basename(this.jsonPath, '.json');
    this.outDir = path.dirname(this.jsonPath);
    this.sourceIp = getLocalIP();
    this.generatedAt = new Date().toLocaleString('es-PE', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // ── Extraer métricas ──────────────────────────────────────────────────
    this._processData();
    this._validateContract();

    console.log(
      `[PlaywrightReader] ✅ JSON validado | Run: ${this.runId}\n` +
        `           Tests: ${this.totalTests} | Pass: ${this.passedTests} | ` +
        `Fail: ${this.failedTests} | Rate: ${fmtPctStr(this.passRate)} | Estado: ${this.statusEmoji} ${this.status}`,
    );
  }

  _processData() {
    const stats = this._raw.stats || {};
    this.startTime = stats.startTime;
    this.durationMs = stats.duration || 0;
    this.durationStr = this._formatDuration(this.durationMs);

    this.totalTests = (stats.expected || 0) + (stats.unexpected || 0);
    this.passedTests = stats.expected || 0;
    this.failedTests = stats.unexpected || 0;
    this.flakyTests = stats.flaky || 0;
    this.skippedTests = stats.skipped || 0;

    this.passRate = this.totalTests > 0 ? this.passedTests / this.totalTests : 0;
    this.failRate = this.totalTests > 0 ? this.failedTests / this.totalTests : 0;
    this.flakyRate = this.totalTests > 0 ? this.flakyTests / this.totalTests : 0;

    // Procesar workers
    this._workers = new Map();
    this._allTests = [];

    const suites = this._raw.suites || [];
    this._extractSuites(suites);
  }

  _validateContract() {
    if (this.totalTests === 0) {
      throw new Error(
        `[PlaywrightReader] ABORT: El run tiene 0 tests.\n` +
          `  Causas posibles: run vacío, JSON incorrecto.\n` +
          `  Archivo: ${this.jsonPath}`,
      );
    }
  }

  _extractSuites(suites, parentTitle = '') {
    for (const suite of suites) {
      const fullTitle = parentTitle ? `${parentTitle} > ${suite.title}` : suite.title;

      if (suite.specs && suite.specs.length > 0) {
        for (const spec of suite.specs) {
          for (const test of spec.tests) {
            for (const result of test.results) {
              const workerIndex = result.workerIndex;
              const parallelIndex = result.parallelIndex;
              const slotHint = extractSlotHint(spec.title, fullTitle, spec.file);
              const annotations = result.annotations || test.annotations || [];
              const identity = resolveWorkerIdentity(workerIndex, this.sourceIp, slotHint);
              const annotatedSlot = Number(findAnnotation(annotations, 'slot'));
              const annotatedWorker = parseAnnotationNumber(annotations, 'worker', null);
              const annotatedPhysicalWorker = parseAnnotationNumber(annotations, 'workerFisico', null);
              const assignedUser = findAnnotation(annotations, 'usuarioAsignado') || identity.assignedUser;
              const assignedIp = findAnnotation(annotations, 'ipAsignada') || identity.assignedIp;
              const resolvedSlot = Number.isFinite(annotatedSlot) ? annotatedSlot : identity.slot;
              const logicalWorkerIndex = Number.isFinite(annotatedWorker) ? annotatedWorker - 1 : workerIndex;
              const physicalWorkerIndex = Number.isFinite(annotatedPhysicalWorker) ? annotatedPhysicalWorker - 1 : workerIndex;

              const testData = {
                title: spec.title,
                suite: fullTitle,
                file: spec.file,
                line: spec.line,
                projectId: test.projectId,
                projectName: test.projectName,
                workerIndex: logicalWorkerIndex,
                physicalWorkerIndex,
                parallelIndex,
                status: result.status,
                durationMs: result.duration,
                durationStr: this._formatDuration(result.duration),
                errors: result.errors || [],
                stdout: result.stdout,
                stderr: result.stderr,
                startTime: result.startTime,
                annotations,
                workerSlot: resolvedSlot,
                assignedUser,
                assignedIp,
                ipMode: identity.ipMode,
              };

              this._allTests.push(testData);

              if (!this._workers.has(logicalWorkerIndex)) {
                this._workers.set(logicalWorkerIndex, {
                  index: logicalWorkerIndex,
                  physicalIndexes: new Set(),
                  parallelIndex,
                  slot: resolvedSlot,
                  assignedUser,
                  assignedIp,
                  ipMode: identity.ipMode,
                  tests: [],
                  passed: 0,
                  failed: 0,
                  totalDurationMs: 0,
                });
              }

              const workerData = this._workers.get(logicalWorkerIndex);
              workerData.physicalIndexes.add(physicalWorkerIndex);
              workerData.tests.push(testData);
              workerData.totalDurationMs += result.duration || 0;
              if (result.status === 'passed') {
                workerData.passed++;
              } else if (result.status === 'failed' || result.status === 'timedOut') {
                workerData.failed++;
              }
            }
          }
        }
      }

      if (suite.suites && suite.suites.length > 0) {
        this._extractSuites(suite.suites, fullTitle);
      }
    }
  }

  _formatDuration(ms) {
    if (ms == null || ms === 0) return '—';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const secs = ms / 1000;
    if (secs < 60) return `${secs.toFixed(1)}s`;
    const mins = Math.floor(secs / 60);
    const remainSecs = Math.round(secs % 60);
    return `${mins}m ${remainSecs}s`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROPIEDADES — Compatibles con interfaz K6Reader
  // ══════════════════════════════════════════════════════════════════════════

  get testName() {
    return 'REGINSA_UI_PRUEBAS_FUNCIONALES';
  }

  /** @returns {string} Timestamp formateado para nombres de archivos (Hora Lima: YYYY-MM-DD_HH-mm) */
  get filenameStamp() {
    const d = new Date();
    const lima = new Date(d.toLocaleString('en-US', { timeZone: 'America/Lima' }));
    const year = lima.getFullYear();
    const month = String(lima.getMonth() + 1).padStart(2, '0');
    const day = String(lima.getDate()).padStart(2, '0');
    const hour = String(lima.getHours()).padStart(2, '0');
    const min = String(lima.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}_${hour}-${min}`;
  }

  get workerList() {
    return Array.from(this._workers.values());
  }

  get functionalWorkerList() {
    return this.workerList
      .map((worker) => ({
        ...worker,
        tests: worker.tests.filter((test) => !isTechnicalSetupTest(test)),
      }))
      .filter((worker) => worker.tests.length > 0);
  }

  get testList() {
    return this._allTests;
  }

  // ── Estado SLO ──────────────────────────────────────────────────────────
  /** @returns {boolean} */
  get sloPass() {
    return (
      this.passRate >= this.slo.passRate &&
      this.flakyRate <= this.slo.flakyRate
    );
  }

  /** @returns {'PASA'|'DEGRADADO'|'FALLA'} */
  get status() {
    if (this.passRate >= 0.98 && this.failedTests === 0) return 'PASA';
    if (this.passRate >= this.slo.passRate && this.flakyRate <= this.slo.flakyRate) return 'DEGRADADO';
    return 'FALLA';
  }

  get statusEmoji() {
    return { PASA: '🟢', DEGRADADO: '🟡', FALLA: '🔴' }[this.status] ?? '⚪';
  }

  get statusFull() {
    return `${this.statusEmoji} ESTADO ${this.status}`;
  }

  // ── Error Budget (adaptado a UI) ────────────────────────────────────────
  get errorBudget() {
    const consumed = Math.min((1 - this.passRate) * 100 / (1 - this.slo.passRate) * 100, 100);
    return {
      consumedPct: parseFloat(consumed.toFixed(1)),
      remainingPct: parseFloat((100 - consumed).toFixed(1)),
      marginTests: Math.max(0, Math.round(this.totalTests * this.slo.passRate - this.passedTests)),
      sloPassRate: this.slo.passRate,
      passRatePct: parseFloat((this.passRate * 100).toFixed(2)),
    };
  }

  // ── Resumen de errores por tipo ─────────────────────────────────────────
  get errorSpectrum() {
    const spectrum = {};
    this._allTests
      .filter((t) => t.status === 'failed' || t.status === 'timedOut')
      .forEach((t) => {
        const type = t.status === 'timedOut' ? 'TIMEOUT' : 'FAILED';
        spectrum[type] = (spectrum[type] || 0) + 1;
        if (t.errors && t.errors.length > 0) {
          const msg = String(t.errors[0].message || '');
          if (msg.includes('timeout') || msg.includes('Timeout')) {
            spectrum['TIMEOUT'] = (spectrum['TIMEOUT'] || 0) + 1;
          } else if (msg.includes('expect') || msg.includes('assert')) {
            spectrum['ASSERTION'] = (spectrum['ASSERTION'] || 0) + 1;
          } else if (msg.includes('locator') || msg.includes('selector')) {
            spectrum['LOCATOR'] = (spectrum['LOCATOR'] || 0) + 1;
          } else if (msg.includes('Network') || msg.includes('ECONNREFUSED') || msg.includes('fetch')) {
            spectrum['NETWORK'] = (spectrum['NETWORK'] || 0) + 1;
          } else {
            spectrum['OTHER'] = (spectrum['OTHER'] || 0) + 1;
          }
        }
      });
    return spectrum;
  }

  // ── Suite summary ───────────────────────────────────────────────────────
  get suiteSummary() {
    const map = {};
    this._allTests.forEach((t) => {
      const suiteName = t.suite || 'Sin Suite';
      if (!map[suiteName]) {
        map[suiteName] = { suite: suiteName, total: 0, passed: 0, failed: 0, skipped: 0 };
      }
      map[suiteName].total++;
      if (t.status === 'passed') map[suiteName].passed++;
      else if (t.status === 'failed' || t.status === 'timedOut') map[suiteName].failed++;
      else if (t.status === 'skipped') map[suiteName].skipped++;
    });
    return Object.values(map).map((s) => ({
      ...s,
      passRate: s.total > 0 ? parseFloat(((s.passed / s.total) * 100).toFixed(2)) : 0,
      status: s.total > 0 && s.passed === s.total ? 'PASA' : s.passed / s.total >= this.slo.passRate ? 'DEGRADADO' : 'FALLA',
    }));
  }

  // ── IPs locales detectadas ──────────────────────────────────────────────
  get localIps() {
    const ips = new Set();
    this._allTests.forEach((t) => {
      if (t.assignedIp && t.assignedIp !== 'N/D') ips.add(t.assignedIp);
    });
    return Array.from(ips).sort();
  }

  get ipSummary() {
    return this.localIps.map((ip) => {
      const tests = this._allTests.filter((t) => t.assignedIp === ip);
      const passed = tests.filter((t) => t.status === 'passed').length;
      const failed = tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length;
      const total = tests.length;
      const totalDuration = tests.reduce((a, t) => a + (t.durationMs || 0), 0);
      return {
        ip,
        node: `Worker ${this.localIps.indexOf(ip) + 1}`,
        tests: total,
        passed,
        failed,
        passRate: total > 0 ? passed / total : 0,
        totalDurationMs: totalDuration,
        durationStr: this._formatDuration(totalDuration),
        apdex: total > 0 ? parseFloat((passed / total).toFixed(3)) : 0,
        errorRate: total > 0 ? parseFloat((failed / total).toFixed(4)) : 0,
      };
    });
  }

  // == Analisis de Concurrencia e Infraestructura ==
  get concurrencyAnalysis() {
    const workers = this.functionalWorkerList;
    const totalWorkers = workers.length;
    const activeIps = new Set(workers.map((w) => w.assignedIp)).size;

    // Retries: tests que tienen mas de 1 resultado en el JSON raw
    let totalRetries = 0;
    const retriedTests = [];
    const rawSuites = this._raw.suites || [];
    const countRetries = (suites) => {
      for (const suite of suites) {
        if (suite.specs) {
          for (const spec of suite.specs) {
            for (const test of spec.tests || []) {
              const results = test.results || [];
              if (results.length > 1) {
                totalRetries += results.length - 1;
                retriedTests.push({
                  title: spec.title,
                  attempts: results.length,
                  finalStatus: results[results.length - 1].status,
                });
              }
            }
          }
        }
        if (suite.suites) countRetries(suite.suites);
      }
    };
    countRetries(rawSuites);

    // Duplicados: expedientes repetidos (mismo prefijo de expediente en distintos tests)
    const expedientes = new Map();
    this._allTests.forEach((t) => {
      const ann = Array.isArray(t.annotations) ? t.annotations : [];
      const exp = (ann.find((a) => a.type === 'expediente') || ann.find((a) => a.type === 'numeroExpediente') || {}).description || '';
      if (exp) {
        const key = exp.replace(/_W\d+_R\d+_\d+$/, '');
        if (!expedientes.has(key)) expedientes.set(key, []);
        expedientes.get(key).push({ worker: t.workerIndex, title: t.title, ip: t.assignedIp });
      }
    });
    const duplicatedExpedientes = Array.from(expedientes.entries())
      .filter(([, entries]) => entries.length > 1)
      .map(([exp, entries]) => ({
        expediente: exp,
        registros: entries.length,
        workers: entries.map(e => `W${e.worker}`).join(', '),
        ips: entries.map(e => e.ip).join(', ')
      }));

    // Tiempos por worker
    const durations = workers.map(w => w.totalDurationMs || 0);
    const maxDur = durations.length ? Math.max(...durations) : 0;
    const minDur = durations.length ? Math.min(...durations) : 0;
    const avgDur = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    // Saturation indicators (Desbalance de carga y concurrencia)
    const loadImbalancePct = avgDur > 0 ? parseFloat((((maxDur - minDur) / avgDur) * 100).toFixed(2)) : 0;
    const saturationPct = totalWorkers > 1 ? parseFloat(((activeIps / totalWorkers) * 100).toFixed(2)) : 100;

    // Risk Level
    let riskLevel = 'BAJO';
    let riskReason = 'Ejecucion stable sin reintentos ni duplicados de expedientes.';
    if (duplicatedExpedientes.length > 0) {
      riskLevel = 'CRITICO';
      riskReason = 'Se detectaron registros de expedientes duplicados en base de datos debido a la falta de idempotencia del backend tras reintentos o ejecuciones simultaneas.';
    } else if (totalRetries > 0) {
      riskLevel = 'MEDIO';
      riskReason = 'Se detectaron reintentos de pruebas (flakiness), lo que indica inestabilidad de la UI o saturacion del servidor.';
    } else if (loadImbalancePct > 50 && totalWorkers > 3) {
      riskLevel = 'MEDIO';
      riskReason = 'Desbalance critico de carga de trabajo entre workers (mayor al 50%). Posible ralentizacion o encolamiento en el backend.';
    }

    // Structured Recommendations by Role
    const recommendations = [];
    if (duplicatedExpedientes.length > 0) {
      recommendations.push({
        area: 'Arquitecto de Software',
        hallazgo: 'Registros duplicados de expedientes bajo alta concurrencia o tras reintentos.',
        origen: 'Falta de restricciones de unicidad o control de idempotencia en la API de guardado de Sanciones.',
        accion: 'Implementar tokens de idempotencia unicos generados en el cliente y validacion a nivel base de datos (Unique Constraint).'
      });
      recommendations.push({
        area: 'Programador Backend',
        hallazgo: 'La API permite crear registros para un mismo expediente sin comprobar existencia.',
        origen: 'Logica de insercion sin control de existencia pre-registro.',
        accion: 'Validar si el expediente ya cuenta con un registro activo antes de proceder a la insercion, retornando un error controlado de conflicto (HTTP 409) si aplica.'
      });
    }
    if (totalRetries > 0) {
      recommendations.push({
        area: 'Infraestructura / TI',
        hallazgo: 'Se requirieron reintentos en pruebas automaticas debido a timeouts o falta de respuesta oportuna.',
        origen: 'Saturacion de recursos del servidor de QA (CPU/RAM) al recibir peticiones concurrentes.',
        accion: 'Escalar recursos del servidor web y de base de datos en QA, y habilitar monitoreo de tiempos de respuesta bajo carga.'
      });
      recommendations.push({
        area: 'Framework QA',
        hallazgo: 'Inestabilidad del entorno genera falsos negativos si no se configuran reintentos.',
        origen: 'Tiempos de renderizado variables y respuestas lentas de la base de datos.',
        accion: 'Optimizar esperas explicitas y localizadores en los specs para tolerar fluctuaciones de latencia sin depender de reintentos globales.'
      });
    }

    // Production Risk projection
    const productionNote = `Nota de Escalamiento a Produccion: El ambiente de pruebas (QA) se esta ejecutando con recursos limitados. Un nivel de riesgo ${riskLevel} proyectado a Produccion con miles de usuarios concurrentes podria derivar en bloqueos de tablas en la base de datos, agotamiento del pool de conexiones o corrupcion de datos con registros duplicados. Se recomienda aplicar las medidas correctivas de forma prioritaria antes del pase.`;

    return {
      totalWorkers,
      activeIps,
      totalRetries,
      retriedTests,
      duplicatedExpedientes,
      loadImbalancePct,
      saturationPct,
      riskLevel,
      riskReason,
      recommendations,
      productionNote,
      maxDurMs: maxDur,
      minDurMs: minDur,
      avgDurMs: avgDur,
      maxDurStr: this._formatDuration(maxDur),
      minDurStr: this._formatDuration(minDur),
      avgDurStr: this._formatDuration(avgDur)
    };
  }

  // == Nota contextual de Workers ==
  get workerContextNote() {
    const hasDedicated = this.workerList.some((w) => w.ipMode === 'dedicada-configurada');
    return hasDedicated
      ? 'IPs dedicadas detectadas mediante REGINSA_IP_N.'
      : `No se detectaron REGINSA_IP_N. Todos los workers comparten la IP del host (${this.sourceIp}).`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DUAL VIEW ARCHITECTURE - Tests Finales vs Intentos
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Procesa el JSON de Playwright en dos vistas:
   * - testListFinal: consolidado por test (con estado final)
   * - attemptList: expandido por intento (incluye retries)
   * 
   * Esto permite distinguir entre:
   * - Tests que pasaron al primer intento
   * - Tests flaky (fallaron primero, pasaron en retry)
   * - Registros creados en intentos fallidos (persistencia indeterminada)
   */
  processDualView() {
    const attemptList = [];
    const testListFinal = [];
    const workerMap = new Map();
    
    // Preparar mapa de workers para lookup rápido
    this.workerList.forEach(w => {
      workerMap.set(w.index, {
        assignedIp: w.assignedIp,
        assignedUser: w.assignedUser
      });
    });

    // Función recursiva para recorrer suites
    const walkSuites = (suites, parentTitles = []) => {
      for (const suite of suites || []) {
        const suiteTitles = suite.title ? [...parentTitles, suite.title] : [...parentTitles];
        
        for (const spec of suite.specs || []) {
          for (const test of spec.tests || []) {
            const results = Array.isArray(test.results) ? test.results : [];
            const firstAnnotations = getAnnotationsFromResult(results[0]);
            const baseTestId = normalizeTestId(test, spec, suiteTitles);
            const logicalWorker = findAnnotation(firstAnnotations, 'worker');
            const logicalRepeat = findAnnotation(firstAnnotations, 'repeatIndex');
            const logicalIp = findAnnotation(firstAnnotations, 'ipAsignada');
            const testId = logicalIp
              ? `${baseTestId} > IP:${logicalIp} > W:${logicalWorker || 'N/D'} > R:${logicalRepeat || '0'}`
              : baseTestId;
            
            // Procesar cada intento
            const attempts = results.map((result, idx) => {
              const annotations = getAnnotationsFromResult(result);
              const errors = (result.errors || [])
                .map(e => e?.message || e?.value || '')
                .filter(Boolean);
              
              const registroId = findAnnotation(annotations, 'registroId');
              const expediente = findAnnotation(annotations, 'expediente');
              const apiEndpoint = findAnnotation(annotations, 'apiEndpoint');
              const sancionesEjecutadas = findAnnotation(annotations, 'sancionesEjecutadas');
              const operacionFuncional = findAnnotation(annotations, 'operacionFuncional');
              const evidenciaFuncional = findAnnotation(annotations, 'evidenciaFuncional');
              
              const meta = classifyError(errors);
              const workerIndex = result?.workerIndex ?? test?.workerIndex ?? -1;
              const logicalWorkerNumber = parseAnnotationNumber(annotations, 'worker', null);
              const logicalWorkerIndex = Number.isFinite(logicalWorkerNumber) ? logicalWorkerNumber - 1 : workerIndex;
              const physicalWorkerNumber = parseAnnotationNumber(annotations, 'workerFisico', null);
              const physicalWorkerIndex = Number.isFinite(physicalWorkerNumber) ? physicalWorkerNumber - 1 : workerIndex;
              const workerInfo = workerMap.get(logicalWorkerIndex) || workerMap.get(workerIndex) || { assignedIp: null, assignedUser: null };
              
              return {
                testId,
                attemptIndex: idx,
                retry: result?.retry ?? idx,
                status: result?.status || 'unknown',
                durationMs: result?.duration || 0,
                workerIndex: logicalWorkerIndex,
                physicalWorkerIndex,
                assignedIp: findAnnotation(annotations, 'ipAsignada') || workerInfo.assignedIp,
                assignedUser: findAnnotation(annotations, 'usuarioAsignado') || workerInfo.assignedUser,
                apiEndpoint,
                registroId,
                operacionFuncional,
                evidenciaFuncional,
                expediente,
                sancionesEjecutadas,
                errors,
                errorCategory: meta.category,
                errorAudience: meta.audience,
                errorPattern: meta.pattern,
                errorRecommendation: meta.recommendation,
                createdPersistencia: Boolean(registroId),
                functionalEvidence: Boolean(registroId || apiEndpoint || evidenciaFuncional || operacionFuncional),
                annotations
              };
            });
            
            attemptList.push(...attempts);
            
            // Determinar estado final del test
            const finalAttempt = attempts[attempts.length - 1] || null;
            const hadRetries = attempts.length > 1;
            const finalStatus = test?.outcome || finalAttempt?.status || 'unknown';
            const registroIds = attempts.map(a => a.registroId).filter(Boolean);
            const isFunctionalTest = !isTechnicalSetupTest({ testId, suite: suiteTitles.join(' > '), title: spec.title });
            const hasFunctionalEvidence = attempts.some(a => a.functionalEvidence);
            const definitiveError = [...attempts].reverse().find(a => a.errors?.length);
            
            testListFinal.push({
              testId,
              title: spec.title,
              suite: suiteTitles.join(' > '),
              finalStatus,
              assignedIp: finalAttempt?.assignedIp || null,
              assignedUser: finalAttempt?.assignedUser || null,
              apiEndpoint: finalAttempt?.apiEndpoint || attempts.find(a => a.apiEndpoint)?.apiEndpoint || null,
              workerIndex: finalAttempt?.workerIndex ?? -1,
              attemptCount: attempts.length,
              hadRetries,
              registroIds,
              finalRegistroId: finalAttempt?.registroId || null,
              isFunctionalTest,
              hasFunctionalEvidence,
              operacionFuncional: finalAttempt?.operacionFuncional || attempts.find(a => a.operacionFuncional)?.operacionFuncional || null,
              evidenciaFuncional: finalAttempt?.evidenciaFuncional || attempts.find(a => a.evidenciaFuncional)?.evidenciaFuncional || null,
              durationMs: finalAttempt?.durationMs || 0,
              errorPattern: definitiveError?.errorPattern || null,
              errorAudience: definitiveError?.errorAudience || null,
              annotations: finalAttempt?.annotations || []
            });
          }
        }
        
        if (suite.suites) {
          walkSuites(suite.suites, suiteTitles);
        }
      }
    };
    
    walkSuites(this._raw.suites || []);
    
    return {
      testListFinal,
      attemptList,
      ipSummary: this._aggregateByIp(testListFinal, attemptList),
      endpointSummary: this._aggregateByEndpoint(testListFinal, attemptList),
      integridad: this._buildIntegridad(testListFinal, attemptList)
    };
  }

  /**
   * Agregación por IP - FÓRMULAS CORREGIDAS
   * Nunca usa intentos como denominador de tasas de éxito
   * Las tasas siempre se calculan sobre tests únicos
   */
  _aggregateByIp(testListFinal, attemptList) {
    const byIp = new Map();
    
    // Inicializar con tests finales para que el denominador incluya fallos sin evidencia.
    const functionalAttempts = attemptList.filter(attempt => attempt.functionalEvidence);
    const functionalTests = testListFinal.filter(test => test.isFunctionalTest || test.hasFunctionalEvidence);

    const ensureIpRow = (ip) => {
      if (!byIp.has(ip)) {
        byIp.set(ip, {
          ip,
          workers: new Set(),
          testsUnicosSet: new Set(),
          intentosEjecutados: 0,
          intentosExitosos: 0,
          intentosFallidos: 0,
          intentosTimeout: 0,
          registrosCreados: 0,
          registrosUnicos: new Set(),
          operacionesFuncionales: 0,
          finalSuccessSet: new Set(),
          finalFailedSet: new Set(),
          flakySet: new Set(),
          latencies: [],
          endpointCounts: new Map()
        });
      }
      return byIp.get(ip);
    };

    for (const test of functionalTests) {
      const ip = test.assignedIp || 'NO_IP';
      const row = ensureIpRow(ip);
      row.workers.add(test.workerIndex);
      row.testsUnicosSet.add(test.testId);
    }

    for (const attempt of functionalAttempts) {
      const ip = attempt.assignedIp || 'NO_IP';
      const row = ensureIpRow(ip);
      row.workers.add(attempt.workerIndex);
      row.testsUnicosSet.add(attempt.testId);
      row.intentosEjecutados += 1;
      row.latencies.push(attempt.durationMs);
      
      if (attempt.status === 'passed') row.intentosExitosos += 1;
      else if (attempt.status === 'failed') row.intentosFallidos += 1;
      else if (attempt.status === 'timedOut') row.intentosTimeout += 1;
      
      if (attempt.registroId) {
        row.registrosCreados += 1;
        row.registrosUnicos.add(attempt.registroId);
      }
      if (attempt.functionalEvidence && attempt.status === 'passed') row.operacionesFuncionales += 1;
      
      if (attempt.apiEndpoint) {
        row.endpointCounts.set(
          attempt.apiEndpoint,
          (row.endpointCounts.get(attempt.apiEndpoint) || 0) + 1
        );
      }
    }
    
    // Agregar datos de tests finales (para tasas correctas)
    for (const test of functionalTests) {
      const ip = test.assignedIp || 'NO_IP';
      const row = byIp.get(ip);
      if (!row) continue;
      
      if (test.finalStatus === 'passed' || test.finalStatus === 'flaky') {
        row.finalSuccessSet.add(test.testId);
      } else if (test.finalStatus === 'failed' || test.finalStatus === 'timedOut') {
        row.finalFailedSet.add(test.testId);
      }
      
      if (test.hadRetries) {
        row.flakySet.add(test.testId);
      }
    }
    
    // Calcular métricas finales
    return [...byIp.values()].map(row => {
      const testsUnicos = row.testsUnicosSet.size;
      const exitososFinales = row.finalSuccessSet.size;
      const fallidosFinales = row.finalFailedSet.size;
      const flakyCount = row.flakySet.size;
      
      return {
        ip: row.ip,
        workers: [...row.workers].sort((a, b) => a - b),
        testsUnicos,
        intentosEjecutados: row.intentosEjecutados,
        intentosExitosos: row.intentosExitosos,
        intentosFallidos: row.intentosFallidos,
        intentosTimeout: row.intentosTimeout,
        registrosCreados: row.registrosCreados,
        registrosUnicos: [...row.registrosUnicos],
        operacionesFuncionales: row.operacionesFuncionales,
        exitososFinales,
        fallidosFinales,
        // FÓRMULAS CORREGIDAS - nunca > 100%
        tasaExitoFinal: testsUnicos > 0 ? (exitososFinales / testsUnicos) * 100 : 0,
        tasaFalloFinal: testsUnicos > 0 ? (fallidosFinales / testsUnicos) * 100 : 0,
        flakyRate: testsUnicos > 0 ? (flakyCount / testsUnicos) * 100 : 0,
        latenciaAvgMs: row.latencies.length ? row.latencies.reduce((a, b) => a + b, 0) / row.latencies.length : 0,
        latenciaP95Ms: percentile95(row.latencies),
        endpointCounts: Object.fromEntries(row.endpointCounts)
      };
    });
  }

  _aggregateByEndpoint(testListFinal, attemptList) {
    const byEndpoint = new Map();
    
    const functionalAttempts = attemptList.filter(attempt => attempt.functionalEvidence || attempt.errors?.length);
    const functionalTests = testListFinal.filter(test => test.isFunctionalTest || test.hasFunctionalEvidence || test.errorPattern);

    for (const attempt of functionalAttempts) {
      const endpoint = attempt.apiEndpoint || 'NO_ENDPOINT';
      if (!byEndpoint.has(endpoint)) {
        byEndpoint.set(endpoint, {
          endpoint,
          llamadasTotales: 0,
          registrosCreados: 0,
          operacionesFuncionales: 0,
          latencies: [],
          errorPatterns: new Map(),
          testIds: new Set(),
          retriedTestIds: new Set(),
          finalFailedIds: new Set(),
          finalSuccessIds: new Set()
        });
      }
      
      const row = byEndpoint.get(endpoint);
      row.llamadasTotales += 1;
      row.latencies.push(attempt.durationMs);
      row.testIds.add(attempt.testId);
      
      if (attempt.registroId) row.registrosCreados += 1;
      if (attempt.functionalEvidence && attempt.status === 'passed') row.operacionesFuncionales += 1;
      
      if (attempt.errorPattern && attempt.errorPattern !== 'Otro') {
        row.errorPatterns.set(
          attempt.errorPattern,
          (row.errorPatterns.get(attempt.errorPattern) || 0) + 1
        );
      }
    }
    
    for (const test of functionalTests) {
      const endpoint = test.apiEndpoint || 'NO_ENDPOINT';
      const row = byEndpoint.get(endpoint);
      if (!row) continue;
      
      if (test.hadRetries) row.retriedTestIds.add(test.testId);
      if (test.finalStatus === 'passed' || test.finalStatus === 'flaky') {
        row.finalSuccessIds.add(test.testId);
      } else {
        row.finalFailedIds.add(test.testId);
      }
    }
    
    return [...byEndpoint.values()].map(row => ({
      endpoint: row.endpoint,
      llamadasTotales: row.llamadasTotales,
      exitososFinales: row.finalSuccessIds.size,
      fallidosFinales: row.finalFailedIds.size,
      retriesNecesarios: row.retriedTestIds.size,
      registrosCreados: row.registrosCreados,
      operacionesFuncionales: row.operacionesFuncionales,
      errorPatterns: Object.fromEntries(row.errorPatterns),
      latenciaAvgMs: row.latencies.length ? row.latencies.reduce((a, b) => a + b, 0) / row.latencies.length : 0,
      latenciaP95Ms: percentile95(row.latencies),
      tasaPersistencia: row.llamadasTotales > 0 ? (row.registrosCreados / row.llamadasTotales) * 100 : 0
    }));
  }

  _buildIntegridad(testListFinal, attemptList) {
    const registros = attemptList.map(a => a.registroId).filter(Boolean);
    const registrosUnicos = [...new Set(registros)];
    const functionalTests = testListFinal.filter(t => t.isFunctionalTest || t.hasFunctionalEvidence);
    const evidenciasFuncionales = testListFinal.filter(t =>
      t.hasFunctionalEvidence && (t.finalStatus === 'passed' || t.finalStatus === 'flaky')
    ).length;
    
    return {
      testsUnicos: testListFinal.length,
      testsFuncionales: functionalTests.length,
      evidenciasFuncionales,
      intentosTotal: attemptList.length,
      retriesTotal: attemptList.length - testListFinal.length,
      registrosTotal: registros.length,
      registrosUnicos: registrosUnicos.length,
      ratioPersistencia: attemptList.length > 0 ? (registros.length / attemptList.length) * 100 : 0,
      ratioPersistenciaUnica: testListFinal.length > 0 ? (registrosUnicos.length / testListFinal.length) * 100 : 0,
      ratioPersistenciaFuncional: functionalTests.length > 0 ? (evidenciasFuncionales / functionalTests.length) * 100 : 0,
      duplicados: registros.filter((id, i) => registros.indexOf(id) !== i)
    };
  }

  /**
   * Getter que expone la vista dual completa.
   * Usar esto en generar-html.js para acceder a métricas corregidas.
   */
  get dualView() {
    return this.processDualView();
  }

  /**
   * Reemplazo corregido de ipSummary original.
   * Usa tests únicos como base, nunca intentos.
   */
  get ipSummaryCorregido() {
    const dual = this.processDualView();
    return dual.ipSummary;
  }

  /**
   * Exporta un objeto plano con las metricas clave para la herramienta IA.
   * @returns {object}
   */
  toAiPayload() {
    const budget = this.errorBudget;
    const spectrum = this.errorSpectrum;
    return {
      test_context: {
        name: this.testName,
        run_id: this.runId,
        source_ip: this.sourceIp,
        workers: this.functionalWorkerList.length,
        duration: this.durationStr,
        slo_pass_rate: this.slo.passRate,
        slo_flaky_rate: this.slo.flakyRate,
      },
      global_metrics: {
        total_tests: this.totalTests,
        passed_tests: this.passedTests,
        failed_tests: this.failedTests,
        flaky_tests: this.flakyTests,
        skipped_tests: this.skippedTests,
        pass_rate: parseFloat(this.passRate.toFixed(4)),
        fail_rate: parseFloat(this.failRate.toFixed(4)),
        flaky_rate: parseFloat(this.flakyRate.toFixed(4)),
        slo_passed: this.sloPass,
        status: this.status,
        duration: this.durationStr,
      },
      suite_summary: this.suiteSummary,
      error_spectrum: Object.entries(spectrum).map(([type, count]) => ({ type, count })),
      error_budget: {
        consumed_pct: budget.consumedPct,
        remaining_pct: budget.remainingPct,
        margin_tests: budget.marginTests,
        slo_pass_rate: budget.sloPassRate,
      },
      ip_summary: this.ipSummary,
      concurrency_analysis: this.concurrencyAnalysis,
      worker_context_note: this.workerContextNote,
      worker_summary: this.functionalWorkerList.map((w) => ({
        index: w.index,
        slot: w.slot,
        assignedUser: w.assignedUser,
        assignedIp: w.assignedIp,
        ipMode: w.ipMode,
        tests: w.tests.length,
        passed: w.passed,
        failed: w.failed,
        durationStr: this._formatDuration(w.totalDurationMs),
      })),
      failed_tests_detail: this._allTests
        .filter((t) => t.status === 'failed' || t.status === 'timedOut')
        .map((t) => ({
          title: t.title,
          suite: t.suite,
          worker: t.workerIndex,
          user: t.assignedUser,
          ip: t.assignedIp,
          status: t.status,
          error: t.errors && t.errors.length > 0 ? `${t.errors[0].message || ''}`.substring(0, 200) : 'Sin detalle',
        })),
    };
  }
}

// ── Utilidad: Resolver JSON más reciente ─────────────────────────────────────
function resolveTargetJson(reportsDir, arg) {
  if (arg && fs.existsSync(arg)) return path.resolve(arg);

  const candidates = [];
  fs.readdirSync(reportsDir)
    .filter((f) => f.endsWith('.json'))
    .forEach((f) => candidates.push(path.join(reportsDir, f)));

  // También buscar en subdirectorios
  fs.readdirSync(reportsDir)
    .filter((f) => fs.statSync(path.join(reportsDir, f)).isDirectory())
    .forEach((dir) => {
      const fullDir = path.join(reportsDir, dir);
      fs.readdirSync(fullDir)
        .filter((f) => f.endsWith('.json'))
        .forEach((f) => candidates.push(path.join(fullDir, f)));
    });

  if (!candidates.length) {
    throw new Error(`[resolveTargetJson] No se encontró ningún JSON de resultados en: ${reportsDir}`);
  }

  candidates.sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);
  return candidates[0];
}

module.exports = { PlaywrightReader, DEFAULT_SLO, fmtMs, fmtPct, resolveTargetJson };
