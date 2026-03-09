import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const BASE_API = __ENV.BASE_API || 'https://reginsaapiqa.sunedu.gob.pe/api';
const ENDPOINT = __ENV.RL_ENDPOINT || '/CabeceraInfraccionSancion/Crear';

const SMOKE_LOW_RPM = Number(__ENV.SMOKE_LOW_RPM || 3);
const SMOKE_AT_LIMIT_RPM = Number(__ENV.SMOKE_AT_LIMIT_RPM || 15);
const SMOKE_STAGE_SECONDS = Number(__ENV.SMOKE_STAGE_SECONDS || 60);
const SMOKE_MAX_429_LOW = Number(__ENV.SMOKE_MAX_429_LOW || 0.05);
const SMOKE_MAX_429_AT_LIMIT = Number(__ENV.SMOKE_MAX_429_AT_LIMIT || 0.25);

const TOKEN = (__ENV.TOKEN1 || __ENV.TOKEN2 || __ENV.TOKEN || '').trim();
const K6_ID_ENTIDAD = Number(__ENV.K6_ID_ENTIDAD || 3);

const rateLimitedGlobal = new Rate('rate_limited_global');
const rateLimitedLow = new Rate('rate_limited_low');
const rateLimitedAtLimit = new Rate('rate_limited_at_limit');
const total429 = new Counter('total_429');

export const options = {
  scenarios: {
    low_limit: {
      executor: 'constant-arrival-rate',
      duration: `${SMOKE_STAGE_SECONDS}s`,
      rate: SMOKE_LOW_RPM,
      timeUnit: '1m',
      preAllocatedVUs: 5,
      maxVUs: 15,
      tags: { phase: 'low' },
    },
    at_limit: {
      executor: 'constant-arrival-rate',
      startTime: `${SMOKE_STAGE_SECONDS}s`,
      duration: `${SMOKE_STAGE_SECONDS}s`,
      rate: SMOKE_AT_LIMIT_RPM,
      timeUnit: '1m',
      preAllocatedVUs: 8,
      maxVUs: 20,
      tags: { phase: 'at_limit' },
    },
  },
  thresholds: {
    checks: ['rate>0.90'],
    rate_limited_low: [`rate<${SMOKE_MAX_429_LOW}`],
    rate_limited_at_limit: [`rate<${SMOKE_MAX_429_AT_LIMIT}`],
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

function payload() {
  const corr = Date.now() % 100000;
  return {
    IdEntidad: K6_ID_ENTIDAD,
    NumeroExpediente: `EXP N° ${corr}-2026`,
    NumeroResolucion: `RES N° ${corr}-2026`,
    FechaResolucion: new Date().toISOString(),
    RutaResolucionSancion: 'GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf',
    ArchivoResolucion: '',
  };
}

export default function () {
  const res = http.post(`${BASE_API}${ENDPOINT}`, JSON.stringify(payload()), headers());
  const is429 = res.status === 429;

  rateLimitedGlobal.add(is429);
  if (is429) total429.add(1);

  const phase = __ENV.K6_SCENARIO_TAGS_PHASE || '';
  if (phase === 'low') rateLimitedLow.add(is429);
  if (phase === 'at_limit') rateLimitedAtLimit.add(is429);

  check(res, {
    'status 200/201/429': (r) => [200, 201, 429].includes(r.status),
  });

  sleep(0.15);
}

export function handleSummary(data) {
  const lowRate = data.metrics?.rate_limited_low?.values?.rate || 0;
  const atLimitRate = data.metrics?.rate_limited_at_limit?.values?.rate || 0;
  const lines = [
    '==== SMOKE RATE LIMIT (CASO 02) ====',
    `LOW (${SMOKE_LOW_RPM} rpm): 429 ${(lowRate * 100).toFixed(2)}%`,
    `AT_LIMIT (${SMOKE_AT_LIMIT_RPM} rpm): 429 ${(atLimitRate * 100).toFixed(2)}%`,
    'Criterio: pocas o nulas respuestas 429 en smoke.',
    '====================================',
  ];

  return {
    stdout: `${lines.join('\n')}\n`,
    'reportes/k6-rate-limit-smoke-summary.json': JSON.stringify(data, null, 2),
  };
}
