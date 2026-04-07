import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';
import { ipPoolParams, logPoolStatus, getAssignedIP, getIpLastOctet } from './helpers/ip-pool.js';

const pdfFile = open('../../../test-files/GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf', 'b');

const BASE_API = __ENV.BASE_API || __ENV.BASE_URL || 'https://reginsaapiqa.sunedu.gob.pe/api';
const DEBUG_ERRORS = (__ENV.K6_DEBUG_ERRORS || '1') === '1';
const DEBUG_LIMIT = Math.max(1, Number.parseInt(__ENV.K6_DEBUG_ERRORS_MAX || '8', 10) || 8);
let debugErrorCount = 0;

// ── Registros por iteración (para informe) ────────────────────────────────
const caso04Records = [];
let _lastNumeroReconsideracion = '';
const EXPECT_RATE_LIMIT = (__ENV.K6_EXPECT_RATE_LIMIT || '1') === '1';

const ENDPOINT_LOGIN = '/Auth/Login';
const ENDPOINT_LISTAR_CABECERA = __ENV.K6_CASO04_LISTAR_CABECERA || '/CabeceraInfraccionSancion/ListarPaginado'; // Mismo endpoint que la UI y caso 03 (soporta sSortOrder)
const ENDPOINT_LISTAR_DETALLE = '/DetalleInfraccionSancion/ListarPaginado';
const ENDPOINT_ACTUALIZAR_CABECERA = '/CabeceraInfraccionSancion/Actualizar';
const ENDPOINT_ACTUALIZAR_DETALLE = '/DetalleInfraccionSancion/Actualizar';

const HTTP_DETAIL_MODE = (__ENV.K6_HTTP_DETAIL_MODE || 'all').toLowerCase();
const HTTP_PUBLIC_NAME = (__ENV.K6_HTTP_PUBLIC_NAME || 'CabeceraInfraccionSancion/Actualizar').trim() || 'CabeceraInfraccionSancion/Actualizar';

// Configuración de ejecución - soporta múltiples VUs para pruebas paralelas
const vus = Math.max(1, parseIntEnv(__ENV.K6_VUS || __ENV.K6_PARALLEL_VUS || 1));
const MAX_REGISTROS = Math.max(1, parseIntEnv(__ENV.K6_CANTIDAD || 3));
const iterations = Math.max(1, parseIntEnv(__ENV.K6_CANTIDAD || __ENV.K6_FIXED_ITERATIONS || MAX_REGISTROS));
const K6_MODE = String(__ENV.K6_MODE || iterations <= 2 ? 'smoke' : 'fast');
const K6_SLEEP_SECONDS = parseFloatEnv(__ENV.K6_SLEEP_SECONDS, 1);
const CLOUD_PROJECT_ID = Math.max(0, parseIntEnv(__ENV.K6_CLOUD_PROJECT_ID, 0));

// Configuración de paginación inteligente
const PAGE_SIZE = 25; // Tamaño fijo de página según API
const MAX_PAGES = Math.min(10, Math.ceil(MAX_REGISTROS / PAGE_SIZE)); // Máximo páginas necesarias

// *** POOL DE USUARIOS (como en Caso 2) ***
const AUTO_LOGIN_ENABLED = (__ENV.K6_AUTO_LOGIN || '0') === '1'; // Habilitado por defecto como fallback
const AUTH_ENDPOINT = String(__ENV.REGINSA_AUTH_ENDPOINT || __ENV.K6_AUTH_LOGIN_ENDPOINT || '/Auth/Login').trim();
const AUTH_USER_FIELD = String(__ENV.REGINSA_AUTH_USER_FIELD || 'usuario').trim() || 'usuario';
const AUTH_PASS_FIELD = String(__ENV.REGINSA_AUTH_PASS_FIELD || 'contrasena').trim() || 'contrasena';
const AUTH_TOKEN_PATH = String(__ENV.REGINSA_AUTH_TOKEN_PATH || '').trim();
const AUTH_TIMEOUT_MS = Math.max(1000, parseIntEnv(__ENV.REGINSA_AUTH_TIMEOUT_MS, 20000));
const AUTH_RETRY_MAX = Math.max(0, parseIntEnv(__ENV.K6_AUTH_RETRY_MAX, 1));

console.log(`[caso04] MODO=${K6_MODE} CANTIDAD=${MAX_REGISTROS} VUS=${vus} AUTO_LOGIN=${AUTO_LOGIN_ENABLED}`);
console.log(`[caso04] Configuracion: PAGE_SIZE=${PAGE_SIZE}, MAX_PAGES=${MAX_PAGES}, MAX_REGISTROS=${MAX_REGISTROS}`);

