// scripts/caso03_reconsiderar_sin_sanciones.js
import { login } from '../lib/requests/auth.js';
import { crearReconsideracionSinSanciones } from '../lib/requests/reconsideracion.js';
import { buildOptions } from '../lib/options-builder.js';
import { check } from 'k6';

export const options = buildOptions('caso03_reconsiderar_sin_sanciones');

export default function () {
  // Ensure we have a valid token (login if not already present)
  if (!__ENV.AUTH_TOKEN) {
    const loginResp = login();
    check(loginResp, {
      'login ok': (r) => r && r.status === 200,
      'token present': (r) => r && r.json && r.json.token,
    });
    if (loginResp && loginResp.json && loginResp.json.token) {
      __ENV.AUTH_TOKEN = loginResp.json.token;
    } else {
      console.error('Unable to obtain auth token, aborting case 03');
      return;
    }
  }

  // Execute the sin sanciones flow
  const resp = crearReconsideracionSinSanciones();
  // Validate HTTP success and business success flag
  check(resp, {
    'reconsideracion sin sanciones 200': (r) => r && r.status === 200,
    'business success': (r) => r && r.json && r.json.bSuccess === true,
  });
}
