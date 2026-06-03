// ============================================================
// lib/scenarios.js
// Escenarios Modulares para REGINSA - Estándar SRE
// ============================================================

function intEnv(name, fallback) {
  const n = parseInt(__ENV[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function strEnv(name, fallback) {
  return (__ENV[name] || fallback).trim();
}

// SMOKE: 1 VU, 4 iteraciones.
export const smokeScenario = {
  smoke: {
    executor: 'shared-iterations',
    vus: 1,
    iterations: 4,
    maxDuration: '1m',
    tags: { scenario: 'smoke', test_type: 'smoke' },
  },
};

// LOAD: Carga nominal sostenida.
export const loadScenario = {
  load: {
    executor: 'constant-vus',
    vus: intEnv('K6_LOAD_VUS', 9),
    duration: strEnv('K6_LOAD_DURATION', '5m'),
    tags: { scenario: 'load', test_type: 'load' },
  },
};

// STRESS: Escalera (10 -> 50 VUs).
export const stressScenario = {
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: strEnv('K6_STRESS_RAMP_1', '1m'), target: intEnv('K6_STRESS_VUS_1', 9) },
      { duration: strEnv('K6_STRESS_RAMP_2', '2m'), target: intEnv('K6_STRESS_VUS_2', 18) },
      { duration: strEnv('K6_STRESS_RAMP_3', '2m'), target: intEnv('K6_STRESS_VUS_3', 27) },
      { duration: strEnv('K6_STRESS_RAMP_4', '2m'), target: intEnv('K6_STRESS_VUS_4', 45) },
      { duration: strEnv('K6_STRESS_RAMP_DOWN', '1m'), target: 0 },
    ],
    tags: { scenario: 'stress', test_type: 'stress' },
  },
};

// SPIKE: Pico repentino.
export const spikeScenario = {
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: strEnv('K6_SPIKE_WARMUP', '30s'), target: intEnv('K6_SPIKE_BASE_VUS', 5) },
      { duration: strEnv('K6_SPIKE_RAMP', '1m'), target: intEnv('K6_SPIKE_PEAK_VUS', 45) },
      { duration: strEnv('K6_SPIKE_HOLD', '2m'), target: intEnv('K6_SPIKE_PEAK_VUS', 45) },
      { duration: strEnv('K6_SPIKE_RECOVER', '1m'), target: intEnv('K6_SPIKE_BASE_VUS', 5) },
      { duration: strEnv('K6_SPIKE_RAMP_DOWN', '30s'), target: 0 },
    ],
    tags: { scenario: 'spike', test_type: 'spike' },
  },
};

// SOAK: Carga moderada sostenida.
export const soakScenario = {
  soak: {
    executor: 'constant-vus',
    vus: intEnv('K6_SOAK_VUS', 9),
    duration: strEnv('K6_SOAK_DURATION', '30m'),
    tags: { scenario: 'soak', test_type: 'soak' },
  },
};

// COLLAPSE: Prueba destructiva controlada para forzar ruptura rápida.
export const collapseScenario = {
  collapse: {
    executor: 'ramping-arrival-rate',
    startRate: intEnv('K6_COLLAPSE_START_RPS', 1),
    timeUnit: '1s',
    preAllocatedVUs: intEnv('K6_COLLAPSE_PRE_VUS', 10),
    maxVUs: intEnv('K6_COLLAPSE_MAX_VUS', 150),
    stages: [
      { duration: strEnv('K6_COLLAPSE_RAMP_1', '1m'), target: intEnv('K6_COLLAPSE_RPS_1', 10) },
      { duration: strEnv('K6_COLLAPSE_RAMP_2', '2m'), target: intEnv('K6_COLLAPSE_RPS_2', 30) },
      { duration: strEnv('K6_COLLAPSE_RAMP_3', '2m'), target: intEnv('K6_COLLAPSE_RPS_3', 60) },
      { duration: strEnv('K6_COLLAPSE_RAMP_4', '1m'), target: intEnv('K6_COLLAPSE_RPS_4', 100) },
      { duration: strEnv('K6_COLLAPSE_RAMP_DOWN', '1m'), target: 0 },
    ],
    tags: { scenario: 'collapse', ip_mode: 'multi' },
  },
};

// AUDITORIA MULTI-IP: 9 VUs locales.
export const multiIpAuditScenario = {
  multi_ip_audit: {
    executor: 'per-vu-iterations',
    vus: 9,
    iterations: intEnv('K6_ITER_PER_VU', 4),
    maxDuration: strEnv('K6_AUDIT_MAX_DURATION', '5m'),
    tags: { scenario: 'multi_ip_audit', ip_mode: 'multi' },
  },
};

// ATTACK: Prueba de estrés por escalones instantáneos (Ataque de Saturación Súbita)
export const attackScenario = {
  attack: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '0s', target: intEnv('K6_ATTACK_STEP_1', 20) },
      { duration: strEnv('K6_ATTACK_HOLD_1', '1m'), target: intEnv('K6_ATTACK_STEP_1', 20) },
      { duration: '0s', target: intEnv('K6_ATTACK_STEP_2', 50) },
      { duration: strEnv('K6_ATTACK_HOLD_2', '1m'), target: intEnv('K6_ATTACK_STEP_2', 50) },
      { duration: '0s', target: intEnv('K6_ATTACK_STEP_3', 80) },
      { duration: strEnv('K6_ATTACK_HOLD_3', '1m'), target: intEnv('K6_ATTACK_STEP_3', 80) },
      { duration: '15s', target: 0 },
    ],
    tags: { scenario: 'attack', ip_mode: 'multi' },
  },
};

// ONE_SHOT: Ráfaga instantánea pura variable a tiempo 0.
export const oneShotScenario = {
  one_shot: {
    executor: 'per-vu-iterations',
    vus: intEnv('K6_ONESHOT_VUS', 50),
    iterations: 1,
    maxDuration: strEnv('K6_ONESHOT_MAX_DURATION', '2m'),
    tags: { scenario: 'one_shot', ip_mode: 'multi' },
  },
};

// FACTORY: Obtener escenario por nombre (vía Variable de Entorno)
export function getScenario(name) {
  const all = {
    smoke: smokeScenario,
    load: loadScenario,
    stress: stressScenario,
    spike: spikeScenario,
    soak: soakScenario,
    collapse: collapseScenario,
    multi_ip_audit: multiIpAuditScenario,
    attack: attackScenario,
    one_shot: oneShotScenario,
  };
  return all[name] || smokeScenario;
}
