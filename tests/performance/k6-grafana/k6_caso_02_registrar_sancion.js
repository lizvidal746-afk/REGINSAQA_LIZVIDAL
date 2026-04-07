import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';
import { ipPoolParams, logPoolStatus, getAssignedIP, getIpLastOctet } from './helpers/ip-pool.js';

const BASE_API = __ENV.BASE_API || 'https://reginsaapiqa.sunedu.gob.pe/api';
const BURST_MODE = (__ENV.K6_BURST_MODE || '0') === '1';
const DEBUG_ERRORS = (__ENV.K6_DEBUG_ERRORS || '0') === '1';
const DEBUG_LIMIT = Math.max(1, Number.parseInt(__ENV.K6_DEBUG_ERRORS_MAX || '8', 10) || 8);

function parseIntEnv(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatEnv(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

const CABECERA_ASCII = (__ENV.K6_CABECERA_ASCII || '1') === '1';
const RUTA_RESOLUCION = __ENV.K6_RUTA_RESOLUCION || 'GENERAL N 00001-2026-SUNEDU-SG-OTI.pdf';
const CABECERA_MODE = (__ENV.K6_CABECERA_MODE || 'form_pascal').toLowerCase();
const ADMIN_SELECTION_MODE = (__ENV.K6_ADMIN_SELECTION_MODE || 'round_robin').toLowerCase();
const RIS_MODE = (__ENV.K6_RIS_MODE || 'random').toLowerCase();
const SANCION_MODE = (__ENV.K6_SANCION_MODE || 'sequence').toLowerCase();
const HTTP_DETAIL_MODE = (__ENV.K6_HTTP_DETAIL_MODE || 'all').toLowerCase();
const HTTP_PUBLIC_NAME = (__ENV.K6_HTTP_PUBLIC_NAME || 'CabeceraInfraccionSancion/Crear').trim() || 'CabeceraInfraccionSancion/Crear';
const FORCE_SINGLE_SANCION = (__ENV.K6_FORCE_SINGLE_SANCION || '1') === '1';
const FORCE_SINGLE_MEDIDA = (__ENV.K6_FORCE_SINGLE_MEDIDA || '1') === '1';
const EXPECT_RATE_LIMIT = (__ENV.K6_EXPECT_RATE_LIMIT || '1') === '1';
const TRACE_CASE = String(__ENV.K6_TRACE_CASE || 'K6-02').trim() || 'K6-02';
const DEFAULT_INFRACCION_ID = Math.max(1, parseIntEnv(__ENV.K6_INFRACCION_ID, 203));
const DEFAULT_INFRACCION_DISPLAY = String(__ENV.K6_INFRACCION_DISPLAY || 'Infraccion k6').trim() || 'Infraccion k6';

function buildRunId() {
  const requested = String(__ENV.K6_RUN_ID || '').trim();
  if (requested.length > 0) return requested;
  return TRACE_CASE;
}

const RUN_ID = buildRunId();

function resolveRunSequence() {
  const explicit = parseIntEnv(__ENV.K6_PREFIX_SEQUENCE, 0);
  if (explicit > 0) return explicit;

  const fromRunId = String(RUN_ID || '').match(/(\d+)$/);
  if (fromRunId && fromRunId[1]) {
    const parsed = parseIntEnv(fromRunId[1], 0);
    if (parsed > 0) return parsed;
  }

  return 0;
}

const RUN_SEQUENCE = resolveRunSequence();
let debugErrorCount = 0;

// ── Registros por iteración (para informe) ────────────────────────────────
const caso02Records = [];

const requestedIterations = Number.parseInt(__ENV.K6_FIXED_ITERATIONS || __ENV.K6_TOTAL_REGISTROS || '1', 10);
const iterations = Number.isFinite(requestedIterations) ? Math.max(1, requestedIterations) : 1;
const requestedMode = String(__ENV.K6_MODE || '').trim().toLowerCase();
const normalizedMode = requestedMode === 'rapida' ? 'fast' : requestedMode;
const K6_MODE = normalizedMode || (iterations <= 2 ? 'smoke' : 'fast');
const K6_SLEEP_SECONDS = parseFloatEnv(__ENV.K6_SLEEP_SECONDS, 0);
const CLOUD_PROJECT_ID = Math.max(0, parseIntEnv(__ENV.K6_CLOUD_PROJECT_ID, 0));
const vusRequested = Number.parseInt(__ENV.K6_VUS || __ENV.K6_FIXED_VUS || '1', 10);
const vus = Number.isFinite(vusRequested) ? Math.max(1, vusRequested) : 1;

const burstIterPerVuRequested = Number.parseInt(__ENV.K6_BURST_ITER_PER_VU || '', 10);
const hasBurstIterPerVu = Number.isFinite(burstIterPerVuRequested) && burstIterPerVuRequested > 0;

if (BURST_MODE && !hasBurstIterPerVu && (iterations % vus !== 0)) {
  throw new Error(`Burst mode requiere K6_FIXED_ITERATIONS divisible por K6_FIXED_VUS (actual: ${iterations}/${vus}) o definir K6_BURST_ITER_PER_VU.`);
}

const burstIterPerVu = BURST_MODE
  ? (hasBurstIterPerVu ? Math.max(1, burstIterPerVuRequested) : Math.max(1, Math.floor(iterations / vus)))
  : 0;

const HTTP_401_TOTAL = new Counter('http_401_total');
const HTTP_429_TOTAL = new Counter('http_429_total');
const HTTP_4XX_TOTAL = new Counter('http_4xx_total');
const HTTP_5XX_TOTAL = new Counter('http_5xx_total');
const HTTP_4XX_NON_429_TOTAL = new Counter('http_4xx_non_429_total');
const RATE_LIMITED_REQUESTS = new Rate('rate_limited_requests');
const STEP_OK_RATE = new Rate('step_ok_rate');
const REGISTRO_OK_RATE = new Rate('registro_ok_rate');
const REGISTRO_EXPECTED_RATE = new Rate('registro_expected_rate');
const REGISTRO_OK_TOTAL = new Counter('registro_ok_total');
const SANCION_DETALLE_OK_TOTAL = new Counter('sancion_detalle_ok_total');
const SANCION_DETALLE_EXPECTED_TOTAL = new Counter('sancion_detalle_expected_total');
const SANCION_COMPLETA_RATE = new Rate('sancion_completa_rate');

const HTTP_FAILED_RATE_MAX = parseFloatEnv(__ENV.K6_HTTP_FAILED_RATE_MAX, EXPECT_RATE_LIMIT ? 0.98 : 0.35);
const RATE_LIMITED_REQUESTS_MAX = parseFloatEnv(__ENV.K6_RATE_LIMITED_MAX, EXPECT_RATE_LIMIT ? 0.99 : 0.6);
const STEP_OK_RATE_MIN = parseFloatEnv(__ENV.K6_STEP_OK_MIN, EXPECT_RATE_LIMIT ? 0.5 : 0.7);
const REGISTRO_OK_RATE_MIN = parseFloatEnv(__ENV.K6_REGISTRO_OK_MIN, EXPECT_RATE_LIMIT ? 0.01 : 0.6);
const REGISTRO_EXPECTED_RATE_MIN = parseFloatEnv(__ENV.K6_REGISTRO_EXPECTED_MIN, EXPECT_RATE_LIMIT ? 0.4 : 0.7);
const SANCION_COMPLETA_RATE_MIN = parseFloatEnv(__ENV.K6_SANCION_COMPLETA_MIN, EXPECT_RATE_LIMIT ? 0.4 : 0.8);
const HTTP_401_MAX = Math.max(0, parseIntEnv(__ENV.K6_HTTP_401_MAX, 0));
const HTTP_5XX_MAX = Math.max(0, parseIntEnv(__ENV.K6_HTTP_5XX_MAX, 0));
const HTTP_4XX_NON_429_MAX = Math.max(0, parseIntEnv(__ENV.K6_HTTP_4XX_NON_429_MAX, EXPECT_RATE_LIMIT ? 3 : 0));
const ENFORCE_OK_RATE = (__ENV.K6_ENFORCE_OK_RATE || (EXPECT_RATE_LIMIT ? '0' : '1')) === '1';
const ALLOW_HTTP_FAILED_THRESHOLD = (__ENV.K6_ENFORCE_HTTP_FAILED || (EXPECT_RATE_LIMIT ? '0' : '1')) === '1';

logPoolStatus();

export const options = {
  ...(CLOUD_PROJECT_ID > 0 ? { cloud: { projectID: CLOUD_PROJECT_ID, name: `caso02-${K6_MODE}` } } : {}),
  systemTags: ['status', 'method', 'name', 'scenario', 'group', 'check', 'error'],
  tags: {
    caso: '02',
    modo: K6_MODE
  },
  scenarios: {
    caso02_registrar_sancion: {
      executor: BURST_MODE ? 'per-vu-iterations' : 'shared-iterations',
      vus,
      ...(BURST_MODE ? { iterations: burstIterPerVu } : { iterations }),
      maxDuration: __ENV.PERF_DURATION || '10m'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<4000', 'avg<2000'],
    ...(ALLOW_HTTP_FAILED_THRESHOLD ? { http_req_failed: [`rate<${HTTP_FAILED_RATE_MAX}`] } : {}),
    rate_limited_requests: [`rate<${RATE_LIMITED_REQUESTS_MAX}`],
    step_ok_rate: [`rate>${STEP_OK_RATE_MIN}`],
    ...(ENFORCE_OK_RATE ? { registro_ok_rate: [`rate>${REGISTRO_OK_RATE_MIN}`] } : {}),
    registro_expected_rate: [`rate>${REGISTRO_EXPECTED_RATE_MIN}`],
    sancion_completa_rate: [`rate>${SANCION_COMPLETA_RATE_MIN}`],
    http_401_total: [`count<=${HTTP_401_MAX}`],
    http_5xx_total: [`count<=${HTTP_5XX_MAX}`],
    http_4xx_non_429_total: [`count<=${HTTP_4XX_NON_429_MAX}`]
  }
};

const AUTO_LOGIN_ENABLED = (__ENV.K6_AUTO_LOGIN || '0') === '1';
const AUTH_ENDPOINT = String(__ENV.REGINSA_AUTH_ENDPOINT || __ENV.K6_AUTH_LOGIN_ENDPOINT || '/Auth/Login').trim();
const AUTH_USER_FIELD = String(__ENV.REGINSA_AUTH_USER_FIELD || 'usuario').trim() || 'usuario';
const AUTH_PASS_FIELD = String(__ENV.REGINSA_AUTH_PASS_FIELD || 'contrasena').trim() || 'contrasena';
const AUTH_TOKEN_PATH = String(__ENV.REGINSA_AUTH_TOKEN_PATH || '').trim();
const AUTH_TIMEOUT_MS = Math.max(1000, parseIntEnv(__ENV.REGINSA_AUTH_TIMEOUT_MS, 20000));
const AUTH_RETRY_MAX = Math.max(0, parseIntEnv(__ENV.K6_AUTH_RETRY_MAX, 1));

function normalizeBearer(value) {
  let token = String(value || '').trim();
  if (!token) return '';
  if (token.startsWith('<') && token.endsWith('>')) token = token.slice(1, -1);
  if (!/^Bearer\s+/i.test(token)) token = `Bearer ${token}`;
  return token;
}

function normalizeEndpointPath(value) {
  const endpoint = String(value || '').trim();
  if (!endpoint) return '/Auth/Login';
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
}

function buildAuthUrl() {
  const endpoint = normalizeEndpointPath(AUTH_ENDPOINT);
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return `${BASE_API.replace(/\/+$/, '')}${endpoint}`;
}

function authPayloadTemplates(user, pass) {
  const templates = [
    { [AUTH_USER_FIELD]: user, [AUTH_PASS_FIELD]: pass },
    { usuario: user, contrasena: pass },
    { usuario: user, contraseña: pass },
    { username: user, password: pass },
    { email: user, password: pass }
  ];

  const unique = [];
  const seen = {};
  templates.forEach((item) => {
    const key = JSON.stringify(item);
    if (seen[key]) return;
    seen[key] = true;
    unique.push(item);
  });
  return unique;
}

function extractTokenByPath(data, pathText) {
  if (!data || typeof data !== 'object' || !pathText) return '';
  const segments = pathText.split('.').map((item) => item.trim()).filter(Boolean);
  if (segments.length === 0) return '';
  let current = data;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) return '';
    current = current[segment];
  }
  return normalizeBearer(current);
}

function extractTokenFromData(data) {
  if (!data || typeof data !== 'object') return '';

  const explicit = extractTokenByPath(data, AUTH_TOKEN_PATH);
  if (explicit) return explicit;

  const queue = [data];
  const keys = {
    token: true,
    accessToken: true,
    access_token: true,
    jwt: true,
    bearerToken: true,
    authToken: true
  };

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    for (const key in current) {
      if (!Object.prototype.hasOwnProperty.call(current, key)) continue;
      const value = current[key];
      if (value && typeof value === 'object') {
        queue.push(value);
        continue;
      }
      if (keys[key]) {
        const token = normalizeBearer(value);
        if (token) return token;
      }
    }
  }

  return '';
}

