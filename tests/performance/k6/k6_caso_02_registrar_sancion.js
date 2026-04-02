import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';

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

const RETRY_429_MAX = Math.max(0, parseIntEnv(__ENV.K6_RETRY_429_MAX, 2));
const RETRY_429_WAIT = Math.max(0.1, parseFloatEnv(__ENV.K6_RETRY_429_WAIT, 0.7));
const EXPECT_RATE_LIMIT = (__ENV.K6_EXPECT_RATE_LIMIT || '0') === '1';
const CABECERA_ASCII = (__ENV.K6_CABECERA_ASCII || '1') === '1';
const RUTA_RESOLUCION = __ENV.K6_RUTA_RESOLUCION || 'GENERAL N 00001-2026-SUNEDU-SG-OTI.pdf';
const CABECERA_MODE = (__ENV.K6_CABECERA_MODE || 'form_pascal').toLowerCase();
const ADMIN_SELECTION_MODE = (__ENV.K6_ADMIN_SELECTION_MODE || 'round_robin').toLowerCase();
const RIS_MODE = (__ENV.K6_RIS_MODE || 'fixed').toLowerCase();
const SANCION_MODE = (__ENV.K6_SANCION_MODE || 'sequence').toLowerCase();
const FORCE_SINGLE_SANCION = (__ENV.K6_FORCE_SINGLE_SANCION || '1') === '1';
const FORCE_SINGLE_MEDIDA = (__ENV.K6_FORCE_SINGLE_MEDIDA || '1') === '1';

function buildRunId() {
  const requested = String(__ENV.K6_RUN_ID || '').replace(/\D/g, '').slice(-4);
  if (requested.length > 0) return requested.padStart(4, '0');
  const auto = (Date.now() + Math.floor(Math.random() * 997)) % 10000;
  return String(auto).padStart(4, '0');
}

const RUN_ID = buildRunId();
let debugErrorCount = 0;

const requestedIterations = Number.parseInt(__ENV.K6_FIXED_ITERATIONS || __ENV.K6_TOTAL_REGISTROS || '1', 10);
const iterations = Number.isFinite(requestedIterations) ? Math.max(1, requestedIterations) : 1;
const vusRequested = Number.parseInt(__ENV.K6_FIXED_VUS || '1', 10);
const vus = Number.isFinite(vusRequested) ? Math.max(1, vusRequested) : 1;

const burstIterPerVuRequested = Number.parseInt(__ENV.K6_BURST_ITER_PER_VU || '', 10);
const hasBurstIterPerVu = Number.isFinite(burstIterPerVuRequested) && burstIterPerVuRequested > 0;

if (BURST_MODE && !hasBurstIterPerVu && (iterations % vus !== 0)) {
  throw new Error(`Burst mode requiere K6_FIXED_ITERATIONS divisible por K6_FIXED_VUS (actual: ${iterations}/${vus}) o definir K6_BURST_ITER_PER_VU.`);
}

const burstIterPerVu = BURST_MODE
  ? (hasBurstIterPerVu ? Math.max(1, burstIterPerVuRequested) : Math.max(1, Math.floor(iterations / vus)))
  : 0;

const HTTP_429_TOTAL = new Counter('http_429_total');
const RATE_LIMITED_REQUESTS = new Rate('rate_limited_requests');
const HTTP_401_TOTAL = new Counter('http_401_total');
const HTTP_4XX_TOTAL = new Counter('http_4xx_total');
const HTTP_5XX_TOTAL = new Counter('http_5xx_total');
const STEP_OK_RATE = new Rate('step_ok_rate');
const REGISTRO_OK_RATE = new Rate('registro_ok_rate');
const REGISTRO_OK_TOTAL = new Counter('registro_ok_total');

export const options = {
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
    http_req_failed: [EXPECT_RATE_LIMIT ? 'rate<0.98' : 'rate<0.35'],
    rate_limited_requests: [EXPECT_RATE_LIMIT ? 'rate<0.99' : 'rate<0.6'],
    step_ok_rate: [EXPECT_RATE_LIMIT ? 'rate>0.5' : 'rate>0.7'],
    registro_ok_rate: [EXPECT_RATE_LIMIT ? 'rate>0.0' : 'rate>0.6']
  }
};

