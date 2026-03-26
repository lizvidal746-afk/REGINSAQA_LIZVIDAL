import fs from 'node:fs';
import path from 'node:path';

type CaseState = {
  next: number;
  updatedAt: string;
};

type SequentialState = {
  runId: string;
  cases: Record<string, CaseState>;
  updatedAt: string;
};

type GlobalCounterState = {
  counters: Record<string, number>;
  updatedAt: string;
};

type GlobalCounterRunState = {
  runs: Record<string, { runId: string; value: number; updatedAt: string }>;
  updatedAt: string;
};

type CandidateReservationState = {
  runId: string;
  cases: Record<string, { keys: string[]; updatedAt: string }>;
  updatedAt: string;
};

type ExhaustedPagesState = {
  runId: string;
  cases: Record<string, { pages: number[]; updatedAt: string }>;
  updatedAt: string;
};

type AssignmentLogItem = {
  runId: string;
  caseId: string;
  ordinal: number;
  status: 'selected' | 'completed' | 'skipped' | 'failed';
  page?: number;
  row?: number;
  expediente?: string;
  resolucion?: string;
  workerIndex?: number;
  repeatIndex?: number;
  processed?: number;
  reason?: string;
  timestamp: string;
};

const reportesDir = path.resolve(process.cwd(), 'reportes');
const statePath = path.resolve(reportesDir, 'reconsideracion-sequential.json');
const logPath = path.resolve(reportesDir, 'reconsideracion-sequential-log.json');
const countersPath = path.resolve(reportesDir, 'reconsideracion-counters.json');
const countersRunStatePath = path.resolve(reportesDir, 'reconsideracion-counters-run-state.json');
const reservationsPath = path.resolve(reportesDir, 'reconsideracion-candidate-reservations.json');
const exhaustedPagesPath = path.resolve(reportesDir, 'reconsideracion-exhausted-pages.json');
const lockPath = path.resolve(reportesDir, 'reconsideracion-sequential.lock');

function ensureReportesDir(): void {
  if (!fs.existsSync(reportesDir)) {
    fs.mkdirSync(reportesDir, { recursive: true });
  }
}

function withFileLock<T>(targetLockPath: string, fn: () => T, timeoutMs = 15000, retryMs = 120): T {
  const start = Date.now();
  while (true) {
    try {
      const fd = fs.openSync(targetLockPath, 'wx');
      try {
        return fn();
      } finally {
        fs.closeSync(fd);
        fs.unlinkSync(targetLockPath);
      }
    } catch (error) {
      if (Date.now() - start > timeoutMs) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryMs);
    }
  }
}

