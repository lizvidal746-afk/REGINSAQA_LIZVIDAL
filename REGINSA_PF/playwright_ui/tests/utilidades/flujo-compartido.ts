import { Page } from '@playwright/test';

/**
 * FLUJO COMPARTIDO: Infractor y Sanción
 * 
 * Función reutilizable que contiene el flujo base común a todos los tests:
 * 1. Login
 * 2. Navegación a Infractor y Sanción
 * 3. Abrir formulario (Agregar Administrado o Registrar Sanción)
 * 
 * Esto permite evitar redundancias y mantener un único punto de actualización
 * para cambios comunes a todos los casos de prueba.
 */

/**
 * Inicializa sesión y navega hasta el módulo de Infractor y Sanción
 * 
 * @param page - Objeto Playwright Page
 * @param usuario - Usuario para login (si no se envía, toma REGINSA_USER)
 * @param contraseña - Contraseña (si no se envía, toma REGINSA_PASS)
 * @returns boolean - true si fue exitoso
 */
export async function flujoInicialeInfractionSancion(
  page: Page,
  usuario: string = process.env.REGINSA_USER || '',
  contraseña: string = process.env.REGINSA_PASS || ''
): Promise<boolean> {
  try {
    console.log('🔄 Iniciando flujo compartido: Infractor y Sanción...\n');

    if (!usuario || !contraseña) {
      throw new Error('Faltan credenciales. Define REGINSA_USER y REGINSA_PASS.');
    }

    // PASO 1: Ir a home
    console.log('   1️⃣ Navegando a home...');
    await page.goto(process.env.REGINSA_URL || process.env.BASE_URL || 'https://example-reginsa.local/#/home');
    await page.getByRole('button', { name: 'Acceder Ahora' }).click();
    await page.waitForTimeout(500);

    // PASO 2: Login
    console.log('   2️⃣ Realizando login...');
    await page.getByRole('textbox', { name: 'Usuario' }).fill(usuario);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(contraseña);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    
    // Esperar aceptación de términos si aparece
    try {
      await page.getByRole('button', { name: 'Aceptar' }).click({ timeout: 3000 });
    } catch (e) {
      // No siempre aparece
    }
    
    await page.waitForTimeout(1500);

    // PASO 3: Navegar a Infractor y Sanción
    console.log('   3️⃣ Navegando a Infractor y Sanción...');
    const linkInfractor = page.getByRole('link', { name: /Infractor y Sanción/i });
    await linkInfractor.waitFor({ state: 'visible', timeout: 15000 });
    await linkInfractor.click({ timeout: 15000 });
    await page.waitForTimeout(1500);

    console.log('✅ Flujo inicial completado\n');
    return true;
  } catch (error) {
    console.error('❌ Error en flujo inicial:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Abre el formulario de Agregar Administrado
 * 
 * @param page - Objeto Playwright Page
 * @returns boolean - true si fue exitoso
 */
export async function abrirFormularioAgregarAdministrado(page: Page): Promise<boolean> {
  try {
    console.log('   📋 Abriendo formulario: Agregar Administrado...');
    
    // Buscar botón "Agregar" o similar
    const btnAgregar = page.getByRole('button').filter({ hasText: /Agregar|Nuevo/ }).first();
    await btnAgregar.waitFor({ state: 'visible', timeout: 15000 });
    await btnAgregar.click({ timeout: 15000 });
    await page.waitForTimeout(500);

    console.log('   ✅ Formulario abierto\n');
    return true;
  } catch (error) {
    console.error('   ❌ Error al abrir formulario:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Abre el formulario de Registrar Sanción
 * 
 * @param page - Objeto Playwright Page
 * @returns boolean - true si fue exitoso
 */
export async function abrirFormularioRegistrarSancion(page: Page): Promise<boolean> {
  try {
    console.log('   📋 Abriendo formulario: Registrar Sanción...');
    
    // Buscar botón "Registrar Sancionar" o similar
    const btnRegistrar = page.getByRole('button', { name: /Registrar Sanc|Registrar Sancionar/i });
    await btnRegistrar.waitFor({ state: 'visible', timeout: 15000 });
    await btnRegistrar.click({ timeout: 15000 });
    await page.waitForTimeout(1500);

    console.log('   ✅ Formulario abierto\n');
    return true;
  } catch (error) {
    console.error('   ❌ Error al abrir formulario:', error instanceof Error ? error.message : String(error));
    return false;
  }
}
