import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';
import { ipPoolParams, logPoolStatus, getIpLastOctet } from './helpers/ip-pool.js';

const BASE_API = __ENV.BASE_API || __ENV.BASE_URL || 'https://reginsaapiqa.sunedu.gob.pe/api';
const BURST_MODE = (__ENV.K6_BURST_MODE || '0') === '1';
const DEBUG_ERRORS = (__ENV.K6_DEBUG_ERRORS || '0') === '1';
const DEBUG_LIMIT = Math.max(1, Number.parseInt(__ENV.K6_DEBUG_ERRORS_MAX || '8', 10) || 8);
const STRICT_ISOLATION = (__ENV.K6_CASO03_STRICT_ISOLATION || '1') === '1';

const ENDPOINT_LISTAR_CABECERA = __ENV.K6_CASO03_LISTAR_CABECERA || '/CabeceraInfraccionSancion/ListarPaginado';
const ENDPOINT_ACTUALIZAR_CABECERA = __ENV.K6_CASO03_GUARDAR_RECONSIDERACION || '/CabeceraInfraccionSancion/Actualizar/{id}';
const ENDPOINT_LISTAR_DETALLE = __ENV.K6_CASO03_LISTAR_DETALLE || '/DetalleInfraccionSancion/ListarPaginado';

