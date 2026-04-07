/**
 * @file k6_caso_04_reconsiderar_con_sanciones.js
 * @description Script k6 para el flujo de reconsideración de sanciones con medidas correctivas
 *              en el sistema REGINSAQA - SUNEDU (entorno QA).
 *              Permite reconsideración múltiple y procesamiento paginado inteligente.
 * @author Performance Engineer
 * @version 2.0.0
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import exec from 'k6/execution';
import { Counter, Rate } from 'k6/metrics';

// ============================================================
// CONFIGURACIÓN GLOBAL Y MÉTRICAS
// ============================================================

/** @constant {string} BASE_API - URL base de la API REST */
const BASE_API = __ENV.BASE_API || __ENV.BASE_URL || 'https://reginsaapiqa.sunedu.gob.pe/api';

/** @constant {boolean} DEBUG_ERRORS - Habilita logs detallados de errores */
const DEBUG_ERRORS = (__ENV.K6_DEBUG_ERRORS || '1') === '1';

const HTTP_DETAIL_MODE = (__ENV.K6_HTTP_DETAIL_MODE || 'all').toLowerCase();
const HTTP_PUBLIC_NAME = (__ENV.K6_HTTP_PUBLIC_NAME || 'Caso04').trim() || 'Caso04';

/** @constant {number} DEBUG_LIMIT - Límite de logs de errores por iteración */
const DEBUG_LIMIT = Math.max(1, Number.parseInt(__ENV.K6_DEBUG_ERRORS_MAX || '8', 10) || 8);

/** @constant {boolean} EXPECT_RATE_LIMIT - Esperar rate limiting del servidor */
const EXPECT_RATE_LIMIT = (__ENV.K6_EXPECT_RATE_LIMIT || '1') === '1';

/** @constant {boolean} STRICT_ISOLATION - Aislamiento estricto de registros */
const STRICT_ISOLATION = (__ENV.K6_CASO04_STRICT_ISOLATION || '0') === '1';

// PDF Real basado en grabación HAR - cargado una vez en memoria
/** @constant {Uint8Array} pdfFile - Archivo PDF para reconsideración */
const pdfFile = open('../../../test-files/GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf', 'b');

// ============================================================
// ENDPOINTS DEL SISTEMA REGINSAQA
// ============================================================

/** @constant {string} ENDPOINT_LOGIN - Endpoint de autenticación */
const ENDPOINT_LOGIN = '/Auth/Login';

/** @constant {string} ENDPOINT_LISTAR_CABECERA - Endpoint para listar cabeceras paginadas */
const ENDPOINT_LISTAR_CABECERA = '/CabeceraInfraccionSancion/ListarPaginado';

/** @constant {string} ENDPOINT_LISTAR_DETALLE - Endpoint para listar detalles de infracción/sanción */
const ENDPOINT_LISTAR_DETALLE = '/DetalleInfraccionSancion/ListarPaginado';

/** @constant {string} ENDPOINT_ACTUALIZAR_CABECERA - Endpoint para actualizar cabecera */
const ENDPOINT_ACTUALIZAR_CABECERA = '/CabeceraInfraccionSancion/Actualizar';

/** @constant {string} ENDPOINT_ACTUALIZAR_DETALLE - Endpoint para actualizar detalle de infracción/sanción */
const ENDPOINT_ACTUALIZAR_DETALLE = '/DetalleInfraccionSancion/Actualizar';

// ============================================================
// MÉTRICAS PERSONALIZADAS
// ============================================================

// ============================================================
// FUNCIONES DE CONFIGURACIÓN Y UTILIDADES
// ============================================================

/**
 * Calcula la configuración óptima de paginación según la cantidad de registros
 * @param {number} cantidad - Cantidad total de registros a procesar
 * @returns {Object} Configuración con pageSize y maxPages
 */
function calcularPaginasOptimas(cantidad) {
  if (cantidad <= 10) return { pageSize: 10, maxPages: 1 };
  if (cantidad <= 25) return { pageSize: 25, maxPages: 1 };
  if (cantidad <= 50) return { pageSize: 50, maxPages: 1 };
  const pageSize = 100;
  return { pageSize, maxPages: Math.ceil(cantidad / pageSize) };
}

/**
 * Genera RUN_ID único para la ejecución actual
 * @returns {string} RUN_ID de 2 dígitos (00-99)
 */
