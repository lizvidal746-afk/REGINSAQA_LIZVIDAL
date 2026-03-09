import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'https://reginsaapiqa.sunedu.gob.pe/api';
const ENDPOINT_CREAR = __ENV.K6_CASO01_CREAR || '/Entidad/Crear';
const STRICT_UNIQUE = (__ENV.K6_STRICT_UNIQUE || '0') === '1';
const BURST_MODE = (__ENV.K6_BURST_MODE || '0') === '1';
const COMPAT_PAYLOAD_MODE = (__ENV.K6_CASO01_COMPAT_PAYLOAD || '1') !== '0';

const HTTP_429_TOTAL = new Counter('http_429_total');
const RATE_LIMITED_REQUESTS = new Rate('rate_limited_requests');
const CREATE_HTTP_200_TOTAL = new Counter('create_http_200_total');
const CREATE_HTTP_201_TOTAL = new Counter('create_http_201_total');
const CREATE_HTTP_409_TOTAL = new Counter('create_http_409_total');
const CREATE_BUSINESS_OK_TOTAL = new Counter('create_business_ok_total');
const CREATE_BUSINESS_FAIL_TOTAL = new Counter('create_business_fail_total');
const CREATE_BSUCCESS_FALSE_TOTAL = new Counter('create_bsuccess_false_total');
const CREATE_DUPLICATE_409_TOTAL = new Counter('create_duplicate_409_total');
const CREATE_BUSINESS_OK_RATE = new Rate('create_business_ok_rate');
const CREATE_HTTP_400_TOTAL = new Counter('create_http_400_total');
const CREATE_HTTP_401_TOTAL = new Counter('create_http_401_total');
const CREATE_HTTP_403_TOTAL = new Counter('create_http_403_total');
const CREATE_HTTP_404_TOTAL = new Counter('create_http_404_total');
const CREATE_HTTP_500_TOTAL = new Counter('create_http_500_total');
const CREATE_HTTP_502_TOTAL = new Counter('create_http_502_total');
const CREATE_HTTP_503_TOTAL = new Counter('create_http_503_total');
const CREATE_HTTP_4XX_TOTAL = new Counter('create_http_4xx_total');
const CREATE_HTTP_5XX_TOTAL = new Counter('create_http_5xx_total');
const CREATE_MSG_DUPLICADO_TOTAL = new Counter('create_msg_duplicado_total');
const CREATE_MSG_VALIDACION_TOTAL = new Counter('create_msg_validacion_total');
const CREATE_MSG_RUC_TOTAL = new Counter('create_msg_ruc_total');
const CREATE_MSG_AUTH_TOTAL = new Counter('create_msg_auth_total');
const CREATE_MSG_OTHER_TOTAL = new Counter('create_msg_other_total');

const DEBUG_ERRORS = (__ENV.K6_DEBUG_ERRORS || '0') === '1';
const DEBUG_LIMIT = Math.max(1, Number.parseInt(__ENV.K6_DEBUG_ERRORS_MAX || '5', 10) || 5);
let debugErrorCount = 0;

const AUTO_LOGIN_ENABLED = (__ENV.K6_AUTO_LOGIN || '1') === '1';
const AUTH_ENDPOINT = String(__ENV.REGINSA_AUTH_ENDPOINT || __ENV.K6_AUTH_LOGIN_ENDPOINT || '/Auth/Login').trim();
const AUTH_USER_FIELD = String(__ENV.REGINSA_AUTH_USER_FIELD || 'usuario').trim() || 'usuario';
const AUTH_PASS_FIELD = String(__ENV.REGINSA_AUTH_PASS_FIELD || 'contrasena').trim() || 'contrasena';
const AUTH_TOKEN_PATH = String(__ENV.REGINSA_AUTH_TOKEN_PATH || '').trim();
const AUTH_TIMEOUT_MS = Math.max(1000, Number.parseInt(__ENV.REGINSA_AUTH_TIMEOUT_MS || '20000', 10) || 20000);
const AUTH_RETRY_MAX = Math.max(0, Number.parseInt(__ENV.K6_AUTH_RETRY_MAX || '1', 10) || 1);

let runtimeToken = '';

function normalizeAuth(value) {
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
  return `${BASE_URL.replace(/\/+$/, '')}${endpoint}`;
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
  return normalizeAuth(current);
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
        const token = normalizeAuth(value);
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

function credentialForVu() {
  if (AUTH_CREDENTIALS.length === 0) return null;
  const idx = Math.max(0, (__VU || 1) - 1) % AUTH_CREDENTIALS.length;
  return AUTH_CREDENTIALS[idx];
}

function obtainRuntimeToken() {
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

      if (response.status < 200 || response.status >= 300) continue;
      const data = parseJsonSafe(response);
      const token = extractTokenFromData(data);
      if (token) return token;
    }
  }

  return '';
}

function invalidateRuntimeToken() {
  runtimeToken = '';
}

const rawDataset = open('../../../reportes/k6-caso01-dataset.json');
const DATASET = JSON.parse(rawDataset || '[]');

if (!Array.isArray(DATASET) || DATASET.length === 0) {
  throw new Error('Dataset k6 vacío. Ejecuta: npm run pool:k6:dataset');
}

