// src/config/index.js
// Archivo central para carga y exportación de variables de entorno

function ipToNumber(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + Number.parseInt(oct, 10), 0);
}

function numberToIp(num) {
  return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join('.');
}

function parseLocalIps(raw) {
  return String(raw || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const [start, end] = part.split('-').map((p) => p.trim());
      if (!end) return [start];
      const startNum = ipToNumber(start);
      const endNum = ipToNumber(end);
      const ips = [];
      for (let n = startNum; n <= endNum; n++) {
        ips.push(numberToIp(n));
      }
      return ips;
    });
}

export const config = {
  baseUrl: (() => {
    let url = (__ENV.BASE_URL || 'https://reginsaapiqa.sunedu.gob.pe/api').replace(/\/+$/, '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    if (!url.endsWith('/api')) {
      url += '/api';
    }
    return url;
  })(),
  localIps: parseLocalIps(__ENV.K6_LOCAL_IPS),
  probarRestricciones: __ENV.K6_PROBAR_RESTRICCIONES === 'true',
  timeoutMs: Number.parseInt(__ENV.HTTP_TIMEOUT || '30000', 10),
  maxRetries: Number.parseInt(__ENV.HTTP_MAX_RETRIES || '3', 10)
};

// Validaciones criticas (falla rápido si falta algo esencial)
if (!config.baseUrl) {
  throw new Error('La variable BASE_URL es requerida pero no está definida en .env');
}
