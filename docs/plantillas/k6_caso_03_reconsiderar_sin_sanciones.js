import http from 'k6/http';
import { check, sleep } from 'k6';
import { buildOptions, mark429, readPerfConfig, successCheck } from './k6_perfiles_comunes.js';

const cfg = readPerfConfig();
export const options = buildOptions(cfg);

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
  mark429(listarResp);

  check(listarResp, {
    'caso03 listar status esperado': (r) => successCheck(r, cfg.profile)
  });

  const guardarResp = postJson(ENDPOINT_GUARDAR_RECONSIDERACION, {
    numeroReconsideracion: `K6-REC-${now}`,
    fechaReconsideracion: new Date(now).toISOString(),
    sinSanciones: true
  });
  mark429(guardarResp);

  check(guardarResp, {
    'caso03 guardar status esperado': (r) => successCheck(r, cfg.profile)
  });

  const detalleResp = postJson(ENDPOINT_LISTAR_DETALLE, {
    page: 1,
    pageSize: 20,
    sinSanciones: true
  });
  mark429(detalleResp);

  check(detalleResp, {
    'caso03 detalle status esperado': (r) => successCheck(r, cfg.profile)
  });

  sleep(Math.max(0.05, cfg.thinkTimeMs / 1000));
}
