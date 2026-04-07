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
const TIMEOUT_TOKEN  = 45000;

// Espera inicial hasta que la app cargue el boton de acceso (ms)
const WAIT_APP_LOAD  = 4000;

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

  // Captura lo que se muestra en pantalla (util para diagnostico si falla)
  async function saveDebugScreenshot(label) {
    try {
      const p = require('path');
      const fs = require('fs');
      const dir = p.join(__dirname, '..', '..', 'reportes', 'logs');
      fs.mkdirSync(dir, { recursive: true });
      const file = p.join(dir, `punku-debug-${label}-${Date.now()}.png`);
      await page.screenshot({ path: file, fullPage: true });
      process.stderr.write(`[Playwright] Screenshot guardado: ${file}\n`);
    } catch (_) {}
  }

  // Intentar encontrar un input usando multiples selectores en orden
  async function findInput(strategies, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const fn of strategies) {
        try {
          const loc = fn();
          if (await loc.isVisible({ timeout: 500 })) return loc;
        } catch (_) {}
      }
      await page.waitForTimeout(300);
    }
    return null;
  }

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

    // Esperar carga inicial de la app Angular
    await page.waitForTimeout(WAIT_APP_LOAD);

    // Intentar clic en boton de entrada al SSO — multiples nombres posibles
    const loginBtnStrategies = [
      /Acceder Ahora/i,
      /Ingresar/i,
      /Iniciar Sesion/i,
      /Acceder/i,
      /Login/i,
    ];
    let btnClicked = false;
    for (const namePattern of loginBtnStrategies) {
      try {
        const btn = page.getByRole('button', { name: namePattern }).first();
        if (await btn.isVisible({ timeout: 3000 })) {
          process.stderr.write(`[Playwright] Clic en boton "${namePattern.source}"\n`);
          await btn.click();
          await page.waitForTimeout(3000);
          btnClicked = true;
          break;
        }
      } catch (_) {}
      // Tambien probar como link
      try {
        const lnk = page.getByRole('link', { name: namePattern }).first();
        if (await lnk.isVisible({ timeout: 1000 })) {
          process.stderr.write(`[Playwright] Clic en link "${namePattern.source}"\n`);
          await lnk.click();
          await page.waitForTimeout(3000);
          btnClicked = true;
          break;
        }
      } catch (_) {}
    }
    if (!btnClicked) {
      process.stderr.write('[Playwright] Boton de acceso no encontrado — intentando directo en el formulario\n');
    }

    // Buscar campo usuario con multiples estrategias
    process.stderr.write(`[Playwright] Buscando campo usuario en: ${page.url()}\n`);
    const usuarioStrategies = [
      () => page.getByRole('textbox', { name: /^usuario$/i }),
      () => page.locator('input[name="username"]'),
      () => page.locator('input[id="username"]'),
      () => page.locator('input[autocomplete="username"]'),
      () => page.locator('input[placeholder*="suario" i]'),
      () => page.locator('input[placeholder*="user" i]'),
      () => page.locator('input[type="text"]').first(),
    ];

    const inputUsuario = await findInput(usuarioStrategies, 15000);
    if (!inputUsuario) {
      await saveDebugScreenshot('no-usuario-field');
      throw new Error('No se encontro el campo de usuario en la pagina de login. Ver screenshot en reportes/logs/');
    }

    process.stderr.write(`[Playwright] Llenando usuario: ${usuario}\n`);
    await inputUsuario.fill(usuario);
    await page.waitForTimeout(400);

    // Buscar campo contrasena con multiples estrategias
    const passStrategies = [
      () => page.getByRole('textbox', { name: /^contrase/i }),
      () => page.locator('input[type="password"]').first(),
      () => page.locator('input[name="password"]'),
      () => page.locator('input[id="password"]'),
      () => page.locator('input[autocomplete="current-password"]'),
    ];

    const inputPass = await findInput(passStrategies, 8000);
    if (!inputPass) {
      await saveDebugScreenshot('no-password-field');
      throw new Error('No se encontro el campo de contrasena en la pagina de login.');
    }

    await inputPass.fill(contrasena);
    await page.waitForTimeout(400);

    // Clic en submit — multiples estrategias
    process.stderr.write('[Playwright] Enviando formulario de login...\n');
    const submitStrategies = [
      () => page.getByRole('button', { name: /Iniciar sesi/i }).first(),
      () => page.getByRole('button', { name: /Ingresar/i }).first(),
      () => page.getByRole('button', { name: /Acceder/i }).first(),
      () => page.getByRole('button', { name: /Login/i }).first(),
      () => page.locator('input[type="submit"]').first(),
      () => page.locator('button[type="submit"]').first(),
    ];
    let submitted = false;
    for (const fn of submitStrategies) {
      try {
        const btn = fn();
        if (await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          submitted = true;
          break;
        }
      } catch (_) {}
    }
    if (!submitted) {
      // Fallback: Enter en el campo de contrasena
      process.stderr.write('[Playwright] Boton submit no encontrado — usando Enter\n');
      await inputPass.press('Enter');
    }

    // Esperar hasta capturar token o timeout
    process.stderr.write('[Playwright] Esperando TOKEN_JWT de Punku...\n');
    const deadline = Date.now() + TIMEOUT_TOKEN;
    while (!tokenJwt && Date.now() < deadline) {
      await page.waitForTimeout(500);
    }

    if (!tokenJwt) {
      await saveDebugScreenshot('no-token-captured');
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
