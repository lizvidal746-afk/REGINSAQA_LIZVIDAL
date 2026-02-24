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
  mark429(listarResp);

  check(listarResp, {
    'caso04 listar status esperado': (r) => successCheck(r, cfg.profile)
  });

  const actualizarResp = postJson(ENDPOINT_ACTUALIZAR_RECONSIDERACION, {
    idDetalle: Number(__ENV.K6_CASO04_ID_DETALLE || 1),
    reconsidera: true,
    pago: false,
    fechaReconsideracion: new Date(now).toISOString()
  });
  mark429(actualizarResp);

  check(actualizarResp, {
    'caso04 actualizar status esperado': (r) => successCheck(r, cfg.profile)
  });

  const confirmarResp = postJson(ENDPOINT_CONFIRMAR_DETALLE, {
    idDetalle: Number(__ENV.K6_CASO04_ID_DETALLE || 1),
    confirmar: true
  });
  mark429(confirmarResp);

  check(confirmarResp, {
    'caso04 confirmar status esperado': (r) => successCheck(r, cfg.profile)
  });

  sleep(Math.max(0.05, cfg.thinkTimeMs / 1000));
}
