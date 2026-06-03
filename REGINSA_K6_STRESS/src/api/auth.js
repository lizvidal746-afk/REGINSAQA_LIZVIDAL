// src/api/auth.js
// Gestor centralizado de autenticación

import { apiRequest } from './client.js';
import { getNextCredentials } from '../data/usuarios.js';
import { vu } from 'k6/execution';

// En K6, la memoria es por VU. Esto significa que cada Virtual User 
// tendrá su propio token cacheado en esta variable.
let cachedToken = null;

let tokensPool = [];
try {
  // Priorizar pool de tokens pasado vía variable de entorno
  if (__ENV.K6_AUTH_HEADERS) {
    tokensPool = __ENV.K6_AUTH_HEADERS.split(',').map(t => t.trim());
  } else {
    // Desde src/api/auth.js, el archivo tokens.json en la raíz del proyecto está en '../../tokens.json'
    const content = open('../../tokens.json');
    tokensPool = JSON.parse(content);
  }
} catch (e) {
  // Silencioso. Si no existe, usamos el fallback de __ENV.
}

/**
 * Obtiene el token válido inyectado por el pipeline o wrapper externo.
 * REGINSA usa Punku (SSO web), por lo que el token no se puede obtener con un simple POST.
 * Se requiere inyectarlo previamente.
 * @returns {string} El token JWT
 */
export function getToken() {
  if (cachedToken) {
    return cachedToken;
  }

  let authHeader = '';

  // 1. Usar Pool de Tokens si existe (Escalado Multi-User / Multi-IP)
  if (tokensPool && tokensPool.length > 0) {
    const index = (vu.idInTest - 1) % tokensPool.length;
    authHeader = tokensPool[index];
  } 
  // 2. Fallback: Usar token inyectado en el entorno (Single User)
  else {
    authHeader = (__ENV.K6_AUTH_HEADER || __ENV.TOKEN1 || __ENV.TOKEN || '').trim();
  }


  
  if (!authHeader) {
    throw new Error(
      'No se detectó un token de autenticación en el entorno.\n' +
      'REGINSA utiliza un SSO (Punku) que requiere interacción de navegador, por lo que K6 no puede generar el token por sí solo.\n' +
      'Por favor, ejecuta el script utilizando el wrapper oficial:\n' +
      '  .\\scripts\\run-caso00-login.ps1\n' +
      'O define manualmente K6_AUTH_HEADER en el archivo .env.'
    );
  }

  // Normalizar a formato Bearer
  cachedToken = /^Bearer\s+/i.test(authHeader) ? authHeader : `Bearer ${authHeader}`;
  return cachedToken;
}

/**
 * Retorna las cabeceras de autenticación estándar
 */
export function getAuthHeaders() {
  const token = getToken();
  return {
    Authorization: token
  };
}