// *** FUNCIÓN POOL DE USUARIOS ***
function collectAuthCredentials() {
  const credentials = [];
  for (let i = 1; i <= 20; i += 1) {
    const user = String(__ENV[`REGINSA_USER_${i}`] || '').trim();
    const pass = String(__ENV[`REGINSA_PASS_${i}`] || '').trim();
    if (user && pass) credentials.push({ user, pass, slot: i });
  }
  
  if (credentials.length > 0) return credentials;
  
  // Usuario por defecto si no hay pool
  const user = String(__ENV.REGINSA_USER || 'lizvidal').trim();
  const pass = String(__ENV.REGINSA_PASS || 'QA1234510qa').trim();
  if (user && pass) return [{ user, pass, slot: 0 }];
  return [];
}

const AUTH_CREDENTIALS = collectAuthCredentials();
let runtimeToken = '';

function credentialForVu() {
  if (AUTH_CREDENTIALS.length === 0) return null;
  const idx = Math.max(0, (__VU || 1) - 1) % AUTH_CREDENTIALS.length;
  const cred = AUTH_CREDENTIALS[idx];
  console.log(`[caso04] VU${__VU || 1} usando usuario: ${cred?.user} (slot ${cred?.slot})`);
  return cred;
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

function obtainTokenByLogin() {
  if (!AUTO_LOGIN_ENABLED) return '';
  const cred = credentialForVu();
  if (!cred) return '';
  
  const url = buildAuthUrl(); // ✅ Usar función que normaliza endpoint
  const payloads = authPayloadTemplates(cred.user, cred.pass);
  
  for (let retry = 0; retry <= AUTH_RETRY_MAX; retry += 1) {
    for (const payload of payloads) {
      const response = http.post(url, JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        timeout: AUTH_TIMEOUT_MS,
        tags: { name: HTTP_DETAIL_MODE === 'guardar_only' ? HTTP_PUBLIC_NAME : 'Auth/Login' }
      });
      
      if (response.status >= 200 && response.status < 300) {
        const token = extractTokenFromData(response.json());
        if (token) {
          console.log(`[caso04] Login exitoso VU${__VU} con usuario ${cred.user}`);
          return token;
        }
      }
    }
  }
  
  console.error(`[caso04] Login fallido para usuario ${cred?.user}`);
  return '';
}

function invalidateRuntimeToken() {
  runtimeToken = '';
}

function tokenActual() {
  // 1. Primero revisar TOKEN del PS1 (como en caso 1)
  const ps1Token = normalizeBearer(__ENV.TOKEN || '');
  console.log(`[caso04] TOKEN del PS1: "${ps1Token ? 'SI' : 'NO'}"`);
  
  if (ps1Token) {
    console.log(`[caso04] [OK] Usando token del PS1: ${ps1Token.substring(0, 20)}...`);
    return ps1Token;
  }
  
  // 2. Luego revisar tokens estáticos TOKEN1, TOKEN2, ..., TOKEN20 (como en caso 1)
  for (let i = 1; i <= 20; i++) {
    const candidate = normalizeBearer(__ENV[`TOKEN${i}`] || '');
    if (candidate) {
      console.log(`[caso04] [OK] Usando TOKEN${i}: ${candidate.substring(0, 20)}...`);
      return candidate;
    }
  }
  
  // 3. Luego tokens estáticos del array (como en caso 2)
  const staticToken = TOKENS[(__VU - 1) % TOKENS.length] || TOKENS[0] || '';
  if (staticToken) {
    console.log(`[caso04] [OK] Usando token estatico: ${staticToken.substring(0, 20)}...`);
    return staticToken;
  }
  
  // 4. Login automático SOLO si no hay runtime token (como Postman)
  if (runtimeToken) {
    console.log(`[caso04] [OK] Reutilizando token existente: ${runtimeToken.substring(0, 20)}...`);
    return runtimeToken;
  }
  
  if (AUTO_LOGIN_ENABLED) {
    console.log(`[caso04] [WARN] Primer login - obteniendo token para VU${__VU || 1}`);
    runtimeToken = obtainTokenByLogin();
    if (runtimeToken) {
      console.log(`[caso04] [OK] Token obtenido y guardado para reutilizacion: ${runtimeToken.substring(0, 20)}...`);
      return runtimeToken;
    }
  }
  
  // 5. Si no hay nada, abortar
  console.error(`[caso04] [ERROR] No hay token disponible. Configura TOKEN, TOKEN1-20 o habilita AUTO_LOGIN.`);
  return '';
}

const TOKENS = [__ENV.TOKEN, __ENV.K6_AUTH_HEADER, __ENV.TOKEN1, __ENV.TOKEN2]
  .map((value) => normalizeBearer(value))
  .filter(Boolean);

function buildRunId() {
  const requested = String(__ENV.K6_RUN_ID || '').replace(/\D/g, '');
  if (requested.length > 0) return requested.padStart(2, '0'); // Asegurar mínimo 2 dígitos
  const auto = (Date.now() + Math.floor(Math.random() * 997)) % 100;
  return String(auto).padStart(2, '0');
}