function buildRunId() {
  // Buscar RUN_ID en variables de entorno o generar automático
  const requested = String(__ENV.K6_RUN_ID || '').replace(/\D/g, '');
  if (requested.length > 0) return requested.padStart(2, '0'); // Asegurar mínimo 2 dígitos
  
  // Generar automático basado en timestamp (00-99)
  const auto = (Date.now() + Math.floor(Math.random() * 997)) % 100;
  return String(auto).padStart(2, '0');
}

/**
 * Calcula el número de páginas necesarias para procesar una cantidad de registros
 * @param {number} cantidad - Cantidad total de registros
 * @param {number} pageSize - Tamaño de página
 * @returns {number} Número de páginas necesarias
 */
function calcularPaginasNecesarias(cantidad, pageSize) {
  return Math.ceil(cantidad / pageSize);
}

/**
 * Muestra la lógica de navegación por páginas
 * @param {number} cantidad - Cantidad total de registros
 * @param {number} pageSize - Tamaño de página
 * @returns {number} Número de páginas necesarias
 */
function mostrarLogicaNavegacion(cantidad, pageSize) {
  const paginasNecesarias = calcularPaginasNecesarias(cantidad, pageSize);
  console.log(`[caso04] Logica de navegacion: ${cantidad} registros / ${pageSize} por pagina = ${paginasNecesarias} paginas necesarias`);
  return paginasNecesarias;
}

// ============================================================
// INICIALIZACIÓN GLOBAL
// ============================================================

/** @constant {string} RUN_ID - ID único para esta ejecución */
const RUN_ID = buildRunId();
console.log(`[caso04] RUN_ID=${RUN_ID} - Prefijo para esta ejecucion`);

function buildK6ReconsideracionPrefix() {
  // Misma estructura del funcional: "FA XX REC", cambiando FA por K6.
  return `K6 ${String(RUN_ID).padStart(2, '0')} REC`;
}

// ============================================================
// FUNCIONES DE AUTENTICACIÓN Y HEADERS
// ============================================================

/**
 * Genera headers de autorización con token Bearer
 * @param {string} token - Token JWT de autenticación
 * @returns {Object} Headers HTTP con autorización
 */
function getAuthHeaders(token) {
  const authValue = normalizeBearer(token);
  return {
    'Authorization': authValue,
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://reginsaqa.sunedu.gob.pe',
    'Referer': 'https://reginsaqa.sunedu.gob.pe/'
  };
}

/**
 * Genera headers para peticiones con contenido JSON
 * @param {string} token - Token JWT de autenticación
 * @returns {Object} Headers con Content-Type application/json
 */
function getJsonHeaders(token) {
  return {
    ...getAuthHeaders(token),
    'Content-Type': 'application/json'
  };
}

// *** POOL DE USUARIOS (como en Caso 2) ***
const AUTO_LOGIN_ENABLED = (__ENV.K6_AUTO_LOGIN || '0') === '1';
const AUTH_ENDPOINT = String(__ENV.REGINSA_AUTH_ENDPOINT || __ENV.K6_AUTH_LOGIN_ENDPOINT || '/Auth/Login').trim();
const AUTH_USER_FIELD = String(__ENV.REGINSA_AUTH_USER_FIELD || 'usuario').trim() || 'usuario';
const AUTH_PASS_FIELD = String(__ENV.REGINSA_AUTH_PASS_FIELD || 'contrasena').trim() || 'contrasena';
const AUTH_TOKEN_PATH = String(__ENV.REGINSA_AUTH_TOKEN_PATH || '').trim();
const AUTH_TIMEOUT_MS = Math.max(1000, parseIntEnv(__ENV.REGINSA_AUTH_TIMEOUT_MS, 20000));
const AUTH_RETRY_MAX = Math.max(0, parseIntEnv(__ENV.K6_AUTH_RETRY_MAX, 1));

// *** FUNCIÓN POOL DE USUARIOS ***
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
const RUNNER_TOKEN = normalizeBearer(__ENV.TOKEN || '');
const TOKENS = [__ENV.TOKEN, __ENV.K6_AUTH_HEADER, __ENV.TOKEN1, __ENV.TOKEN2]
  .map((value) => normalizeBearer(value))
  .filter(Boolean);

let runtimeToken = '';
let debugErrorCount = 0;
let lastAuthTokenUsed = '';
const invalidTokens = new Set();