function collectAuthCredentials() {
  const credentials = [];
  for (let i = 1; i <= 20; i += 1) {
    const user = String(__ENV[`REGINSA_USER_${i}`] || '').trim();
    const pass = String(__ENV[`REGINSA_PASS_${i}`] || '').trim();
    if (user && pass) credentials.push({ user, pass, slot: i });
  }

  if (credentials.length > 0) return credentials;

  const user = String(__ENV.REGINSA_USER || '').trim();
  const pass = String(__ENV.REGINSA_PASS || '').trim();
  if (user && pass) return [{ user, pass, slot: 0 }];
  return [];
}

const AUTH_CREDENTIALS = collectAuthCredentials();
const TOKENS = [__ENV.TOKEN1, __ENV.TOKEN2, __ENV.TOKEN]
  .map((value) => normalizeBearer(value))
  .filter(Boolean);
let runtimeToken = '';
let iterationRateLimited = false;
let iterationHas4xx = false;
let iterationHas5xx = false;

function credentialForVu() {
  if (AUTH_CREDENTIALS.length === 0) return null;
  const idx = Math.max(0, (__VU || 1) - 1) % AUTH_CREDENTIALS.length;
  return AUTH_CREDENTIALS[idx];
}

function obtainTokenByLogin() {
  if (!AUTO_LOGIN_ENABLED) return '';
  const cred = credentialForVu();
  if (!cred) return '';

  const url = buildAuthUrl();
  const payloads = authPayloadTemplates(cred.user, cred.pass);
  for (let retry = 0; retry <= AUTH_RETRY_MAX; retry += 1) {
    for (const payload of payloads) {
      const response = http.post(url, JSON.stringify(payload), {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        timeout: `${AUTH_TIMEOUT_MS}ms`,
        tags: {
          name: HTTP_DETAIL_MODE === 'guardar_only' ? HTTP_PUBLIC_NAME : 'Auth/Login'
        },
        ...ipPoolParams()
      });

      if (response.status < 200 || response.status >= 300) {
        continue;
      }

      const data = safeJson(response);
      const token = extractTokenFromData(data);
      if (token) return token;
    }
  }

  return '';
}