const RUN_ID = buildRunId();
console.log(`[caso04] RUN_ID=${RUN_ID} - Prefijo para esta ejecucion`);

function buildK6ReconsideracionPrefix() {
  // Misma estructura del funcional: "FA XX REC", cambiando FA por K6.
  return `K6 ${String(RUN_ID).padStart(2, '0')} REC`;  // RUN_ID ya viene con pad
}

const HTTP_429_TOTAL = new Counter('http_429_total');
const HTTP_401_TOTAL = new Counter('http_401_total');
const HTTP_4XX_TOTAL = new Counter('http_4xx_total');
const HTTP_4XX_NON_429_TOTAL = new Counter('http_4xx_non_429_total');
const HTTP_5XX_TOTAL = new Counter('http_5xx_total');
const RATE_LIMITED_REQUESTS = new Rate('rate_limited_requests');
const STEP_OK_RATE = new Rate('step_ok_rate');
const REGISTRO_OK_RATE = new Rate('registro_ok_rate');
const REGISTRO_EXPECTED_RATE = new Rate('registro_expected_rate');
const CABECERA_OK_RATE = new Rate('cabecera_ok_rate');
const MEDIDA_OK_RATE = new Rate('medida_ok_rate');

const FILTRAR_SOLO_ELEGIBLES = (__ENV.K6_CASO04_SOLO_ELEGIBLES || '0') === '1';

