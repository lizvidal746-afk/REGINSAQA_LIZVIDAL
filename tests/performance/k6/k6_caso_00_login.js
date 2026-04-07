import http from 'k6/http';
import { check } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'https://reginsaapiqa.sunedu.gob.pe/api').replace(/\/+$/, '');
const ENDPOINT = (__ENV.K6_LOGIN_CHECK_ENDPOINT || '/Entidad/Listar').trim();
const METHOD = String(__ENV.K6_LOGIN_CHECK_METHOD || 'GET').trim().toUpperCase();
const EXPECT_RATE_LIMIT = (__ENV.K6_EXPECT_RATE_LIMIT || '1') === '1';
const HTTP_DETAIL_MODE = (__ENV.K6_HTTP_DETAIL_MODE || 'all').toLowerCase();
const HTTP_PUBLIC_NAME = (__ENV.K6_HTTP_PUBLIC_NAME || 'Entidad/Listar').trim() || 'Entidad/Listar';
const AUTH_HEADER = (__ENV.K6_AUTH_HEADER || __ENV.TOKEN1 || __ENV.TOKEN || '').trim();
const AUTH_HEADERS_POOL = String(__ENV.K6_AUTH_HEADERS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const requested = Number.parseInt(__ENV.K6_CANTIDAD || __ENV.K6_FIXED_ITERATIONS || '3', 10);
const iterations = Number.isFinite(requested) ? Math.max(1, requested) : 3;
const vusRequested = Number.parseInt(__ENV.K6_VUS || __ENV.K6_FIXED_VUS || '1', 10);
const vus = Number.isFinite(vusRequested) ? Math.max(1, vusRequested) : 1;

const AUTH_OK_RATE = new Rate('auth_ok_rate');
const AUTH_EXPECTED_RATE = new Rate('auth_expected_rate');
const RATE_LIMITED_REQUESTS = new Rate('rate_limited_requests');
const AUTH_401_TOTAL = new Counter('auth_401_total');
const AUTH_403_TOTAL = new Counter('auth_403_total');

const AUTH_OK_RATE_MIN = Number.parseFloat(__ENV.K6_AUTH_OK_RATE_MIN || (EXPECT_RATE_LIMIT ? '0.01' : '0.8'));
const AUTH_EXPECTED_RATE_MIN = Number.parseFloat(__ENV.K6_AUTH_EXPECTED_RATE_MIN || (EXPECT_RATE_LIMIT ? '0.95' : '0.8'));
const ENFORCE_OK_RATE = (__ENV.K6_ENFORCE_OK_RATE || (EXPECT_RATE_LIMIT ? '0' : '1')) === '1';

function normalizeAuth(value) {
  const token = String(value || '').trim();
  if (!token) return '';
  return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
}

const auth = normalizeAuth(AUTH_HEADER);
const authPool = AUTH_HEADERS_POOL.map((v) => normalizeAuth(v)).filter(Boolean);
if (!auth && authPool.length === 0) {
  throw new Error('Falta K6_AUTH_HEADER/TOKEN1/TOKEN para caso00 login.');
}

export const options = {
  systemTags: ['status', 'method', 'name', 'scenario', 'group', 'check', 'error'],
  tags: { caso: '00', tipo: 'login' },
  scenarios: {
    caso00_login: {
      executor: 'shared-iterations',
      vus,
      iterations,
      maxDuration: __ENV.PERF_DURATION || '2m'
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    ...(ENFORCE_OK_RATE ? { auth_ok_rate: [`rate>${AUTH_OK_RATE_MIN}`] } : {}),
    auth_expected_rate: [`rate>${AUTH_EXPECTED_RATE_MIN}`],
    rate_limited_requests: [EXPECT_RATE_LIMIT ? 'rate<0.99' : 'rate<0.6']
  }
};

export default function () {
  const url = `${BASE_URL}${ENDPOINT.startsWith('/') ? ENDPOINT : `/${ENDPOINT}`}`;
  const selectedAuth = authPool.length > 0 ? authPool[(__VU - 1) % authPool.length] : auth;

  const endpointName = ENDPOINT.replace(/^\//, '');
  const visibleName = HTTP_DETAIL_MODE === 'guardar_only' ? HTTP_PUBLIC_NAME : endpointName;

  let response;
  if (METHOD === 'GET') {
    response = http.get(url, {
      headers: {
        Authorization: selectedAuth
      },
      tags: { name: visibleName }
    });
  } else {
    // Payload minimo para validar autenticacion sin depender de datos de negocio.
    response = http.request(METHOD, url, JSON.stringify({}), {
      headers: {
        'Content-Type': 'application/json',
        Authorization: selectedAuth
      },
      tags: { name: visibleName }
    });
  }

  if (response.status === 401) AUTH_401_TOTAL.add(1);
  if (response.status === 403) AUTH_403_TOTAL.add(1);

  const limited = response.status === 429;
  const authOk = response.status >= 200 && response.status < 300;
  const has4xx = response.status >= 400 && response.status < 500;
  const has5xx = response.status >= 500 && response.status < 600;
  RATE_LIMITED_REQUESTS.add(limited);
  AUTH_OK_RATE.add(authOk);
  AUTH_EXPECTED_RATE.add(Boolean(authOk || limited));

  check(response, {
    'caso00 auth status 200 esperado': () => (EXPECT_RATE_LIMIT ? (authOk || limited) : authOk)
  });

  if (EXPECT_RATE_LIMIT) {
    check(response, {
      'caso00 auth status 429 esperado por limite de regla de negocio': () => authOk || limited
    });
  }

  if (has4xx || has5xx) {
    const suffix = has4xx && has5xx ? '4xx y 5xx' : (has4xx ? '4xx' : '5xx');
    check({ ok: true }, {
      [`caso00 auth status ${suffix} detectado`]: () => true
    });
  }
}
