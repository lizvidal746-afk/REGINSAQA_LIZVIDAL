/**
 * tools/lib/k6-reader.js
 * ══════════════════════════════════════════════════════════════════════════════
 * Adaptador canónico para el JSON generado por `k6 --summary-export`.
 *
 * PROPÓSITO: Única fuente de verdad para extraer métricas k6.
 *   Todos los generadores (Word, Excel, IA) importan ESTE módulo.
 *   Ningún generador accede al JSON directamente.
 *
 * CONTRATO DE DATOS k6 summary-export (v0.43+):
 *
 *   Trend  (http_req_duration, http_req_waiting, http_req_blocked, ...):
 *     { avg, min, med, max, "p(90)", "p(95)", "p(99)", count, thresholds? }
 *
 *   Rate   (checks, http_req_failed, session_success_rate, error_rate):
 *     { passes, fails, value, thresholds? }
 *     value = passes / (passes + fails)  → ratio 0.0–1.0
 *
 *   Counter (http_reqs, data_sent, data_received, iterations):
 *     { count, rate }   ← rate = count / test_duration_s
 *
 *   Gauge  (vus, vus_max):
 *     { value, min, max }
 *
 * IMPORTANTE — Tags de endpoint:
 *   Cuando hay thresholds por tag, k6 incluye métricas como
 *   `http_req_duration{endpoint:carnet_consulta}` dentro de `values`.
 *   Si no existen, los endpoints se reconstruyen desde root_group.
 *
 * ESCALABILIDAD:
 *   Diseñado para 1 VU / 1 IP (modo actual).
 *   Extensible a multi-IP sin modificar este módulo:
 *   `k6 --out json` con tags por IP se procesará en K6ReaderMultiIP (futuro).
 * ══════════════════════════════════════════════════════════════════════════════
 */

const fs = require('node:fs');
const path = require('node:path');

// ── SLOs institucionales SUNEDU (sobrescribibles) ────────────────────────────
const DEFAULT_SLO = {
  p95Ms: 1500, // Latencia máx. aceptable (p95)
  p99Ms: 2000, // Latencia máx. cola (p99)
  errorRate: 0.01, // 1% tasa de errores
  checksRate: 0.99, // 99% validaciones funcionales
  apdexMin: 0.9, // Índice mínimo de satisfacción
  apdexTarget: 800, // ms para considerar "satisfecho" en APDEX
};

const ENDPOINT_LABELS = {
  infraccion_listar: {
    label: 'INFRACCION / LISTAR',
    url: '/Infraccion/Listar',
  },
  cabecerainfraccionsancion_crear: {
    label: 'CABECERA INFRACCION SANCION / CREAR',
    url: '/CabeceraInfraccionSancion/Crear',
  },
  medidacorrectiva_crear: {
    label: 'MEDIDA CORRECTIVA / CREAR',
    url: '/MedidaCorrectiva/Crear',
  },
  detalleinfraccionsancion_crear: {
    label: 'DETALLE INFRACCION SANCION / CREAR',
    url: '/DetalleInfraccionSancion/Crear',
  },
};

function parseMetricKey(key) {
  const match = String(key).match(/^([^{}]+)(?:\{(.+)\})?$/);
  if (!match) return { base: key, tags: {} };
  const tags = {};
  if (match[2]) {
    match[2].split(',').forEach((pair) => {
      const idx = pair.indexOf(':');
      if (idx > -1) tags[pair.slice(0, idx)] = pair.slice(idx + 1);
    });
  }
  return { base: match[1], tags };
}

function safeReadJson(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/^\uFEFF/, '');
  const firstBrace = content.indexOf('{');
  const firstBracket = content.indexOf('[');
  const lastBrace = content.lastIndexOf('}');
  const lastBracket = content.lastIndexOf(']');
  let startIdx = -1;
  let endIdx = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = lastBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = lastBracket;
  }
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    content = content.substring(startIdx, endIdx + 1);
  }
  content = content.replace(/[\x00-\x1F\x7F-\x9F]/g, (match) => {
    if (match === '\n' || match === '\r' || match === '\t') return match;
    return '';
  });
  try {
    return JSON.parse(content);
  } catch (e) {
    const snippet = content.substring(0, 200) + '...';
    throw new Error(`Error parseando JSON en "${path.basename(filePath)}": ${e.message}. Snippet: ${snippet}`);
  }
}

