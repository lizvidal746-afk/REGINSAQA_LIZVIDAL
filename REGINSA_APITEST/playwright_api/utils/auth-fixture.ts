import { test as base } from '@playwright/test';

// Extender el fixture base de Playwright
export const test = base.extend({
  request: async ({ playwright }, use) => {
    const token = process.env.PUNKU_JWT || '';
    
    // Crear un contexto de request personalizado inyectando el token JWT de Punku
    const context = await playwright.request.newContext({
      extraHTTPHeaders: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    // Pasar el contexto de request autenticado al test
    await use(context);

    // Limpiar/Cerrar el contexto después del test
    await context.dispose();
  }
});

export { expect } from '@playwright/test';
