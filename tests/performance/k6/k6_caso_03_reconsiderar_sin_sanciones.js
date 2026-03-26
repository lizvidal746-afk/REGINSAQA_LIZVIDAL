import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';

const BASE_API = __ENV.BASE_API || __ENV.BASE_URL || 'https://reginsaapiqa.sunedu.gob.pe/api';
const BURST_MODE = (__ENV.K6_BURST_MODE || '0') === '1';
const DEBUG_ERRORS = (__ENV.K6_DEBUG_ERRORS || '0') === '1';
const DEBUG_LIMIT = Math.max(1, Number.parseInt(__ENV.K6_DEBUG_ERRORS_MAX || '8', 10) || 8);

const ENDPOINT_LISTAR_CABECERA = __ENV.K6_CASO03_LISTAR_CABECERA || '/CabeceraInfraccionSancion/Listar';
const ENDPOINT_GUARDAR_RECONSIDERACION = __ENV.K6_CASO03_GUARDAR_RECONSIDERACION || '/Reconsideracion/GuardarCabecera';
const ENDPOINT_LISTAR_DETALLE = __ENV.K6_CASO03_LISTAR_DETALLE || '/DetalleInfraccionSancion/Listar';

function parseIntEnv(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const LIST_PAGE_SIZE = Math.max(10, parseIntEnv(__ENV.K6_CASO03_PAGE_SIZE || __ENV.K6_LIST_PAGE_SIZE, 100));
const DETAIL_PAGE_SIZE = Math.max(10, parseIntEnv(__ENV.K6_CASO03_DETAIL_PAGE_SIZE || LIST_PAGE_SIZE, LIST_PAGE_SIZE));

const EXPECT_RATE_LIMIT = (__ENV.K6_EXPECT_RATE_LIMIT || '0') === '1';
const AUTO_LOGIN_ENABLED = (__ENV.K6_AUTO_LOGIN || '1') === '1';
const AUTH_ENDPOINT = String(__ENV.REGINSA_AUTH_ENDPOINT || __ENV.K6_AUTH_LOGIN_ENDPOINT || '/Auth/Login').trim();
const AUTH_USER_FIELD = String(__ENV.REGINSA_AUTH_USER_FIELD || 'usuario').trim() || 'usuario';
const AUTH_PASS_FIELD = String(__ENV.REGINSA_AUTH_PASS_FIELD || 'contrasena').trim() || 'contrasena';
const AUTH_TOKEN_PATH = String(__ENV.REGINSA_AUTH_TOKEN_PATH || '').trim();
const AUTH_TIMEOUT_MS = Math.max(1000, parseIntEnv(__ENV.REGINSA_AUTH_TIMEOUT_MS, 20000));
const AUTH_RETRY_MAX = Math.max(0, parseIntEnv(__ENV.K6_AUTH_RETRY_MAX, 1));

let debugErrorCount = 0;
let runtimeToken = '';

const requestedIterations = parseIntEnv(__ENV.K6_FIXED_ITERATIONS || __ENV.K6_TOTAL_REGISTROS, 1);
const iterations = Math.max(1, requestedIterations);
const vus = Math.max(1, parseIntEnv(__ENV.K6_FIXED_VUS, 1));
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
const RATE_LIMITED_REQUESTS = new Rate('rate_limited_requests');
const STEP_OK_RATE = new Rate('step_ok_rate');
const REGISTRO_OK_RATE = new Rate('registro_ok_rate');

export const options = {
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
    http_req_failed: [EXPECT_RATE_LIMIT ? 'rate<0.98' : 'rate<0.4'],
    rate_limited_requests: [EXPECT_RATE_LIMIT ? 'rate<0.99' : 'rate<0.6'],
    step_ok_rate: [EXPECT_RATE_LIMIT ? 'rate>0.5' : 'rate>0.7'],
    registro_ok_rate: [EXPECT_RATE_LIMIT ? 'rate>0.0' : 'rate>0.6']
  }
};

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
        timeout: `${AUTH_TIMEOUT_MS}ms`
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

function reportStatus(res, endpoint) {
  const limited = res.status === 429;
  RATE_LIMITED_REQUESTS.add(limited);
  if (res.status === 401) {
    HTTP_401_TOTAL.add(1);
    runtimeToken = '';
  }
  if (res.status >= 400 && res.status < 500) HTTP_4XX_TOTAL.add(1);
  if (res.status >= 500 && res.status < 600) HTTP_5XX_TOTAL.add(1);
  if (limited) {
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
  if (!response || (response.status !== 200 && response.status !== 201)) return false;
  const json = safeJson(response);
  if (!json || typeof json !== 'object') return false;
  if (json.bSuccess === false) return false;
  if (!requireData) return true;
  return json.oData !== null && json.oData !== undefined;
}

function postJson(endpoint, payload) {
  return http.post(`${BASE_API}${endpoint}`, JSON.stringify(payload), headers());
}

function pickCabeceraId(listResponse) {
  const data = safeJson(listResponse)?.oData;
  if (!data) return null;

  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    return first?.idCabeceraInfraccionSancion || first?.IdCabeceraInfraccionSancion || first?.idCabecera || null;
  }

  if (Array.isArray(data?.Results) && data.Results.length > 0) {
    const first = data.Results[0];
    return first?.idCabeceraInfraccionSancion || first?.IdCabeceraInfraccionSancion || first?.idCabecera || null;
  }

  return data?.idCabeceraInfraccionSancion || data?.IdCabeceraInfraccionSancion || data?.idCabecera || null;
}

export default function () {
  const listarResp = postJson(ENDPOINT_LISTAR_CABECERA, {
    nPageNumber: 1,
    nPageSize: LIST_PAGE_SIZE,
    sinSanciones: true,
    reconsideracionPendiente: true
  });
  reportStatus(listarResp, 'Caso03/ListarCabecera');
  const listarOk = check(listarResp, { 'caso03_listar_ok': (r) => r.status === 200 || r.status === 429 });
  STEP_OK_RATE.add(listarOk);

  const cabeceraId = pickCabeceraId(listarResp);

  const guardarResp = postJson(ENDPOINT_GUARDAR_RECONSIDERACION, {
    idCabeceraInfraccionSancion: cabeceraId,
    numeroReconsideracion: `K6-REC-${Date.now()}`,
    fechaReconsideracion: new Date().toISOString(),
    sinSanciones: true
  });
  reportStatus(guardarResp, 'Caso03/GuardarReconsideracion');
  const guardarOk = check(guardarResp, { 'caso03_guardar_ok': (r) => isBusinessSuccess(r, false) || r.status === 429 });
  STEP_OK_RATE.add(guardarOk);

  const detalleResp = postJson(ENDPOINT_LISTAR_DETALLE, {
    nPageNumber: 1,
    nPageSize: DETAIL_PAGE_SIZE,
    idCabeceraInfraccionSancion: cabeceraId,
    sinSanciones: true
  });
  reportStatus(detalleResp, 'Caso03/ListarDetalle');
  const detalleOk = check(detalleResp, { 'caso03_detalle_ok': (r) => r.status === 200 || r.status === 429 });
  STEP_OK_RATE.add(detalleOk);

  REGISTRO_OK_RATE.add(Boolean(listarOk && guardarOk && detalleOk));
  sleep(Number.parseFloat(__ENV.K6_SLEEP_SECONDS || '0.2'));
}