function readState(): SequentialState {
  if (!fs.existsSync(statePath)) {
    return {
      runId: '',
      cases: {},
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    if (!raw.trim()) {
      return {
        runId: '',
        cases: {},
        updatedAt: new Date().toISOString(),
      };
    }

    const parsed = JSON.parse(raw) as SequentialState;
    return {
      runId: parsed.runId || '',
      cases: parsed.cases || {},
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      runId: '',
      cases: {},
      updatedAt: new Date().toISOString(),
    };
  }
}

function writeState(state: SequentialState): void {
  ensureReportesDir();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function readLog(): AssignmentLogItem[] {
  if (!fs.existsSync(logPath)) return [];
  try {
    const raw = fs.readFileSync(logPath, 'utf-8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AssignmentLogItem[]) : [];
  } catch {
    return [];
  }
}

function writeLog(entries: AssignmentLogItem[]): void {
  ensureReportesDir();
  fs.writeFileSync(logPath, JSON.stringify(entries, null, 2));
}

function readGlobalCounters(): GlobalCounterState {
  if (!fs.existsSync(countersPath)) {
    return {
      counters: {},
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const raw = fs.readFileSync(countersPath, 'utf-8');
    if (!raw.trim()) {
      return {
        counters: {},
        updatedAt: new Date().toISOString(),
      };
    }
    const parsed = JSON.parse(raw) as GlobalCounterState;
    return {
      counters: parsed.counters || {},
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      counters: {},
      updatedAt: new Date().toISOString(),
    };
  }
}

function writeGlobalCounters(state: GlobalCounterState): void {
  ensureReportesDir();
  fs.writeFileSync(countersPath, JSON.stringify(state, null, 2));
}

function readGlobalCounterRunState(): GlobalCounterRunState {
  if (!fs.existsSync(countersRunStatePath)) {
    return {
      runs: {},
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const raw = fs.readFileSync(countersRunStatePath, 'utf-8');
    if (!raw.trim()) {
      return {
        runs: {},
        updatedAt: new Date().toISOString(),
      };
    }
    const parsed = JSON.parse(raw) as GlobalCounterRunState;
    return {
      runs: parsed.runs || {},
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      runs: {},
      updatedAt: new Date().toISOString(),
    };
  }
}

function writeGlobalCounterRunState(state: GlobalCounterRunState): void {
  ensureReportesDir();
  fs.writeFileSync(countersRunStatePath, JSON.stringify(state, null, 2));
}

function readCandidateReservations(): CandidateReservationState {
  if (!fs.existsSync(reservationsPath)) {
    return {
      runId: '',
      cases: {},
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const raw = fs.readFileSync(reservationsPath, 'utf-8');
    if (!raw.trim()) {
      return {
        runId: '',
        cases: {},
        updatedAt: new Date().toISOString(),
      };
    }
    const parsed = JSON.parse(raw) as CandidateReservationState;
    return {
      runId: parsed.runId || '',
      cases: parsed.cases || {},
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      runId: '',
      cases: {},
      updatedAt: new Date().toISOString(),
    };
  }
}

function writeCandidateReservations(state: CandidateReservationState): void {
  ensureReportesDir();
  fs.writeFileSync(reservationsPath, JSON.stringify(state, null, 2));
}

function readExhaustedPages(): ExhaustedPagesState {
  if (!fs.existsSync(exhaustedPagesPath)) {
    return {
      runId: '',
      cases: {},
      updatedAt: new Date().toISOString(),
    };
  }

  try {
    const raw = fs.readFileSync(exhaustedPagesPath, 'utf-8');
    if (!raw.trim()) {
      return {
        runId: '',
        cases: {},
        updatedAt: new Date().toISOString(),
      };
    }
    const parsed = JSON.parse(raw) as ExhaustedPagesState;
    return {
      runId: parsed.runId || '',
      cases: parsed.cases || {},
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      runId: '',
      cases: {},
      updatedAt: new Date().toISOString(),
    };
  }
}

function writeExhaustedPages(state: ExhaustedPagesState): void {
  ensureReportesDir();
  fs.writeFileSync(exhaustedPagesPath, JSON.stringify(state, null, 2));
}

export function reservarOrdinalSecuencial(caseId: string, fallbackOrdinal: number): number {
  const runId = process.env.TEST_RUN_ID || '';
  if (!runId) {
    return fallbackOrdinal;
  }

  ensureReportesDir();

  return withFileLock<number>(lockPath, () => {
    let state = readState();

    if (state.runId !== runId) {
      state = {
        runId,
        cases: {},
        updatedAt: new Date().toISOString(),
      };
    }

    const current = state.cases[caseId]?.next ?? 0;
    state.cases[caseId] = {
      next: current + 1,
      updatedAt: new Date().toISOString(),
    };
    state.updatedAt = new Date().toISOString();

    writeState(state);
    return current;
  });
}

export function registrarAsignacionSecuencial(
  caseId: string,
  ordinal: number,
  data: Omit<AssignmentLogItem, 'runId' | 'caseId' | 'ordinal' | 'timestamp'>
): void {
  const runId = process.env.TEST_RUN_ID || '';
  if (!runId) return;

  ensureReportesDir();

  withFileLock<void>(lockPath, () => {
    const entries = readLog();
    entries.push({
      runId,
      caseId,
      ordinal,
      timestamp: new Date().toISOString(),
      ...data,
    });
    writeLog(entries);
  });
}

export function reservarConsecutivoGlobal(counterId: string, startValue = 1): number {
  const start = Number.isFinite(startValue) ? Math.max(1, Math.floor(startValue)) : 1;
  ensureReportesDir();

  return withFileLock<number>(lockPath, () => {
    const state = readGlobalCounters();
    const current = state.counters[counterId] ?? start;
    state.counters[counterId] = current + 1;
    state.updatedAt = new Date().toISOString();
    writeGlobalCounters(state);
    return current;
  });
}

export function reservarConsecutivoGlobalPorRun(counterId: string, runId: string, startValue = 1): number {
  const runKey = String(runId || '').trim();
  if (!runKey) {
    return reservarConsecutivoGlobal(counterId, startValue);
  }

  const start = Number.isFinite(startValue) ? Math.max(1, Math.floor(startValue)) : 1;
  ensureReportesDir();

  return withFileLock<number>(lockPath, () => {
    const counters = readGlobalCounters();
    const runs = readGlobalCounterRunState();

    const currentRun = runs.runs[counterId];
    if (currentRun && currentRun.runId === runKey && Number.isFinite(currentRun.value) && currentRun.value > 0) {
      return currentRun.value;
    }

    const nextValue = counters.counters[counterId] ?? start;
    counters.counters[counterId] = nextValue + 1;
    counters.updatedAt = new Date().toISOString();

    runs.runs[counterId] = {
      runId: runKey,
      value: nextValue,
      updatedAt: new Date().toISOString(),
    };
    runs.updatedAt = new Date().toISOString();

    writeGlobalCounters(counters);
    writeGlobalCounterRunState(runs);

    return nextValue;
  });
}

export function reservarClaveCandidato(caseId: string, key: string): boolean {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return false;

  const runId = String(process.env.TEST_RUN_ID || process.env.REGINSA_FUNC_RUN_ID || '').trim();
  ensureReportesDir();

  return withFileLock<boolean>(lockPath, () => {
    let state = readCandidateReservations();

    if (state.runId !== runId) {
      state = {
        runId,
        cases: {},
        updatedAt: new Date().toISOString(),
      };
    }

    const current = state.cases[caseId] || { keys: [], updatedAt: new Date().toISOString() };
    if (current.keys.includes(normalizedKey)) {
      return false;
    }

    current.keys.push(normalizedKey);
    current.updatedAt = new Date().toISOString();
    state.cases[caseId] = current;
    state.updatedAt = new Date().toISOString();
    writeCandidateReservations(state);
    return true;
  });
}

export type ReservaCandidatoResultado = 'ok' | 'duplicate' | 'limit' | 'invalid';

export function reservarClaveCandidatoConLimite(caseId: string, key: string, maxReservas: number): ReservaCandidatoResultado {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return 'invalid';

  const runId = String(process.env.TEST_RUN_ID || process.env.REGINSA_FUNC_RUN_ID || '').trim();
  ensureReportesDir();

  return withFileLock<ReservaCandidatoResultado>(lockPath, () => {
    let state = readCandidateReservations();

    if (state.runId !== runId) {
      state = {
        runId,
        cases: {},
        updatedAt: new Date().toISOString(),
      };
    }

    const current = state.cases[caseId] || { keys: [], updatedAt: new Date().toISOString() };
    if (current.keys.includes(normalizedKey)) {
      return 'duplicate';
    }

    const limite = Number.isFinite(maxReservas) ? Math.max(1, Math.floor(maxReservas)) : 1;
    if (current.keys.length >= limite) {
      return 'limit';
    }

    current.keys.push(normalizedKey);
    current.updatedAt = new Date().toISOString();
    state.cases[caseId] = current;
    state.updatedAt = new Date().toISOString();
    writeCandidateReservations(state);
    return 'ok';
  });
}

export function contarReservasCandidatos(caseId: string): number {
  const runId = String(process.env.TEST_RUN_ID || process.env.REGINSA_FUNC_RUN_ID || '').trim();
  ensureReportesDir();

  return withFileLock<number>(lockPath, () => {
    const state = readCandidateReservations();
    if (state.runId !== runId) return 0;
    const keys = state.cases[caseId]?.keys;
    return Array.isArray(keys) ? keys.length : 0;
  });
}

export function liberarClaveCandidato(caseId: string, key: string): void {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return;

  const runId = String(process.env.TEST_RUN_ID || process.env.REGINSA_FUNC_RUN_ID || '').trim();
  ensureReportesDir();

  withFileLock<void>(lockPath, () => {
    const state = readCandidateReservations();
    if (state.runId !== runId) return;

    const current = state.cases[caseId];
    if (!current || !Array.isArray(current.keys) || current.keys.length === 0) return;

    const nextKeys = current.keys.filter((k) => k !== normalizedKey);
    if (nextKeys.length === current.keys.length) return;

    state.cases[caseId] = {
      keys: nextKeys,
      updatedAt: new Date().toISOString(),
    };
    state.updatedAt = new Date().toISOString();
    writeCandidateReservations(state);
  });
}

export function marcarPaginaAgotada(caseId: string, page: number): void {
  const pageNumber = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 0;
  if (!pageNumber) return;

  const runId = String(process.env.TEST_RUN_ID || process.env.REGINSA_FUNC_RUN_ID || '').trim();
  if (!runId) return;

  ensureReportesDir();
  withFileLock<void>(lockPath, () => {
    let state = readExhaustedPages();
    if (state.runId !== runId) {
      state = {
        runId,
        cases: {},
        updatedAt: new Date().toISOString(),
      };
    }

    const current = state.cases[caseId] || { pages: [], updatedAt: new Date().toISOString() };
    if (!current.pages.includes(pageNumber)) {
      current.pages.push(pageNumber);
      current.pages.sort((a, b) => a - b);
      current.updatedAt = new Date().toISOString();
      state.cases[caseId] = current;
      state.updatedAt = new Date().toISOString();
      writeExhaustedPages(state);
    }
  });
}

export function esPaginaAgotada(caseId: string, page: number): boolean {
  const pageNumber = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 0;
  if (!pageNumber) return false;

  const runId = String(process.env.TEST_RUN_ID || process.env.REGINSA_FUNC_RUN_ID || '').trim();
  if (!runId) return false;

  ensureReportesDir();
  return withFileLock<boolean>(lockPath, () => {
    const state = readExhaustedPages();
    if (state.runId !== runId) return false;
    const pages = state.cases[caseId]?.pages;
    return Array.isArray(pages) && pages.includes(pageNumber);
  });
}