function parseIntEnv(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const LIST_PAGE_SIZE = Math.max(10, parseIntEnv(__ENV.K6_CASO03_PAGE_SIZE || __ENV.K6_LIST_PAGE_SIZE, 100));
const DETAIL_PAGE_SIZE = Math.max(10, parseIntEnv(__ENV.K6_CASO03_DETAIL_PAGE_SIZE || LIST_PAGE_SIZE, LIST_PAGE_SIZE));

function parseFloatEnv(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

const EXPECT_RATE_LIMIT = (__ENV.K6_EXPECT_RATE_LIMIT || '1') === '1';
const HTTP_DETAIL_MODE = (__ENV.K6_HTTP_DETAIL_MODE || 'all').toLowerCase();
const HTTP_PUBLIC_NAME = (__ENV.K6_HTTP_PUBLIC_NAME || 'Reconsideracion/GuardarCabecera').trim() || 'Reconsideracion/GuardarCabecera';
const AUTO_LOGIN_ENABLED = (__ENV.K6_AUTO_LOGIN || '0') === '1';
const AUTH_ENDPOINT = String(__ENV.REGINSA_AUTH_ENDPOINT || __ENV.K6_AUTH_LOGIN_ENDPOINT || '/Auth/Login').trim();
const AUTH_USER_FIELD = String(__ENV.REGINSA_AUTH_USER_FIELD || 'usuario').trim() || 'usuario';
const AUTH_PASS_FIELD = String(__ENV.REGINSA_AUTH_PASS_FIELD || 'contrasena').trim() || 'contrasena';
const AUTH_TOKEN_PATH = String(__ENV.REGINSA_AUTH_TOKEN_PATH || '').trim();
const AUTH_TIMEOUT_MS = Math.max(1000, parseIntEnv(__ENV.REGINSA_AUTH_TIMEOUT_MS, 20000));
const AUTH_RETRY_MAX = Math.max(0, parseIntEnv(__ENV.K6_AUTH_RETRY_MAX, 1));

let debugErrorCount = 0;
let runtimeToken = '';
let iterationHas4xx = false;
let iterationHas5xx = false;

const requestedIterations = parseIntEnv(__ENV.K6_CANTIDAD || __ENV.K6_FIXED_ITERATIONS || __ENV.K6_TOTAL_REGISTROS, 1);
const iterations = Math.max(1, requestedIterations);
const requestedMode = String(__ENV.K6_MODE || '').trim().toLowerCase();
const normalizedMode = requestedMode === 'rapida' ? 'fast' : requestedMode;
const K6_MODE = normalizedMode || (iterations <= 2 ? 'smoke' : 'fast');
const K6_SLEEP_SECONDS = parseFloatEnv(__ENV.K6_SLEEP_SECONDS, 0);
const CLOUD_PROJECT_ID = Math.max(0, parseIntEnv(__ENV.K6_CLOUD_PROJECT_ID, 0));
const vus = Math.max(1, parseIntEnv(__ENV.K6_VUS || __ENV.K6_FIXED_VUS, 1));
const burstIterPerVuRequested = parseIntEnv(__ENV.K6_BURST_ITER_PER_VU, 0);
const hasBurstIterPerVu = burstIterPerVuRequested > 0;

if (BURST_MODE && !hasBurstIterPerVu && (iterations % vus !== 0)) {
  throw new Error(`Burst mode requiere K6_FIXED_ITERATIONS divisible por K6_FIXED_VUS (actual: ${iterations}/${vus}) o definir K6_BURST_ITER_PER_VU.`);
}

const burstIterPerVu = BURST_MODE
  ? (hasBurstIterPerVu ? Math.max(1, burstIterPerVuRequested) : Math.max(1, Math.floor(iterations / vus)))
  : 0;

const HTTP_429_TOTAL = new Counter('http_429_total');
const HTTP_401_TOTAL = new Counter('http_401_total');
const HTTP_4XX_TOTAL = new Counter('http_4xx_total');
const HTTP_5XX_TOTAL = new Counter('http_5xx_total');
const HTTP_4XX_NON_429_TOTAL = new Counter('http_4xx_non_429_total');
const RATE_LIMITED_REQUESTS = new Rate('rate_limited_requests');
const STEP_OK_RATE = new Rate('step_ok_rate');
const REGISTRO_OK_RATE = new Rate('registro_ok_rate');
const REGISTRO_EXPECTED_RATE = new Rate('registro_expected_rate');
const LISTAR_OK_RATE = new Rate('listar_ok_rate');
const GUARDAR_OK_RATE = new Rate('guardar_ok_rate');
const DETALLE_OK_RATE = new Rate('detalle_ok_rate');

const HTTP_FAILED_RATE_MAX = parseFloatEnv(__ENV.K6_HTTP_FAILED_RATE_MAX, EXPECT_RATE_LIMIT ? 0.98 : 0.4);
const RATE_LIMITED_REQUESTS_MAX = parseFloatEnv(__ENV.K6_RATE_LIMITED_MAX, EXPECT_RATE_LIMIT ? 0.99 : 0.6);
const STEP_OK_RATE_MIN = parseFloatEnv(__ENV.K6_STEP_OK_MIN, EXPECT_RATE_LIMIT ? 0.5 : 0.7);
const REGISTRO_OK_RATE_MIN = parseFloatEnv(__ENV.K6_REGISTRO_OK_MIN, EXPECT_RATE_LIMIT ? 0.01 : 0.6);
const REGISTRO_EXPECTED_RATE_MIN = parseFloatEnv(__ENV.K6_REGISTRO_EXPECTED_MIN, EXPECT_RATE_LIMIT ? 0.95 : 0.7);
const HTTP_401_MAX = Math.max(0, parseIntEnv(__ENV.K6_HTTP_401_MAX, 0));
const HTTP_5XX_MAX = Math.max(0, parseIntEnv(__ENV.K6_HTTP_5XX_MAX, 0));
const HTTP_4XX_NON_429_MAX = Math.max(0, parseIntEnv(__ENV.K6_HTTP_4XX_NON_429_MAX, EXPECT_RATE_LIMIT ? 3 : 0));
const ENFORCE_OK_RATE = (__ENV.K6_ENFORCE_OK_RATE || (EXPECT_RATE_LIMIT ? '0' : '1')) === '1';
const ALLOW_HTTP_FAILED_THRESHOLD = (__ENV.K6_ENFORCE_HTTP_FAILED || (EXPECT_RATE_LIMIT ? '0' : '1')) === '1';

console.log(`[caso03] modo=${K6_MODE} cantidad=${iterations} vus=${vus} sleep=${K6_SLEEP_SECONDS} project=${CLOUD_PROJECT_ID || 'local'}`);
logPoolStatus();

export const options = {
  ...(CLOUD_PROJECT_ID > 0 ? { cloud: { projectID: CLOUD_PROJECT_ID, name: `caso03-${K6_MODE}` } } : {}),
  systemTags: ['status', 'method', 'name', 'scenario', 'group', 'check', 'error'],
  tags: {
    caso: '03',
    modo: K6_MODE
  },
  scenarios: {
    caso03_reconsiderar_sin_sanciones: {
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
    http_401_total: [`count<=${HTTP_401_MAX}`],
    http_5xx_total: [`count<=${HTTP_5XX_MAX}`],
    http_4xx_non_429_total: [`count<=${HTTP_4XX_NON_429_MAX}`]
  }
};

let iterationRateLimited = false;

function safeJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

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
  const parts = pathText.split('.').map((item) => item.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  let current = data;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) return '';
    current = current[part];
  }
  return normalizeBearer(current);
}

function extractTokenFromData(data) {
  if (!data || typeof data !== 'object') return '';
  const explicit = extractTokenByPath(data, AUTH_TOKEN_PATH);
  if (explicit) return explicit;

  const queue = [data];
  const keys = { token: true, accessToken: true, access_token: true, jwt: true, bearerToken: true, authToken: true };
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
const TOKENS = [__ENV.K6_AUTH_HEADER, __ENV.TOKEN1, __ENV.TOKEN2, __ENV.TOKEN]
  .map((value) => normalizeBearer(value))
  .filter(Boolean);

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
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: `${AUTH_TIMEOUT_MS}ms`,
        ...ipPoolParams()
      });
      if (response.status < 200 || response.status >= 300) continue;
      const token = extractTokenFromData(safeJson(response));
      if (token) return token;
    }
  }
  return '';
}

