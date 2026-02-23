import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    caso02: {
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

const ENDPOINT_LISTAR_INFRACCION = __ENV.K6_CASO02_LISTAR_INFRACCION || '/Infraccion/Listar';
const ENDPOINT_CREAR_CABECERA = __ENV.K6_CASO02_CREAR_CABECERA || '/CabeceraInfraccionSancion/Crear';
const ENDPOINT_CREAR_MEDIDA = __ENV.K6_CASO02_CREAR_MEDIDA || '/MedidaCorrectiva/Crear';
const ENDPOINT_CREAR_DETALLE = __ENV.K6_CASO02_CREAR_DETALLE || '/DetalleInfraccionSancion/Crear';

function postJson(urlPath, payload) {
  return http.post(`${BASE_URL}${urlPath}`, JSON.stringify(payload), { headers: commonHeaders });
}

export default function () {
  const now = Date.now();

  const listarResp = postJson(ENDPOINT_LISTAR_INFRACCION, {
    page: 1,
    pageSize: 20,
    filtro: __ENV.K6_CASO02_FILTRO || ''
  });

  check(listarResp, {
    'caso02 listar status 2xx/3xx': (r) => r.status >= 200 && r.status < 400
  });

  const cabeceraResp = postJson(ENDPOINT_CREAR_CABECERA, {
    numeroExpediente: `K6-EXP-${now}`,
    numeroResolucion: `K6-RES-${now}`,
    fechaResolucion: new Date(now).toISOString(),
    usuarioRegistro: __ENV.K6_USUARIO || 'k6-runner'
  });

  check(cabeceraResp, {
    'caso02 cabecera status 2xx/3xx': (r) => r.status >= 200 && r.status < 400
  });

  const medidaResp = postJson(ENDPOINT_CREAR_MEDIDA, {
    descripcion: `K6 Medida ${now}`,
    orden: 1
  });

  check(medidaResp, {
    'caso02 medida status 2xx/3xx': (r) => r.status >= 200 && r.status < 400
  });

  const detalleResp = postJson(ENDPOINT_CREAR_DETALLE, {
    tipoInfraccion: __ENV.K6_CASO02_TIPO_INFRACCION || 'TIPO-01',
    tipoSancion: __ENV.K6_CASO02_TIPO_SANCION || 'MULTA',
    monto: Number(__ENV.K6_CASO02_MONTO || 100)
  });

  check(detalleResp, {
    'caso02 detalle status 2xx/3xx': (r) => r.status >= 200 && r.status < 400
  });

  sleep(1);
}
