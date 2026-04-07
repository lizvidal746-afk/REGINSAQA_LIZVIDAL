import { defineConfig, devices } from '@playwright/test';

/**
 * NOTA: Playwright Component Testing (CT) para Angular NO esta soportado.
 *
 * El paquete @playwright/experimental-ct-angular no existe en npm.
 * Playwright CT solo soporta: React, Vue, Svelte, Solid.
 *
 * Los tests en tests/component/ estan DESHABILITADOS (test.describe.skip).
 * La cobertura equivalente esta cubierta por los tests E2E en tests/casos-prueba/:
 *   - reconsideracion-checkbox → test:03 y test:04
 *   - sancion-form             → test:02 y test:04
 *
 * Este archivo se mantiene como referencia historica.
 */
export default defineConfig({
  testDir: './tests/component',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reportes/playwright-ct', open: 'never' }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    baseURL: process.env.REGINSA_URL || 'http://localhost:3000',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