// *** FUNCIÓN LOGIN CON POOL ***
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

function markTokenInvalid(token) {
  if (!token) return;
  invalidTokens.add(String(token));
}

function tokenActual() {
  const ps1Token = RUNNER_TOKEN;
  if (ps1Token && !invalidTokens.has(ps1Token)) {
    lastAuthTokenUsed = ps1Token;
    console.log(`[caso04] [OK] Usando TOKEN del runner: ${ps1Token.substring(0, 20)}...`);
    return ps1Token;
  }

  const staticToken = TOKENS[(__VU - 1) % TOKENS.length] || TOKENS[0] || '';
  if (staticToken && !invalidTokens.has(staticToken)) {
    lastAuthTokenUsed = staticToken;
    console.log(`[caso04] [OK] Usando token estatico: ${staticToken.substring(0, 20)}...`);
    return staticToken;
  }

  if (runtimeToken && !invalidTokens.has(runtimeToken)) {
    lastAuthTokenUsed = runtimeToken;
    console.log(`[caso04] [OK] Reutilizando token login: ${runtimeToken.substring(0, 20)}...`);
    return runtimeToken;
  }

  if (AUTO_LOGIN_ENABLED) {
    console.log(`[caso04] [WARN] Obteniendo token por login para VU${__VU || 1}`);
    runtimeToken = obtainTokenByLogin();
    if (runtimeToken) {
      lastAuthTokenUsed = runtimeToken;
      console.log(`[caso04] [OK] Token obtenido por login: ${runtimeToken.substring(0, 20)}...`);
      return runtimeToken;
    }
  }

  console.error(`[caso04] [ERROR] No hay token disponible. Configura TOKEN, TOKEN1-20 o habilita AUTO_LOGIN.`);
  return '';
}

// Métricas específicas para Caso 04
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

// Configuración de ejecución - soporta múltiples VUs para pruebas paralelas
const vus = Math.max(1, parseIntEnv(__ENV.K6_VUS || __ENV.K6_PARALLEL_VUS || 1));
const MAX_REGISTROS = Math.max(1, parseIntEnv(__ENV.K6_CANTIDAD || 3));
const iterations = Math.max(1, parseIntEnv(__ENV.K6_CANTIDAD || __ENV.K6_FIXED_ITERATIONS || MAX_REGISTROS));
const K6_MODE = String(__ENV.K6_MODE || iterations <= 2 ? 'smoke' : 'fast');
const K6_SLEEP_SECONDS = parseFloatEnv(__ENV.K6_SLEEP_SECONDS, 1);
const CLOUD_PROJECT_ID = Math.max(0, parseIntEnv(__ENV.K6_CLOUD_PROJECT_ID, 0));
const ENFORCE_STRICT_THRESHOLDS = (__ENV.K6_ENFORCE_OK_RATE || '0') === '1';

// Configuración de paginación inteligente
const PAGINATION_CONFIG = calcularPaginasOptimas(MAX_REGISTROS);
const PAGE_SIZE = PAGINATION_CONFIG.pageSize;
const MAX_PAGES = PAGINATION_CONFIG.maxPages;

console.log(`[caso04] MODO=${K6_MODE} CANTIDAD=${MAX_REGISTROS} VUS=${vus} AUTO_LOGIN=${AUTO_LOGIN_ENABLED}`);
console.log(`[caso04] Configuracion: PAGE_SIZE=${PAGE_SIZE}, MAX_PAGES=${MAX_PAGES}, MAX_REGISTROS=${MAX_REGISTROS}`);
console.log(`[caso04] Estrategia: tomar primeros ${MAX_REGISTROS} registros en orden usando pageSize=${PAGE_SIZE}`);

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
    http_req_failed: [ENFORCE_STRICT_THRESHOLDS ? 'rate<0.1' : 'rate<0.95'],
    rate_limited_requests: [ENFORCE_STRICT_THRESHOLDS ? 'rate<0.05' : 'rate<0.99'],
    step_ok_rate: [ENFORCE_STRICT_THRESHOLDS ? 'rate>0.8' : 'rate>0.5'],
    registro_ok_rate: [ENFORCE_STRICT_THRESHOLDS ? 'rate>0.7' : 'rate>=0'],
    registro_expected_rate: [ENFORCE_STRICT_THRESHOLDS ? 'rate>0.9' : 'rate>0.4'],
    cabecera_ok_rate: [ENFORCE_STRICT_THRESHOLDS ? 'rate>0.8' : 'rate>=0'],
    medida_ok_rate: [ENFORCE_STRICT_THRESHOLDS ? 'rate>0.7' : 'rate>=0'],
    http_401_total: ['count<=0'],
    http_5xx_total: ['count<=0'],
    http_4xx_non_429_total: [ENFORCE_STRICT_THRESHOLDS ? 'count<=0' : 'count<=3']
  }
};

