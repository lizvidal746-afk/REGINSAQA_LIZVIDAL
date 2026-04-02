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
  const repeatFromEnv = Number(process.env.REGINSA_REPEAT_EACH || process.env.PLAYWRIGHT_REPEAT_EACH || '0');
  const repeatFromArg = (() => {
    const arg = process.argv.find((a) => a.startsWith('--repeat-each='));
    if (!arg) return 0;
    const parsed = Number(arg.split('=')[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  })();
  const repeatEach =
    (repeatFromEnv > 0 ? repeatFromEnv : undefined) ??
    (repeatFromArg > 0 ? repeatFromArg : undefined) ??
    (testInfo as { repeatEach?: number }).repeatEach ??
    (testInfo as { config?: { repeatEach?: number } }).config?.repeatEach ??
    (testInfo as { project?: { repeatEach?: number } }).project?.repeatEach ??
    1;
  const workers = (testInfo.config?.workers as number | undefined) ?? 1;
  const isMassive = repeatEach > 1 || repeatIndex > 0;
  // Slot estable por repeatIndex para mantener selección consecutiva sin saltos.
  const selectionSlot = repeatIndex;

  return {
    workerIndex,
    repeatIndex,
    repeatEach,
    workers,
    isMassive,
    selectionSlot,
  };
}
