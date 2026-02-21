require('dotenv').config();
const { chromium } = require('@playwright/test');
const dns = require('dns').promises;

const CREDENCIALES = {
  url: process.env.REGINSA_URL || process.env.BASE_URL || 'https://example-reginsa.local/#/home'
};

module.exports = async () => {
  // Acepta REGINSA_USER/REGINSA_PASS y también REGINSA_USER_1..8 / REGINSA_PASS_1..8
  const candidatos = [{ usuario: process.env.REGINSA_USER, contraseña: process.env.REGINSA_PASS, origen: 'REGINSA_USER/REGINSA_PASS' }];
  for (let i = 1; i <= 8; i++) {
    candidatos.push({
      usuario: process.env[`REGINSA_USER_${i}`],
      contraseña: process.env[`REGINSA_PASS_${i}`],
      origen: `REGINSA_USER_${i}/REGINSA_PASS_${i}`
    });
  }

  const credencialActiva = candidatos.find((item) => item.usuario && item.contraseña) || null;

  if (!credencialActiva) {
    throw new Error('Faltan credenciales. Define al menos un par válido: REGINSA_USER/REGINSA_PASS o REGINSA_USER_n/REGINSA_PASS_n (n=1..8) en Secrets de GitHub o .env.');
  }

  console.log(`[global-setup] Credencial activa detectada desde ${credencialActiva.origen}`);

  const urlNormalizada = String(CREDENCIALES.url || '').trim();
  if (!urlNormalizada) {
    throw new Error('REGINSA_URL/BASE_URL está vacío. Define una URL válida en Secrets.');
  }

  const urlConProtocolo = /^https?:\/\//i.test(urlNormalizada)
    ? urlNormalizada
    : `https://${urlNormalizada}`;

  let hostname;
  try {
    hostname = new URL(urlConProtocolo).hostname;
  } catch {
    throw new Error(`URL inválida en REGINSA_URL: "${urlNormalizada}"`);
  }

  try {
    await dns.lookup(hostname);
  } catch {
    throw new Error(`No se pudo resolver el dominio "${hostname}" desde el runner. Verifica REGINSA_URL o usa un runner self-hosted con acceso a red/VPN institucional.`);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(urlConProtocolo);
  const btnAcceder = page.getByRole('button', { name: 'Acceder Ahora' });
  await btnAcceder.click();

  const inputUsuario = page.getByRole('textbox', { name: 'Usuario' });
  await inputUsuario.waitFor({ state: 'visible', timeout: 30000 });
  await inputUsuario.fill(credencialActiva.usuario);

  const inputContraseña = page.getByRole('textbox', { name: 'Contraseña' });
  await inputContraseña.fill(credencialActiva.contraseña);

  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  // Esperar a que el menú esté disponible para asegurar sesión válida
  await page.getByRole('link').first().waitFor({ state: 'visible', timeout: 30000 });

  await page.context().storageState({ path: 'storageState.json' });
  await browser.close();
};