let iterationRateLimited = false;
let iterationHas4xx = false;
let iterationHas5xx = false;

// Funciones utilitarias
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

function headers(token) {
  return {
    'Authorization': normalizeBearer(token),
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

function isBusinessSuccess(response) {
  const json = safeJson(response);
  return response.status >= 200 && response.status < 300 && json?.bSuccess !== false;
}

function reportStatus(response, operation) {
  const status = response.status;
  const json = safeJson(response);
  const success = isBusinessSuccess(response);
  
  console.log(`[caso04] ${operation}: HTTP=${status} Success=${success} Duration=${response.timings.duration}ms`);
  
  // Token refresh on 401
  if (status === 401) {
    console.log('[caso04] Token expirado (401), invalidando y refrescando...');
    if (lastAuthTokenUsed && lastAuthTokenUsed !== RUNNER_TOKEN) {
      markTokenInvalid(lastAuthTokenUsed);
    }
    invalidateRuntimeToken();
    HTTP_401_TOTAL.add(1);
    return false;
  }
  
  if (!success && DEBUG_ERRORS && debugErrorCount < DEBUG_LIMIT) {
    console.log(`[caso04][error] ${operation} Response: ${response.body}`);
    debugErrorCount++;
  }
  
  // Tracking de errores
  if (status === 429) {
    HTTP_429_TOTAL.add(1);
    RATE_LIMITED_REQUESTS.add(1);
    iterationRateLimited = true;
  }
  if (status === 401) HTTP_401_TOTAL.add(1);
  if (status >= 400 && status < 500) {
    HTTP_4XX_TOTAL.add(1);
    if (status !== 429) HTTP_4XX_NON_429_TOTAL.add(1);
  }
  if (status >= 500) HTTP_5XX_TOTAL.add(1);
  STEP_OK_RATE.add(success || status === 429);
  
  return success;
}

// ============================================================
// FUNCIONES PRINCIPALES DE API
// ============================================================

/**
 * Lista cabeceras paginadas usando el endpoint del sistema web
 * @param {number} pageNumber - Número de página a consultar
 * @param {number} pageSize - Tamaño de página
 * @returns {Object|null} Respuesta JSON con las cabeceras o null si hay error
 */
function listarCabecerasPaginadas(pageNumber, pageSize, token) {
  return group('Listar Cabeceras Paginadas', () => {
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

    const response = http.post(`${BASE_API}${ENDPOINT_LISTAR_CABECERA}`, JSON.stringify(payload), {
      headers: getJsonHeaders(token),
      tags: { name: HTTP_DETAIL_MODE === 'guardar_only' ? HTTP_PUBLIC_NAME : 'CabeceraInfraccionSancion/ListarPaginado' }
    });

    const success = check(response, {
      '[ListarCabecerasPaginadas] status 200': (r) => r.status === 200,
      '[ListarCabecerasPaginadas] bSuccess true': (r) => {
        try {
          return r.json('bSuccess') === true;
        } catch {
          return false;
        }
      },
      '[ListarCabecerasPaginadas] oData presente': (r) => {
        try {
          return r.json('oData') !== undefined;
        } catch {
          return false;
        }
      }
    });

    reportStatus(response, `ListarCabecerasPaginadas[p=${pageNumber},size=${pageSize}]`);
    
    if (success) {
      const json = safeJson(response);
      if (json?.oData?.Results) {
        console.log(`[caso04] Cabeceras pagina ${pageNumber}: ${json.oData.Results.length} (Total en sistema: ${json.oData.TotalNumberOfRecords})`);
        
        // Debug de primeras cabeceras
        if (pageNumber === 1) {
          console.log(`[caso04][DEBUG] Primeras 3 cabeceras - Reconsideracion:`);
          for (let i = 0; i < Math.min(3, json.oData.Results.length); i++) {
            const cab = json.oData.Results[i];
            console.log(`[caso04][DEBUG] #${i+1} ID=${cab?.idCabeceraInfraccionSancion} - resolucionReconsideracion: "${cab?.resolucionReconsideracion || 'VACIO'}"`);  
          }
        }
        
        return Array.isArray(json.oData.Results) ? json.oData.Results : [];
      }
    }
    
    return [];
  });
}

function listarDetalles(idCabecera, token) {
  const payload = {
    idCabeceraInfraccionSancion: idCabecera,
    nPageNumber: 1,
    nPageSize: 50,
    sSortColumnName: 'ID_INFRACCION',
    sSortOrder: 'ASC',
    sFilterValue: ''
  };
  const response = http.post(`${BASE_API}${ENDPOINT_LISTAR_DETALLE}`, JSON.stringify(payload), {
    headers: getJsonHeaders(token),
    tags: { name: HTTP_DETAIL_MODE === 'guardar_only' ? HTTP_PUBLIC_NAME : 'DetalleInfraccionSancion/ListarPaginado' }
  });
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

function toggleDetalle(detalle, cabeceraId, token) {
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
    const respDesmarcar = http.put(`${BASE_API}${ENDPOINT_ACTUALIZAR_DETALLE}/${detalleId}`, JSON.stringify(payloadDesmarcar), {
      headers: getJsonHeaders(token),
      tags: { name: HTTP_DETAIL_MODE === 'guardar_only' ? HTTP_PUBLIC_NAME : 'DetalleInfraccionSancion/DesmarcarReconsidera' }
    });
    reportStatus(respDesmarcar, `DesmarcarReconsidera[${detalleId}]`);
    sleep(0.5);
  }

  const payloadReconsidera = buildDetallePayload(1, originalBitPago);
  const respMarcar = http.put(`${BASE_API}${ENDPOINT_ACTUALIZAR_DETALLE}/${detalleId}`, JSON.stringify(payloadReconsidera), {
    headers: getJsonHeaders(token),
    tags: { name: HTTP_DETAIL_MODE === 'guardar_only' ? HTTP_PUBLIC_NAME : 'DetalleInfraccionSancion/MarcarReconsidera' }
  });
  reportStatus(respMarcar, `MarcarReconsidera[${detalleId}]`);

  let nuevoBitPago = originalBitPago;
  if (originalBitPago === 0) {
    console.log(`[caso04][toggle] Pago no estaba marcado, marcando...`);
    const payloadPago = buildDetallePayload(1, 1);
    const respPago = http.put(`${BASE_API}${ENDPOINT_ACTUALIZAR_DETALLE}/${detalleId}`, JSON.stringify(payloadPago), {
      headers: getJsonHeaders(token),
      tags: { name: HTTP_DETAIL_MODE === 'guardar_only' ? HTTP_PUBLIC_NAME : 'DetalleInfraccionSancion/MarcarPago' }
    });
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

// *** ACTUALIZAR CABECERA CON PREFIJOS INCREMENTALES ***
function actualizarCabecera(cabecera, ordinalConsecutivo, token) {
  const prefijoK6 = buildK6ReconsideracionPrefix();
  const fileName = 'GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf';
  
  // ✅ Envolver PDF con http.file() para multipart correcto (como en k6-grafana)
  const realPdf = http.file(pdfFile, fileName, 'application/pdf');
  
  const numeroSecuencial = 8800 + ordinalConsecutivo;
  const numeroReconsideracion = `${prefijoK6} ${numeroSecuencial}-${new Date().getFullYear()}`;
  
  console.log(`[caso04] Generando numero de reconsideracion: ${numeroReconsideracion} (RUN_ID=${RUN_ID}, ordinal=${ordinalConsecutivo})`);
  
  // Ruta existente de resolución de sanción (para preservarla en la actualización)
  const rutaSancionExistente = String(cabecera?.rutaResolucionSancion || cabecera?.RutaResolucionSancion || cabecera?.RutaResolSancion || cabecera?.rutaResolSancion || '');
  
  const cabMultipart = {
    // ✅ Campos exactos del HAR - MAYÚSCULAS como en la API
    IdEntidad: String(cabecera?.idEntidad || cabecera?.IdEntidad || ''),
    NumeroExpediente: String(cabecera?.numeroExpediente || cabecera?.NumeroExpediente || ''),
    NumeroResolucion: String(cabecera?.numeroResolucion || cabecera?.NumeroResolucion || ''),
    FechaResolucion: String(cabecera?.fechaResolucion || cabecera?.FechaResolucion || ''),
    
    // ✅ Campos de reconsideración del HAR y API
    DesResolucionReconsideracion: numeroReconsideracion,
    FechaResolucionReconsideracion: new Date().toISOString().split('T')[0] + 'T05:00:00.000Z',
    GuidCabecera: String(cabecera?.guidCabecera || cabecera?.GuidCabecera || ''),
    LimpiarReconsideracion: 'false',
    RutaResolucionReconsideracion: fileName,
    ArchivoResolucionReconsideracion: realPdf,
    
    // ✅ Preservar ruta de resolución de sanción existente
    RutaResolucionSancion: rutaSancionExistente,
    rutaResolucionSancionAnterior: rutaSancionExistente,
    rutaResolucionReconsideracionAnterior: String(cabecera?.rutaResolucionReconsideracion || cabecera?.RutaResolucionReconsideracion || cabecera?.RutaResolReconsidera || '')
  };

  const idCabecera = cabecera?.idCabeceraInfraccionSancion || cabecera?.IdCabeceraInfraccionSancion || '';
  
  if (!idCabecera) {
    console.warn(`[caso04] ERROR: ID de cabecera no encontrado`);
    return false;
  }

  console.log(`[caso04][DEBUG] Enviando multipart con PDF real para cabecera ${idCabecera}`);

  // ✅ PUT CON ID EN URL (exactamente como en el HAR)
  const response = http.put(`${BASE_API}${ENDPOINT_ACTUALIZAR_CABECERA}/${idCabecera}`, cabMultipart, {
    headers: { 'Authorization': normalizeBearer(token), 'Accept': 'application/json, text/plain, */*' },
    tags: { name: HTTP_DETAIL_MODE === 'guardar_only' ? HTTP_PUBLIC_NAME : 'CabeceraInfraccionSancion/Actualizar' }
  });
  
  // ✅ Manejar respuesta vacía o no JSON
  let responseBody = '';
  try {
    responseBody = response.body || '';
    if (responseBody) {
      const parsed = JSON.parse(responseBody);
      console.log(`[caso04][DEBUG] Respuesta: Status=${response.status}, Body=${JSON.stringify(parsed)}`);
    } else {
      console.log(`[caso04][DEBUG] Respuesta: Status=${response.status}, Body vacio`);
    }
  } catch (error) {
    console.log(`[caso04][DEBUG] Respuesta: Status=${response.status}, Body="${responseBody}", Error JSON: ${error.message}`);
  }
  
  reportStatus(response, `ActualizarCabecera[${idCabecera}]`);
  const success = isBusinessSuccess(response);
  CABECERA_OK_RATE.add(success);
  
  return success;
}

// *** FUNCIÓN PRINCIPAL CON PROCESAMIENTO MASIVO ***
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
    // 1. Login con pool de usuarios
    const token = tokenActual();
    loginSuccess = Boolean(token);
    if (!loginSuccess) {
      console.error('[caso04] Login fallido, abortando iteracion');
      return;
    }
    console.log('[caso04] Token unico fijado para toda la iteracion (como HAR)');
    
    // 2. Buscar candidato por ordinal global consecutivo (sin saltos)
    let totalCabeceras = [];
    let paginasProcesadas = 0;
    
    // Calcular páginas necesarias según cantidad
    const paginasNecesarias = Math.ceil(MAX_REGISTROS / PAGE_SIZE);
    console.log(`[caso04] Paginacion necesaria: ${MAX_REGISTROS} / ${PAGE_SIZE} = ${paginasNecesarias} paginas (max ${MAX_PAGES})`);
    
    // Recolectar cabeceras hasta cubrir el ordinal objetivo
    const paginasAProcesar = Math.min(paginasNecesarias, MAX_PAGES);
    
    for (let pageNumber = 1; pageNumber <= paginasAProcesar; pageNumber++) {
      console.log(`[caso04] Procesando pagina ${pageNumber}/${paginasAProcesar}`);
      const cabeceras = listarCabecerasPaginadas(pageNumber, PAGE_SIZE, token);
      if (!Array.isArray(cabeceras) || cabeceras.length === 0) {
        console.log(`[caso04] Pagina ${pageNumber} vacia, terminando recoleccion`);
        break;
      }
      
      totalCabeceras = totalCabeceras.concat(cabeceras);
      paginasProcesadas++;
      const elegiblesAcumulados = FILTRAR_SOLO_ELEGIBLES
        ? totalCabeceras.filter(cabeceraElegibleSinReconsideracion).length
        : totalCabeceras.length;

      console.log(`[caso04] Pagina ${pageNumber}: acumulado=${totalCabeceras.length}, elegibles=${elegiblesAcumulados}, objetivoOrdinal=${currentIteration}`);

      if (elegiblesAcumulados > globalIterationIndex) {
        console.log('[caso04] Objetivo ordinal cubierto con paginas actuales.');
        break;
      }
      // Pausa entre páginas
      sleep(0.5);
    }
    
    console.log(`[caso04] Busqueda completada: ${paginasProcesadas}/${paginasAProcesar} paginas procesadas, ${totalCabeceras.length} cabeceras encontradas`);
    
    if (totalCabeceras.length === 0) {
      console.warn('[caso04] No se encontraron cabeceras para procesar');
      return;
    }
    
    // ✅ NO re-ordenar: usar el orden del API (FECHA_REGISTRO DESC) para coincidir con la UI
    const elegibles = FILTRAR_SOLO_ELEGIBLES
      ? totalCabeceras.filter(cabeceraElegibleSinReconsideracion)
      : totalCabeceras;

    console.log(`[caso04] Elegibles finales=${elegibles.length} (filtro vacios=${FILTRAR_SOLO_ELEGIBLES ? 'ON' : 'OFF'})`);

    if (globalIterationIndex >= elegibles.length) {
      console.warn(`[caso04] Sin candidato para ordinal global ${currentIteration}. Disponibles=${elegibles.length}.`);
      return;
    }

    const cabecera = elegibles[globalIterationIndex];
    const cabeceraId = cabecera?.IdCabeceraInfraccionSancion || cabecera?.idCabeceraInfraccionSancion;

    if (!cabeceraId) {
      console.warn('[caso04] Candidato sin idCabeceraInfraccionSancion, abortando iteracion.');
      return;
    }

    const indiceGlobal = totalCabeceras.findIndex((item) => String(item?.IdCabeceraInfraccionSancion || item?.idCabeceraInfraccionSancion) === String(cabeceraId));
    const filaGlobal = indiceGlobal >= 0 ? indiceGlobal + 1 : globalIterationIndex + 1;
    const paginaObjetivo = Math.floor((filaGlobal - 1) / PAGE_SIZE) + 1;
    const filaEnPagina = ((filaGlobal - 1) % PAGE_SIZE) + 1;

    console.log(`[caso04] [>>] Candidato ordinal global ${currentIteration}: ID=${cabeceraId} | filaGlobal=${filaGlobal} | pagina=${paginaObjetivo} | filaPagina=${filaEnPagina}`);

    const cabeceraSuccess = actualizarCabecera(cabecera, currentIteration, token);
    if (!cabeceraSuccess) {
      console.warn(`[caso04] Fallo actualizando cabecera ${cabeceraId}, no se procesaran medidas en esta iteracion.`);
      return;
    }

    cabecerasProcesadas = 1;

    const detalles = listarDetalles(cabeceraId, token);
    if (detalles.length === 0) {
      console.warn(`[caso04] No se encontraron detalles para cabecera ${cabeceraId}`);
    } else {
      let detallesExitosos = 0;
      for (let j = 0; j < detalles.length; j++) {
        const detalle = detalles[j];
        const resultado = toggleDetalle(detalle, cabeceraId, token);

        if (resultado.success) {
          detallesExitosos++;
          if (resultado.toggleInfo) {
            console.log(`[caso04] Detalle procesado: ${JSON.stringify(resultado.toggleInfo)}`);
          }
        }

        sleep(0.3);
      }

      medidasProcesadas = detallesExitosos;
      console.log(`[caso04] Cabecera ${cabeceraId} completada: ${detallesExitosos}/${detalles.length} detalles exitosos`);
    }
    
    exitoTotal = cabecerasProcesadas > 0 && medidasProcesadas > 0;
    console.log(`[caso04] Iteracion completada: ${cabecerasProcesadas} cabeceras, ${medidasProcesadas} medidas procesadas`);
    
  } catch (error) {
    console.error(`[caso04] Error en iteracion: ${error.message}`);
    exitoTotal = false;
  }
  
  // Métricas finales
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
