// src/data/usuarios.js
// Gestor de pool de usuarios de prueba

const credentialsPool = [];

// Inicializar el pool leyendo desde las variables de entorno
for (let i = 1; i <= 20; i++) {
  const user = __ENV[`REGINSA_USER_${i}`];
  const pass = __ENV[`REGINSA_PASS_${i}`];
  if (user && pass) {
    credentialsPool.push({ user: user.trim(), pass: pass.trim(), id: i });
  }
}

// Fallback por si usan REGINSA_USER singular
if (credentialsPool.length === 0) {
  const user = __ENV.REGINSA_USER;
  const pass = __ENV.REGINSA_PASS;
  if (user && pass) {
    credentialsPool.push({ user: user.trim(), pass: pass.trim(), id: 0 });
  }
}

let currentIndex = 0;

export function getNextCredentials() {
  if (credentialsPool.length === 0) {
    throw new Error('No hay credenciales configuradas en el entorno (REGINSA_USER_X)');
  }
  const creds = credentialsPool[currentIndex % credentialsPool.length];
  currentIndex++;
  return creds;
}

export function getAllCredentials() {
  return credentialsPool;
}