console.log(`[caso02] run_id=K6${RUN_ID}`);

const AUTO_LOGIN_ENABLED = (__ENV.K6_AUTO_LOGIN || '1') === '1';
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
        timeout: `${AUTH_TIMEOUT_MS}ms`
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

function reportRateLimit(res, endpoint) {
  const limited = res.status === 429;
  RATE_LIMITED_REQUESTS.add(limited);
  if (res.status === 401) {
    HTTP_401_TOTAL.add(1);
    invalidateRuntimeToken();
  }
  if (res.status >= 400 && res.status < 500) HTTP_4XX_TOTAL.add(1);
  if (res.status >= 500 && res.status < 600) HTTP_5XX_TOTAL.add(1);
  if (limited) {
    HTTP_429_TOTAL.add(1);
    console.warn(`[WARN] 429 en ${endpoint}`);
  }
  return limited;
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
  if (totalRegistros === 3) {
    return (Math.max(0, globalIdx) % 2 === 0) ? 2 : 1;
  }
  if (FORCE_SINGLE_SANCION) return 1;
  const configured = Number.parseInt(__ENV.K6_SANCIONES_POR_REGISTRO || '1', 10);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(8, configured);
  }
  if (totalRegistros <= 2) return 1;
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
    { key: 'multa_soles_suspension', desSancion: 'Multa + Suspensión', bitCancelacion: 0, canSuspension: randomInt(1, 5), tipoMulta: 'SOLES', numMonto: randomInt(1, 2000000) },
    { key: 'multa_soles_cancelacion', desSancion: 'Multa + Cancelación', bitCancelacion: 1, canSuspension: 0, tipoMulta: 'SOLES', numMonto: randomInt(1, 2000000) },
    { key: 'multa_uit_suspension', desSancion: 'Multa (UIT) + Suspensión', bitCancelacion: 0, canSuspension: randomInt(1, 5), tipoMulta: 'UIT', numMonto: randomInt(1, 300) },
    { key: 'multa_uit', desSancion: 'Multa (UIT)', bitCancelacion: 0, canSuspension: 0, tipoMulta: 'UIT', numMonto: randomInt(1, 300) },
    { key: 'multa_uit_cancelacion', desSancion: 'Multa (UIT) + Cancelación', bitCancelacion: 1, canSuspension: 0, tipoMulta: 'UIT', numMonto: randomInt(1, 300) }
  ];
}

