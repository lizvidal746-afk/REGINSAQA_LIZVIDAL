// cases/caso00_login.js
// Smoke Test refactorizado con la nueva arquitectura modular

import { check, sleep } from 'k6';
import http from 'k6/http';
import { getToken } from '../src/api/auth.js';
import { buildOptions } from '../src/config/k6Options.js';

export const options = buildOptions('caso00_login');

export default function () {
  // 1️⃣ Obtener Token (la función getToken se encarga del auth y validación)
  let token;
  try {
    token = getToken();
  } catch (e) {
    console.error('Login Error:', e.message);
    return; // Aborta VU
  }
  check(token, { 'obtain token': (t) => !!t });

  // 2️⃣ Ping a Swagger (único endpoint disponible públicamente sin error 404)
  // Utilizamos esto temporalmente para que K6 registre peticiones HTTP reales 
  // y genere un reporte válido mientras configuran los endpoints de negocio (Caso 01).
  const healthResp = http.get('https://reginsaapiqa.sunedu.gob.pe/swagger/index.html', {
    tags: { name: 'Swagger UI (Health)' }
  });
  
  if (healthResp.status !== 200 && __ITER === 0) {
    console.log(`[Error] VU ${__VU} - Estado: ${healthResp.status}`);
  }

  check(healthResp, {
    'GET /swagger/index.html 200': (r) => r.status === 200
  });

  // 3️⃣ IMPORTANTE: Pausa para simular el "think time" del usuario.
  // Sin esto, K6 hará miles de peticiones por segundo en un bucle infinito.
  sleep(1);
}
