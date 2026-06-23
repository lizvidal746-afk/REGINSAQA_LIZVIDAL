import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ── Helpers ────────────────────────────────────────────────────────────────────
function getEnv(name: string, fallback = ''): string {
  return (process.env[name] || fallback).trim();
}

function collectUsers(): Array<{ index: number; user: string; pass: string }> {
  const users: Array<{ index: number; user: string; pass: string }> = [];
  const authSlots = Number.parseInt(process.env.REGINSA_AUTH_SLOTS || process.env.PLAYWRIGHT_WORKERS || '1', 10);
  const maxUsers = Number.isFinite(authSlots) && authSlots > 0 ? Math.min(authSlots, 50) : 1;
  for (let i = 1; i <= maxUsers; i++) {
    const user = getEnv(`REGINSA_USER_${i}`);
    const pass = getEnv(`REGINSA_PASS_${i}`);
    if (!user) break;
    users.push({ index: i, user, pass });
  }
  return users;
}

// ── Setup: autentica cada usuario y guarda storageState individual ─────────────
setup('Autenticación multi-usuario: generar storageState por slot', async ({ browser }) => {
  const baseUrl = getEnv('REGINSA_UI_BASE_URL', 'https://reginsaqa.sunedu.gob.pe');
  const authDir = path.join(__dirname, '../.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const users = collectUsers();
  if (users.length === 0) {
    // Fallback: intentar con usuario 1 hardcodeado para compatibilidad
    users.push({ index: 1, user: getEnv('REGINSA_USER_1', 'lizvidal'), pass: getEnv('REGINSA_PASS_1', 'QA1234511qa') });
  }

  console.log(`[Auth Setup] Autenticando ${users.length} usuario(s) segun REGINSA_AUTH_SLOTS/PLAYWRIGHT_WORKERS...`);
  setup.setTimeout(Math.max(120000, users.length * 90000));

  for (const { index, user, pass } of users) {
    const authFile = path.join(authDir, `user-${index}.json`);
    console.log(`[Auth Setup] Slot ${index}: ${user} → ${authFile}`);

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);

      // Botón de acceso al portal
      const btnAccederAhora = page.getByRole('button', { name: /Acceder Ahora/i }).first();
      if (await btnAccederAhora.isVisible({ timeout: 10000 })) {
        await btnAccederAhora.click();
        await page.waitForTimeout(3000);
      }

      // Usuario
      const inputUsuario = page.getByRole('textbox', { name: /usuario/i }).first()
        .or(page.locator('input[name="username"]').first())
        .or(page.locator('input[id="username"]').first())
        .or(page.locator('input[placeholder*="usuario" i]').first())
        .or(page.locator('input[type="text"]').first());
      await expect(inputUsuario).toBeVisible({ timeout: 15000 });
      await inputUsuario.fill(user);

      // Contraseña
      const inputContrasena = page.getByRole('textbox', { name: /contraseña/i }).first()
        .or(page.locator('input[type="password"]').first())
        .or(page.locator('input[name="password"]').first());
      await expect(inputContrasena).toBeVisible({ timeout: 10000 });
      await inputContrasena.fill(pass);

      // Iniciar sesión
      const btnIngresar = page.getByRole('button', { name: /Iniciar sesión/i }).first()
        .or(page.getByRole('button', { name: /Ingresar/i }).first())
        .or(page.getByRole('button', { name: /Acceder/i }).first())
        .or(page.locator('button[type="submit"]').first());
      await expect(btnIngresar).toBeVisible({ timeout: 5000 });
      await btnIngresar.click();

      // Esperar dashboard
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 });
      await expect(page).toHaveURL(/reginsaqa\.sunedu\.gob\.pe/i, { timeout: 60000 });

      // Guardar storageState individual
      await context.storageState({ path: authFile });
      console.log(`[Auth Setup] Slot ${index} (${user}) guardado en ${authFile}`);
    } finally {
      await context.close().catch(() => {});
    }
  }

  // Fallback backward-compatible: copiar user-1.json como user.json
  const primaryAuth = path.join(authDir, 'user-1.json');
  const fallbackAuth = path.join(authDir, 'user.json');
  if (fs.existsSync(primaryAuth)) {
    fs.copyFileSync(primaryAuth, fallbackAuth);
    console.log(`[Auth Setup] Fallback user.json actualizado desde user-1.json`);
  }

  console.log('[Auth Setup] Autenticación multi-usuario completada.');
});
