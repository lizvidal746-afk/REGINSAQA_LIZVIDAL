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

const ENDPOINT_LISTAR = __ENV.K6_CASO01_LISTAR || '/Entidad/Listar';
const ENDPOINT_CREAR = __ENV.K6_CASO01_CREAR || '/Entidad/Crear';

function postJson(urlPath, payload) {
  return http.post(`${BASE_URL}${urlPath}`, JSON.stringify(payload), { headers: commonHeaders });
}

function buildRuc(seed) {
  const body = String(seed).replaceAll(/\D/g, '').slice(-9).padStart(9, '0');
  return `10${body}`;
}

export default function () {
  const now = Date.now();
  const ruc = buildRuc(now);

  const listarResp = postJson(ENDPOINT_LISTAR, {
    page: 1,
    pageSize: 20,
    filtro: ''
  });
  mark429(listarResp);
  check(listarResp, {
    'caso01 listar status esperado': (r) => successCheck(r, cfg.profile)
  });

  const crearResp = postJson(ENDPOINT_CREAR, {
    ruc,
    razonSocial: `K6 EMPRESA ${ruc}`,
    nombreComercial: `K6 ${ruc.slice(-5)}`,
    estado: 1
  });
  mark429(crearResp);
  check(crearResp, {
    'caso01 crear status esperado': (r) => successCheck(r, cfg.profile)
  });

  sleep(Math.max(0.05, cfg.thinkTimeMs / 1000));
}
