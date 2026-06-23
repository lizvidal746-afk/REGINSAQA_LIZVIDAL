function digits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export function getPfRunSequence(): string {
  const explicitSequence = digits(process.env.REGINSA_PF_RUN_SEQUENCE || process.env.PF_RUN_SEQUENCE || '');
  if (explicitSequence) return explicitSequence.padStart(2, '0').slice(-2);

  const seed = digits(process.env.REGINSA_FUNC_RUN_SEED || process.env.TEST_RUN_SEED || process.env.REGINSA_FUNC_RUN_ID || '');
  if (seed) return String((Number(seed.slice(-6)) % 99) + 1).padStart(2, '0');

  return '00';
}

export function getPfRunLabel(): string {
  const explicitLabel = String(process.env.REGINSA_PF_RUN_LABEL || process.env.PF_RUN_LABEL || '').trim();
  if (explicitLabel) return explicitLabel;
  return `PF ${getPfRunSequence()}`;
}

export function buildPfRunSuffix(slot: number, repeatIndex: number): string {
  return `W${String(slot).padStart(2, '0')}R${String(repeatIndex + 1).padStart(2, '0')}`;
}
