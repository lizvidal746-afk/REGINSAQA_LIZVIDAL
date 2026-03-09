import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const BASE_API = __ENV.BASE_API || 'https://reginsaapiqa.sunedu.gob.pe/api';
const ENDPOINT = __ENV.RL_ENDPOINT || '/CabeceraInfraccionSancion/Crear';

const STRESS_LOW_RPM = Number(__ENV.STRESS_LOW_RPM || 10);
const STRESS_MID_RPM = Number(__ENV.STRESS_MID_RPM || 20);
const STRESS_HIGH_RPM = Number(__ENV.STRESS_HIGH_RPM || 40);
const STRESS_PEAK_RPM = Number(__ENV.STRESS_PEAK_RPM || 60);
const STRESS_STAGE_SECONDS = Number(__ENV.STRESS_STAGE_SECONDS || 90);

const STRESS_MIN_429_HIGH = Number(__ENV.STRESS_MIN_429_HIGH || 0.05);
const STRESS_MIN_429_PEAK = Number(__ENV.STRESS_MIN_429_PEAK || 0.10);

const TOKEN = (__ENV.TOKEN1 || __ENV.TOKEN2 || __ENV.TOKEN || '').trim();
const K6_ID_ENTIDAD = Number(__ENV.K6_ID_ENTIDAD || 3);

const rateLimitedHigh = new Rate('rate_limited_high');
const rateLimitedPeak = new Rate('rate_limited_peak');
const rateLimitedGlobal = new Rate('rate_limited_global');
const total429 = new Counter('total_429');

export const options = {
  scenarios: {
    low: {
      executor: 'constant-arrival-rate',
      duration: `${STRESS_STAGE_SECONDS}s`,
      rate: STRESS_LOW_RPM,
      timeUnit: '1m',
      preAllocatedVUs: 10,
      maxVUs: 30,
      tags: { phase: 'low' },
    },
    mid: {
      executor: 'constant-arrival-rate',
      startTime: `${STRESS_STAGE_SECONDS}s`,
      duration: `${STRESS_STAGE_SECONDS}s`,
      rate: STRESS_MID_RPM,
      timeUnit: '1m',
      preAllocatedVUs: 20,
      maxVUs: 50,
      tags: { phase: 'mid' },
    },
    high: {
      executor: 'constant-arrival-rate',
      startTime: `${STRESS_STAGE_SECONDS * 2}s`,
      duration: `${STRESS_STAGE_SECONDS}s`,
      rate: STRESS_HIGH_RPM,
      timeUnit: '1m',
      preAllocatedVUs: 30,
      maxVUs: 80,
      tags: { phase: 'high' },
    },
    peak: {
      executor: 'constant-arrival-rate',
      startTime: `${STRESS_STAGE_SECONDS * 3}s`,
      duration: `${STRESS_STAGE_SECONDS}s`,
      rate: STRESS_PEAK_RPM,
      timeUnit: '1m',
      preAllocatedVUs: 40,
      maxVUs: 120,
      tags: { phase: 'peak' },
    },
  },
  thresholds: {
    checks: ['rate>0.85'],
    rate_limited_high: [`rate>${STRESS_MIN_429_HIGH}`],
    rate_limited_peak: [`rate>${STRESS_MIN_429_PEAK}`],
    http_req_failed: ['rate<0.50'],
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
  if (phase === 'high') rateLimitedHigh.add(is429);
  if (phase === 'peak') rateLimitedPeak.add(is429);

  check(res, {
    'status 200/201/429': (r) => [200, 201, 429].includes(r.status),
  });

  sleep(0.1);
}

export function handleSummary(data) {
  const highRate = data.metrics?.rate_limited_high?.values?.rate || 0;
  const peakRate = data.metrics?.rate_limited_peak?.values?.rate || 0;
  const globalRate = data.metrics?.rate_limited_global?.values?.rate || 0;

  const lines = [
    '==== STRESS RATE LIMIT (CASO 02) ====',
    `HIGH (${STRESS_HIGH_RPM} rpm): 429 ${(highRate * 100).toFixed(2)}%`,
    `PEAK (${STRESS_PEAK_RPM} rpm): 429 ${(peakRate * 100).toFixed(2)}%`,
    `GLOBAL 429: ${(globalRate * 100).toFixed(2)}%`,
    'Criterio: en alta carga debe observarse 429 de forma consistente.',
    '=====================================',
  ];

  return {
    stdout: `${lines.join('\n')}\n`,
    'reportes/k6-rate-limit-stress-summary.json': JSON.stringify(data, null, 2),
  };
}
