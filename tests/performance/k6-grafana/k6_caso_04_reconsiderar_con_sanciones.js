import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';

const BASE_API = __ENV.BASE_API || __ENV.BASE_URL || 'https://reginsaapiqa.sunedu.gob.pe/api';
const DEBUG_ERRORS = (__ENV.K6_DEBUG_ERRORS || '0') === '1';
const DEBUG_LIMIT = Math.max(1, Number.parseInt(__ENV.K6_DEBUG_ERRORS_MAX || '8', 10) || 8);
const EXPECT_RATE_LIMIT = (__ENV.K6_EXPECT_RATE_LIMIT || '1') === '1';
const STRICT_ISOLATION = (__ENV.K6_CASO04_STRICT_ISOLATION || '1') === '1';

const ENDPOINT_LISTAR_DETALLE = __ENV.K6_CASO04_LISTAR_DETALLE || '/DetalleInfraccionSancion/Listar';
const ENDPOINT_ACTUALIZAR_RECONSIDERACION = __ENV.K6_CASO04_ACTUALIZAR_RECONSIDERACION || '/DetalleInfraccionSancion/ActualizarReconsideracion';
const ENDPOINT_CONFIRMAR_DETALLE = __ENV.K6_CASO04_CONFIRMAR_DETALLE || '/DetalleInfraccionSancion/Confirmar';
const LIST_PAGE_SIZE = Math.max(10, parseIntEnv(__ENV.K6_CASO04_PAGE_SIZE, 100));
const LIST_MAX_PAGES = Math.max(1, parseIntEnv(__ENV.K6_CASO04_MAX_PAGES, 50));
const STRICT_FIRST_N = (__ENV.K6_CASO04_STRICT_FIRST_N || '1') === '1';

