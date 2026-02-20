require('dotenv').config();
const { chromium } = require('@playwright/test');

const CREDENCIALES = {
  url: process.env.REGINSA_URL || process.env.BASE_URL || 'https://example-reginsa.local/#/home'
};

module.exports = async () => {
  // Usuarios/contraseñas se leen desde `.env` (REGINSA_USER/REGINSA_PASS o REGINSA_USER_1/REGINSA_PASS_1)
  const usuarioEnv = process.env.REGINSA_USER || process.env.REGINSA_USER_1;
  const contraseñaEnv = process.env.REGINSA_PASS || process.env.REGINSA_PASS_1;
  const credencialActiva = usuarioEnv && contraseñaEnv
    ? { usuario: usuarioEnv, contraseña: contraseñaEnv }
    : null;

  if (!credencialActiva) {
    throw new Error('Faltan credenciales. Define REGINSA_USER/REGINSA_PASS o REGINSA_USER_1/REGINSA_PASS_1 en variables de entorno o en .env (ver docs/plantillas/.env.example).');
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(CREDENCIALES.url);
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
