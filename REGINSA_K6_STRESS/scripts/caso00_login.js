// scripts/caso00_login.js
// Smoke test que cubre varios endpoints del API REGINSA.
// Utiliza el helper de login (devuelve token) y la función genérica request
// para realizar llamadas GET/POST con el token en el header.

import { login } from '../lib/requests/auth.js';
import { request } from '../lib/http.js';
import { config } from '../config/env.js';
import { buildOptions } from '../lib/options-builder.js';
import { check } from 'k6';

export const options = buildOptions('caso00_login');

// Helper to add Authorization header
function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export default function () {
  // 1️⃣ Login – devuelve el token directamente (string) o lanza error
  let token;
  try {
    token = login();
  } catch (e) {
    console.error('Login failed (posible credencial vencida):', e.message);
    return; // abortar VU porque no hay token válido
  }

  check(token, { 'obtain token': (t) => !!t });
  // Guardar token para los siguientes scripts
  __ENV.AUTH_TOKEN = token;

  // 2️⃣ Consulta lista de Entidades (GET)
  const entidadResp = request('GET', `${config.baseUrl}/Entidad/Buscar`, null, authHeaders(token));
  check(entidadResp, {
    'GET Entidad/Buscar 200': (r) => r && r.status === 200,
    'entidades returned': (r) => {
      try {
        const body = r.json();
        return Array.isArray(body) && body.length > 0;
      } catch { return false; }
    },
  });

  // 3️⃣ Listar infracciones (POST) – endpoint usado en caso 02
  const infraccionResp = request(
    'POST',
    `${config.baseUrl}/Infraccion/Listar`,
    { page: 1, pageSize: 10 },
    authHeaders(token)
  );
  check(infraccionResp, {
    'POST Infraccion/Listar 200': (r) => r && r.status === 200,
    'infracciones retorno': (r) => {
      try {
        const body = r.json();
        return body && Array.isArray(body.items) && body.items.length >= 0;
      } catch { return false; }
    },
  });

  // 4️⃣ Health‑check sencillo (GET) – si el API expone /Health o /Ping
  const healthResp = request('GET', `${config.baseUrl}/Health`, null, authHeaders(token));
  check(healthResp, {
    'GET /Health 200': (r) => r && r.status === 200,
  });
}