const requestedIterations = Number.parseInt(__ENV.K6_FIXED_ITERATIONS || __ENV.K6_TOTAL_REGISTROS || `${DATASET.length}`, 10);
const iterations = Number.isFinite(requestedIterations)
  ? Math.max(1, Math.min(requestedIterations, DATASET.length))
  : DATASET.length;
const vusRequested = Number.parseInt(__ENV.K6_FIXED_VUS || '3', 10);
const vus = Number.isFinite(vusRequested) ? Math.max(1, vusRequested) : 3;

const burstIterPerVuRequested = Number.parseInt(__ENV.K6_BURST_ITER_PER_VU || '', 10);
const hasBurstIterPerVu = Number.isFinite(burstIterPerVuRequested) && burstIterPerVuRequested > 0;

if (BURST_MODE && !hasBurstIterPerVu && (iterations % vus !== 0)) {
  throw new Error(`Burst mode requiere K6_FIXED_ITERATIONS divisible por K6_FIXED_VUS (actual: ${iterations}/${vus}) o definir K6_BURST_ITER_PER_VU.`);
}

const burstIterPerVu = BURST_MODE
  ? (hasBurstIterPerVu ? Math.max(1, burstIterPerVuRequested) : Math.max(1, Math.floor(iterations / vus)))
  : 0;
const burstTotalIterations = BURST_MODE ? (vus * burstIterPerVu) : iterations;

if (STRICT_UNIQUE && burstTotalIterations > DATASET.length) {
  throw new Error(`STRICT_UNIQUE=1 requiere dataset >= iteraciones efectivas (${DATASET.length} < ${burstTotalIterations}).`);
}

