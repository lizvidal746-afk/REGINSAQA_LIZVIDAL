#!/usr/bin/env node

const DEFAULT_ENDPOINT = '/Auth/Login';

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function normalizePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_ENDPOINT;
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function normalizeBearer(value) {
  let token = String(value || '').trim();
  if (!token) return '';
  if (token.startsWith('<') && token.endsWith('>')) token = token.slice(1, -1);
  if (!/^Bearer\s+/i.test(token)) token = `Bearer ${token}`;
  return token;
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function pickCredentials() {
  const credentials = [];
  for (let i = 1; i <= 20; i++) {
    const user = String(process.env[`REGINSA_USER_${i}`] || '').trim();
    const pass = String(process.env[`REGINSA_PASS_${i}`] || '').trim();
    if (user && pass) credentials.push({ user, pass, slot: i });
  }

  if (credentials.length > 0) return credentials;

  const singleUser = String(process.env.REGINSA_USER || '').trim();
  const singlePass = String(process.env.REGINSA_PASS || '').trim();
  if (singleUser && singlePass) {
    return [{ user: singleUser, pass: singlePass, slot: 0 }];
  }

  return [];
}

function getTokenCandidate(data) {
  if (!data || typeof data !== 'object') return '';

  const explicitPath = String(process.env.REGINSA_AUTH_TOKEN_PATH || '').trim();
  if (explicitPath) {
    const parts = explicitPath.split('.').map((item) => item.trim()).filter(Boolean);
    let current = data;
    for (const part of parts) {
      if (!current || typeof current !== 'object' || !(part in current)) {
        current = '';
        break;
      }
      current = current[part];
    }
    const token = normalizeBearer(current);
    if (token) return token;
  }

  const queue = [data];
  const tokenKeys = ['token', 'accessToken', 'access_token', 'jwt', 'bearerToken', 'authToken'];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;

    for (const [key, value] of Object.entries(current)) {
      if (value && typeof value === 'object') {
        queue.push(value);
        continue;
      }
      if (tokenKeys.includes(key)) {
        const token = normalizeBearer(value);
        if (token) return token;
      }
    }
  }

  return '';
}

function buildPayload(user, pass) {
  const userField = String(process.env.REGINSA_AUTH_USER_FIELD || 'usuario').trim();
  const passField = String(process.env.REGINSA_AUTH_PASS_FIELD || 'contrasena').trim();

  const templates = [
    { [userField]: user, [passField]: pass },
    { usuario: user, contrasena: pass },
    { usuario: user, contraseña: pass },
    { username: user, password: pass },
    { email: user, password: pass }
  ];

  const unique = [];
  const seen = new Set();
  for (const item of templates) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

async function authenticateOne(baseUrl, endpoint, cred) {
  const timeoutMs = Number.parseInt(process.env.REGINSA_AUTH_TIMEOUT_MS || '20000', 10) || 20000;
  const target = /^https?:\/\//i.test(endpoint) ? endpoint : `${baseUrl}${endpoint}`;
  const attempts = buildPayload(cred.user, cred.pass);

  for (const payload of attempts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(target, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const bodyText = await response.text();
      const json = parseJsonSafe(bodyText);
      const token = getTokenCandidate(json);

      if (response.ok && token) {
        return { ok: true, token };
      }
    } catch {
      // continua con siguiente plantilla
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false, token: '' };
}

async function main() {
  const baseUrl = normalizeBaseUrl(process.env.REGINSA_API_BASE || process.env.BASE_URL);
  const endpoint = normalizePath(process.env.REGINSA_AUTH_ENDPOINT || process.env.K6_AUTH_LOGIN_ENDPOINT || DEFAULT_ENDPOINT);
  const credentials = pickCredentials();

  if (!baseUrl) {
    throw new Error('Falta REGINSA_API_BASE o BASE_URL para construir endpoint de login.');
  }

  if (credentials.length === 0) {
    throw new Error('No hay credenciales. Define REGINSA_USER/REGINSA_PASS o REGINSA_USER_n/REGINSA_PASS_n.');
  }

  const tokens = [];
  const strict = String(process.env.REGINSA_AUTH_STRICT || '0') === '1';
  for (const cred of credentials) {
    const result = await authenticateOne(baseUrl, endpoint, cred);
    if (result.ok && result.token) {
      tokens.push(result.token);
      continue;
    }

    if (strict) {
      throw new Error(`No se pudo autenticar credencial en slot ${cred.slot || 1}.`);
    }
  }

  if (tokens.length === 0) {
    throw new Error('No se pudo generar ningún token desde login API.');
  }

  const uniqueTokens = [...new Set(tokens)];
  process.stdout.write(uniqueTokens.join(';'));
}

main().catch((error) => {
  console.error(`[auth-bootstrap] ${error.message}`);
  process.exit(1);
});
