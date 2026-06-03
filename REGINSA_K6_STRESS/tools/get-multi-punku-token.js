const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const scriptPath = path.join(__dirname, '../../scripts/postman/get-punku-token.js');
const frontendUrl = process.env.REGINSA_BASE_URL || 'https://reginsaqa.sunedu.gob.pe';
const tokensPath = path.join(__dirname, '../tokens.json');

function isTokenValid(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString();
    const payload = JSON.parse(jsonPayload);
    const exp = payload.exp;
    if (!exp) return false;
    const now = Math.floor(Date.now() / 1000);
    return exp > (now + 300); // Válido si le quedan más de 5 minutos
  } catch (e) {
    return false;
  }
}

// 1. Verificar si los tokens existentes siguen siendo válidos para evitar ejecuciones lentas de Playwright
if (fs.existsSync(tokensPath)) {
  try {
    const existingTokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
    if (Array.isArray(existingTokens) && existingTokens.length >= 9) {
      let allValid = true;
      for (const t of existingTokens) {
        if (!isTokenValid(t)) {
          allValid = false;
          break;
        }
      }
      if (allValid) {
        console.log('\x1b[32m[MULTI-TOKEN] Los tokens de tokens.json siguen siendo válidos. Saltando Playwright.\x1b[0m');
        process.exit(0);
      }
    }
  } catch (e) {
    // Ignorar y continuar
  }
}

console.log('\x1b[36m[MULTI-TOKEN] Iniciando obtención de tokens en PARALELO para 9 usuarios...\x1b[0m');

const promises = [];

for (let i = 1; i <= 9; i++) {
  const user = process.env[`REGINSA_USER_${i}`];
  const pass = process.env[`REGINSA_PASS_${i}`];

  if (!user || !pass) {
    console.warn(`\x1b[33m[MULTI-TOKEN] Faltan credenciales para el slot ${i}. Saltando...\x1b[0m`);
    continue;
  }

  promises.push(new Promise((resolve) => {
    console.log(`\x1b[36m[MULTI-TOKEN] (${i}/9) Iniciando obtención para ${user}...\x1b[0m`);
    exec(`node "${scriptPath}" "${user}" "${pass}" "${frontendUrl}"`, (error, stdout, stderr) => {
      const token = stdout.toString().trim();
      if (token) {
        console.log(`\x1b[32m[MULTI-TOKEN] Token JWT obtenido para ${user}.\x1b[0m`);
        resolve({ index: i, token });
      } else {
        console.error(`\x1b[31m[MULTI-TOKEN] Error al obtener token para ${user}.\x1b[0m`);
        resolve({ index: i, token: null });
      }
    });
  }));
}

Promise.all(promises).then((results) => {
  // Ordenar resultados según el slot del usuario
  results.sort((a, b) => a.index - b.index);
  const finalTokens = results.map(r => r.token).filter(Boolean);

  if (finalTokens.length > 0) {
    fs.writeFileSync(tokensPath, JSON.stringify(finalTokens, null, 2));
    console.log(`\x1b[32m[MULTI-TOKEN] Éxito: Se guardaron ${finalTokens.length} tokens en tokens.json\x1b[0m`);
    process.exit(0);
  } else {
    console.error('\x1b[31m[MULTI-TOKEN] Error crítico: No se pudo obtener ningún token.\x1b[0m');
    process.exit(1);
  }
});
