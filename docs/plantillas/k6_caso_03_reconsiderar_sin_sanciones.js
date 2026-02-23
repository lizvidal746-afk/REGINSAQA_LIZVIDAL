import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    caso03: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 5 },
        { duration: '1m', target: 10 },
        { duration: '30s', target: 0 }
      ]
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.03'],
    http_req_duration: ['p(95)<1800', 'avg<900']
  }
};

const BASE_URL = __ENV.BASE_URL || 'https://tu-url-reginsa';
const AUTH_HEADER = __ENV.K6_AUTH_HEADER || '';
const commonHeaders = {
  'Content-Type': 'application/json',
  ...(AUTH_HEADER ? { Authorization: AUTH_HEADER } : {})
};

const ENDPOINT_LISTAR_CABECERA = __ENV.K6_CASO03_LISTAR_CABECERA || '/CabeceraInfraccionSancion/Listar';
const ENDPOINT_GUARDAR_RECONSIDERACION = __ENV.K6_CASO03_GUARDAR_RECONSIDERACION || '/Reconsideracion/GuardarCabecera';
const ENDPOINT_LISTAR_DETALLE = __ENV.K6_CASO03_LISTAR_DETALLE || '/DetalleInfraccionSancion/Listar';

function postJson(urlPath, payload) {
  return http.post(`${BASE_URL}${urlPath}`, JSON.stringify(payload), { headers: commonHeaders });
}

export default function () {
  const now = Date.now();

  const listarResp = postJson(ENDPOINT_LISTAR_CABECERA, {
    page: 1,
    pageSize: 20,
    sinSanciones: true,
    reconsideracionPendiente: true
  });

  check(listarResp, {
    'caso03 listar status 2xx/3xx': (r) => r.status >= 200 && r.status < 400
  });

  const guardarResp = postJson(ENDPOINT_GUARDAR_RECONSIDERACION, {
    numeroReconsideracion: `K6-REC-${now}`,
    fechaReconsideracion: new Date(now).toISOString(),
    sinSanciones: true
  });

  check(guardarResp, {
    'caso03 guardar status 2xx/3xx': (r) => r.status >= 200 && r.status < 400
  });

  const detalleResp = postJson(ENDPOINT_LISTAR_DETALLE, {
    page: 1,
    pageSize: 20,
    sinSanciones: true
  });

  check(detalleResp, {
    'caso03 detalle status 2xx/3xx': (r) => r.status >= 200 && r.status < 400
  });

  sleep(1);
}
