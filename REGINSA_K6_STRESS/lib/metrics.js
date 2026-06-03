// ============================================================
// lib/metrics.js
// Metricas custom alineadas a SRE Golden Signals e ISTQB.
//
// Mas alla del avg: medimos saturacion, rate-limit, sesion exitosa,
// concurrencia vs latencia, timeouts, Apdex.
// ============================================================
import { Counter, Gauge, Rate, Trend } from 'k6/metrics';

// --- Errores y limites de gateway ---
export const rateLimitedRequests = new Counter('rate_limited_requests'); // HTTP 429
export const businessLimitHits = new Counter('business_limit_hits'); // bSuccess=false con limite
export const businessValidationHits = new Counter('business_validation_hits'); // motivo funcional normalizado
export const unexpectedErrors = new Counter('unexpected_errors'); // 5xx u otros
export const timeoutErrors = new Counter('timeout_errors'); // tiempos > X

// --- Tasas (SRE Errors) ---
export const errorRate = new Rate('error_rate'); // % requests fallidos
export const sessionSuccessRate = new Rate('session_success_rate'); // % iteraciones completas OK

// --- Tendencias (latencia detallada) ---
export const ttfbTrend = new Trend('ttfb_ms', true); // Time To First Byte
export const apdexTrend = new Trend('apdex_score'); // Apdex per sample

// --- Gauges (saturacion en el tiempo) ---
export const concurrencyGauge = new Gauge('concurrent_vus');

// --- Contador de resultados HTTP por IP (para desglose por IP en reportes) ---
// Tags usados: source_ip, outcome (ok|business_limit|gateway_429|error_5xx|timeout), status_code
// Permite mostrar en el HTML cuantos 200-OK, 200-LIMITE, 429, errores tuvo cada IP.
export const httpOutcomeCounter = new Counter('http_outcome_count');
export const createdRecordsCounter = new Counter('reginsa_created_records');

// ----------------------------------------------------------
// Calcula Apdex score para una request individual.
// Apdex = (satisfied + tolerating/2) / total
// T = umbral satisfactorio (ms), 4T = umbral frustrado.
// Estandar: Apdex >= 0.94 EXCELENTE, >= 0.85 BUENO, < 0.5 INACEPTABLE
// ----------------------------------------------------------
export function recordApdex(durationMs, T = 800) {
  let score;
  if (durationMs <= T)
    score = 1.0; // satisfied
  else if (durationMs <= 4 * T)
    score = 0.5; // tolerating
  else score = 0.0; // frustrated
  apdexTrend.add(score);
  return score;
}
