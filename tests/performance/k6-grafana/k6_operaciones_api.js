import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

function toInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeAuth(value) {
  const token = String(value || '').trim();
  if (!token) return '';
  return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
}

const BASE_URL = String(__ENV.BASE_URL || 'https://reginsaapiqa.sunedu.gob.pe/api').replace(/\/+$/, '');
const OP = String(__ENV.K6_OP_NAME || 'create_entidad').trim().toLowerCase();

const CATALOG = {
  create_entidad: { method: 'POST', path: '/Entidad/Crear' },
  search_cabecera: { method: 'POST', path: '/CabeceraInfraccionSancion/Listar' },
  search_detalle: { method: 'POST', path: '/DetalleInfraccionSancion/Listar' },
  update_reconsideracion: { method: 'POST', path: '/DetalleInfraccionSancion/ActualizarReconsideracion' },
  confirm_reconsideracion: { method: 'POST', path: '/DetalleInfraccionSancion/Confirmar' },
  delete_generic: { method: 'DELETE', path: '/__UNSET__' },
  hide_generic: { method: 'PATCH', path: '/__UNSET__' },
  clean_generic: { method: 'POST', path: '/__UNSET__' }
};

const selected = CATALOG[OP] || CATALOG.create_entidad;
const METHOD = String(__ENV.K6_OP_METHOD || selected.method).toUpperCase();
const PATH = String(__ENV.K6_OP_PATH || selected.path).trim();

if (!PATH || PATH === '/__UNSET__') {
  throw new Error(`Operacion ${OP} requiere K6_OP_PATH.`);
}

const auth = normalizeAuth(__ENV.K6_AUTH_HEADER || __ENV.TOKEN1 || __ENV.TOKEN || '');
const authPool = String(__ENV.K6_AUTH_HEADERS || '')
  .split(',')
  .map((v) => normalizeAuth(v))
  .filter(Boolean);
if (!auth && authPool.length === 0) {
  throw new Error('Falta token API: define K6_AUTH_HEADER o TOKEN1/TOKEN.');
}

const rawBody = String(__ENV.K6_OP_BODY_JSON || '{}').trim();
let payload = '{}';
try {
  payload = JSON.stringify(JSON.parse(rawBody));
} catch (e) {
  throw new Error(`K6_OP_BODY_JSON invalido: ${e.message}`);
}

const iterations = Math.max(1, toInt(__ENV.K6_CANTIDAD || __ENV.K6_FIXED_ITERATIONS, 3));
const vus = Math.max(1, toInt(__ENV.K6_VUS || __ENV.K6_FIXED_VUS, 1));

const OP_OK_RATE = new Rate('op_ok_rate');
const STATUS_200 = new Counter('status_200_total');
const STATUS_201 = new Counter('status_201_total');
const STATUS_400 = new Counter('status_400_total');
const STATUS_401 = new Counter('status_401_total');
const STATUS_403 = new Counter('status_403_total');
const STATUS_404 = new Counter('status_404_total');
const STATUS_409 = new Counter('status_409_total');
const STATUS_429 = new Counter('status_429_total');
const STATUS_5XX = new Counter('status_5xx_total');
const STATUS_OTHER = new Counter('status_other_total');
const OP_LATENCY = new Trend('op_latency_ms');

function countStatus(code) {
  if (code === 200) return STATUS_200.add(1);
  if (code === 201) return STATUS_201.add(1);
  if (code === 400) return STATUS_400.add(1);
  if (code === 401) return STATUS_401.add(1);
  if (code === 403) return STATUS_403.add(1);
  if (code === 404) return STATUS_404.add(1);
  if (code === 409) return STATUS_409.add(1);
  if (code === 429) return STATUS_429.add(1);
  if (code >= 500 && code < 600) return STATUS_5XX.add(1);
  return STATUS_OTHER.add(1);
}

export const options = {
  tags: { caso: 'ops', op: OP },
  scenarios: {
    op_api: {
      executor: 'shared-iterations',
      vus,
      iterations,
      maxDuration: __ENV.PERF_DURATION || '5m'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    op_ok_rate: ['rate>0.5']
  }
};

export default function () {
  const url = `${BASE_URL}${PATH.startsWith('/') ? PATH : `/${PATH}`}`;
  const selectedAuth = authPool.length > 0 ? authPool[(__VU - 1) % authPool.length] : auth;
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: selectedAuth
    }
  };

  let response;
  if (METHOD === 'GET' || METHOD === 'DELETE') {
    response = http.request(METHOD, url, null, params);
  } else {
    response = http.request(METHOD, url, payload, params);
  }

  OP_LATENCY.add(response.timings.duration);
  countStatus(response.status);

  const ok = response.status >= 200 && response.status < 300;
  OP_OK_RATE.add(ok);

  check(response, {
    'status real capturado': (r) => r.status > 0,
    'operacion sin 401/403': (r) => r.status !== 401 && r.status !== 403
  });
}
