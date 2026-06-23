// src/config/k6Options.js
// Opciones globales, escenarios y thresholds dinámicos reutilizables para K6

import { getScenario } from '../../lib/scenarios.js';
import { buildHandleSummary } from '../../lib/summary.js';
import { config } from './index.js';

const CASE_ENDPOINTS = {
  caso01_agregar_administrado: [
    { tag: 'entidad_crear', label: 'ENTIDAD / CREAR', title: 'Entidad/Crear' },
    { tag: 'entidad_listar', label: 'ENTIDAD / LISTAR', title: 'Entidad/Listar' },
  ],
  caso01_crear: [
    { tag: 'entidad_crear', label: 'ENTIDAD / CREAR', title: 'Entidad/Crear' },
    { tag: 'entidad_listar', label: 'ENTIDAD / LISTAR', title: 'Entidad/Listar' },
  ],
  caso02_registrar_sancion: [
    { tag: 'infraccion_listar', label: 'INFRACCION / LISTAR', title: 'Infraccion/Listar' },
    {
      tag: 'cabecerainfraccionsancion_crearcondetalles',
      label: 'CABECERA INFRACCION SANCION / CREAR CON DETALLES',
      title: 'CabeceraInfraccionSancion/CrearConDetalles',
    },
  ],
  caso04_reconsiderar_con_sanciones: [
    {
      tag: 'cabecerainfraccionsancion_listarpaginado',
      label: 'CABECERA INFRACCION SANCION / LISTAR PAGINADO',
      title: 'CabeceraInfraccionSancion/ListarPaginado',
    },
    {
      tag: 'cabecerainfraccionsancion_actualizar',
      label: 'CABECERA INFRACCION SANCION / ACTUALIZAR',
      title: 'CabeceraInfraccionSancion/Actualizar',
    },
    {
      tag: 'detalleinfraccionsancion_listarpaginado',
      label: 'DETALLE INFRACCION SANCION / LISTAR PAGINADO',
      title: 'DetalleInfraccionSancion/ListarPaginado',
    },
    {
      tag: 'detalleinfraccionsancion_actualizar',
      label: 'DETALLE INFRACCION SANCION / ACTUALIZAR',
      title: 'DetalleInfraccionSancion/Actualizar',
    },
  ],
};

const CASE_CREATED_OPERATIONS = {
  caso01_agregar_administrado: ['administrado'],
  caso01_crear: ['administrado'],
  caso02_registrar_sancion: ['cabecera_con_detalles'],
  caso04_reconsiderar_con_sanciones: ['reconsideracion'],
};

function endpointDefinitions(caseName) {
  return CASE_ENDPOINTS[caseName] || CASE_ENDPOINTS.caso02_registrar_sancion;
}

function createdOperations(caseName) {
  return CASE_CREATED_OPERATIONS[caseName] || CASE_CREATED_OPERATIONS.caso02_registrar_sancion;
}

const OBSERVABLE_STATUS_CODES = [200, 201, 202, 204, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504];
const OUTCOME_TAGS = ['success', 'business', 'rate_limited', 'error', 'network'];

export const defaultThresholds = {
  http_req_duration: ['p(95)<1500'], // 95% de peticiones deben responder en menos de 1.5s
  http_req_failed: ['rate<0.01']     // Menos del 1% de peticiones puede fallar
};

