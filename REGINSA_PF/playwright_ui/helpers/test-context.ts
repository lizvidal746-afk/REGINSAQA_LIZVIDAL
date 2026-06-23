import type { TestInfo } from '@playwright/test';

export type ReginsaTestContext = {
  workerIndex: number;
  repeatIndex: number;
  repeatEach: number;
  workers: number;
  selectionSlot: number;
  isMassive: boolean;
};

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getTestContext(testInfo: TestInfo): ReginsaTestContext {
  const repeatIndex =
    (testInfo as TestInfo & { repeatEachIndex?: number; repeatIndex?: number }).repeatEachIndex ??
    (testInfo as TestInfo & { repeatIndex?: number }).repeatIndex ??
    0;
  const repeatEach = readPositiveInt(process.env.REGINSA_REPEAT_EACH, readPositiveInt(process.env.PLAYWRIGHT_REPEAT_EACH, 1));
  const workers = readPositiveInt(process.env.REGINSA_LOGICAL_WORKERS, readPositiveInt(process.env.PLAYWRIGHT_WORKERS, 1));
  const workerIndex = Number(testInfo.workerIndex ?? 0);
  const executionMode = String(process.env.REGINSA_EXECUTION_MODE || '').toLowerCase();

  return {
    workerIndex,
    repeatIndex,
    repeatEach,
    workers,
    selectionSlot: workerIndex * repeatEach + repeatIndex,
    isMassive: executionMode === 'fast' || executionMode === 'scale' || repeatEach > 1 || workers > 1
  };
}