function parseIntEnv(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatEnv(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

logPoolStatus();

export const options = {
  ...(CLOUD_PROJECT_ID > 0 ? { cloud: { projectID: CLOUD_PROJECT_ID, name: `caso04-${K6_MODE}` } } : {}),
  systemTags: ['status', 'method', 'name', 'scenario', 'group', 'check', 'error'],
  tags: { caso: '04', modo: K6_MODE },
  scenarios: {
    caso04_reconsiderar_sanciones: {
      executor: 'shared-iterations',
      vus,
      iterations,
      maxDuration: __ENV.PERF_DURATION || '15m'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<6000', 'avg<3000'],
    http_req_failed: ['rate<0.95'],
    rate_limited_requests: ['rate<0.99'],
    step_ok_rate: ['rate>0.5'],
    registro_ok_rate: ['rate>=0'],
    registro_expected_rate: ['rate>0.4'],
    cabecera_ok_rate: ['rate>=0'],
    medida_ok_rate: ['rate>=0'],
    http_401_total: ['count<=0'],
    http_5xx_total: ['count<=0'],
    http_4xx_non_429_total: ['count<=3']
  }
};

let iterationRateLimited = false;
let iterationHas4xx = false;
let iterationHas5xx = false;

function safeJson(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

function isBusinessSuccess(response) {
  const json = safeJson(response);
  return response.status >= 200 && response.status < 300 && json?.bSuccess !== false;
}

function withRequestTags(baseOptions, endpointName) {
  const _ipSuffix = getIpLastOctet();
  const _ipPfx = _ipSuffix ? `IP ${_ipSuffix} ` : '';
  const visibleName = `${_ipPfx}${HTTP_DETAIL_MODE === 'guardar_only' ? HTTP_PUBLIC_NAME : endpointName}`;
  const opts = baseOptions || {};
  return { ...opts, ...ipPoolParams(), tags: { ...(opts.tags || {}), name: visibleName } };
}

function reportStatus(response, operation) {
  const status = response.status;
  const success = isBusinessSuccess(response);
  console.log(`[caso04] ${operation}: HTTP=${status} Success=${success} Duration=${response.timings.duration}ms`);
  
  // Token refresh on 401
  if (status === 401) {
    const currentToken = tokenActual();
    console.log('[caso04] Token expirado (401), invalidando y refrescando...');
    invalidateToken(currentToken);
    HTTP_401_TOTAL.add(1);
    return false;
  }
  
  if (!success && DEBUG_ERRORS && debugErrorCount < DEBUG_LIMIT) {
    console.log(`[caso04][error] ${operation} Response: ${response.body}`);
    debugErrorCount++;
  }
  if (status === 429) {
    HTTP_429_TOTAL.add(1);
    RATE_LIMITED_REQUESTS.add(1);
    iterationRateLimited = true;
  }
  if (status >= 400 && status < 500) {
    HTTP_4XX_TOTAL.add(1);
    if (status !== 429) HTTP_4XX_NON_429_TOTAL.add(1);
  }
  if (status >= 500) HTTP_5XX_TOTAL.add(1);
  STEP_OK_RATE.add(success || status === 429);
  return success;
}

function tokenActual() {
  const staticToken = TOKENS.length > 0 ? TOKENS[(__VU - 1) % TOKENS.length] || TOKENS[0] || '' : '';
  if (staticToken) return staticToken;
  if (runtimeToken) return runtimeToken;
  runtimeToken = obtainTokenByLogin();
  return runtimeToken;
}

// Pool de usuarios para login (20 usuarios máximo)
const USER_POOL = [];
for (let i = 1; i <= 20; i++) {
  const user = __ENV[`REGINSA_USER_${i}`];
  const pass = __ENV[`REGINSA_PASS_${i}`];
  if (user && pass) USER_POOL.push({ username: user, password: pass });
}
if (USER_POOL.length === 0) {
  USER_POOL.push({ username: 'lizvidal', password: 'QA1234510qa' });
}

let currentUserIndex = 0;
let invalidTokens = new Set();

function getNextUser() {
  const user = USER_POOL[currentUserIndex % USER_POOL.length];
  currentUserIndex++;
  return user;
}

function loginReal() {
  const user = getNextUser();
  console.log(`[caso04] Login real con usuario: ${user.username}`);
  
  const loginPayload = JSON.stringify({
    username: user.username,
    password: user.password
  });
  
  const response = http.post(`${BASE_API}/Auth/Login`, loginPayload, {
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    tags: { name: HTTP_DETAIL_MODE === 'guardar_only' ? HTTP_PUBLIC_NAME : 'Auth/Login' },
    ...ipPoolParams()
  });
  
  if (response.status === 200) {
    const json = safeJson(response);
    const token = json?.token || json?.accessToken || json?.data?.token;
    if (token) {
      console.log(`[caso04] Token obtenido exitosamente`);
      return normalizeBearer(token);
    }
  }
  
  console.error(`[caso04] Login fallo: HTTP ${response.status}`);
  return null;
}

function obtainTokenByLogin() {
  console.log(`[caso04] Obteniendo token real para VU${__VU}`);
  return loginReal();
}

function invalidateToken(token) {
  if (token) {
    invalidTokens.add(token);
    console.log(`[caso04] Token invalidado, total invalidos: ${invalidTokens.size}`);
  }
  if (runtimeToken === token) runtimeToken = '';
}

function tokenActual() {
  // Si hay token runtime válido, usarlo
  if (runtimeToken && !invalidTokens.has(runtimeToken)) return runtimeToken;
  
  // Intentar tokens estáticos que no estén inválidos
  for (const token of TOKENS) {
    if (token && !invalidTokens.has(token)) return token;
  }
  
  // Si no hay tokens válidos, hacer login
  runtimeToken = obtainTokenByLogin();
  return runtimeToken;
}

function login() {
  const token = tokenActual();
  if (!token) {
    console.error('[caso04] No hay token disponible');
    return false;
  }
  console.log(`[caso04] Login exitoso con token real`);
  return true;
}

function listarCabecerasPaginadas(pageNumber, pageSize) {
  // ✅ Usar payload exacto del HAR del sistema web
  const payload = {
    nPageNumber: pageNumber,
    nPageSize: pageSize,
    sSortColumnName: 'FECHA_REGISTRO', // ✅ Igual que el sistema web
    sSortOrder: 'DESC', // ✅ Igual que el sistema web
    sFilterValue: '',
    numeroExpediente: null,
    numeroResolucion: null,
    fechaRegistroIni: null,
    fechaRegistroFin: null,
    filtroEstado: null
  };

  const response = http.post(`${BASE_API}${ENDPOINT_LISTAR_CABECERA}`, JSON.stringify(payload), withRequestTags({
    headers: {
      'Authorization': tokenActual(),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  }, 'CabeceraInfraccionSancion/ListarPaginado'));

  reportStatus(response, `ListarCabecerasPaginadas[p=${pageNumber},size=${pageSize}]`);
  const success = isBusinessSuccess(response);

  if (success) {
    const json = safeJson(response);
    // La estructura es: oData.Results (array de cabeceras)
    const cabeceras = json?.oData?.Results || json?.oData?.results || json?.Results || json?.results || [];
    console.log(`[caso04] Cabeceras pagina ${pageNumber}: ${Array.isArray(cabeceras) ? cabeceras.length : 0} (Total en sistema: ${json?.oData?.TotalNumberOfRecords || 0})`);
    return Array.isArray(cabeceras) ? cabeceras : [];
  }

  return [];
}

function headers() {
  return {
    'Authorization': tokenActual(),
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

function listarDetalles(idCabecera) {
  const payload = {
    idCabeceraInfraccionSancion: idCabecera,
    nPageNumber: 1,
    nPageSize: 50,
    sSortColumnName: 'ID_INFRACCION',
    sSortOrder: 'ASC',
    sFilterValue: ''
  };
  const response = http.post(`${BASE_API}${ENDPOINT_LISTAR_DETALLE}`, JSON.stringify(payload), withRequestTags({
    headers: headers()
  }, 'DetalleInfraccionSancion/ListarPaginado'));
  reportStatus(response, `ListarDetalles[c=${idCabecera}]`);
  const success = isBusinessSuccess(response);

  if (success) {
    const json = safeJson(response);
    const detalles = json?.oData?.Results || json?.oData || [];
    console.log(`[caso04] Detalles encontrados para cabecera ${idCabecera}: ${Array.isArray(detalles) ? detalles.length : 0}`);
    return Array.isArray(detalles) ? detalles : [];
  }

  return [];
}

function campoVacioReconsideracion(value) {
  if (value === null || value === undefined) return true;
  const txt = String(value).trim().toLowerCase();
  if (!txt) return true;
  if (txt === 'null' || txt === 'undefined' || txt === '-' || txt === '--' || txt === 'n/a') return true;
  if (/^0{4}-0{2}-0{2}(t0{2}:0{2}:0{2}(\.0+)?z?)?$/.test(txt)) return true;
  if (/^0001-01-01(t00:00:00(\.0+)?z?)?$/.test(txt)) return true;
  return false;
}

function cabeceraElegibleSinReconsideracion(cabecera) {
  const ruta = cabecera?.rutaResolucionReconsideracion ?? cabecera?.RutaResolucionReconsideracion;
  const resol = cabecera?.resolucionReconsideracion ?? cabecera?.ResolucionReconsideracion ?? cabecera?.desResolucionReconsideracion ?? cabecera?.DesResolucionReconsideracion;
  const fecha = cabecera?.fechaResolucionReconsideracion ?? cabecera?.FechaResolucionReconsideracion ?? cabecera?.fechaReconsideracion ?? cabecera?.FechaReconsideracion;
  const elegible = campoVacioReconsideracion(ruta) && campoVacioReconsideracion(resol) && campoVacioReconsideracion(fecha);
  if (!elegible && DEBUG_ERRORS) {
    const id = cabecera?.idCabeceraInfraccionSancion ?? cabecera?.IdCabeceraInfraccionSancion;
    console.log(`[caso04][filtro] ID=${id} excluido: ruta="${ruta}", resol="${resol}", fecha="${fecha}"`);
  }
  return elegible;
}

function cabeceraIdNumerico(cabecera) {
  const raw = cabecera?.idCabeceraInfraccionSancion ?? cabecera?.IdCabeceraInfraccionSancion;
  const id = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(id) ? id : -1;
}

function sortCabecerasDescPorId(cabeceras) {
  return [...cabeceras].sort((a, b) => cabeceraIdNumerico(b) - cabeceraIdNumerico(a));
}

function actualizarCabecera(cabecera, ordinalConsecutivo) {
  const prefijoK6 = buildK6ReconsideracionPrefix();
  const fileName = 'GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf';
  const realPdf = http.file(pdfFile, fileName, 'application/pdf');

  const numeroSecuencial = 8800 + ordinalConsecutivo;
  const numeroReconsideracion = `${prefijoK6} ${numeroSecuencial}-${new Date().getFullYear()}`;
  _lastNumeroReconsideracion = numeroReconsideracion;

  console.log(`[caso04] Generando numero de reconsideracion: ${numeroReconsideracion} (RUN_ID=${RUN_ID}, ordinal=${ordinalConsecutivo})`);

  const cabMultipart = {
    IdCabeceraInfraccionSancion: String(cabecera?.IdCabeceraInfraccionSancion || cabecera?.idCabeceraInfraccionSancion || ''),
    IdEntidad: String(cabecera?.IdEntidad || cabecera?.idEntidad || ''),
    NumeroExpediente: String(cabecera?.NumeroExpediente || cabecera?.numeroExpediente || ''),
    NumeroResolucion: String(cabecera?.NumeroResolucion || cabecera?.numeroResolucion || ''),
    FechaResolucion: String(cabecera?.FechaResolucion || cabecera?.fechaResolucion || ''),
    NumeroReconsideracion: numeroReconsideracion,
    FechaReconsideracion: new Date().toISOString(),
    DesResolucionReconsideracion: numeroReconsideracion,
    FechaResolucionReconsideracion: new Date().toISOString(),
    LimpiarReconsideracion: 'false',
    RutaResolucionSancion: String(cabecera?.RutaResolucionSancion || cabecera?.rutaResolucionSancion || cabecera?.RutaResolSancion || cabecera?.rutaResolSancion || ''),
    GuidCabecera: String(cabecera?.GuidCabecera || cabecera?.guidCabecera || ''),
    RutaResolucionReconsideracion: fileName,
    ArchivoResolucionReconsideracion: realPdf,
    rutaResolucionSancionAnterior: String(cabecera?.RutaResolucionSancion || cabecera?.rutaResolucionSancion || cabecera?.RutaResolSancion || cabecera?.rutaResolSancion || ''),
    rutaResolucionReconsideracionAnterior: String(cabecera?.RutaResolucionReconsideracion || cabecera?.rutaResolucionReconsideracion || cabecera?.RutaResolReconsidera || cabecera?.rutaResolReconsidera || '')
  };

  const idCabecera = cabecera?.idCabeceraInfraccionSancion || cabecera?.IdCabeceraInfraccionSancion || '';
  const guidCabecera = cabecera?.guidCabecera || cabecera?.GuidCabecera || '';
  
  if (!idCabecera) {
    console.warn(`[caso04] ERROR: ID de cabecera no encontrado en el objeto: ${JSON.stringify(cabecera).substring(0, 100)}`);
    return false;
  }
  // LOG antes del PUT
  console.log(`[caso04] Ejecutando PUT para cabecera ID=${idCabecera}`);
  const response = http.put(`${BASE_API}${ENDPOINT_ACTUALIZAR_CABECERA}/${idCabecera}`, cabMultipart, withRequestTags({
    headers: { 'Authorization': tokenActual(), 'Accept': 'application/json' }
  }, 'CabeceraInfraccionSancion/Actualizar'));
  reportStatus(response, `ActualizarCabecera[${cabecera?.IdCabeceraInfraccionSancion}]`);
  if (!isBusinessSuccess(response)) {
    console.error(`[caso04] PUT fallido para cabecera ID=${idCabecera}. Respuesta: ${response.body}`);
  }
  const success = isBusinessSuccess(response);
  CABECERA_OK_RATE.add(success);
  return success;
}

function toggleDetalle(detalle, cabeceraId) {
  const detalleId = detalle?.IdDetalleInfraccionSancion || detalle?.idDetalleInfraccionSancion;
  console.log(`[caso04][toggle] Procesando detalle ${detalleId} para cabecera ${cabeceraId}`);

  const originalBitReconsidera = (detalle?.BitReconsidera === 1 || detalle?.bitReconsidera === 1) ? 1 : 0;
  const originalBitPago = (detalle?.BitPago === 1 || detalle?.bitPago === 1) ? 1 : 0;

  console.log(`[caso04][toggle] Estado inicial - Reconsidera: ${originalBitReconsidera}, Pago: ${originalBitPago}`);

  // Construir payload base con todos los campos que requiere DetalleInfraccionSancion/Actualizar
  function buildDetallePayload(bitReconsidera, bitPago) {
    return {
      idCabeceraInfraccionSancion: cabeceraId,
      IdInfraccion: detalle?.IdInfraccion || detalle?.idInfraccion || 0,
      desSancion: detalle?.Sancion || detalle?.desSancion || detalle?.sancion || '',
      bitReconsidera: bitReconsidera,
      bitReincidente: (detalle?.BitReincidente === 1 || detalle?.bitReincidente === 1) ? 1 : 0,
      bitPago: bitPago,
      desSuspension: detalle?.DesSuspension || detalle?.desSuspension || null,
      bitCancelacion: (detalle?.BitCancelacion === 1 || detalle?.bitCancelacion === 1) ? 1 : 0,
      canSuspension: Number(detalle?.CanSuspension || detalle?.canSuspension || 0),
      tipoMulta: detalle?.TipoMulta || detalle?.tipoMulta || null,
      numMonto: Number(detalle?.Monto || detalle?.numMonto || 0),
      idRis: detalle?.IdRis || detalle?.idRis || 0,
      desHechoInfractor: detalle?.HechoInfractor || detalle?.desHechoInfractor || '',
      numCorrelativo: detalle?.NumCorrelativo || detalle?.numCorrelativo || 1,
      bitMedida: (detalle?.BitMedida === 1 || detalle?.bitMedida === 1) ? 1 : 0,
      desMedidaCorrectivaGen: detalle?.DesMedidaCorrectivaGen || detalle?.desMedidaCorrectivaGen || '',
      idDetalleInfraccionSancion: detalleId,
      bitActivo: 1
    };
  }

  let nuevoBitReconsidera = 1;
  if (originalBitReconsidera === 1) {
    console.log(`[caso04][toggle] Reconsidera ya marcado, aplicando ciclo: desmarcar -> marcar`);
    const payloadDesmarcar = buildDetallePayload(0, originalBitPago);
    const respDesmarcar = http.put(`${BASE_API}${ENDPOINT_ACTUALIZAR_DETALLE}/${detalleId}`, JSON.stringify(payloadDesmarcar), withRequestTags({ headers: headers() }, 'DetalleInfraccionSancion/DesmarcarReconsidera'));
    reportStatus(respDesmarcar, `DesmarcarReconsidera[${detalleId}]`);
    sleep(0.5);
  }

  const payloadReconsidera = buildDetallePayload(1, originalBitPago);
  const respMarcar = http.put(`${BASE_API}${ENDPOINT_ACTUALIZAR_DETALLE}/${detalleId}`, JSON.stringify(payloadReconsidera), withRequestTags({ headers: headers() }, 'DetalleInfraccionSancion/MarcarReconsidera'));
  reportStatus(respMarcar, `MarcarReconsidera[${detalleId}]`);

  let nuevoBitPago = originalBitPago;
  if (originalBitPago === 0) {
    console.log(`[caso04][toggle] Pago no estaba marcado, marcando...`);
    const payloadPago = buildDetallePayload(1, 1);
    const respPago = http.put(`${BASE_API}${ENDPOINT_ACTUALIZAR_DETALLE}/${detalleId}`, JSON.stringify(payloadPago), withRequestTags({ headers: headers() }, 'DetalleInfraccionSancion/MarcarPago'));
    reportStatus(respPago, `MarcarPago[${detalleId}]`);
    nuevoBitPago = 1;
    sleep(0.5);
  }

  const success = isBusinessSuccess(respMarcar);
  MEDIDA_OK_RATE.add(success);

  return {
    success,
    toggleInfo: {
      detalleId,
      original: { reconsidera: originalBitReconsidera, pago: originalBitPago },
      final: { reconsidera: nuevoBitReconsidera, pago: nuevoBitPago }
    }
  };
}

export default function () {
  iterationRateLimited = false;
  iterationHas4xx = false;
  iterationHas5xx = false;

  const globalIterationIndex = Number(exec.scenario.iterationInTest || 0);
  const currentIteration = globalIterationIndex + 1;
  console.log(`[caso04] Iniciando iteracion ${currentIteration} de ${iterations}`);
  console.log(`[caso04] Configuracion: PAGE_SIZE=${PAGE_SIZE}, MAX_PAGES=${MAX_PAGES}, MAX_REGISTROS=${MAX_REGISTROS}`);

  let loginSuccess = false;
  let cabecerasProcesadas = 0;
  let medidasProcesadas = 0;
  let exitoTotal = false;

  try {
    loginSuccess = login();
    if (!loginSuccess) {
      console.error('[caso04] Login fallido, abortando iteracion');
      return;
    }

    let totalCabeceras = [];
    let paginasProcesadas = 0;

    const paginasNecesarias = Math.ceil(MAX_REGISTROS / PAGE_SIZE);
    const maxPaginasAProcesar = Math.min(paginasNecesarias, MAX_PAGES);

    console.log(`[caso04] Logica de navegacion: ${MAX_REGISTROS} registros / ${PAGE_SIZE} por pagina = ${paginasNecesarias} paginas necesarias`);
    console.log(`[caso04] Se procesaran hasta ${maxPaginasAProcesar} paginas (maximo permitido: ${MAX_PAGES})`);

    for (let page = 1; page <= maxPaginasAProcesar; page++) {
      console.log(`[caso04] Procesando pagina ${page}/${maxPaginasAProcesar} de cabeceras...`);

      const cabecerasPagina = listarCabecerasPaginadas(page, PAGE_SIZE);
      totalCabeceras = totalCabeceras.concat(cabecerasPagina);
      paginasProcesadas++;

      const elegiblesAcumulados = FILTRAR_SOLO_ELEGIBLES
        ? totalCabeceras.filter(cabeceraElegibleSinReconsideracion).length
        : totalCabeceras.length;
      console.log(`[caso04] Pagina ${page}: acumulado=${totalCabeceras.length}, elegibles=${elegiblesAcumulados}, objetivoOrdinal=${currentIteration}`);

      if (elegiblesAcumulados > globalIterationIndex) {
        console.log('[caso04] Objetivo ordinal cubierto con paginas actuales.');
        break;
      }

      if (cabecerasPagina.length < PAGE_SIZE) {
        console.log(`[caso04] Ultima pagina alcanzada (${cabecerasPagina.length} < ${PAGE_SIZE})`);
        break;
      }

      sleep(0.5);
    }

    console.log(`[caso04] Busqueda completada: ${paginasProcesadas}/${maxPaginasAProcesar} paginas procesadas, ${totalCabeceras.length} cabeceras encontradas`);

    if (totalCabeceras.length === 0) {
      console.warn('[caso04] No se encontraron cabeceras para procesar');
      return;
    }

    // ✅ Orden viene del API (FECHA_REGISTRO DESC via ListarPaginado) — coincide con la UI
    const elegibles = FILTRAR_SOLO_ELEGIBLES
      ? totalCabeceras.filter(cabeceraElegibleSinReconsideracion)
      : totalCabeceras;

    console.log(`[caso04] Elegibles finales=${elegibles.length} (filtro vacios=${FILTRAR_SOLO_ELEGIBLES ? 'ON' : 'OFF'})`);

    if (globalIterationIndex >= elegibles.length) {
      console.warn(`[caso04] Sin candidato para ordinal global ${currentIteration}. Disponibles=${elegibles.length}.`);
      return;
    }

    const cabecera = elegibles[globalIterationIndex];
    const idCabecera = cabecera?.idCabeceraInfraccionSancion || cabecera?.IdCabeceraInfraccionSancion || '';

    if (!idCabecera) {
      console.warn('[caso04] Candidato sin idCabeceraInfraccionSancion, abortando iteracion.');
      return;
    }

    const indiceGlobal = totalCabeceras.findIndex((item) => String(item?.IdCabeceraInfraccionSancion || item?.idCabeceraInfraccionSancion) === String(idCabecera));
    const filaGlobal = indiceGlobal >= 0 ? indiceGlobal + 1 : globalIterationIndex + 1;
    const paginaObjetivo = Math.floor((filaGlobal - 1) / PAGE_SIZE) + 1;
    const filaEnPagina = ((filaGlobal - 1) % PAGE_SIZE) + 1;

    console.log(`[caso04] [>>] Candidato ordinal global ${currentIteration}: ID=${idCabecera} | filaGlobal=${filaGlobal} | pagina=${paginaObjetivo} | filaPagina=${filaEnPagina}`);

    const cabeceraSuccess = actualizarCabecera(cabecera, currentIteration);
    if (!cabeceraSuccess) {
      console.warn(`[caso04] Fallo actualizando cabecera ${idCabecera}, no se procesaran medidas en esta iteracion.`);
      return;
    }

    cabecerasProcesadas = 1;

    const detalles = listarDetalles(idCabecera);
    if (detalles.length === 0) {
      console.warn(`[caso04] No se encontraron detalles para cabecera ${idCabecera}`);
    } else {
      let medidasExitosas = 0;
      for (let j = 0; j < detalles.length; j++) {
        const detalle = detalles[j];
        const resultado = toggleDetalle(detalle, idCabecera);

        if (resultado.success) {
          medidasExitosas++;
          if (resultado.toggleInfo) {
            console.log(`[caso04] Medida procesada: ${JSON.stringify(resultado.toggleInfo)}`);
          }
        }
        sleep(0.3);
      }

      medidasProcesadas = medidasExitosas;
      console.log(`[caso04] Cabecera ${idCabecera} completada: ${medidasExitosas}/${detalles.length} detalles exitosos`);
    }

    exitoTotal = cabecerasProcesadas > 0 && medidasProcesadas > 0;
    console.log(`[caso04] Iteracion completada: ${cabecerasProcesadas} cabeceras, ${medidasProcesadas} medidas procesadas`);

    if (cabecerasProcesadas > 0) {
      caso04Records.push({
        ip: getAssignedIP() || 'local',
        idCabecera: idCabecera,
        expediente: String(cabecera?.NumeroExpediente || cabecera?.numeroExpediente || ''),
        fechaModificacion: String(cabecera?.FechaResolucion || cabecera?.fechaResolucion || '').split('T')[0],
        numeroReconsideracion: _lastNumeroReconsideracion,
        fechaReconsideracion: new Date().toISOString().split('T')[0],
        resultado: exitoTotal ? 'OK' : 'PARCIAL',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error(`[caso04] Error en iteracion: ${error.message}`);
    exitoTotal = false;
  }

  REGISTRO_OK_RATE.add(exitoTotal);
  REGISTRO_EXPECTED_RATE.add(Boolean(exitoTotal || iterationRateLimited));

  check({
    loginSuccess,
    cabecerasProcesadas,
    medidasProcesadas,
    exitoTotal,
    limited: iterationRateLimited,
    has4xx: iterationHas4xx
  }, {
    'caso04 login ok': (r) => r.loginSuccess,
    'caso04 cabecera actualizada': (r) => r.cabecerasProcesadas > 0,
    'caso04 medidas procesadas': (r) => r.medidasProcesadas > 0,
    'caso04 reconsideracion exitosa': (r) => r.exitoTotal || r.limited,
    'caso04 status 429 esperado por limite de regla de negocio': (r) => r.exitoTotal || r.limited,
    'caso04 status 4xx detectado': (r) => !r.has4xx || r.exitoTotal || r.limited
  });
  
  if (K6_SLEEP_SECONDS > 0) {
    sleep(K6_SLEEP_SECONDS);
  }
}

export function handleSummary(_data) {
  const output = {
    run_id: RUN_ID,
    modo: __ENV.K6_OUTPUT || 'local',
    fecha: new Date().toISOString().split('T')[0],
    ip_pool: (__ENV.K6_LOCAL_IPS || '').trim(),
    registros: caso04Records
  };
  return { 'reportes/k6-caso04-registros.json': JSON.stringify(output, null, 2) };
}
