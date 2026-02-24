import { Counter, Rate } from 'k6/metrics';

export const metric429Rate = new Rate('http_429_rate');
export const metric429Count = new Counter('http_429_count');

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

export function readPerfConfig() {
  const profile = String(__ENV.K6_PROFILE || 'carga_secuencial').toLowerCase();
  const fixedIterations = toInt(__ENV.K6_FIXED_ITERATIONS, 20);
  const fixedVUs = toInt(__ENV.K6_FIXED_VUS, 1);
  const minRPM = toInt(__ENV.K6_MIN_RPM, 3);
  const maxRPM = toInt(__ENV.K6_MAX_RPM, 15);
  const overLimitRPM = toInt(__ENV.K6_OVERLIMIT_RPM, 20);
  const expect429Min = toInt(__ENV.K6_EXPECT_429_MIN, 1);
  const spikeSize = toInt(__ENV.K6_SPIKE_SIZE, 100);
  const duration = String(__ENV.PERF_DURATION || __ENV.TEST_DURATION || '1m');
  const thinkTimeMs = toInt(__ENV.K6_THINK_MS, 200);

  return {
    profile,
    fixedIterations,
    fixedVUs,
    minRPM,
    maxRPM,
    overLimitRPM,
    expect429Min,
    spikeSize,
    duration,
    thinkTimeMs
  };
}

export function buildOptions(config) {
  const thresholds = {
    http_req_duration: ['p(95)<2500', 'avg<1200'],
    http_req_failed: ['rate<0.15']
  };

  if (config.profile === 'limite_20' || config.profile === 'pico') {
    thresholds.http_429_count = [`count>=${Math.max(1, config.expect429Min)}`];
  }

  if (config.profile === 'carga_tiempo0') {
    return {
      scenarios: {
        carga_tiempo0: {
          executor: 'constant-arrival-rate',
          rate: config.maxRPM,
          timeUnit: '1m',
          duration: config.duration,
          preAllocatedVUs: Math.max(1, Math.min(30, config.maxRPM)),
          maxVUs: Math.max(10, config.maxRPM)
        }
      },
      thresholds
    };
  }

  if (config.profile === 'fijo') {
    return {
      scenarios: {
        fijo: {
          executor: 'shared-iterations',
          vus: Math.max(1, config.fixedVUs),
          iterations: Math.max(1, config.fixedIterations),
          maxDuration: config.duration
        }
      },
      thresholds
    };
  }

  if (config.profile === 'limite_20') {
    return {
      scenarios: {
        limite_20: {
          executor: 'constant-arrival-rate',
          rate: config.overLimitRPM,
          timeUnit: '1m',
          duration: config.duration,
          preAllocatedVUs: Math.max(10, config.overLimitRPM),
          maxVUs: Math.max(20, config.overLimitRPM * 2)
        }
      },
      thresholds
    };
  }

  if (config.profile === 'pico') {
    return {
      scenarios: {
        pico: {
          executor: 'per-vu-iterations',
          vus: config.spikeSize,
          iterations: 1,
          maxDuration: '2m'
        }
      },
      thresholds
    };
  }

  if (config.profile === 'estres') {
    return {
      scenarios: {
        estres: {
          executor: 'ramping-arrival-rate',
          startRate: config.maxRPM,
          timeUnit: '1m',
          preAllocatedVUs: 20,
          maxVUs: 250,
          stages: [
            { target: config.maxRPM, duration: '1m' },
            { target: config.maxRPM * 2, duration: '1m' },
            { target: config.maxRPM * 3, duration: '1m' },
            { target: config.maxRPM, duration: '30s' }
          ]
        }
      },
      thresholds
    };
  }

  return {
    scenarios: {
      carga_secuencial: {
        executor: 'ramping-arrival-rate',
        startRate: config.minRPM,
        timeUnit: '1m',
        preAllocatedVUs: 10,
        maxVUs: 80,
        stages: [
          { target: config.minRPM, duration: '1m' },
          { target: Math.ceil((config.minRPM + config.maxRPM) / 2), duration: '1m' },
          { target: config.maxRPM, duration: '1m' },
          { target: config.minRPM, duration: '30s' }
        ]
      }
    },
    thresholds
  };
}

export function mark429(response) {
  const is429 = response && response.status === 429;
  metric429Rate.add(Boolean(is429));
  if (is429) {
    metric429Count.add(1);
  }
}

export function successCheck(response, profile) {
  if (!response) return false;
  if (profile === 'limite_20' || profile === 'pico') {
    return response.status === 429 || (response.status >= 200 && response.status < 400);
  }
  return response.status >= 200 && response.status < 400;
}
