import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    caso04: {
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
    http_req_duration: ['p(95)<2000', 'avg<1000']
  }
};

const BASE_URL = __ENV.BASE_URL || 'https://tu-url-reginsa';
const AUTH_HEADER = __ENV.K6_AUTH_HEADER || '';
const commonHeaders = {
  'Content-Type': 'application/json',
  ...(AUTH_HEADER ? { Authorization: AUTH_HEADER } : {})
};

const ENDPOINT_LISTAR_DETALLE = __ENV.K6_CASO04_LISTAR_DETALLE || '/DetalleInfraccionSancion/Listar';
const ENDPOINT_ACTUALIZAR_RECONSIDERACION = __ENV.K6_CASO04_ACTUALIZAR_RECONSIDERACION || '/DetalleInfraccionSancion/ActualizarReconsideracion';
const ENDPOINT_CONFIRMAR_DETALLE = __ENV.K6_CASO04_CONFIRMAR_DETALLE || '/DetalleInfraccionSancion/Confirmar';

function postJson(urlPath, payload) {
  return http.post(`${BASE_URL}${urlPath}`, JSON.stringify(payload), { headers: commonHeaders });
}

export default function () {
  const now = Date.now();

  const listarResp = postJson(ENDPOINT_LISTAR_DETALLE, {
    page: 1,
    pageSize: 20,
    conSanciones: true
  });

  check(listarResp, {
    'caso04 listar status 2xx/3xx': (r) => r.status >= 200 && r.status < 400
  });

  const actualizarResp = postJson(ENDPOINT_ACTUALIZAR_RECONSIDERACION, {
    idDetalle: Number(__ENV.K6_CASO04_ID_DETALLE || 1),
    reconsidera: true,
    pago: false,
    fechaReconsideracion: new Date(now).toISOString()
  });

  check(actualizarResp, {
    'caso04 actualizar status 2xx/3xx': (r) => r.status >= 200 && r.status < 400
  });

  const confirmarResp = postJson(ENDPOINT_CONFIRMAR_DETALLE, {
    idDetalle: Number(__ENV.K6_CASO04_ID_DETALLE || 1),
    confirmar: true
  });

  check(confirmarResp, {
    'caso04 confirmar status 2xx/3xx': (r) => r.status >= 200 && r.status < 400
  });

  sleep(1);
}
