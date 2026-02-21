import { defineConfig, devices } from '@playwright/test';

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
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  globalSetup: './tests/global-setup.js',
  reporter: reporters,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
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