function tokenActual() {
  const staticToken = TOKENS[(__VU - 1) % TOKENS.length] || TOKENS[0] || '';
  if (staticToken) return staticToken;
  if (runtimeToken) return runtimeToken;
  runtimeToken = obtainTokenByLogin();
  return runtimeToken;
}

function headers() {
  const auth = tokenActual();
  return {
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {})
    }
  };
}

function authHeadersOnly() {
  const auth = tokenActual();
  return {
    headers: {
      ...(auth ? { Authorization: auth } : {})
    }
  };
}

function reportStatus(res, endpoint) {
  const limited = res.status === 429;
  RATE_LIMITED_REQUESTS.add(limited);
  if (res.status === 401) {
    HTTP_401_TOTAL.add(1);
    runtimeToken = '';
  }
  if (res.status >= 400 && res.status < 500) {
    iterationHas4xx = true;
    HTTP_4XX_TOTAL.add(1);
    if (res.status !== 429) HTTP_4XX_NON_429_TOTAL.add(1);
  }
  if (res.status >= 500 && res.status < 600) {
    iterationHas5xx = true;
    HTTP_5XX_TOTAL.add(1);
  }
  if (limited) {
    iterationRateLimited = true;
    HTTP_429_TOTAL.add(1);
  }

  if (DEBUG_ERRORS && res.status >= 400 && debugErrorCount < DEBUG_LIMIT) {
    debugErrorCount += 1;
    const bodyText = typeof res.body === 'string' ? res.body.replace(/\s+/g, ' ').slice(0, 260) : '';
    console.error(`[caso03][debug][${debugErrorCount}] ${endpoint} status=${res.status} body=${bodyText}`);
  }

  return limited;
}

function isBusinessSuccess(response, requireData) {
  if (!response || response.status < 200 || response.status >= 300) return false;
  const json = safeJson(response);
  if (!json) return true;
  if (typeof json !== 'object') return true;
  if (json.bSuccess === false) return false;
  if (!requireData) return true;
  return json.oData !== null && json.oData !== undefined;
}

function withRequestTags(baseOptions, endpointName) {
  const _ipSuffix = getIpLastOctet();
  const _ipPfx = _ipSuffix ? `IP ${_ipSuffix} ` : '';
  const visibleName = `${_ipPfx}${HTTP_DETAIL_MODE === 'guardar_only' ? HTTP_PUBLIC_NAME : endpointName}`;
  const options = baseOptions || {};
  return {
    ...options,
    ...ipPoolParams(),
    tags: {
      ...(options.tags || {}),
      name: visibleName
    }
  };
}

