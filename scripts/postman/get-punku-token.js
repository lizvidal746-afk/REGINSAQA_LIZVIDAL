/**
 * get-punku-token.js
 *
 * Obtiene TOKEN_JWT de Punku mediante login web automatizado con Playwright.
 * Hace login en el navegador con usuario/contrasena, intercepta la respuesta
 * de GetTokenByCodeAndCodeChallenge y devuelve TOKEN_JWT por stdout.
 *
 * Uso:
 *   node scripts/postman/get-punku-token.js <usuario> <contrasena> [url_reginsa]
 *
 * Variables de entorno alternativas:
 *   REGINSA_USER_1    usuario QA
 *   REGINSA_PASS_1    contrasena QA
 *   REGINSA_BASE_URL  URL frontend REGINSA QA
 *
 * Salida: TOKEN_JWT en stdout (sin saltos de línea extra)
 * Errores: stderr + exit code 1 o 2
 */

'use strict';

const { chromium } = require('playwright');

const REGINSA_URL    = process.argv[4] || process.env.REGINSA_BASE_URL || 'https://reginsaqa.sunedu.gob.pe';
const PUNKU_PATTERN  = /GetTokenByCodeAndCodeChallenge/i;
const TIMEOUT_NAV    = 60000;
const TIMEOUT_TOKEN  = 30000;

const usuario    = process.argv[2] || process.env.REGINSA_USER_1 || '';
const contrasena = process.argv[3] || process.env.REGINSA_PASS_1 || '';

if (!usuario || !contrasena) {
  process.stderr.write(
    'ERROR: Proveer usuario y contrasena como argumentos:\n' +
    '  node get-punku-token.js <usuario> <contrasena>\n' +
    'O via variables de entorno: REGINSA_USER_1 / REGINSA_PASS_1\n'
  );
  process.exit(1);
}

(async () => {
  let tokenJwt = '';

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();

  // Interceptar respuesta de Punku para capturar TOKEN_JWT
  page.on('response', async (response) => {
    if (!PUNKU_PATTERN.test(response.url())) return;
    if (response.status() !== 200) return;
    try {
      const data = await response.json();
      if (data && data.TOKEN_JWT) {
        tokenJwt = data.TOKEN_JWT;
      }
    } catch (_) {
      // Si falla el parse, ignorar
    }
  });

  try {
    process.stderr.write(`[Playwright] Navegando a ${REGINSA_URL}\n`);
    await page.goto(REGINSA_URL, { timeout: TIMEOUT_NAV, waitUntil: 'domcontentloaded' });

    // Esperar carga inicial
    await page.waitForTimeout(2000);

    // Clic en "Acceder Ahora" si aparece (botón de entrada al SSO)
    try {
      const btnAcceder = page.getByRole('button', { name: /Acceder Ahora/i }).first();
      const visible = await btnAcceder.isVisible({ timeout: 5000 });
      if (visible) {
        process.stderr.write('[Playwright] Clic en "Acceder Ahora"\n');
        await btnAcceder.click();
        await page.waitForTimeout(2500);
      }
    } catch (_) {
      // No apareció el botón, puede que ya esté en el formulario
    }

    // Llenar campo Usuario
    process.stderr.write(`[Playwright] Llenando usuario: ${usuario}\n`);
    const inputUsuario = page.getByRole('textbox', { name: /^usuario$/i });
    await inputUsuario.waitFor({ state: 'visible', timeout: 15000 });
    await inputUsuario.fill(usuario);
    await page.waitForTimeout(400);

    // Llenar campo Contrasena
    const inputPass = page.getByRole('textbox', { name: /^contraseña$/i });
    await inputPass.waitFor({ state: 'visible', timeout: 10000 });
    await inputPass.fill(contrasena);
    await page.waitForTimeout(400);

    // Clic en "Iniciar sesión"
    process.stderr.write('[Playwright] Clic en "Iniciar sesión"\n');
    await page.getByRole('button', { name: /Iniciar sesión/i }).click();

    // Esperar hasta capturar token o timeout
    process.stderr.write('[Playwright] Esperando TOKEN_JWT de Punku...\n');
    const deadline = Date.now() + TIMEOUT_TOKEN;
    while (!tokenJwt && Date.now() < deadline) {
      await page.waitForTimeout(500);
    }

  } catch (err) {
    process.stderr.write(`[Playwright] Error durante login: ${err.message}\n`);
  } finally {
    await browser.close();
  }

  if (!tokenJwt) {
    process.stderr.write(
      'ERROR: No se pudo obtener TOKEN_JWT.\n' +
      '  - Verifica usuario/contrasena\n' +
      '  - Verifica que REGINSA_BASE_URL sea correcto: ' + REGINSA_URL + '\n' +
      '  - Si el sistema usa doble factor, este método no aplica\n'
    );
    process.exit(2);
  }

  // Escribir TOKEN_JWT a stdout (sin salto de línea extra para facilitar captura)
  process.stdout.write(tokenJwt);
  process.exit(0);
})();
