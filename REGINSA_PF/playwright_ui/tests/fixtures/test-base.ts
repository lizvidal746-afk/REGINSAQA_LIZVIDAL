/**
 * tests/fixtures/test-base.ts
 *
 * Fixture base para REGINSA_PF que selecciona dinámicamente el storageState
 * correcto por worker, usando el patrón "una cuenta por worker".
 *
 * Uso en specs:
 *   import { test, expect } from '../fixtures/test-base';
 */
import { test as baseTest } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

function resolveFunctionalSlot(testInfo: { workerIndex: number; parallelIndex: number; repeatEachIndex?: number }): number {
  const physicalWorkerIndex = testInfo.parallelIndex ?? testInfo.workerIndex;
  const physicalRepeatIndex = testInfo.repeatEachIndex ?? 0;
  const workers = readPositiveIntEnv('REGINSA_LOGICAL_WORKERS', readPositiveIntEnv('PLAYWRIGHT_WORKERS', 1));
  const repeatEach = readPositiveIntEnv('REGINSA_REPEAT_EACH', 1);
  const playwrightRepeatEach = readPositiveIntEnv('PLAYWRIGHT_REPEAT_EACH', repeatEach);
  const usesFunctionalDistribution = workers > 1 && playwrightRepeatEach >= workers;

  if (!usesFunctionalDistribution) return physicalWorkerIndex + 1;
  return (physicalRepeatIndex % workers) + 1;
}

export const test = baseTest.extend({
  storageState: async ({}, use, testInfo) => {
    const userIndex = resolveFunctionalSlot(testInfo);
    const authDir = path.join(__dirname, '../../.auth');
    const specificAuth = path.join(authDir, `user-${userIndex}.json`);
    const fallbackAuth = path.join(authDir, 'user.json');

    const finalPath = fs.existsSync(specificAuth) ? specificAuth : fallbackAuth;
    await use(finalPath);
  },
});

export { expect } from '@playwright/test';

