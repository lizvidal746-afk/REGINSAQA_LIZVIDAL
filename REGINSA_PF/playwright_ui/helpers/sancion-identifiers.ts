import { buildPfRunSuffix, getPfRunLabel } from './pf-run-label';

export type SancionIdentifierOptions = {
  scenario: string;
  workerIndex: number;
  repeatIndex?: number;
  slot?: number;
};

function normalizeSegment(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 24);
}

export function buildSancionIdentifiers(
  expedienteBase: string,
  resolucionBase: string,
  options: SancionIdentifierOptions
): { numExpediente: string; numResolucion: string; runSuffix: string } {
  const runLabel = getPfRunLabel();
  const scenario = normalizeSegment(options.scenario || 'PF');
  const runSuffix = `${runLabel} ${scenario} ${buildPfRunSuffix(options.slot || options.workerIndex + 1, options.repeatIndex ?? 0)}`;

  return {
    numExpediente: `${runSuffix} ${expedienteBase}`,
    numResolucion: `${runSuffix} ${resolucionBase}`,
    runSuffix,
  };
}
