// config/env.js
// Esta versión ya no usa el paquete 'dotenv' (no soportado por k6).
// Las variables de entorno son inyectadas por el script PowerShell (run‑k6.ps1) a través de __ENV.

// Helper para convertir rangos de IP a lista
function ipToNumber(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0);
}
function numberToIp(num) {
  return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join('.');
}

// Parse K6_LOCAL_IPS (ej: "192.168.28.48-192.168.28.56,192.168.30.10")
const rawIps = __ENV.K6_LOCAL_IPS || '';
const localIps = rawIps.split(',').map(range => {
  const parts = range.trim().split('-');
  if (parts.length === 2) {
    const start = ipToNumber(parts[0]);
    const end = ipToNumber(parts[1]);
    const list = [];
    for (let i = start; i <= end; i++) {
      list.push(numberToIp(i));
    }
    return list;
  }
  return [parts[0].trim()];
}).flat();

// Validar variables obligatorias
['BASE_URL'].forEach(key => {
  if (!__ENV[key]) {
    console.error(`Missing required env var ${key}`);
    // k6 aborta lanzando excepción
    throw new Error(`Missing required env var ${key}`);
  }
});

export const config = {
  baseUrl: __ENV.BASE_URL,
  localIps: localIps,
  probaRestricciones: __ENV.K6_PROBAR_RESTRICCIONES === 'true',
};