function secuenciaSanciones(totalRegistros) {
  if (totalRegistros === 3) {
    return ['multa_soles', 'suspension', 'cancelacion'];
  }
  if (totalRegistros === 10) {
    return [
      'multa_soles',
      'suspension',
      'cancelacion',
      'multa_uit',
      'multa_soles_suspension',
      'multa_soles_cancelacion',
      'multa_uit_suspension',
      'multa_uit_cancelacion',
      'multa_soles',
      'multa_uit'
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

  const seqVu = String(__VU || 1).padStart(2, '0');
  const seqIter = String((__ITER || 0) + 1).padStart(3, '0');
  const correlativo = `${seqVu}${seqIter}`;
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
    NumeroExpediente: normalizarTextoCabecera(`K6${RUN_ID} EXP-${correlativo}-2026`),
    NumeroResolucion: normalizarTextoCabecera(`K6${RUN_ID} RES-${correlativo}-2026`),
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

function listarInfracciones(idRis) {
  const res = http.post(`${BASE_API}/Infraccion/Listar`, JSON.stringify({ idRis }), headers());
  const limited = reportRateLimit(res, 'Infraccion/Listar');
  const ok = check(res, { 'listar_infracciones_status_ok': (r) => r.status === 200 || r.status === 429 });
  STEP_OK_RATE.add(ok);
  if (limited) return [];

  const json = safeJson(res);
  if (!ok || !json || !Array.isArray(json.oData)) {
    if (res.status >= 400) {
      logDebug('Infraccion/Listar', { idRis }, res);
    }
    return [];
  }

  return json.oData;
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
    let attempt = 0;
    do {
      res = http.post(`${BASE_API}/CabeceraInfraccionSancion/Crear`, candidate.body, candidate.requestHeaders);

      if (res.status === 200 || res.status === 201) {
        break;
      }

      if (res.status === 400) {
        logDebug(candidate.name, candidate.debugPayload, res);
        break;
      }

      if (res.status === 429 && attempt < RETRY_429_MAX) {
        reportRateLimit(res, 'CabeceraInfraccionSancion/Crear');
        sleep(RETRY_429_WAIT);
      }

      attempt += 1;
    } while (res.status === 429 && attempt <= RETRY_429_MAX);

    if (res.status === 429) {
      break;
    }

    if (res.status === 200 || res.status === 201) {
      break;
    }
  }

  const limited = reportRateLimit(res, 'CabeceraInfraccionSancion/Crear');
  const ok = check(res, { 'crear_cabecera_status_ok': (r) => isBusinessSuccess(r, true) });
  STEP_OK_RATE.add(ok);
  if (limited) return null;
  if (!ok && res.status >= 400) {
    logDebug('CabeceraInfraccionSancion/Crear.business', selected.debugPayload, res);
  }

  const oData = safeJson(res)?.oData;
  if (typeof oData === 'object' && oData?.idCabeceraInfraccionSancion) return oData.idCabeceraInfraccionSancion;
  if (Array.isArray(oData) && oData[0]?.idCabeceraInfraccionSancion) return oData[0].idCabeceraInfraccionSancion;
  return null;
}

function crearMedida(idCabecera, medida) {
  const res = http.post(`${BASE_API}/MedidaCorrectiva/Crear`, JSON.stringify({
    idCabeceraInfraccionSancion: idCabecera,
    descripcionMedidaCorrectiva: medida.descripcionMedidaCorrectiva,
    orden: medida.orden
  }), headers());

  reportRateLimit(res, 'MedidaCorrectiva/Crear');
  const ok = check(res, { 'crear_medida_status_ok': (r) => isBusinessSuccess(r, false) });
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

  const res = http.post(`${BASE_API}/DetalleInfraccionSancion/Crear`, JSON.stringify(payload), headers());
  reportRateLimit(res, 'DetalleInfraccionSancion/Crear');
  if (res.status >= 400) {
    logDebug('DetalleInfraccionSancion/Crear', payload, res);
  }
  const ok = check(res, { 'crear_detalle_status_ok': (r) => isBusinessSuccess(r, false) });
  STEP_OK_RATE.add(ok);
  return { response: res, ok };
}

export default function () {
  const totalRegistros = Number.parseInt(__ENV.K6_TOTAL_REGISTROS || '1', 10);
  const totalObjetivo = Number.isFinite(totalRegistros) ? Math.max(1, totalRegistros) : 1;
  const idx = BURST_MODE
    ? (((__VU || 1) - 1) * burstIterPerVu) + (__ITER || 0)
    : Number(exec.scenario.iterationInTest || 0);

  if (idx >= totalObjetivo && !BURST_MODE) {
    sleep(Number.parseFloat(__ENV.K6_SLEEP_SECONDS || '1'));
    return;
  }

  const data = generarPayload(idx);
  const infracciones = listarInfracciones(data.idRis);
  if (!infracciones.length) {
    REGISTRO_OK_RATE.add(false);
    sleep(1);
    return;
  }

  const cabeceraId = crearCabecera(data);
  if (!cabeceraId) {
    REGISTRO_OK_RATE.add(false);
    sleep(1);
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
    sleep(1);
    return;
  }

  const infraccion = infracciones[randomInt(0, infracciones.length - 1)];

   let detalleOk = 0;
   let detalleTotal = 0;

  data.Detalles.forEach((detalle) => {
    const result = crearDetalle(cabeceraId, detalle, infraccion.IdInfraccion, infraccion.DisplayInfraccion, data.idRis);
    detalleTotal += 1;
    if (result && result.ok) {
      detalleOk += 1;
    }
  });

  const registroOk = detalleTotal > 0 && detalleOk === detalleTotal;
  REGISTRO_OK_RATE.add(registroOk);
  if (registroOk) {
    REGISTRO_OK_TOTAL.add(1);
  }

  sleep(Number.parseFloat(__ENV.K6_SLEEP_SECONDS || '1'));
}