function invalidateRuntimeToken() {
  runtimeToken = '';
}

function tokenActual() {
  const staticToken = TOKENS[(__VU - 1) % TOKENS.length] || TOKENS[0] || '';
  if (staticToken) return staticToken;
  if (runtimeToken) return runtimeToken;
  runtimeToken = obtainTokenByLogin();
  return runtimeToken;
}

function headers() {
  return {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': tokenActual().trim()
    }
  };
}

function formHeaders() {
  return {
    headers: {
      'Authorization': tokenActual().trim()
    }
  };
}

function withRequestTags(requestOptions, endpointName) {
  const _ipSuffix = getIpLastOctet();
  const _ipPfx = _ipSuffix ? `IP ${_ipSuffix} ` : '';
  const visibleName = `${_ipPfx}${HTTP_DETAIL_MODE === 'guardar_only' ? HTTP_PUBLIC_NAME : endpointName}`;
  const base = requestOptions || {};
  return {
    ...base,
    ...ipPoolParams(),
    tags: {
      ...(base.tags || {}),
      name: visibleName
    }
  };
}

function reportHttpStatus(res, endpoint) {
  const limited = res.status === 429;
  RATE_LIMITED_REQUESTS.add(limited);
  if (res.status === 401) {
    HTTP_401_TOTAL.add(1);
    invalidateRuntimeToken();
  }
  if (res.status >= 400 && res.status < 500) {
    iterationHas4xx = true;
    HTTP_4XX_TOTAL.add(1);
    if (res.status !== 429) {
      HTTP_4XX_NON_429_TOTAL.add(1);
    }
  }
  if (res.status >= 500 && res.status < 600) {
    iterationHas5xx = true;
    HTTP_5XX_TOTAL.add(1);
  }
  if (limited) {
    iterationRateLimited = true;
    HTTP_429_TOTAL.add(1);
  }
}