// ── Clase principal ──────────────────────────────────────────────────────────
class K6Reader {
  /**
   * @param {string} jsonPath - Ruta absoluta al JSON summary-export de k6
   * @param {Partial<typeof DEFAULT_SLO>} [sloOverrides]
   * @throws {Error} Si el archivo no existe, el JSON es inválido o el run está vacío
   */
  constructor(jsonPath, sloOverrides = {}) {
    this.jsonPath = path.resolve(jsonPath);
    this.slo = { ...DEFAULT_SLO, ...sloOverrides };

    // ── Carga y validación inicial ──────────────────────────────────────────
    if (!fs.existsSync(this.jsonPath)) {
      throw new Error(`[K6Reader] Archivo no encontrado: ${this.jsonPath}`);
    }

    let raw;
    try {
      raw = safeReadJson(this.jsonPath);
    } catch (e) {
      throw new Error(`[K6Reader] JSON inválido en "${path.basename(this.jsonPath)}": ${e.message}`);
    }

    this._m = raw.metrics || {};
    this._root = raw.root_group || null;
    this._raw = raw;

    // ── Validación de contrato de datos ────────────────────────────────────
    this._validateContract();

    // ── Metadatos del run ──────────────────────────────────────────────────
    const base = path.basename(this.jsonPath, '.json');
    this.testName = base.replace(/-\d{4}-\d{2}-\d{2}.*$/, '').toUpperCase();
    this.runId = base;
    this.outDir = path.dirname(this.jsonPath);
    this.sourceIp = raw.metadata?.ip_origen ?? this._inferSourceIp();
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

    console.log(
      `[K6Reader] ✅ JSON validado | Run: ${this.runId}\n` +
        `           Requests: ${this.totalRequests} | p95: ${Math.round(this.p95)}ms | ` +
        `APDEX: ${this.apdex.toFixed(3)} | Estado: ${this.statusEmoji} ${this.status}`,
    );
  }

