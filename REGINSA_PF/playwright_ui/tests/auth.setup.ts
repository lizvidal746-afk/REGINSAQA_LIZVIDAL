import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const authFile = path.join(__dirname, '../.auth/user.json');

setup('Autenticación en Punku y guardar storageState', async ({ page }) => {
  const baseUrl = process.env.REGINSA_UI_BASE_URL || 'https://reginsaqa.sunedu.gob.pe';
  const usuario = process.env.REGINSA_USER_1 || 'lizvidal';
  const contrasena = process.env.REGINSA_PASS_1 || 'QA1234511qa';

  console.log(`[Auth Setup] Navegando a ${baseUrl}...`);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  // Esperar a que cargue la app y hacer clic en "Acceder Ahora"
  await page.waitForTimeout(4000);
  const btnAccederAhora = page.getByRole('button', { name: /Acceder Ahora/i }).first();
  if (await btnAccederAhora.isVisible({ timeout: 10000 })) {
    await btnAccederAhora.click();
    await page.waitForTimeout(3000);
  }

  // Llenar usuario
  console.log('[Auth Setup] Ingresando usuario...');
  const inputUsuario = page.getByRole('textbox', { name: /usuario/i }).first()
    .or(page.locator('input[name="username"]').first())
    .or(page.locator('input[id="username"]').first())
    .or(page.locator('input[placeholder*="usuario" i]').first())
    .or(page.locator('input[type="text"]').first());
  await expect(inputUsuario).toBeVisible({ timeout: 15000 });
  await inputUsuario.fill(usuario);

  // Llenar contraseña
  console.log('[Auth Setup] Ingresando contraseña...');
  const inputContrasena = page.getByRole('textbox', { name: /contraseña/i }).first()
    .or(page.locator('input[type="password"]').first())
    .or(page.locator('input[name="password"]').first());
  await expect(inputContrasena).toBeVisible({ timeout: 10000 });
  await inputContrasena.fill(contrasena);

  // Hacer clic en botón de inicio de sesión
  console.log('[Auth Setup] Iniciando sesión...');
  const btnIngresar = page.getByRole('button', { name: /Iniciar sesión/i }).first()
    .or(page.getByRole('button', { name: /Ingresar/i }).first())
    .or(page.getByRole('button', { name: /Acceder/i }).first())
    .or(page.locator('button[type="submit"]').first());
  await expect(btnIngresar).toBeVisible({ timeout: 5000 });
  await btnIngresar.click();

  // Esperar a que la sesión esté activa (navegación principal visible)
  console.log('[Auth Setup] Esperando dashboard...');
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 });
  
  // Validar que la sesión está activa
  await expect(page).toHaveURL(/reginsaqa\.sunedu\.gob\.pe/i, { timeout: 60000 });

  // Guardar storageState
  console.log('[Auth Setup] Guardando storageState en', authFile);
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  await page.context().storageState({ path: authFile });
  console.log('[Auth Setup] Autenticación completada exitosamente!');
});
