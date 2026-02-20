import type { TestInfo } from '@playwright/test';

export type TestContext = {
  workerIndex: number;
  repeatIndex: number;
  repeatEach: number;
  workers: number;
  isMassive: boolean;
  selectionSlot: number;
};

export function getTestContext(testInfo: TestInfo): TestContext {
  const workerIndex = testInfo.workerIndex ?? 0;
  const repeatIndex = (testInfo as { repeatEachIndex?: number }).repeatEachIndex ?? 0;
  const repeatEach =
    (testInfo as { repeatEach?: number }).repeatEach ??
    (testInfo as { config?: { repeatEach?: number } }).config?.repeatEach ??
    (testInfo as { project?: { repeatEach?: number } }).project?.repeatEach ??
    1;
  const workers = (testInfo.config?.workers as number | undefined) ?? 1;
  const isMassive = repeatEach > 1 || repeatIndex > 0;
  const selectionSlot = workerIndex + repeatIndex * workers;

  return {
    workerIndex,
    repeatIndex,
    repeatEach,
    workers,
    isMassive,
    selectionSlot,
  };
}