export function buildOptions(caseName, customOptions = {}) {
  // Determinar escenario seleccionado vía variable de entorno
  const envScenario = __ENV.SCENARIO || 'smoke';
  const scenarioConfig = getScenario(envScenario);
  const endpointTags = endpointDefinitions(caseName).map((ep) => ep.tag);
  const operations = createdOperations(caseName);

  const thresholds = Object.assign({}, defaultThresholds, {
    checks: ['rate>0.99'],
    apdex_score: ['avg>=0'],
    session_success_rate: ['rate>=0'],
    error_rate: ['rate>=0'],
    http_outcome_count: ['count>=0'],
    business_validation_hits: ['count>=0'],
    reginsa_created_records: ['count>=0'],
  }, customOptions.thresholds || {});

  endpointTags.forEach((endpoint) => {
    thresholds[`http_req_duration{endpoint:${endpoint}}`] = thresholds[`http_req_duration{endpoint:${endpoint}}`] || ['p(95)>=0'];
    thresholds[`http_req_failed{endpoint:${endpoint}}`] = thresholds[`http_req_failed{endpoint:${endpoint}}`] || ['rate>=0'];
    thresholds[`ttfb_ms{endpoint:${endpoint}}`] = thresholds[`ttfb_ms{endpoint:${endpoint}}`] || ['p(95)>=0'];
    thresholds[`http_req_blocked{endpoint:${endpoint}}`] = thresholds[`http_req_blocked{endpoint:${endpoint}}`] || ['avg>=0'];
    thresholds[`http_req_tls_handshaking{endpoint:${endpoint}}`] =
      thresholds[`http_req_tls_handshaking{endpoint:${endpoint}}`] || ['avg>=0'];
    OUTCOME_TAGS.forEach((outcome) => {
      thresholds[`http_outcome_count{endpoint:${endpoint},outcome:${outcome}}`] =
        thresholds[`http_outcome_count{endpoint:${endpoint},outcome:${outcome}}`] || ['count>=0'];
    });
  });

  operations.forEach((operation) => {
    thresholds[`reginsa_created_records{operation:${operation}}`] =
      thresholds[`reginsa_created_records{operation:${operation}}`] || ['count>=0'];
  });

  config.localIps.forEach((ip) => {
    thresholds[`http_req_duration{source_ip:${ip}}`] = thresholds[`http_req_duration{source_ip:${ip}}`] || ['p(95)>=0'];
    thresholds[`http_req_failed{source_ip:${ip}}`] = thresholds[`http_req_failed{source_ip:${ip}}`] || ['rate>=0'];
    thresholds[`ttfb_ms{source_ip:${ip}}`] = thresholds[`ttfb_ms{source_ip:${ip}}`] || ['p(95)>=0'];
    thresholds[`http_req_blocked{source_ip:${ip}}`] = thresholds[`http_req_blocked{source_ip:${ip}}`] || ['avg>=0'];
    thresholds[`http_req_tls_handshaking{source_ip:${ip}}`] = thresholds[`http_req_tls_handshaking{source_ip:${ip}}`] || ['avg>=0'];
    endpointTags.forEach((endpoint) => {
      thresholds[`http_req_duration{endpoint:${endpoint},source_ip:${ip}}`] =
        thresholds[`http_req_duration{endpoint:${endpoint},source_ip:${ip}}`] || ['p(95)>=0'];
      thresholds[`http_req_failed{endpoint:${endpoint},source_ip:${ip}}`] =
        thresholds[`http_req_failed{endpoint:${endpoint},source_ip:${ip}}`] || ['rate>=0'];
      thresholds[`ttfb_ms{endpoint:${endpoint},source_ip:${ip}}`] =
        thresholds[`ttfb_ms{endpoint:${endpoint},source_ip:${ip}}`] || ['p(95)>=0'];
      thresholds[`http_req_blocked{endpoint:${endpoint},source_ip:${ip}}`] =
        thresholds[`http_req_blocked{endpoint:${endpoint},source_ip:${ip}}`] || ['avg>=0'];
      thresholds[`http_req_tls_handshaking{endpoint:${endpoint},source_ip:${ip}}`] =
        thresholds[`http_req_tls_handshaking{endpoint:${endpoint},source_ip:${ip}}`] || ['avg>=0'];
    });
    OUTCOME_TAGS.forEach((outcome) => {
      thresholds[`http_outcome_count{source_ip:${ip},outcome:${outcome}}`] =
        thresholds[`http_outcome_count{source_ip:${ip},outcome:${outcome}}`] || ['count>=0'];
      endpointTags.forEach((endpoint) => {
        thresholds[`http_outcome_count{endpoint:${endpoint},source_ip:${ip},outcome:${outcome}}`] =
          thresholds[`http_outcome_count{endpoint:${endpoint},source_ip:${ip},outcome:${outcome}}`] || ['count>=0'];
      });
    });
    operations.forEach((operation) => {
      thresholds[`reginsa_created_records{source_ip:${ip},operation:${operation}}`] =
        thresholds[`reginsa_created_records{source_ip:${ip},operation:${operation}}`] || ['count>=0'];
    });
  });

  OBSERVABLE_STATUS_CODES.forEach((status) => {
    thresholds[`http_reqs{status:${status}}`] = thresholds[`http_reqs{status:${status}}`] || ['count>=0'];
  });

  return {
    scenarios: scenarioConfig,
    thresholds,
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
    tags: { name: caseName, ...customOptions.tags }
  };
}

export function buildSummaryHandler(caseName) {
  const envScenario = __ENV.SCENARIO || 'smoke';
  return buildHandleSummary(`${caseName}-${envScenario}`, {
    ipMode: config.localIps.length > 1 ? 'multi' : 'single',
    sourceIp: config.localIps.length > 1 ? 'auto' : __ENV.K6_SOURCE_IP || config.localIps[0] || 'auto',
    localIps: config.localIps,
    scenario: envScenario,
    endpoints: endpointDefinitions(caseName),
  });
}
