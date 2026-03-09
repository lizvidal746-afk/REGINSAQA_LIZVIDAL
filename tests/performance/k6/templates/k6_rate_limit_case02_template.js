import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

const BASE_API = __ENV.BASE_API || 'https://reginsaapiqa.sunedu.gob.pe/api';
const ENDPOINT = __ENV.RL_ENDPOINT || '/CabeceraInfraccionSancion/Crear';

const RL_LOW_RPM = Number(__ENV.RL_LOW_RPM || 3);
const RL_MID_RPM = Number(__ENV.RL_MID_RPM || 15);
const RL_HIGH_RPM = Number(__ENV.RL_HIGH_RPM || 30);

const RL_STAGE_SECONDS = Number(__ENV.RL_STAGE_SECONDS || 90);
const RL_EXPECT_429_MIN = Number(__ENV.RL_EXPECT_429_MIN || 0.02);
const RL_EXPECT_429_MAX_LOW = Number(__ENV.RL_EXPECT_429_MAX_LOW || 0.05);

const K6_ID_ENTIDAD = Number(__ENV.K6_ID_ENTIDAD || 3);
const TOKEN = (__ENV.TOKEN1 || __ENV.TOKEN2 || __ENV.TOKEN || '').trim();

const http429Total = new Counter('http_429_total');
const http400Total = new Counter('http_400_total');
const http401Total = new Counter('http_401_total');
const http403Total = new Counter('http_403_total');
const http404Total = new Counter('http_404_total');
const http409Total = new Counter('http_409_total');
const http422Total = new Counter('http_422_total');
const http500Total = new Counter('http_500_total');
const http502Total = new Counter('http_502_total');
const http503Total = new Counter('http_503_total');
const http4xxTotal = new Counter('http_4xx_total');
const http5xxTotal = new Counter('http_5xx_total');
const http2xxTotal = new Counter('http_2xx_total');
const httpOtherTotal = new Counter('http_other_total');
const rateLimitedRequests = new Rate('rate_limited_requests');
const lowPhaseRateLimited = new Rate('low_phase_rate_limited');
const highPhaseRateLimited = new Rate('high_phase_rate_limited');

const totalPhases = 3;