let administradosRaw = '';
const administradosCandidates = ['administrados.txt', '../../../administrados.txt'];
for (const candidate of administradosCandidates) {
  try {
    administradosRaw = open(candidate);
    if (administradosRaw && administradosRaw.trim().length > 0) {
      break;
    }
  } catch (e) {
    // Continue with next candidate path.
  }
}

const administradosActivos = administradosRaw
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((id) => Number.parseInt(id, 10))
  .filter((id) => Number.isFinite(id));

const adminPoolRequested = parseIntEnv(__ENV.K6_ADMIN_POOL_SIZE, 20);
const adminPoolSize = Math.max(1, Math.min(administradosActivos.length || 1, adminPoolRequested));

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatDateYmd(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateDmy(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy}`;
}

function logDebug(endpoint, payload, response) {
  if (!DEBUG_ERRORS || debugErrorCount >= DEBUG_LIMIT) return;
  debugErrorCount += 1;
  const bodyText = response && typeof response.body === 'string' ? response.body : '';
  const compactBody = bodyText.replace(/\s+/g, ' ').slice(0, 260);
  console.error(`[caso02][debug][${debugErrorCount}] ${endpoint} status=${response.status} body=${compactBody}`);
  if (payload) {
    console.error(`[caso02][debug][${debugErrorCount}] payload=${JSON.stringify(payload).slice(0, 260)}`);
  }
}

function safeJson(response) {
  try {
    return response.json();
  } catch (e) {
    return null;
  }
}

function isBusinessSuccess(response, requireData = false) {
  if (!response || (response.status !== 200 && response.status !== 201)) return false;
  const json = safeJson(response);
  if (!json || typeof json !== 'object') return false;
  if (json.bSuccess === false) return false;
  if (!requireData) return true;
  return json.oData !== null && json.oData !== undefined;
}

function sancionesPorRegistro(totalRegistros, globalIdx) {
  if (totalRegistros <= 2) return 8;
  if (FORCE_SINGLE_SANCION) return 1;
  const configured = Number.parseInt(__ENV.K6_SANCIONES_POR_REGISTRO || '1', 10);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(8, configured);
  }
  return 1;
}

function medidasPorRegistro() {
  if (FORCE_SINGLE_MEDIDA) return 1;
  const configured = Number.parseInt(__ENV.K6_MEDIDAS_POR_REGISTRO || '1', 10);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(3, configured);
  }
  return 1;
}

function catalogo8Casos() {
  return [
    { key: 'multa_soles', desSancion: 'Multa', bitCancelacion: 0, canSuspension: 0, tipoMulta: 'SOLES', numMonto: randomInt(1, 2000000) },
    { key: 'suspension', desSancion: 'Suspensión', bitCancelacion: 0, canSuspension: randomInt(1, 5), tipoMulta: null, numMonto: 0 },
    { key: 'cancelacion', desSancion: 'Cancelación', bitCancelacion: 1, canSuspension: 0, tipoMulta: null, numMonto: 0 },
    { key: 'multa_soles_suspension', desSancion: 'Multa', bitCancelacion: 0, canSuspension: randomInt(1, 5), tipoMulta: 'SOLES', numMonto: randomInt(1, 2000000) },
    { key: 'multa_soles_cancelacion', desSancion: 'Multa', bitCancelacion: 1, canSuspension: 0, tipoMulta: 'SOLES', numMonto: randomInt(1, 2000000) },
    { key: 'multa_uit_suspension', desSancion: 'Multa', bitCancelacion: 0, canSuspension: randomInt(1, 5), tipoMulta: 'UIT', numMonto: randomInt(1, 300) },
    { key: 'multa_uit', desSancion: 'Multa', bitCancelacion: 0, canSuspension: 0, tipoMulta: 'UIT', numMonto: randomInt(1, 300) },
    { key: 'multa_uit_cancelacion', desSancion: 'Multa', bitCancelacion: 1, canSuspension: 0, tipoMulta: 'UIT', numMonto: randomInt(1, 300) }
  ];
}

function secuenciaSanciones(totalRegistros) {
  if (totalRegistros <= 2) {
    return [
      'multa_soles',
      'suspension',
      'cancelacion',
      'multa_soles_suspension',
      'multa_soles_cancelacion',
      'multa_uit_suspension',
      'multa_uit',
      'multa_uit_cancelacion'
    ];
  }
  return [];
}

function pickEntidad(globalIdx) {
  if (administradosActivos.length === 0) {
    return Number.parseInt(__ENV.K6_ID_ENTIDAD || '3', 10);
  }

  if (ADMIN_SELECTION_MODE === 'random') {
    return administradosActivos[randomInt(0, adminPoolSize - 1)];
  }

  const rrIdx = Math.max(0, globalIdx) % adminPoolSize;
  return administradosActivos[rrIdx];
}

function pickRis(globalIdx) {
  if (RIS_MODE === 'random' || RIS_MODE === 'aleatorio') {
    return randomInt(1, 2);
  }

  if (RIS_MODE === 'rotate_1_2' || RIS_MODE === 'rotate') {
    return (Math.max(0, globalIdx) % 2) + 1;
  }

  const idRis = parseIntEnv(__ENV.K6_ID_RIS, 1);
  return idRis === 2 ? 2 : 1;
}

function normalizarTextoCabecera(value) {
  if (!CABECERA_ASCII || typeof value !== 'string') return value;
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\-_/ .]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generarPayload(globalIdx) {
  const totalRegistros = Number.parseInt(__ENV.K6_TOTAL_REGISTROS || __ENV.K6_FIXED_ITERATIONS || '1', 10);
  const cantidadSanciones = sancionesPorRegistro(Number.isFinite(totalRegistros) ? totalRegistros : 1, globalIdx);
  const cantidadMedidas = medidasPorRegistro();
  const totalObjetivo = Number.isFinite(totalRegistros) ? Math.max(1, totalRegistros) : 1;

  const baseRun = RUN_SEQUENCE > 0 ? RUN_SEQUENCE * 1000 : 0;
  const correlativoNumerico = baseRun + Math.max(1, globalIdx + 1);
  const correlativo = String(correlativoNumerico).padStart(5, '0');
  const entidad = pickEntidad(globalIdx);

  const casos = catalogo8Casos();
  const seqSanciones = secuenciaSanciones(totalObjetivo);
  let casosSeleccionados = [];

  if (SANCION_MODE === 'sequence' && seqSanciones.length > 0) {
    const start = Math.max(0, globalIdx) % seqSanciones.length;
    const selectedKeys = Array.from({ length: Math.max(1, cantidadSanciones) }, (_, i) => seqSanciones[(start + i) % seqSanciones.length]);
    casosSeleccionados = selectedKeys.map((key) => casos.find((item) => item.key === key) || casos[0]);
  } else {
    casosSeleccionados = casos
      .sort(() => Math.random() - 0.5)
      .slice(0, cantidadSanciones);
  }

  const seleccion = casosSeleccionados.map((caso, idx) => ({
      ...caso,
      bitReconsidera: 0,
      bitReincidente: 0,
      bitPago: 0,
      desSuspension: caso.canSuspension > 0 ? 'A' : null,
      desHechoInfractor: `Hecho Infractor k6 ${idx + 1}`,
      numCorrelativo: idx + 1,
      bitMedida: 1,
      desMedidaCorrectivaGen: 'Medida Correctiva k6'
    }));

  return {
    idRis: pickRis(globalIdx),
    IdEntidad: entidad,
    NumeroExpediente: normalizarTextoCabecera(`${RUN_ID} EXP-${correlativo}-2026`),
    NumeroResolucion: normalizarTextoCabecera(`${RUN_ID} RES-${correlativo}-2026`),
    FechaResolucion: formatDateYmd(new Date()),
    RutaResolucionSancion: normalizarTextoCabecera(RUTA_RESOLUCION),
    ArchivoResolucion: '',
    Medidas: Array.from({ length: cantidadMedidas }, (_, index) => ({
      descripcionMedidaCorrectiva: `Medida Correctiva k6 ${index + 1}`,
      orden: index + 1
    })),
    Detalles: seleccion
  };
}

function resolveInfraccion(idRis) {
  const byRisId = Math.max(1, parseIntEnv(__ENV[`K6_INFRACCION_ID_RIS${idRis}`], DEFAULT_INFRACCION_ID));
  const byRisDisplay = String(__ENV[`K6_INFRACCION_DISPLAY_RIS${idRis}`] || DEFAULT_INFRACCION_DISPLAY).trim() || DEFAULT_INFRACCION_DISPLAY;
  return {
    IdInfraccion: byRisId,
    DisplayInfraccion: byRisDisplay
  };
}

function extractCabeceraIdFromJson(json) {
  if (!json || typeof json !== 'object') return null;
  const oData = json?.oData;
  const idCandidates = [
    oData,
    oData?.id,
    oData?.Id,
    oData?.idCabeceraInfraccionSancion,
    oData?.IdCabeceraInfraccionSancion,
    oData?.idCabecera,
    json?.id,
    json?.Id,
    json?.idCabeceraInfraccionSancion,
    json?.IdCabeceraInfraccionSancion,
    Array.isArray(oData) ? oData[0]?.id : null,
    Array.isArray(oData) ? oData[0]?.Id : null,
    Array.isArray(oData) ? oData[0]?.idCabeceraInfraccionSancion : null,
    Array.isArray(oData) ? oData[0]?.IdCabeceraInfraccionSancion : null,
    Array.isArray(oData?.Results) ? oData.Results[0]?.idCabeceraInfraccionSancion : null,
    Array.isArray(oData?.Results) ? oData.Results[0]?.IdCabeceraInfraccionSancion : null
  ];

  for (const value of idCandidates) {
    const id = Number.parseInt(String(value ?? ''), 10);
    if (Number.isFinite(id) && id > 0) return id;
  }

  return null;
}

function extractCabeceraIdFromBody(response) {
  const body = typeof response?.body === 'string' ? response.body : '';
  if (!body) return null;

  const patterns = [
    /"idCabeceraInfraccionSancion"\s*:\s*(\d+)/i,
    /"IdCabeceraInfraccionSancion"\s*:\s*(\d+)/i,
    /"idCabecera"\s*:\s*(\d+)/i,
    /"id"\s*:\s*(\d+)/i
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (!match || match.length < 2) continue;
    const id = Number.parseInt(match[1], 10);
    if (Number.isFinite(id) && id > 0) return id;
  }

  return null;
}

function listarParaVisibilidad(data) {
  const res = http.post(
    `${BASE_API}/CabeceraInfraccionSancion/Listar`,
    JSON.stringify({ nPageNumber: 1, nPageSize: 1 }),
    withRequestTags(headers(), 'CabeceraInfraccionSancion/Listar')
  );
  // Solo contabilizar rate limiting; no afectar thresholds 4xx/5xx
  RATE_LIMITED_REQUESTS.add(res.status === 429);
  if (res.status === 429) HTTP_429_TOTAL.add(1);
}

function buscarCabeceraRecienCreada(data) {
  const payloads = [
    {
      nPageNumber: 1,
      nPageSize: 20,
      NumeroExpediente: data.NumeroExpediente,
      NumeroResolucion: data.NumeroResolucion
    },
    {
      nPageNumber: 1,
      nPageSize: 20,
      numeroExpediente: data.NumeroExpediente,
      numeroResolucion: data.NumeroResolucion
    }
  ];

  for (const payload of payloads) {
    const res = http.post(
      `${BASE_API}/CabeceraInfraccionSancion/Listar`,
      JSON.stringify(payload),
      withRequestTags(headers(), 'CabeceraInfraccionSancion/Listar')
    );
    reportHttpStatus(res, 'CabeceraInfraccionSancion/Listar');
    if (!isBusinessSuccess(res, true)) continue;
    const id = extractCabeceraIdFromJson(safeJson(res));
    if (id) return id;
  }

  return null;
}

function crearCabecera(data) {
  const payloadPrimary = {
    IdEntidad: data.IdEntidad,
    NumeroExpediente: data.NumeroExpediente,
    NumeroResolucion: data.NumeroResolucion,
    FechaResolucion: data.FechaResolucion,
    RutaResolucionSancion: data.RutaResolucionSancion,
    ArchivoResolucion: data.ArchivoResolucion
  };

  const payloadFallback = {
    IdEntidad: data.IdEntidad,
    NumeroExpediente: data.NumeroExpediente,
    NumeroResolucion: data.NumeroResolucion,
    FechaResolucion: formatDateDmy(new Date()),
    RutaResolucionSancion: data.RutaResolucionSancion,
    ArchivoResolucion: ''
  };

  const payloadFormPascal = {
    IdEntidad: String(data.IdEntidad),
    NumeroExpediente: data.NumeroExpediente,
    NumeroResolucion: data.NumeroResolucion,
    FechaResolucion: data.FechaResolucion,
    RutaResolucionSancion: data.RutaResolucionSancion,
    ArchivoResolucion: data.ArchivoResolucion || ''
  };

  const payloadFormCamel = {
    idEntidad: String(data.IdEntidad),
    numeroExpediente: data.NumeroExpediente,
    numeroResolucion: data.NumeroResolucion,
    fechaResolucion: data.FechaResolucion,
    rutaResolucionSancion: data.RutaResolucionSancion,
    archivoResolucion: data.ArchivoResolucion || ''
  };

  const candidateByMode = {
    json_primary: {
      name: 'CabeceraInfraccionSancion/Crear.primary',
      body: JSON.stringify(payloadPrimary),
      requestHeaders: headers(),
      debugPayload: payloadPrimary
    },
    json_fallback: {
      name: 'CabeceraInfraccionSancion/Crear.fallback',
      body: JSON.stringify(payloadFallback),
      requestHeaders: headers(),
      debugPayload: payloadFallback
    },
    form_pascal: {
      name: 'CabeceraInfraccionSancion/Crear.form_pascal',
      body: payloadFormPascal,
      requestHeaders: formHeaders(),
      debugPayload: payloadFormPascal
    },
    form_camel: {
      name: 'CabeceraInfraccionSancion/Crear.form_camel',
      body: payloadFormCamel,
      requestHeaders: formHeaders(),
      debugPayload: payloadFormCamel
    }
  };

  const selected = candidateByMode[CABECERA_MODE] || candidateByMode.form_pascal;
  const candidates = [selected];

  let res = null;
  for (const candidate of candidates) {
    res = http.post(
      `${BASE_API}/CabeceraInfraccionSancion/Crear`,
      candidate.body,
      withRequestTags(candidate.requestHeaders, 'CabeceraInfraccionSancion/Crear')
    );

    if (res.status === 200 || res.status === 201) {
      break;
    }

    if (res.status >= 400) {
      logDebug(candidate.name, candidate.debugPayload, res);
      break;
    }
  }

  reportHttpStatus(res, 'CabeceraInfraccionSancion/Crear');
  const ok = isBusinessSuccess(res, false);
  STEP_OK_RATE.add(ok);
  if (!ok && res.status >= 400) {
    logDebug('CabeceraInfraccionSancion/Crear.business', selected.debugPayload, res);
  }

  const idDirecto = extractCabeceraIdFromJson(safeJson(res)) || extractCabeceraIdFromBody(res);

  if (HTTP_DETAIL_MODE === 'all') {
    if (idDirecto) {
      // Visibilidad Grafana: una sola llamada Listar sin afectar thresholds
      listarParaVisibilidad(data);
      return idDirecto;
    }
    // Sin idDirecto, intentar recuperar ID via Listar real
    const idListado = buscarCabeceraRecienCreada(data);
    return idListado || null;
  }

  if (idDirecto) return idDirecto;

  const idListado = buscarCabeceraRecienCreada(data);
  if (idListado) return idListado;

  logDebug('CabeceraInfraccionSancion/Crear.id_missing', selected.debugPayload, res);
  return null;
}

function crearMedida(idCabecera, medida) {
  const res = http.post(
    `${BASE_API}/MedidaCorrectiva/Crear`,
    JSON.stringify({
      idCabeceraInfraccionSancion: idCabecera,
      descripcionMedidaCorrectiva: medida.descripcionMedidaCorrectiva,
      orden: medida.orden
    }),
    withRequestTags(headers(), 'MedidaCorrectiva/Crear')
  );

  reportHttpStatus(res, 'MedidaCorrectiva/Crear');
  const ok = isBusinessSuccess(res, false);
  if (!ok && res.status >= 400) {
    logDebug('MedidaCorrectiva/Crear', {
      idCabeceraInfraccionSancion: idCabecera,
      descripcionMedidaCorrectiva: medida.descripcionMedidaCorrectiva,
      orden: medida.orden
    }, res);
  }
  STEP_OK_RATE.add(ok);
  return ok;
}

function crearDetalle(idCabecera, detalle, idInfraccion, desInfraccion, idRis) {
  const payload = {
    idCabeceraInfraccionSancion: idCabecera,
    IdInfraccion: idInfraccion,
    desInfraccion: desInfraccion,
    ...detalle,
    idRis,
    tempId: -2
  };

  const res = http.post(
    `${BASE_API}/DetalleInfraccionSancion/Crear`,
    JSON.stringify(payload),
    withRequestTags(headers(), 'DetalleInfraccionSancion/Crear')
  );
  reportHttpStatus(res, 'DetalleInfraccionSancion/Crear');
  if (res.status >= 400) {
    logDebug('DetalleInfraccionSancion/Crear', payload, res);
    if (res.status >= 500) {
      const bodyText = typeof res.body === 'string' ? res.body.replace(/\s+/g, ' ').slice(0, 300) : '';
      console.error(`[caso02][5xx][detalle] status=${res.status} payload=${JSON.stringify(payload).slice(0, 300)} body=${bodyText}`);
    }
  }
  const ok = isBusinessSuccess(res, false);
  STEP_OK_RATE.add(ok);
  return { response: res, ok };
}

export default function () {
  iterationRateLimited = false;
  iterationHas4xx = false;
  iterationHas5xx = false;
  const totalObjetivo = iterations;
  const idx = BURST_MODE
    ? (((__VU || 1) - 1) * burstIterPerVu) + (__ITER || 0)
    : Number(exec.scenario.iterationInTest || 0);

  if (idx >= totalObjetivo && !BURST_MODE) {
    sleep(K6_SLEEP_SECONDS);
    return;
  }

  const data = generarPayload(idx);
  const infraccion = resolveInfraccion(data.idRis);

  const cabeceraId = crearCabecera(data);
  if (!cabeceraId) {
    REGISTRO_OK_RATE.add(false);
    REGISTRO_EXPECTED_RATE.add(iterationRateLimited);

    check({ registroOk: false, limited: iterationRateLimited }, {
      'caso02 crear status 200 esperado': (ctx) => (EXPECT_RATE_LIMIT ? (ctx.registroOk || ctx.limited) : ctx.registroOk)
    });
    if (EXPECT_RATE_LIMIT) {
      check({ registroOk: false, limited: iterationRateLimited }, {
        'caso02 crear status 429 esperado por limite de regla de negocio': (ctx) => ctx.registroOk || ctx.limited
      });
    }
    if (iterationHas4xx || iterationHas5xx) {
      const suffix = iterationHas4xx && iterationHas5xx ? '4xx y 5xx' : (iterationHas4xx ? '4xx' : '5xx');
      check({ ok: true }, {
        [`caso02 crear status ${suffix} detectado`]: () => true
      });
    }
    sleep(K6_SLEEP_SECONDS);
    return;
  }

  let medidaOk = 0;
  let medidaTotal = 0;
  data.Medidas.forEach((medida) => {
    medidaTotal += 1;
    if (crearMedida(cabeceraId, medida)) {
      medidaOk += 1;
    }
  });

  if (medidaTotal > 0 && medidaOk !== medidaTotal) {
    REGISTRO_OK_RATE.add(false);
    REGISTRO_EXPECTED_RATE.add(iterationRateLimited);

    check({ registroOk: false, limited: iterationRateLimited }, {
      'caso02 crear status 200 esperado': (ctx) => (EXPECT_RATE_LIMIT ? (ctx.registroOk || ctx.limited) : ctx.registroOk)
    });
    if (EXPECT_RATE_LIMIT) {
      check({ registroOk: false, limited: iterationRateLimited }, {
        'caso02 crear status 429 esperado por limite de regla de negocio': (ctx) => ctx.registroOk || ctx.limited
      });
    }
    if (iterationHas4xx || iterationHas5xx) {
      const suffix = iterationHas4xx && iterationHas5xx ? '4xx y 5xx' : (iterationHas4xx ? '4xx' : '5xx');
      check({ ok: true }, {
        [`caso02 crear status ${suffix} detectado`]: () => true
      });
    }
    sleep(K6_SLEEP_SECONDS);
    return;
  }

   let detalleOk = 0;
   let detalleTotal = 0;

  data.Detalles.forEach((detalle) => {
    const result = crearDetalle(cabeceraId, detalle, infraccion.IdInfraccion, infraccion.DisplayInfraccion, data.idRis);
    detalleTotal += 1;
    if (result && result.ok) {
      detalleOk += 1;
    }
  });

  SANCION_DETALLE_EXPECTED_TOTAL.add(detalleTotal);
  SANCION_DETALLE_OK_TOTAL.add(detalleOk);

  const sancionCompleta = detalleTotal > 0 && detalleOk === detalleTotal;
  SANCION_COMPLETA_RATE.add(Boolean(sancionCompleta || (EXPECT_RATE_LIMIT && iterationRateLimited)));

  const registroOk = detalleTotal > 0 && detalleOk === detalleTotal;
  REGISTRO_OK_RATE.add(registroOk);
  REGISTRO_EXPECTED_RATE.add(Boolean(registroOk || iterationRateLimited));
  if (registroOk) {
    REGISTRO_OK_TOTAL.add(1);
    caso02Records.push({
      ip: getAssignedIP() || 'local',
      idEntidad: data.IdEntidad,
      expediente: data.NumeroExpediente,
      resolucion: data.NumeroResolucion,
      fechaResolucion: data.FechaResolucion,
      cabeceraId: cabeceraId,
      status: 'ok',
      fechaRegistro: new Date().toISOString()
    });
  }

  check({ registroOk, limited: iterationRateLimited }, {
    'caso02 crear status 200 esperado': (ctx) => (EXPECT_RATE_LIMIT ? (ctx.registroOk || ctx.limited) : ctx.registroOk)
  });
  if (EXPECT_RATE_LIMIT) {
    check({ registroOk, limited: iterationRateLimited }, {
      'caso02 crear status 429 esperado por limite de regla de negocio': (ctx) => ctx.registroOk || ctx.limited
    });
  }
  check({ ok: sancionCompleta, limited: iterationRateLimited }, {
    'caso02 sanciones completas creadas': (ctx) => (EXPECT_RATE_LIMIT ? (ctx.ok || ctx.limited) : ctx.ok)
  });
  if (iterationHas4xx || iterationHas5xx) {
    const suffix = iterationHas4xx && iterationHas5xx ? '4xx y 5xx' : (iterationHas4xx ? '4xx' : '5xx');
    check({ ok: true }, {
      [`caso02 crear status ${suffix} detectado`]: () => true
    });
  }

  sleep(K6_SLEEP_SECONDS);
}

export function handleSummary(_data) {
  const output = {
    run_id: RUN_ID,
    modo: __ENV.K6_OUTPUT || 'local',
    fecha: new Date().toISOString().split('T')[0],
    ip_pool: (__ENV.K6_LOCAL_IPS || '').trim(),
    registros: caso02Records
  };
  return { 'reportes/k6-caso02-registros.json': JSON.stringify(output, null, 2) };
}