function parseIntEnv(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatEnv(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

const BURST_MODE = (__ENV.K6_BURST_MODE || '0') === '1';
const AUTO_LOGIN_ENABLED = (__ENV.K6_AUTO_LOGIN || '1') === '1';
const AUTH_ENDPOINT = String(__ENV.REGINSA_AUTH_ENDPOINT || __ENV.K6_AUTH_LOGIN_ENDPOINT || '/Auth/Login').trim();
const AUTH_USER_FIELD = String(__ENV.REGINSA_AUTH_USER_FIELD || 'usuario').trim() || 'usuario';
const AUTH_PASS_FIELD = String(__ENV.REGINSA_AUTH_PASS_FIELD || 'contrasena').trim() || 'contrasena';
const AUTH_TOKEN_PATH = String(__ENV.REGINSA_AUTH_TOKEN_PATH || '').trim();
const AUTH_TIMEOUT_MS = Math.max(1000, parseIntEnv(__ENV.REGINSA_AUTH_TIMEOUT_MS, 20000));
const AUTH_RETRY_MAX = Math.max(0, parseIntEnv(__ENV.K6_AUTH_RETRY_MAX, 1));

let runtimeToken = '';
let debugErrorCount = 0;
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

console.log(`[caso04] modo=${K6_MODE} cantidad=${iterations} vus=${vus} sleep=${K6_SLEEP_SECONDS} project=${CLOUD_PROJECT_ID || 'local'}`);

export const options = {
  ...(CLOUD_PROJECT_ID > 0 ? { cloud: { projectID: CLOUD_PROJECT_ID, name: `caso04-${K6_MODE}` } } : {}),
  tags: {
    caso: '04',
    modo: K6_MODE
  },
  scenarios: {
    caso04_reconsiderar_con_sanciones: {
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
    console.error(`[caso04][debug][${debugErrorCount}] ${endpoint} status=${res.status} body=${bodyText}`);
  }

  return limited;
}

function isBusinessSuccess(response) {
  if (!response || (response.status !== 200 && response.status !== 201)) return false;
  const json = safeJson(response);
  if (!json || typeof json !== 'object') return false;
  return json.bSuccess !== false;
}

function postJson(endpoint, payload) {
  return http.post(`${BASE_API}${endpoint}`, JSON.stringify(payload), headers());
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

function hasSancion(row) {
  const texto = String(valueOf(row, [
    'displaySancionImpuesta', 'DisplaySancionImpuesta',
    'desSancionImpuesta', 'DesSancionImpuesta',
    'tipoSancion', 'TipoSancion'
  ])).toLowerCase();
  const flag = valueOf(row, ['conSanciones', 'ConSanciones', 'tieneSancion', 'TieneSancion']);
  const total = valueOf(row, ['totalDetallesInfraccion', 'TotalDetallesInfraccion', 'cantidadSanciones', 'CantidadSanciones']);
  const totalNum = Number.parseInt(String(total || ''), 10);
  const porTexto = /multa|suspensi[oó]n|cancelaci[oó]n|uit|soles/.test(texto) && !/sin\s+sanci[oó]n|sin\s+detalle|^no$/.test(texto);
  const porFlag = ['1', 'true', 'si', 'sí'].includes(String(flag || '').trim().toLowerCase());
  const porTotal = Number.isFinite(totalNum) && totalNum > 0;
  return porTexto || porFlag || porTotal;
}

function isDisponibleParaReconsiderar(row) {
  if (!row || typeof row !== 'object') return false;
  if (!STRICT_ISOLATION) return true;

  const fechaRec = valueOf(row, ['fechaReconsideracion', 'FechaReconsideracion', 'fechaResolucionReconsideracion', 'FechaResolucionReconsideracion']);
  const nroRec = valueOf(row, ['numeroReconsideracion', 'NumeroReconsideracion', 'desResolucionReconsideracion', 'DesResolucionReconsideracion']);
  const fMod = valueOf(row, ['fechaModificacion', 'FechaModificacion', 'fecModificacion', 'FecModificacion']);
  const bitReconsidera = String(valueOf(row, ['bitReconsidera', 'BitReconsidera', 'reconsiderado', 'Reconsiderado']) || '').trim().toLowerCase();
  const noReconsiderado = bitReconsidera === '' || bitReconsidera === '0' || bitReconsidera === 'false';

  return isEmptyLike(fechaRec) && isEmptyLike(nroRec) && isEmptyLike(fMod) && noReconsiderado && hasSancion(row);
}

function iterationSlot() {
  const globalIteration = Number(exec?.scenario?.iterationInTest);
  if (Number.isFinite(globalIteration) && globalIteration >= 0) {
    return globalIteration;
  }
  const localIteration = Number(exec?.vu?.iterationInInstance || 0);
  return Math.max(0, ((__VU || 1) - 1) + (localIteration * vus));
}

function pickRowBySlot(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const slot = iterationSlot();
  return rows[slot] || null;
}

function idDetalleFromRow(picked) {
  if (!picked || typeof picked !== 'object') return 0;
  const id = picked?.idDetalleInfraccionSancion || picked?.IdDetalleInfraccionSancion || picked?.idDetalle || 0;
  const parsed = Number.parseInt(String(id || '0'), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function listarPaginaDetalle(pageNumber) {
  const response = postJson(ENDPOINT_LISTAR_DETALLE, {
    nPageNumber: pageNumber,
    nPageSize: LIST_PAGE_SIZE,
    conSanciones: true
  });
  reportStatus(response, `Caso04/ListarDetalle[p=${pageNumber}]`);
  const ok = isBusinessSuccess(response) || (EXPECT_RATE_LIMIT && response.status === 429);
  STEP_OK_RATE.add(ok);
  return { response, ok, rows: rowsFromResponse(response) };
}

function pickDetalleByOrdinal(globalOrdinal) {
  if (!Number.isFinite(globalOrdinal) || globalOrdinal < 0) {
    return { idDetalle: 0, listarOk: false, found: false, reason: 'ordinal-invalido' };
  }

  let candidatosAcumulados = 0;
  let ultimoListarOk = false;

  for (let page = 1; page <= LIST_MAX_PAGES; page += 1) {
    const { ok, rows } = listarPaginaDetalle(page);
    ultimoListarOk = ok;
    if (!Array.isArray(rows) || rows.length === 0) {
      break;
    }

    for (const row of rows) {
      if (!isDisponibleParaReconsiderar(row)) continue;
      if (candidatosAcumulados === globalOrdinal) {
        return {
          idDetalle: idDetalleFromRow(row),
          listarOk: ultimoListarOk,
          found: true,
          reason: `ordinal=${globalOrdinal};page=${page};offset=${candidatosAcumulados}`
        };
      }
      candidatosAcumulados += 1;
    }
  }

  return {
    idDetalle: 0,
    listarOk: ultimoListarOk,
    found: false,
    reason: `sin-candidato-ordinal=${globalOrdinal};detectados=${candidatosAcumulados};maxPages=${LIST_MAX_PAGES}`
  };
}

export default function () {
  iterationRateLimited = false;
  iterationHas4xx = false;
  iterationHas5xx = false;

  const slot = iterationSlot();
  const seleccion = pickDetalleByOrdinal(slot);
  const listarOk = seleccion.listarOk;
  const detalleId = seleccion.idDetalle;

  if (!detalleId) {
    if (STRICT_FIRST_N) {
      check({ ok: false }, {
        'caso04 seleccion estricto primeros N': () => false
      });
      REGISTRO_OK_RATE.add(false);
      REGISTRO_EXPECTED_RATE.add(false);
      throw new Error(`[caso04] No se encontró candidato para ordinal ${slot}. ${seleccion.reason}`);
    }

    const fallbackId = Number.parseInt(__ENV.K6_CASO04_ID_DETALLE || '1', 10);
    if (DEBUG_ERRORS) {
      console.error(`[caso04] fallback idDetalle=${fallbackId} por ${seleccion.reason}`);
    }
    const safeId = Number.isFinite(fallbackId) ? fallbackId : 1;

    const actualizarRespFallback = postJson(ENDPOINT_ACTUALIZAR_RECONSIDERACION, {
      idDetalleInfraccionSancion: safeId,
      bitReconsidera: 1,
      fechaReconsideracion: new Date().toISOString()
    });
    reportStatus(actualizarRespFallback, 'Caso04/ActualizarReconsideracionFallback');
    const actualizarOkFallback = isBusinessSuccess(actualizarRespFallback) || (EXPECT_RATE_LIMIT && actualizarRespFallback.status === 429);
    STEP_OK_RATE.add(actualizarOkFallback);

    const confirmarRespFallback = postJson(ENDPOINT_CONFIRMAR_DETALLE, {
      idDetalleInfraccionSancion: safeId,
      confirmar: true
    });
    reportStatus(confirmarRespFallback, 'Caso04/ConfirmarDetalleFallback');
    const confirmarOkFallback = isBusinessSuccess(confirmarRespFallback) || (EXPECT_RATE_LIMIT && confirmarRespFallback.status === 429);
    STEP_OK_RATE.add(confirmarOkFallback);

    const registroOkFallback = Boolean(listarOk && actualizarOkFallback && confirmarOkFallback);
    REGISTRO_OK_RATE.add(registroOkFallback);
    REGISTRO_EXPECTED_RATE.add(Boolean(registroOkFallback || iterationRateLimited));
    sleep(K6_SLEEP_SECONDS);
    return;
  }

  const actualizarResp = postJson(ENDPOINT_ACTUALIZAR_RECONSIDERACION, {
    idDetalleInfraccionSancion: detalleId,
    bitReconsidera: 1,
    fechaReconsideracion: new Date().toISOString()
  });
  reportStatus(actualizarResp, 'Caso04/ActualizarReconsideracion');
  const actualizarOk = isBusinessSuccess(actualizarResp) || (EXPECT_RATE_LIMIT && actualizarResp.status === 429);
  STEP_OK_RATE.add(actualizarOk);

  const confirmarResp = postJson(ENDPOINT_CONFIRMAR_DETALLE, {
    idDetalleInfraccionSancion: detalleId,
    confirmar: true
  });
  reportStatus(confirmarResp, 'Caso04/ConfirmarDetalle');
  const confirmarOk = isBusinessSuccess(confirmarResp) || (EXPECT_RATE_LIMIT && confirmarResp.status === 429);
  STEP_OK_RATE.add(confirmarOk);

  const registroOk = Boolean(listarOk && actualizarOk && confirmarOk);
  REGISTRO_OK_RATE.add(registroOk);
  REGISTRO_EXPECTED_RATE.add(Boolean(registroOk || iterationRateLimited));

  check({ registroOk, limited: iterationRateLimited }, {
    'caso04 crear status 200 esperado': (ctx) => (EXPECT_RATE_LIMIT ? (ctx.registroOk || ctx.limited) : ctx.registroOk)
  });
  if (EXPECT_RATE_LIMIT) {
    check({ registroOk, limited: iterationRateLimited }, {
      'caso04 crear status 429 esperado por limite de regla de negocio': (ctx) => ctx.registroOk || ctx.limited
    });
  }
  if (iterationHas4xx || iterationHas5xx) {
    const suffix = iterationHas4xx && iterationHas5xx ? '4xx y 5xx' : (iterationHas4xx ? '4xx' : '5xx');
    check({ ok: true }, {
      [`caso04 crear status ${suffix} detectado`]: () => true
    });
  }

  sleep(K6_SLEEP_SECONDS);
}