export const options = {
  scenarios: {
    low_limit: {
      executor: 'constant-arrival-rate',
      duration: `${RL_STAGE_SECONDS}s`,
      rate: RL_LOW_RPM,
      timeUnit: '1m',
      preAllocatedVUs: 5,
      maxVUs: 20,
      tags: { phase: 'low' },
    },
    at_limit: {
      executor: 'constant-arrival-rate',
      startTime: `${RL_STAGE_SECONDS}s`,
      duration: `${RL_STAGE_SECONDS}s`,
      rate: RL_MID_RPM,
      timeUnit: '1m',
      preAllocatedVUs: 10,
      maxVUs: 30,
      tags: { phase: 'mid' },
    },
    above_limit: {
      executor: 'constant-arrival-rate',
      startTime: `${RL_STAGE_SECONDS * 2}s`,
      duration: `${RL_STAGE_SECONDS}s`,
      rate: RL_HIGH_RPM,
      timeUnit: '1m',
      preAllocatedVUs: 20,
      maxVUs: 50,
      tags: { phase: 'high' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.30'],
    checks: ['rate>0.90'],
    low_phase_rate_limited: [`rate<${RL_EXPECT_429_MAX_LOW}`],
    high_phase_rate_limited: [`rate>${RL_EXPECT_429_MIN}`],
  },
};

function authHeader() {
  if (!TOKEN) return '';
  return TOKEN.startsWith('Bearer ') ? TOKEN : `Bearer ${TOKEN}`;
}

function headers() {
  const auth = authHeader();
  return {
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
    },
  };
}

function buildCabeceraPayload() {
  const now = Date.now();
  const corr = now % 100000;
  return {
    IdEntidad: K6_ID_ENTIDAD,
    NumeroExpediente: `EXP N° ${corr}-2026`,
    NumeroResolucion: `RES N° ${corr}-2026`,
    FechaResolucion: new Date().toISOString(),
    RutaResolucionSancion: 'GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf',
    ArchivoResolucion: '',
  };
}

function countStatus(status) {
  if (status >= 200 && status < 300) {
    http2xxTotal.add(1);
    return;
  }

  if (status >= 400 && status < 500) {
    http4xxTotal.add(1);
    if (status === 400) http400Total.add(1);
    if (status === 401) http401Total.add(1);
    if (status === 403) http403Total.add(1);
    if (status === 404) http404Total.add(1);
    if (status === 409) http409Total.add(1);
    if (status === 422) http422Total.add(1);
    return;
  }

  if (status >= 500 && status < 600) {
    http5xxTotal.add(1);
    if (status === 500) http500Total.add(1);
    if (status === 502) http502Total.add(1);
    if (status === 503) http503Total.add(1);
    return;
  }

  httpOtherTotal.add(1);
}

function metricCount(data, key) {
  return Number(data?.metrics?.[key]?.values?.count || 0);
}

export default function () {
  const url = `${BASE_API}${ENDPOINT}`;
  const payload = JSON.stringify(buildCabeceraPayload());
  const res = http.post(url, payload, headers());
  countStatus(res.status);

  const is429 = res.status === 429;
  rateLimitedRequests.add(is429);
  if (is429) http429Total.add(1);

  const phase = __ENV.K6_SCENARIO_TAGS_PHASE || '';
  if (phase === 'low') lowPhaseRateLimited.add(is429);
  if (phase === 'high') highPhaseRateLimited.add(is429);

  check(res, {
    'status esperado (200/201/429)': (r) => [200, 201, 429].includes(r.status),
  });

  sleep(0.2);
}

export function handleSummary(data) {
  const rate429 = data.metrics?.rate_limited_requests?.values?.rate || 0;
  const low429 = data.metrics?.low_phase_rate_limited?.values?.rate || 0;
  const high429 = data.metrics?.high_phase_rate_limited?.values?.rate || 0;
  const c2xx = metricCount(data, 'http_2xx_total');
  const c4xx = metricCount(data, 'http_4xx_total');
  const c5xx = metricCount(data, 'http_5xx_total');
  const c400 = metricCount(data, 'http_400_total');
  const c401 = metricCount(data, 'http_401_total');
  const c403 = metricCount(data, 'http_403_total');
  const c404 = metricCount(data, 'http_404_total');
  const c409 = metricCount(data, 'http_409_total');
  const c422 = metricCount(data, 'http_422_total');
  const c429 = metricCount(data, 'http_429_total');
  const c500 = metricCount(data, 'http_500_total');
  const c502 = metricCount(data, 'http_502_total');
  const c503 = metricCount(data, 'http_503_total');
  const cOther = metricCount(data, 'http_other_total');

  const lines = [
    '==== RESUMEN RATE LIMIT ====',
    `Endpoint: ${BASE_API}${ENDPOINT}`,
    `Fase LOW  (${RL_LOW_RPM} rpm): 429 rate=${(low429 * 100).toFixed(2)}%`,
    `Fase MID  (${RL_MID_RPM} rpm): revisar en métricas globales`,
    `Fase HIGH (${RL_HIGH_RPM} rpm): 429 rate=${(high429 * 100).toFixed(2)}%`,
    `Global 429 rate: ${(rate429 * 100).toFixed(2)}%`,
    `Conteo HTTP => 2xx:${c2xx} | 4xx:${c4xx} | 5xx:${c5xx} | other:${cOther}`,
    `Errores 4xx => 400:${c400} 401:${c401} 403:${c403} 404:${c404} 409:${c409} 422:${c422} 429:${c429}`,
    `Errores 5xx => 500:${c500} 502:${c502} 503:${c503}`,
    `Criterio esperado: LOW < ${(RL_EXPECT_429_MAX_LOW * 100).toFixed(1)}% y HIGH > ${(RL_EXPECT_429_MIN * 100).toFixed(1)}%`,
    '============================',
  ];

  return {
    stdout: `${lines.join('\n')}\n`,
    'reportes/k6-rate-limit-summary.json': JSON.stringify(data, null, 2),
  };
}