export const options = {
  scenarios: {
    caso01_agregar_administrado: {
      executor: BURST_MODE ? 'per-vu-iterations' : 'shared-iterations',
      vus,
      ...(BURST_MODE ? { iterations: burstIterPerVu } : { iterations }),
      maxDuration: __ENV.PERF_DURATION || '10m'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<3000', 'avg<1500'],
    http_req_failed: ['rate<0.2'],
    create_business_ok_rate: ['rate>0.7'],
    ...(STRICT_UNIQUE ? { create_http_409_total: ['count==0'] } : {})
  }
};

function parseJsonSafe(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

function classifyMessage(message) {
  const text = String(message || '').toLowerCase();
  if (!text) {
    CREATE_MSG_OTHER_TOTAL.add(1);
    return;
  }

  if (text.includes('existe') || text.includes('duplic')) {
    CREATE_MSG_DUPLICADO_TOTAL.add(1);
    return;
  }
  if (text.includes('ruc')) {
    CREATE_MSG_RUC_TOTAL.add(1);
    return;
  }
  if (text.includes('obligatorio') || text.includes('inválid') || text.includes('inval') || text.includes('formato')) {
    CREATE_MSG_VALIDACION_TOTAL.add(1);
    return;
  }
  if (text.includes('token') || text.includes('autoriz') || text.includes('sesi') || text.includes('credencial') || text.includes('forbidden') || text.includes('unauthorized')) {
    CREATE_MSG_AUTH_TOTAL.add(1);
    return;
  }

  CREATE_MSG_OTHER_TOTAL.add(1);
}

function countHttpErrors(status) {
  if (status >= 400 && status < 500) {
    CREATE_HTTP_4XX_TOTAL.add(1);
    if (status === 400) CREATE_HTTP_400_TOTAL.add(1);
    if (status === 401) CREATE_HTTP_401_TOTAL.add(1);
    if (status === 403) CREATE_HTTP_403_TOTAL.add(1);
    if (status === 404) CREATE_HTTP_404_TOTAL.add(1);
    return;
  }

  if (status >= 500 && status < 600) {
    CREATE_HTTP_5XX_TOTAL.add(1);
    if (status === 500) CREATE_HTTP_500_TOTAL.add(1);
    if (status === 502) CREATE_HTTP_502_TOTAL.add(1);
    if (status === 503) CREATE_HTTP_503_TOTAL.add(1);
  }
}

function logDebugFailure(payload, status, body, reason) {
  if (!DEBUG_ERRORS || debugErrorCount >= DEBUG_LIMIT) return;
  debugErrorCount += 1;

  const msg = body && typeof body === 'object' ? (body.sMessage || body.message || '') : '';
  console.error(
    `[caso01][debug][${debugErrorCount}] status=${status} reason=${reason} ruc=${payload.ruc} msg=${String(msg || '').slice(0, 220)}`
  );
}

function evaluateBusinessResult(response) {
  const status = response.status;
  if (status === 401) {
    invalidateRuntimeToken();
  }
  countHttpErrors(status);
  if (status === 200) CREATE_HTTP_200_TOTAL.add(1);
  if (status === 201) CREATE_HTTP_201_TOTAL.add(1);
  if (status === 409) CREATE_HTTP_409_TOTAL.add(1);

  if (status === 429) {
    return {
      businessOk: false,
      controlled: true,
      reason: 'rate-limit-429'
    };
  }

  if (status === 409) {
    CREATE_DUPLICATE_409_TOTAL.add(1);
    if (STRICT_UNIQUE) {
      return {
        businessOk: false,
        controlled: false,
        reason: 'duplicate-409-strict'
      };
    }
    return {
      businessOk: false,
      controlled: true,
      reason: 'duplicate-409'
    };
  }

  const body = parseJsonSafe(response);
  const message = body && typeof body === 'object' ? (body.sMessage || body.message || '') : '';
  const hasBSuccess = body && Object.prototype.hasOwnProperty.call(body, 'bSuccess');
  const bSuccess = hasBSuccess ? Boolean(body.bSuccess) : true;

  if ((status === 200 || status === 201) && bSuccess) {
    return {
      businessOk: true,
      controlled: true,
      reason: 'created'
    };
  }

  if ((status === 200 || status === 201) && !bSuccess) {
    CREATE_BSUCCESS_FALSE_TOTAL.add(1);
    classifyMessage(message);
    return {
      businessOk: false,
      controlled: false,
      reason: 'bsuccess-false',
      body
    };
  }

  if (status >= 400 || status >= 500) {
    classifyMessage(message);
  }

  return {
    businessOk: false,
    controlled: false,
    reason: 'business-failed',
    body
  };
}

function authHeaders() {
  const explicit = (__ENV.K6_AUTH_HEADER || '').trim();
  if (explicit) {
    return {
      'Content-Type': 'application/json',
      Authorization: normalizeAuth(explicit)
    };
  }

  const explicitPool = String(__ENV.K6_AUTH_HEADERS || '').trim();
  if (explicitPool) {
    const tokens = explicitPool
      .split(/[;,]/)
      .map((item) => normalizeAuth(item))
      .filter((item) => item.length > 0);

    if (tokens.length > 0) {
      const token = tokens[((__VU || 1) - 1) % tokens.length];
      return {
        'Content-Type': 'application/json',
        Authorization: token
      };
    }
  }

  const tokenList = [];
  for (let i = 1; i <= 20; i++) {
    const candidate = normalizeAuth(__ENV[`TOKEN${i}`]);
    if (candidate) tokenList.push(candidate);
  }
  const fallbackToken = normalizeAuth(__ENV.TOKEN);
  if (fallbackToken) tokenList.push(fallbackToken);

  if (tokenList.length > 0) {
    const token = tokenList[((__VU || 1) - 1) % tokenList.length];
    return {
      'Content-Type': 'application/json',
      Authorization: token
    };
  }

  if (!runtimeToken) {
    runtimeToken = obtainRuntimeToken();
  }

  if (runtimeToken) {
    return {
      'Content-Type': 'application/json',
      Authorization: runtimeToken
    };
  }

  return {
    'Content-Type': 'application/json'
  };
}

function mark429(response) {
  const limited = response && response.status === 429;
  RATE_LIMITED_REQUESTS.add(Boolean(limited));
  if (limited) {
    HTTP_429_TOTAL.add(1);
  }
}

function buildCreatePayload(row) {
  const ruc = String(row.ruc || '').trim();
  const razonSocial = String(row.razonSocial || '').trim();
  const nombreComercial = String(row.nombreComercial || row.razonSocial || '').trim();
  const estadoNumber = Number.isFinite(Number(row.estado)) ? Number(row.estado) : 1;

  if (!COMPAT_PAYLOAD_MODE) {
    return {
      ruc,
      razonSocial,
      nombreComercial,
      estado: estadoNumber
    };
  }

  return {
    ruc,
    Ruc: ruc,
    razonSocial,
    RazonSocial: razonSocial,
    nombreComercial,
    NombreComercial: nombreComercial,
    estado: estadoNumber,
    Estado: estadoNumber,
    idEstado: estadoNumber,
    IdEstado: estadoNumber,
    bitActivo: true,
    BitActivo: true
  };
}

export default function () {
  const idx = BURST_MODE
    ? (((__VU || 1) - 1) * burstIterPerVu) + (__ITER || 0)
    : Number(exec.scenario.iterationInTest || 0);
  const row = DATASET[idx % DATASET.length];

  const payload = buildCreatePayload(row);

  const response = http.post(
    `${BASE_URL}${ENDPOINT_CREAR}`,
    JSON.stringify(payload),
    { headers: authHeaders() }
  );

  mark429(response);
  const business = evaluateBusinessResult(response);
  CREATE_BUSINESS_OK_RATE.add(Boolean(business.businessOk));

  if (business.businessOk) {
    CREATE_BUSINESS_OK_TOTAL.add(1);
  } else if (!business.controlled) {
    CREATE_BUSINESS_FAIL_TOTAL.add(1);
    logDebugFailure(payload, response.status, business.body, business.reason);
  }

  check(response, {
    'caso01 crear status esperado': (r) => r.status === 200 || r.status === 201 || r.status === 409 || r.status === 429
  });

  check(
    { response, business },
    {
      'caso01 crear negocio esperado': (ctx) => ctx.business.businessOk || ctx.business.controlled
    }
  );

  sleep(Number.parseFloat(__ENV.K6_SLEEP_SECONDS || '0.2'));
}
