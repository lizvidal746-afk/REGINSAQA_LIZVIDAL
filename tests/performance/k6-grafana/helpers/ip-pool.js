/**
 * IP Pool helper para k6 — distribuye requests HTTP entre múltiples IPs de origen.
 *
 * Uso:
 *   import { ipPoolParams } from './helpers/ip-pool.js';
 *
 *   // Antes:
 *   http.post(url, body, { headers, tags });
 *   // Después:
 *   http.post(url, body, { headers, tags, ...ipPoolParams() });
 *
 * Configuración vía env var:
 *   K6_LOCAL_IPS=192.168.28.8,192.168.28.48,192.168.28.49,...
 *
 * Si K6_LOCAL_IPS no está definida o vacía, ipPoolParams() retorna {} (sin efecto).
 * Si está definida, retorna { localAddress: '<ip>' } usando asignación fija por VU.
 * Además marca cada VU con el tag 'source_ip' → visible en Grafana Cloud > Analysis.
 */

import exec from 'k6/execution';

const RAW_IPS = (__ENV.K6_LOCAL_IPS || '').trim();
const IP_POOL = RAW_IPS ? RAW_IPS.split(',').map(s => s.trim()).filter(Boolean) : [];
const POOL_ENABLED = IP_POOL.length > 1;

// Contador global para round-robin (modo secuencial, 1 VU)
let _counter = 0;

/**
 * Retorna parámetros de k6 http con localAddress si el pool está activo.
 * - Si hay 1 VU: round-robin entre IPs (simula rotación de origen).
 * - Si hay múltiples VUs: cada VU usa su IP fija del pool (simula N máquinas en paralelo).
 *   VU 1 → IP[0], VU 2 → IP[1], VU 3 → IP[2], etc.
 *
 * El tag 'source_ip' se aplica automáticamente a TODOS los requests del VU activo,
 * por lo que aparece en la pestaña "Analysis" de Grafana Cloud sin cambios extras.
 */
export function ipPoolParams() {
  if (!POOL_ENABLED) return {};
  // __VU es 1-based en k6; si está en init (VU=0) cae a round-robin
  const vuIndex = (typeof __VU !== 'undefined' && __VU > 0) ? (__VU - 1) : _counter++;
  const ip = IP_POOL[vuIndex % IP_POOL.length];

  // Marcar el VU con source_ip → aparece en TODOS sus requests en Grafana Cloud
  if (typeof __VU !== 'undefined' && __VU > 0) {
    exec.vu.tags['source_ip'] = ip;
  }

  return { localAddress: ip };
}

/**
 * Retorna true si el pool tiene más de 1 IP activa.
 */
export function isPoolActive() {
  return POOL_ENABLED;
}

/**
 * Retorna la cantidad de IPs en el pool (0 si desactivado).
 */
export function poolSize() {
  return POOL_ENABLED ? IP_POOL.length : 0;
}

/**
 * Log informativo del estado del pool (llamar al inicio del test).
 */
export function logPoolStatus() {
  if (POOL_ENABLED) {
    console.log(`[ip-pool] ACTIVO: ${IP_POOL.length} IPs — ${IP_POOL.join(', ')}`);
  } else if (RAW_IPS) {
    console.log(`[ip-pool] INACTIVO: solo 1 IP configurada (${RAW_IPS})`);
  }
  // Si RAW_IPS está vacío, no mostrar nada (modo normal sin pool)
}

/**
 * Retorna la IP asignada al VU actual, o '' cuando el pool está desactivado.
 * Útil para anotar registros con la IP de origen de cada iteración.
 */
export function getAssignedIP() {
  if (!POOL_ENABLED) return '';
  const vuIndex = (typeof __VU !== 'undefined' && __VU > 0) ? (__VU - 1) : _counter;
  return IP_POOL[vuIndex % IP_POOL.length];
}

/**
 * Retorna el último octeto de la IP asignada al VU actual, o '' cuando el pool está desactivado.
 * Ejemplo: '192.168.28.40' → '40'. Usarlo como prefijo de etiquetas para identificar
 * fácilmente qué IP ejecutó cada caso en dashboards de Grafana / salida de consola.
 */
export function getIpLastOctet() {
  if (!POOL_ENABLED) return '';
  const ip = getAssignedIP();
  if (!ip) return '';
  const lastDot = ip.lastIndexOf('.');
  return lastDot >= 0 ? ip.slice(lastDot + 1) : ip;
}