function postJson(endpoint, payload, requestName) {
  const params = withRequestTags(headers(), requestName || endpoint.replace(/^\//, ''));
  return http.post(`${BASE_API}${endpoint}`, JSON.stringify(payload), params);
}

function putForm(endpoint, payload, requestName) {
  const params = withRequestTags(authHeadersOnly(), requestName || endpoint.replace(/^\//, ''));
  return http.put(`${BASE_API}${endpoint}`, payload, params);
}

function resolveEndpointWithId(endpoint, idValue) {
  const id = String(idValue || '').trim();
  if (!id) return endpoint;
  if (endpoint.includes('{id}')) return endpoint.replace('{id}', id);
  if (endpoint.endsWith('/')) return `${endpoint}${id}`;
  return `${endpoint}/${id}`;
}

function rowsFromResponse(response) {
  const data = safeJson(response)?.oData;
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.Results)) return data.Results;
  if (typeof data === 'object') return [data];
  return [];
}

function valueOf(row, keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  return '';
}

function isEmptyLike(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim().toLowerCase();
  return text === '' || text === '-' || text === '--' || text === 'null' || text === 'undefined' || text === '0001-01-01' || text === '0001-01-01t00:00:00';
}

function candidateWithoutSanciones(rows) {
  const pick = rows.find((row) => {
    const fechaMod = valueOf(row, ['fechaModificacion', 'FechaModificacion', 'fecModificacion', 'FecModificacion', 'fechaModif', 'FechaModif', 'fechaActualizacion', 'FechaActualizacion']);
    const nroRec = valueOf(row, ['desResolucionReconsideracion', 'DesResolucionReconsideracion', 'numeroReconsideracion', 'NumeroReconsideracion', 'nroReconsideracion', 'NroReconsideracion', 'nroResolucionReconsideracion', 'NroResolucionReconsideracion', 'desResolReconsidera', 'DesResolReconsidera']);
    const fechaRec = valueOf(row, ['fechaResolucionReconsideracion', 'FechaResolucionReconsideracion', 'fechaReconsideracion', 'FechaReconsideracion', 'fecResolucionReconsideracion', 'FecResolucionReconsideracion']);
    const cumpleTresVacios = isEmptyLike(fechaMod) && isEmptyLike(nroRec) && isEmptyLike(fechaRec);
    if (!cumpleTresVacios) return false;

    const detalles = valueOf(row, ['detallesInfraccion', 'DetallesInfraccion', 'detalles', 'Detalles']);
    if (Array.isArray(detalles) && detalles.length > 0) return false;

    const display = String(valueOf(row, ['displaySancionImpuesta', 'DisplaySancionImpuesta'])).toLowerCase();
    const total = valueOf(row, ['totalDetallesInfraccion', 'TotalDetallesInfraccion', 'cantidadSanciones', 'CantidadSanciones']);
    const totalNum = Number.parseInt(String(total || ''), 10);
    const sinSancionesTexto = display.includes('sin detalle') || display.includes('sin sanciones') || display.includes('sin detalles de infracción') || display.includes('sin detalles de infraccion');
    const sinSancionesTotal = Number.isFinite(totalNum) ? totalNum === 0 : true;
    return sinSancionesTexto || sinSancionesTotal;
  });

  return pick || rows[0] || null;
}

function candidatesWithoutSanciones(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (!STRICT_ISOLATION) return rows.filter(Boolean);
  return rows.filter((row) => candidateWithoutSanciones([row]) === row);
}

function iterationSlot() {
  const globalIteration = Number(exec?.scenario?.iterationInTest);
  if (Number.isFinite(globalIteration) && globalIteration >= 0) {
    return globalIteration;
  }
  const localIteration = Number(exec?.vu?.iterationInInstance || 0);
  return Math.max(0, ((__VU || 1) - 1) + (localIteration * vus));
}

function reorderBySlot(items, slot) {
  if (!Array.isArray(items) || items.length <= 1) return Array.isArray(items) ? items : [];
  const normalized = Number.isFinite(slot) ? Math.max(0, slot) : 0;
  const index = normalized % items.length;
  return [...items.slice(index), ...items.slice(0, index)];
}

function buildTraceSuffix() {
  const runId = String(__ENV.K6_RUN_ID || __ENV.K6_TRACE_CASE || 'K6-03').trim();
  return `${runId}-VU${__VU || 1}-IT${iterationSlot()}`;
}

function cabeceraIdFromRow(cabecera) {
  return cabecera?.idCabeceraInfraccionSancion || cabecera?.IdCabeceraInfraccionSancion || cabecera?.idCabecera || null;
}

function guardarReconsideracion(cabecera, cabeceraId) {
  const trace = buildTraceSuffix();
  let response;
  if (String(ENDPOINT_ACTUALIZAR_CABECERA).toLowerCase().includes('/reconsideracion/guardarcabecera')) {
    response = postJson(ENDPOINT_ACTUALIZAR_CABECERA, {
      idCabeceraInfraccionSancion: cabeceraId,
      numeroReconsideracion: `K6-REC-${trace}`,
      fechaReconsideracion: new Date().toISOString(),
      sinSanciones: true
    }, ENDPOINT_ACTUALIZAR_CABECERA.replace(/^\//, ''));
  } else {
    const endpointActualizar = resolveEndpointWithId(ENDPOINT_ACTUALIZAR_CABECERA, cabeceraId);
    response = putForm(endpointActualizar, buildActualizarCabeceraPayload(cabecera || {}), ENDPOINT_ACTUALIZAR_CABECERA.replace(/^\//, ''));
    if (response.status === 404) {
      response = postJson('/Reconsideracion/GuardarCabecera', {
        idCabeceraInfraccionSancion: cabeceraId,
        numeroReconsideracion: `K6-REC-${trace}`,
        fechaReconsideracion: new Date().toISOString(),
        sinSanciones: true
      }, 'Reconsideracion/GuardarCabecera');
    }
  }

  return response;
}

function buildActualizarCabeceraPayload(cabecera) {
  const nowIso = new Date().toISOString();
  const trace = buildTraceSuffix();
  const fechaResolucion = String(valueOf(cabecera, ['fechaResolucion', 'FechaResolucion']) || nowIso).split('T')[0];
  const rutaSancion = String(valueOf(cabecera, ['rutaResolucionSancion', 'RutaResolSancion', 'RutaResolucionSancion']) || '');
  const rutaReconsAnterior = String(valueOf(cabecera, ['rutaResolucionReconsideracion', 'RutaResolReconsidera', 'RutaResolucionReconsideracion']) || '');

  return {
    IdEntidad: String(valueOf(cabecera, ['idEntidad', 'IdEntidad']) || ''),
    NumeroExpediente: String(valueOf(cabecera, ['numeroExpediente', 'NumeroExpediente']) || ''),
    NumeroResolucion: String(valueOf(cabecera, ['numeroResolucion', 'NumeroResolucion']) || ''),
    FechaResolucion: fechaResolucion,
    DesResolucionReconsideracion: `REC-${trace}`,
    FechaResolucionReconsideracion: nowIso,
    RutaResolucionSancion: rutaSancion,
    GuidCabecera: String(valueOf(cabecera, ['guidCabecera', 'GuidCabecera']) || ''),
    LimpiarReconsideracion: 'false',
    RutaResolucionReconsideracion: 'Campos_obligatorios_solicitud.pdf',
    ArchivoResolucionReconsideracion: http.file('K6 archivo de reconsideracion', 'Campos_obligatorios_solicitud.pdf', 'application/pdf'),
    rutaResolucionSancionAnterior: rutaSancion,
    rutaResolucionReconsideracionAnterior: rutaReconsAnterior
  };
}

export default function () {
  iterationRateLimited = false;
  iterationHas4xx = false;
  iterationHas5xx = false;
  const payloadListarPaginado = {
    nPageNumber: 1,
    nPageSize: LIST_PAGE_SIZE,
    sinSanciones: true
  };
  const payloadListarSimple = {
    nPageNumber: 1,
    nPageSize: LIST_PAGE_SIZE,
    sinSanciones: true,
    reconsideracionPendiente: true
  };

  let listarResp = postJson(ENDPOINT_LISTAR_CABECERA, payloadListarPaginado, ENDPOINT_LISTAR_CABECERA.replace(/^\//, ''));
  if (listarResp.status === 404) {
    listarResp = postJson('/CabeceraInfraccionSancion/Listar', payloadListarSimple, 'CabeceraInfraccionSancion/Listar');
  }
  reportStatus(listarResp, 'Caso03/ListarCabecera');
  const listarOk = isBusinessSuccess(listarResp, true) || (EXPECT_RATE_LIMIT && listarResp.status === 429);
  STEP_OK_RATE.add(listarOk);
  LISTAR_OK_RATE.add(listarOk);

  const cabeceras = rowsFromResponse(listarResp);
  const elegibles = candidatesWithoutSanciones(cabeceras);
  const slot = iterationSlot();
  const prioritizedCabeceras = reorderBySlot(elegibles, slot).slice(0, 8);
  if (prioritizedCabeceras.length === 0) {
    const fallback = reorderBySlot(cabeceras.filter(Boolean), slot).slice(0, 8);
    prioritizedCabeceras.push(...fallback);
  }

  let selectedCabecera = prioritizedCabeceras[0] || null;
  let cabeceraId = cabeceraIdFromRow(selectedCabecera);
  let guardarResp = null;
  let guardarOk = false;

  for (const candidate of prioritizedCabeceras) {
    const candidateId = cabeceraIdFromRow(candidate);
    if (!candidateId) continue;
    const response = guardarReconsideracion(candidate, candidateId);
    reportStatus(response, 'Caso03/GuardarReconsideracion');
    const ok = isBusinessSuccess(response, false) || (EXPECT_RATE_LIMIT && response.status === 429);
    if (ok) {
      selectedCabecera = candidate;
      cabeceraId = candidateId;
      guardarResp = response;
      guardarOk = true;
      break;
    }
    guardarResp = response;
  }

  if (!guardarResp) {
    guardarResp = { status: 0, body: '' };
  }

  STEP_OK_RATE.add(guardarOk);
  GUARDAR_OK_RATE.add(guardarOk);

  const payloadDetallePaginado = {
    idCabeceraInfraccionSancion: cabeceraId,
    nPageNumber: 1,
    nPageSize: DETAIL_PAGE_SIZE,
    sSortColumnName: 'ID_DETALLE_INFRACCION_SANCION',
    sSortOrder: 'DESC',
    sFilterValue: ''
  };
  const payloadDetalleSimple = {
    nPageNumber: 1,
    nPageSize: DETAIL_PAGE_SIZE,
    idCabeceraInfraccionSancion: cabeceraId,
    sinSanciones: true
  };
  let detalleResp = postJson(ENDPOINT_LISTAR_DETALLE, payloadDetallePaginado, ENDPOINT_LISTAR_DETALLE.replace(/^\//, ''));
  if (detalleResp.status === 404) {
    detalleResp = postJson('/DetalleInfraccionSancion/Listar', payloadDetalleSimple, 'DetalleInfraccionSancion/Listar');
  }
  reportStatus(detalleResp, 'Caso03/ListarDetalle');
  const detalleOk = isBusinessSuccess(detalleResp, false) || (EXPECT_RATE_LIMIT && detalleResp.status === 429);
  STEP_OK_RATE.add(detalleOk);
  DETALLE_OK_RATE.add(detalleOk);

  const registroOk = Boolean(listarOk && guardarOk && detalleOk);
  REGISTRO_OK_RATE.add(registroOk);
  REGISTRO_EXPECTED_RATE.add(Boolean(registroOk || iterationRateLimited));

  check({ registroOk, limited: iterationRateLimited }, {
    'caso03 crear resultado esperado': (ctx) => (EXPECT_RATE_LIMIT ? (ctx.registroOk || ctx.limited) : ctx.registroOk)
  });
  if (EXPECT_RATE_LIMIT) {
    check({ registroOk, limited: iterationRateLimited }, {
      'caso03 crear status 429 esperado por limite de regla de negocio': (ctx) => ctx.registroOk || ctx.limited
    });
  }
  if (iterationHas4xx || iterationHas5xx) {
    const suffix = iterationHas4xx && iterationHas5xx ? '4xx y 5xx' : (iterationHas4xx ? '4xx' : '5xx');
    check({ ok: true }, {
      [`caso03 crear status ${suffix} detectado`]: () => true
    });
  }

  sleep(K6_SLEEP_SECONDS);
}
