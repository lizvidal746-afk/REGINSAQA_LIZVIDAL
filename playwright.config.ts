import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

const envWorkers = Number(process.env.REGINSA_WORKERS || '');
const envRetries = Number(process.env.REGINSA_PW_RETRIES || '');
const headlessEnv = String(process.env.REGINSA_HEADLESS || '1').toLowerCase();
const resolvedWorkers = Number.isFinite(envWorkers) && envWorkers > 0 ? envWorkers : (process.env.CI ? 2 : 1);
const resolvedRetries = Number.isFinite(envRetries) && envRetries >= 0 ? envRetries : (process.env.CI ? 2 : 0);
const resolvedHeadless = ['1', 'true', 'yes', 'on'].includes(headlessEnv);

const traceMode = (process.env.REGINSA_TRACE as 'on' | 'off' | 'on-first-retry' | 'on-all-retries' | 'retain-on-failure') || 'on-first-retry';
const screenshotMode = (process.env.REGINSA_SCREENSHOT as 'off' | 'on' | 'only-on-failure') || 'only-on-failure';
const videoMode = (process.env.REGINSA_VIDEO as 'off' | 'on' | 'retain-on-failure' | 'on-first-retry') || 'retain-on-failure';
const reporterMode = process.env.REGINSA_REPORTER_MODE || 'full';

const reporters: any[] = reporterMode === 'minimal'
  ? [
      ['line'],
      ['json', { outputFile: 'test-results/results.json' }]
    ]
  : [
      ['line'],
      ['html', { open: 'never', outputFolder: 'playwright-report' }],
      ['junit', { outputFile: 'test-results/junit.xml' }],
      ['json', { outputFile: 'test-results/results.json' }],
      ['allure-playwright', { outputFolder: 'allure-results', detail: true, suiteTitle: false }]
    ];

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: resolvedRetries,
  workers: resolvedWorkers,
  timeout: 120000,
  expect: { timeout: 15000 },
  globalSetup: './tests/global-setup.js',
  reporter: reporters,
  use: {
    baseURL: process.env.REGINSA_URL || process.env.BASE_URL || 'http://localhost:3000',
    headless: resolvedHeadless,
    trace: traceMode,
    screenshot: screenshotMode,
    video: videoMode,
    actionTimeout: 20000,
    navigationTimeout: 30000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
