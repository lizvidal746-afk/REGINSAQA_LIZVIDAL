import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });


const executionMode = String(process.env.REGINSA_EXECUTION_MODE || '').toLowerCase();
const fastEvidenceMode =
  process.env.SKIP_SCREENSHOTS === '1' ||
  executionMode === 'fast' ||
  executionMode === 'scale';
const projectRoot = path.resolve(__dirname, '..');
const defaultTechnicalReportsDir = path.resolve(projectRoot, 'reportes', '_technical');
const playwrightReportDir =
  process.env.REGINSA_PLAYWRIGHT_REPORT_DIR ||
  path.resolve(defaultTechnicalReportsDir, 'playwright-report');
const allureResultsDir =
  process.env.REGINSA_ALLURE_RESULTS_DIR ||
  path.resolve(defaultTechnicalReportsDir, 'allure-results');

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 9, // 1 worker por usuario
  timeout: 120000, // 2 minutos de timeout por test
  expect: {
    timeout: 30000 // 30 segundos para assertions
  },
  use: {
    baseURL: process.env.REGINSA_UI_BASE_URL || 'https://reginsaqa.sunedu.gob.pe',
    trace: 'retain-on-failure',
    screenshot: fastEvidenceMode ? 'only-on-failure' : 'on',
    video: fastEvidenceMode ? 'retain-on-failure' : 'on',
    ignoreHTTPSErrors: true,
    viewport: { width: 1920, height: 1080 }
  },
  reporter: [
    ['html', { outputFolder: playwrightReportDir, open: 'never' }],
    ['json', { outputFile: path.resolve(playwrightReportDir, 'results.json') }],
    ['allure-playwright', { resultsDir: allureResultsDir }],
    ['list']
  ],
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'ui-smoke',
      dependencies: ['setup'],
      testMatch: /.*\.smoke\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'ui-regression',
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts/,
      testIgnore: [
        /.*\.smoke\.spec\.ts/,
        /.*auth\.setup\.ts/,
        /.*legacy_tests.*/,
        /.*utilidades.*\.spec\.ts/,
      ],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
    {
      name: 'ui-legacy',
      testMatch: /.*legacy_tests.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'ui-diagnostics',
      dependencies: ['setup'],
      testMatch: /.*utilidades.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
  ],
});
