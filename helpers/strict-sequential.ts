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