  // ── Validación de contrato ────────────────────────────────────────────────
  _validateContract() {
    const required = ['http_req_duration', 'http_reqs', 'http_req_failed'];
    const missing = required.filter((k) => !this._m[k]);
    if (missing.length) {
      throw new Error(`[K6Reader] Métricas requeridas faltantes: ${missing.join(', ')}`);
    }

    if (this.totalRequests === 0) {
      throw new Error(
        `[K6Reader] ABORT: El run tiene 0 requests HTTP.\n` +
          `  Causas posibles: run vacío, script k6 sin requests, o JSON incorrecto.\n` +
          `  Archivo: ${this.jsonPath}`,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACCESORES DE MÉTRICAS — API pública tipada por tipo de métrica
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Lee una métrica TREND (http_req_duration, http_req_waiting, etc.)
   * Estructura k6: { avg, min, med, max, "p(90)", "p(95)", "p(99)", count }
   *
   * @param {string} name
   * @param {'avg'|'min'|'max'|'p50'|'p90'|'p95'|'p99'|'count'} stat
   * @returns {number}
   */
  trend(name, stat) {
    const metric = this._m[name];
    if (!metric) return 0;

    // Soportar formato k6 interno (con .values) y formato summary-export (aplanado)
    const v = metric.values || metric;

    const statMap = {
      p50: 'med',
      p90: 'p(90)',
      p95: 'p(95)',
      p99: 'p(99)',
      avg: 'avg',
      min: 'min',
      max: 'max',
      count: 'count',
      med: 'med',
    };
    return v[statMap[stat] ?? stat] ?? 0;
  }

  /**
   * Lee una métrica RATE (checks, http_req_failed, session_success_rate)
   * Estructura k6: { passes, fails, value }  ← value = ratio 0-1
   *
   * @param {string} name
   * @returns {number} ratio 0.0–1.0
   */
  rate(name) {
    const m = this._m[name];
    if (!m) return 0;
    const v = m.values || m;
    return v.rate ?? v.value ?? 0;
  }

  /**
   * Lee los conteos raw de una métrica RATE (passes / fails)
   * @param {string} name
   * @returns {{ passes: number, fails: number }}
   */
  rateCounts(name) {
    const m = this._m[name];
    const v = m?.values || m;
    return { passes: v?.passes ?? 0, fails: v?.fails ?? 0 };
  }

  /**
   * Lee una métrica COUNTER (http_reqs, data_sent, iterations)
   * Estructura k6: { count, rate }  ← rate = count/segundo
   *
   * @param {string} name
   * @param {'count'|'rps'} stat
   * @returns {number}
   */
  counter(name, stat = 'count') {
    const metric = this._m[name];
    if (!metric) return 0;
    const v = metric.values || metric;
    return stat === 'rps' ? (v.rate ?? 0) : (v.count ?? 0);
  }

  /**
   * Lee una métrica GAUGE (vus, vus_max)
   * @param {string} name
   * @param {'value'|'min'|'max'} stat
   * @returns {number}
   */
  gauge(name, stat = 'value') {
    const m = this._m[name];
    if (!m) return 0;
    const v = m.values || m;
    return v[stat] ?? 0;
  }

  metricValues(name) {
    const m = this._m[name];
    return m ? m.values || m : {};
  }

  taggedCount(base, filters = {}) {
    return Object.entries(this._m).reduce((sum, [key, raw]) => {
      const parsed = parseMetricKey(key);
      if (parsed.base !== base) return sum;
      const ok = Object.entries(filters).every(([k, v]) => parsed.tags[k] === String(v));
      if (!ok) return sum;
      const v = raw.values || raw;
      return sum + (v.count ?? 0);
    }, 0);
  }

  outcomeCount(outcome, filters = {}) {
    return this.taggedCount('http_outcome_count', { ...filters, outcome });
  }

  createdCount(operation) {
    return this.taggedCount('reginsa_created_records', { operation });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROPIEDADES DERIVADAS — Acceso directo a KPIs comunes
  // ══════════════════════════════════════════════════════════════════════════

  // Latencia principal
  get totalRequests() {
    return this.counter('http_reqs', 'count');
  }
  get testRunDurationMs() {
    return this._raw.state?.testRunDurationMs ?? 0;
  }
  get testRunDurationStr() {
    const ms = this.testRunDurationMs;
    if (ms === 0) return 'N/D';
    const totalSecs = Math.round(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  }
  get rps() {
    return this.counter('http_reqs', 'rps');
  }
  get p50() {
    return this.trend('http_req_duration', 'p50');
  }
  get p90() {
    return this.trend('http_req_duration', 'p90');
  }
  get p95() {
    return this.trend('http_req_duration', 'p95');
  }
  get p99() {
    return this.trend('http_req_duration', 'p99');
  }
  get avgDuration() {
    return this.trend('http_req_duration', 'avg');
  }
  get maxDuration() {
    return this.trend('http_req_duration', 'max');
  }
  get minDuration() {
    return this.trend('http_req_duration', 'min');
  }

  // Calidad
  get errorRate() {
    return Math.max(this.rate('http_req_failed'), this.rate('error_rate'));
  }
  get httpErrorRate() {
    return this.rate('http_req_failed');
  }
  get checksRate() {
    return this.rate('checks');
  }
  get sessionRate() {
    return this.rate('session_success_rate');
  }
  get apdex() {
    return this.trend('apdex_score', 'avg');
  }

  // Descomposición de latencia (Golden Signals SRE)
  get ttfb() {
    return this.trend('http_req_waiting', 'avg');
  }
  get ttfbP95() {
    return this.trend('http_req_waiting', 'p95');
  }
  get blockedAvg() {
    return this.trend('http_req_blocked', 'avg');
  }
  get blockedP95() {
    return this.trend('http_req_blocked', 'p95');
  }
  get tlsAvg() {
    return this.trend('http_req_tls_handshaking', 'avg');
  }
  get tlsP95() {
    return this.trend('http_req_tls_handshaking', 'p95');
  }
  get connectingAvg() {
    return this.trend('http_req_connecting', 'avg');
  }
  get sendingAvg() {
    return this.trend('http_req_sending', 'avg');
  }
  get receivingAvg() {
    return this.trend('http_req_receiving', 'avg');
  }
  get iterationAvg() {
    return this.trend('iteration_duration', 'avg');
  }

  // Infraestructura
  get vusMax() {
    return this.gauge('vus_max', 'max');
  }
  get dataRecvKB() {
    return Math.round((this.counter('data_received', 'count') / 1024) * 100) / 100;
  }
  get dataSentKB() {
    return Math.round((this.counter('data_sent', 'count') / 1024) * 100) / 100;
  }

  // Checks raw
  get checksPasses() {
    return this.rateCounts('checks').passes;
  }
  get checksFails() {
    return this.rateCounts('checks').fails;
  }

  _inferSourceIp() {
    const ips = this.localIps;
    if (ips.length === 0) return 'N/D';
    if (ips.length === 1) return ips[0];
    return `${ips.length} IPs (${ips[0]}-${ips[ips.length - 1]})`;
  }

  /** @returns {string} Timestamp formateado para nombres de archivos (Hora Lima: YYYY-MM-DD_HH-mm) */
  get filenameStamp() {
    const d = new Date();
    // Ajuste manual a UTC-5 (Lima) si no estamos en ese entorno
    // O mejor usar toLocaleString y parsear
    const lima = new Date(d.toLocaleString('en-US', { timeZone: 'America/Lima' }));
    const year = lima.getFullYear();
    const month = String(lima.getMonth() + 1).padStart(2, '0');
    const day = String(lima.getDate()).padStart(2, '0');
    const hour = String(lima.getHours()).padStart(2, '0');
    const min = String(lima.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}_${hour}-${min}`;
  }

  // ── Multi-IP (Auditoría) ──────────────────────────────────────────────────
  /** @returns {string[]} Lista de IPs detectadas en las métricas */
  get localIps() {
    const ips = new Set();
    Object.keys(this._m).forEach((k) => {
      const parsed = parseMetricKey(k);
      if (parsed.tags.source_ip) ips.add(parsed.tags.source_ip);
    });
    const arr = Array.from(ips).sort();
    return arr.length > 0 ? arr : ['Local/Global'];
  }

  /**
   * Retorna un set de métricas filtrado por IP.
   * @param {string} ip
   */
  getMetricsByIp(ip) {
    const getV = (name) => {
      const m = this._m[name];
      return m ? m.values || m : {};
    };

    if (ip === 'Local/Global') {
      return {
        dur: getV('http_req_duration'),
        fail: getV('http_req_failed'),
        ttfb: getV('ttfb_ms') || getV('http_req_waiting'),
        blk: getV('http_req_blocked'),
        tls: getV('http_req_tls_handshaking'),
      };
    }

    return {
      dur: getV(`http_req_duration{source_ip:${ip}}`),
      fail: getV(`http_req_failed{source_ip:${ip}}`),
      ttfb: getV(`ttfb_ms{source_ip:${ip}}`) || getV(`http_req_waiting{source_ip:${ip}}`),
      blk: getV(`http_req_blocked{source_ip:${ip}}`),
      tls: getV(`http_req_tls_handshaking{source_ip:${ip}}`),
    };
  }

  get statusCodeSummary() {
    const rows = [];
    Object.keys(this._m).forEach((k) => {
      const match = k.match(/^http_reqs\{status:(\d+)\}$/);
      if (!match) return;
      const v = this.metricValues(k);
      rows.push({
        status: match[1],
        count: v.count ?? 0,
        rate: v.rate ?? 0,
      });
    });
    return rows.sort((a, b) => Number(a.status) - Number(b.status));
  }

  get ipSummary() {
    return this.localIps.map((ip) => {
      const m = this.getMetricsByIp(ip);
      const reqs = m.dur.count ?? 0;
      
      // APDEX localizado: Asumimos que si no hay `apdex_score{source_ip:ip}` 
      // calculamos un aproximado o usamos el global si es 'Local/Global'
      let apdexVal = 0;
      if (ip === 'Local/Global') {
         apdexVal = this.apdex;
      } else {
         const apdexMetric = this.metricValues(`apdex_score{source_ip:${ip}}`);
         apdexVal = apdexMetric.avg ?? 0;
      }

      return {
        ip,
        requests: reqs,
        p50: Math.round(m.dur.med ?? 0),
        p95: Math.round(m.dur['p(95)'] ?? 0),
        p99: Math.round(m.dur['p(99)'] ?? 0),
        avg: Math.round(m.dur.avg ?? 0),
        error_rate: parseFloat((m.fail.rate ?? m.fail.value ?? 0).toFixed(4)),
        node: `Nodo ${this.localIps.indexOf(ip) + 1}`,
        duration: this.testRunDurationStr,
        ttfb_avg: Math.round(m.ttfb.avg ?? 0),
        blocked_avg: Math.round(m.blk.avg ?? 0),
        tls_avg: Math.round(m.tls.avg ?? 0),
        apdex: parseFloat(apdexVal.toFixed(3))
      };
    });
  }

  get ipResponseDistribution() {
    const map = {};
    const statusSummary = this.statusCodeSummary;

    this.localIps.forEach(ip => {
      map[ip] = { success: 0, business: 0, rate_limited: 0, errors: 0, error_details: [] };

      if (ip === 'Local/Global') {
        statusSummary.forEach(s => {
          const code = Number(s.status);
          if (code >= 200 && code < 300) map[ip].success += s.count;
          else if (code === 400 || code === 404 || code === 422) map[ip].business += s.count;
          else if (code === 429) map[ip].rate_limited += s.count;
          else map[ip].errors += s.count;
        });

        const netErrors = this.counter('http_req_failed', 'count') - statusSummary.filter(s => Number(s.status) >= 400).reduce((a, b) => a + b.count, 0);
        if (netErrors > 0) map[ip].errors += netErrors;
      }
    });

    return map;
  }

  get functionalFlow() {
    const byEndpoint = (endpoint) => {
      const success = this.outcomeCount('success', { endpoint });
      const business = this.outcomeCount('business', { endpoint });
      const rateLimited = this.outcomeCount('rate_limited', { endpoint });
      const error = this.outcomeCount('error', { endpoint });
      const network = this.outcomeCount('network', { endpoint });
      const exact = success + business + rateLimited + error + network;
      if (exact > 0) return { success, business, rateLimited, error, network };

      const dur = this.metricValues(`http_req_duration{endpoint:${endpoint}}`);
      const fail = this.metricValues(`http_req_failed{endpoint:${endpoint}}`);
      const reqs = dur.count ?? 0;
      const failures = Math.round(reqs * (fail.rate ?? fail.value ?? 0));
      return {
        success: Math.max(0, reqs - failures),
        business: 0,
        rateLimited: endpoint === 'cabecerainfraccionsancion_crear' ? failures : 0,
        error: endpoint === 'detalleinfraccionsancion_crear' ? failures : 0,
        network: 0,
      };
    };

    return [
      { type: 'Consulta', step: 'Listar infracciones', endpoint: 'infraccion_listar', created: null, counts: byEndpoint('infraccion_listar') },
      { type: 'Creación', step: 'Crear cabecera', endpoint: 'cabecerainfraccionsancion_crear', created: this.createdCount('cabecera'), counts: byEndpoint('cabecerainfraccionsancion_crear') },
      { type: 'Creación', step: 'Crear medida correctiva', endpoint: 'medidacorrectiva_crear', created: this.createdCount('medida'), counts: byEndpoint('medidacorrectiva_crear') },
      { type: 'Creación', step: 'Crear detalle sanción', endpoint: 'detalleinfraccionsancion_crear', created: this.createdCount('detalle_sancion'), counts: byEndpoint('detalleinfraccionsancion_crear') },
    ];
  }

  // ── Error Budget ──────────────────────────────────────────────────────────
  /**
   * Calcula el Error Budget basado en p95 vs SLO.
   * @returns {{ consumedPct, remainingPct, marginMs, sloMs, p95Ms }}
   */
  get errorBudget() {
    const consumed = Math.min((this.p95 / this.slo.p95Ms) * 100, 100);
    return {
      consumedPct: parseFloat(consumed.toFixed(1)),
      remainingPct: parseFloat((100 - consumed).toFixed(1)),
      marginMs: Math.max(0, Math.round(this.slo.p95Ms - this.p95)),
      sloMs: this.slo.p95Ms,
      p95Ms: Math.round(this.p95),
    };
  }

  // ── Estado SLO ───────────────────────────────────────────────────────────
  /** @returns {boolean} */
  get sloPass() {
    return (
      this.p95 < this.slo.p95Ms &&
      this.errorRate < this.slo.errorRate &&
      this.checksRate >= this.slo.checksRate &&
      (!this._m.session_success_rate || this.sessionRate >= this.slo.checksRate)
    );
  }

  get functionalChecksRate() {
    return this.checksRate;
  }

  get performanceThresholdStatus() {
    const thresholds = this._raw.metrics
      ? Object.values(this._raw.metrics)
          .filter((m) => m.thresholds)
          .flatMap((m) => m.thresholds || [])
      : [];
    const breached = thresholds.filter((t) => t.ok === false).length;
    return breached > 0 ? 'FAIL' : 'PASS';
  }

  get functionalPersistenceRatio() {
    const iteracionesExitosas = this.counter('iterations', 'count') || 1;
    const registrosConfirmados = this.createdCount('detalle_sancion') || 0;
    return parseFloat(((registrosConfirmados / iteracionesExitosas) * 100).toFixed(2));
  }

  get technicalStatus() {
    if (
      this.errorRate >= this.slo.errorRate ||
      this.checksRate < this.slo.checksRate ||
      this.performanceThresholdStatus === 'FAIL'
    ) {
      return 'FAIL';
    }
    return 'PASS';
  }

  get goDecision() {
    if (this.technicalStatus === 'FAIL') {
      if (this.functionalPersistenceRatio === 100 && this.errorRate < 0.10) {
        return 'GO_CON_RIESGO';
      } else {
        return 'NO_GO';
      }
    }
    return 'GO';
  }

  /** @returns {'PASA'|'DEGRADADO'|'FALLA'} */
  get status() {
    if (this.technicalStatus === 'FAIL') return 'FALLA';
    if (this.sloPass && this.apdex >= this.slo.apdexMin) return 'PASA';
    if (this.p95 < this.slo.p95Ms * 1.2) return 'DEGRADADO';
    return 'FALLA';
  }

  get statusEmoji() {
    return { PASA: '🟢', DEGRADADO: '🟡', FALLA: '🔴' }[this.status] ?? '⚪';
  }

  get statusFull() {
    return `${this.statusEmoji} ESTADO ${this.status}`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ENDPOINTS — Extraídos de root_group.groups (no de tags de métricas)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Retorna todas las iteraciones de endpoints encontradas en root_group.
   * Cada elemento es una iteración individual (ej: "Carnet Iteración 1").
   *
   * Estructura de retorno:
   * [{
   *   name: string,      // Nombre del grupo k6
   *   endpoint: string,  // 'carnet_consulta' | 'grados_consulta'
   *   url: string,       // URL completa extraída del nombre del grupo
   *   passes: number,    // Total de checks aprobados
   *   fails: number,     // Total de checks fallidos
   *   checks: Array      // Checks individuales
   * }]
   */
  get endpointIterations() {
    if (!this._root) return [];
    const result = [];

    const collectGroups = (group) => {
      if (!group) return;
      const name = group.name ?? '';

// Grupos que contienen un endpoint real (tienen URL en el nombre)
      if (/https?:\/\/.+/.test(name)) {
        const endpointName = name.replace(/.*https?:\/\//, '').split(/[\s/()]+/)[0];
        const checksObj = group.checks ?? {};
        const checks = Object.values(checksObj);
        result.push({
          name,
          endpoint: endpointName,
          url: name.match(/https?:\/\/[^\s()]+/)?.[0] ?? 'N/D',
          passes: checks.reduce((a, c) => a + (c.passes ?? 0), 0),
          fails: checks.reduce((a, c) => a + (c.fails ?? 0), 0),
          checks,
        });
      }

      // Recorrer sub-grupos recursivamente
      if (group.groups) {
        Object.values(group.groups).forEach(collectGroups);
      }
    };

    collectGroups(this._root);
    return result;
  }

  /**
   * Resumen agregado por tipo de endpoint.
   * Agrupa todas las iteraciones de un mismo endpoint.
   *
   * @returns {Array<{endpoint, url, totalRequests, passes, fails, successRate, iterations}>}
   */
  get endpointSummary() {
    const map = {};
    for (const iter of this.endpointIterations) {
      if (!map[iter.endpoint]) {
        map[iter.endpoint] = {
          endpoint: iter.endpoint,
          url: iter.url,
          totalRequests: 0,
          passes: 0,
          fails: 0,
          iterations: 0,
        };
      }
      const ep = map[iter.endpoint];
      ep.totalRequests += iter.passes + iter.fails;
      ep.passes += iter.passes;
      ep.fails += iter.fails;
      ep.iterations += 1;
    }

    const grouped = Object.values(map).map((ep) => {
      const dur = this.metricValues(`http_req_duration{endpoint:${ep.endpoint}}`);
      const fail = this.metricValues(`http_req_failed{endpoint:${ep.endpoint}}`);
      const count = dur ? (dur.count ?? 0) : 0;
      return {
        ...ep,
        successRate: ep.totalRequests > 0 ? parseFloat(((ep.passes / ep.totalRequests) * 100).toFixed(2)) : 0,
        reqs: count,
        p50: dur ? (dur.med ?? null) : null,
        p95: dur ? (dur['p(95)'] ?? null) : null,
        p99: dur ? (dur['p(99)'] ?? null) : null,
        avg: dur ? (dur.avg ?? null) : null,
        max: dur ? (dur.max ?? null) : null,
        errorRate: fail ? (fail.rate ?? fail.value ?? 0) : 0,
      };
    });

    if (grouped.length > 0) return grouped;

    return Object.keys(this._m)
      .map((key) => key.match(/^http_req_duration\{endpoint:([^}]+)\}$/)?.[1])
      .filter(Boolean)
      .sort()
      .map((endpoint) => {
        const dur = this.metricValues(`http_req_duration{endpoint:${endpoint}}`);
        const fail = this.metricValues(`http_req_failed{endpoint:${endpoint}}`);
        const reqs = dur.count ?? 0;
        const meta = ENDPOINT_LABELS[endpoint] || { label: endpoint.replace(/_/g, '/').toUpperCase(), url: 'N/D' };
        return {
          endpoint,
          label: meta.label,
          url: meta.url,
          totalRequests: reqs,
          passes: Math.round(reqs * (1 - (fail.rate ?? fail.value ?? 0))),
          fails: Math.round(reqs * (fail.rate ?? fail.value ?? 0)),
          iterations: reqs,
          successRate: reqs > 0 ? parseFloat(((1 - (fail.rate ?? fail.value ?? 0)) * 100).toFixed(2)) : 0,
          reqs,
          p50: dur.med ?? null,
          p95: dur['p(95)'] ?? null,
          p99: dur['p(99)'] ?? null,
          avg: dur.avg ?? null,
          max: dur.max ?? null,
          errorRate: fail.rate ?? fail.value ?? 0,
        };
      });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SERIALIZACIÓN — Para alimentar otras herramientas (IA, CSV, etc.)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Exporta un objeto plano con las métricas clave para la herramienta IA.
   * @returns {object}
   */
  toAiPayload() {
    const budget = this.errorBudget;
    return {
      test_context: {
        name: this.testName,
        run_id: this.runId,
        source_ip: this.sourceIp,
        vus_max: this.vusMax,
        duration: this.testRunDurationStr,
        slo_latency_ms: this.slo.p95Ms,
        slo_error_rate: this.slo.errorRate,
      },
      global_metrics: {
        total_requests: this.totalRequests,
        rps: parseFloat(this.rps.toFixed(2)),
        duration_p50: Math.round(this.p50),
        duration_p90: Math.round(this.p90),
        duration_p95: Math.round(this.p95),
        duration_p99: Math.round(this.p99),
        duration_avg: Math.round(this.avgDuration),
        error_rate: parseFloat(this.errorRate.toFixed(4)),
        checks_rate: parseFloat(this.checksRate.toFixed(4)),
        apdex: parseFloat(this.apdex.toFixed(3)),
        slo_passed: this.sloPass,
        status: this.status,
        functionalChecksRate: this.functionalChecksRate,
        performanceThresholdStatus: this.performanceThresholdStatus,
        functionalPersistenceRatio: this.functionalPersistenceRatio,
        technicalStatus: this.technicalStatus,
        goDecision: this.goDecision,
      },
      latency_breakdown: {
        ttfb_avg_ms: Math.round(this.ttfb),
        ttfb_p95_ms: Math.round(this.ttfbP95),
        tls_avg_ms: Math.round(this.tlsAvg),
        tls_p95_ms: Math.round(this.tlsP95),
        blocked_avg_ms: Math.round(this.blockedAvg),
        blocked_p95_ms: Math.round(this.blockedP95),
        connecting_avg_ms: Math.round(this.connectingAvg),
        sending_avg_ms: Math.round(this.sendingAvg),
        receiving_avg_ms: Math.round(this.receivingAvg),
      },
      status_codes: this.statusCodeSummary,
      custom_counters: {
        rate_limited_requests: this.counter('rate_limited_requests', 'count'),
        business_limit_hits: this.counter('business_limit_hits', 'count'),
        unexpected_errors: this.counter('unexpected_errors', 'count'),
        timeout_errors: this.counter('timeout_errors', 'count'),
      },
      ip_summary: this.ipSummary,
      error_budget: {
        consumed_pct: budget.consumedPct,
        remaining_pct: budget.remainingPct,
        margin_ms: budget.marginMs,
        slo_ms: budget.sloMs,
      },
      endpoints: this.endpointSummary,
    };
  }
}

// ── Utilidades de formato (compartidas con generadores) ──────────────────────
/**
 * Formatea milisegundos con guión si el valor es 0 o nulo.
 * @param {number|null} v
 * @returns {string}
 */
function fmtMs(v) {
  if (v == null || v === 0) return '—';
  return `${Math.round(v)} ms`;
}

/**
 * Formatea ratio 0-1 como porcentaje con 2 decimales.
 * @param {number|null} v
 * @returns {string}
 */
function fmtPct(v) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

/**
 * Encuentra el JSON más reciente en el directorio de reportes.
 * Excluye archivos de IA y métricas intermedias.
 * @param {string} reportsDir
 * @param {string|null} [arg] - process.argv[2] si fue pasado
 * @returns {string} ruta absoluta al JSON
 */
function resolveTargetJson(reportsDir, arg) {
  if (arg && fs.existsSync(arg)) return path.resolve(arg);

  // Buscar en el directorio raíz de reports y subdirectorios RUN_*
  const excluded = ['ai-insights', 'metrics_for_ai', 'secuencia'];
  const candidates = [];

  // 1. Directo en reports/
  fs.readdirSync(reportsDir)
    .filter((f) => f.endsWith('.json') && !excluded.some((x) => f.includes(x)))
    .forEach((f) => candidates.push(path.join(reportsDir, f)));

  // 2. En subcarpetas que contengan RUN_ (prioridad: más reciente primero)
  fs.readdirSync(reportsDir)
    .filter((f) => f.includes('RUN_'))
    .sort()
    .reverse() // más reciente primero por nombre
    .slice(0, 5) // solo los últimos 5 runs
    .forEach((runDir) => {
      const dir = path.join(reportsDir, runDir);
      if (fs.statSync(dir).isDirectory()) {
        fs.readdirSync(dir)
          .filter((f) => f.endsWith('.json') && !excluded.some((x) => f.includes(x)))
          .forEach((f) => candidates.push(path.join(dir, f)));
      }
    });

  if (!candidates.length) {
    throw new Error(`[resolveTargetJson] No se encontró ningún JSON de resultados en: ${reportsDir}`);
  }

  // Ordenar por fecha de modificación, más reciente primero
  candidates.sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);
  return candidates[0];
}

module.exports = { K6Reader, DEFAULT_SLO, fmtMs, fmtPct, resolveTargetJson, safeReadJson };
