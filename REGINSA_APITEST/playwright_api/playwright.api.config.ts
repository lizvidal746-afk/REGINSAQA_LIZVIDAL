import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import N8nWebhookReporter from './utils/n8n-webhook-reporter';

// Cargar variables de entorno desde la raíz del módulo y la raíz del proyecto
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Las llamadas de API secuenciales son más estables para evitar rate limits
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Ejecución secuencial para no colisionar con bases de datos ni tokens de Punku
  reporter: [
    ['html', { outputFolder: '../playwright-report', open: 'never' }],
    ['json', { outputFile: '../playwright-report/results.json' }],
    ['list'],
    ['./utils/n8n-webhook-reporter.ts']
  ],
  globalSetup: require.resolve('./utils/global-setup'),
  use: {
    baseURL: process.env.REGINSA_API_BASE_URL || 'https://reginsaapiqa.sunedu.gob.pe/api',
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  },
  projects: [
    {
      name: 'api-smoke',
      testMatch: /.*\.smoke\.spec\.ts/,
    },
    {
      name: 'api-regression',
      testMatch: /.*\.regression\.spec\.ts/,
    }
  ],
});
