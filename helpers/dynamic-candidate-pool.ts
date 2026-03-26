import fs from 'node:fs';
import path from 'node:path';

export type DynamicCandidate = {
  key: string;
  expediente: string;
  resolucion: string;
  page?: number;
  row?: number;
};

type CandidateStatus = 'pending' | 'claimed' | 'done' | 'invalid';

type CandidateStateItem = DynamicCandidate & {
  status: CandidateStatus;
  attempts: number;
  updatedAt: string;
  leaseUntil?: string;
  claimedBy?: string;
  reason?: string;
};

type CasePoolState = {
  candidates: CandidateStateItem[];
  updatedAt: string;
};

type DynamicPoolState = {
  runId: string;
  cases: Record<string, CasePoolState>;
  updatedAt: string;
};

export type DynamicPoolStats = {
  total: number;
  pending: number;
  claimed: number;
  done: number;
  invalid: number;
};

const reportesDir = path.resolve(process.cwd(), 'reportes');
const statePath = path.resolve(reportesDir, 'dynamic-candidate-pool.json');
const lockPath = path.resolve(reportesDir, 'dynamic-candidate-pool.lock');

function ensureReportesDir(): void {
  if (!fs.existsSync(reportesDir)) {
    fs.mkdirSync(reportesDir, { recursive: true });
  }
}

function withFileLock<T>(fn: () => T, timeoutMs = 15000, retryMs = 120): T {
  const start = Date.now();
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      try {
        return fn();
      } finally {
        fs.closeSync(fd);
        fs.unlinkSync(lockPath);
      }
    } catch (error) {
      if (Date.now() - start > timeoutMs) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryMs);
    }
  }
}

function currentRunId(): string {
  return String(process.env.TEST_RUN_ID || process.env.REGINSA_FUNC_RUN_ID || '').trim();
}

function readState(): DynamicPoolState {
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
    const parsed = JSON.parse(raw) as DynamicPoolState;
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

function writeState(state: DynamicPoolState): void {
  ensureReportesDir();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function normalizeKey(value: string): string {
  return String(value || '').trim();
}

function releaseExpiredLeases(caseState: CasePoolState): void {
  const now = Date.now();
  for (const item of caseState.candidates) {
    if (item.status !== 'claimed' || !item.leaseUntil) continue;
    const leaseTime = new Date(item.leaseUntil).getTime();
    if (!Number.isFinite(leaseTime) || leaseTime <= now) {
      item.status = 'pending';
      item.claimedBy = undefined;
      item.leaseUntil = undefined;
      item.updatedAt = new Date().toISOString();
    }
  }
}

export function mergeDynamicCandidates(caseId: string, candidates: DynamicCandidate[]): number {
  const runId = currentRunId();
  if (!runId || !Array.isArray(candidates) || candidates.length === 0) return 0;

  ensureReportesDir();

  return withFileLock<number>(() => {
    let state = readState();
    if (state.runId !== runId) {
      state = {
        runId,
        cases: {},
        updatedAt: new Date().toISOString(),
      };
    }

    const caseState: CasePoolState = state.cases[caseId] || {
      candidates: [],
      updatedAt: new Date().toISOString(),
    };

    const known = new Set(caseState.candidates.map((c) => normalizeKey(c.key)));
    let added = 0;

    for (const c of candidates) {
      const key = normalizeKey(c.key);
      if (!key || known.has(key)) continue;
      known.add(key);
      caseState.candidates.push({
        ...c,
        key,
        status: 'pending',
        attempts: 0,
        updatedAt: new Date().toISOString(),
      });
      added++;
    }

    caseState.updatedAt = new Date().toISOString();
    state.cases[caseId] = caseState;
    state.updatedAt = new Date().toISOString();
    writeState(state);
    return added;
  });
}

export function claimNextDynamicCandidate(caseId: string, consumerId: string, leaseMs = 45000): DynamicCandidate | null {
  const runId = currentRunId();
  if (!runId) return null;

  ensureReportesDir();

  return withFileLock<DynamicCandidate | null>(() => {
    const state = readState();
    if (state.runId !== runId) return null;

    const caseState = state.cases[caseId];
    if (!caseState) return null;

    releaseExpiredLeases(caseState);

    const item = caseState.candidates.find((c) => c.status === 'pending');
    if (!item) {
      writeState(state);
      return null;
    }

    item.status = 'claimed';
    item.attempts += 1;
    item.claimedBy = consumerId;
    item.leaseUntil = new Date(Date.now() + Math.max(5000, leaseMs)).toISOString();
    item.updatedAt = new Date().toISOString();

    caseState.updatedAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();
    writeState(state);

    return {
      key: item.key,
      expediente: item.expediente,
      resolucion: item.resolucion,
      page: item.page,
      row: item.row,
    };
  });
}

export function completeDynamicCandidate(caseId: string, key: string): void {
  const runId = currentRunId();
  if (!runId) return;

  ensureReportesDir();

  withFileLock<void>(() => {
    const state = readState();
    if (state.runId !== runId) return;

    const caseState = state.cases[caseId];
    if (!caseState) return;

    const normalized = normalizeKey(key);
    const item = caseState.candidates.find((c) => c.key === normalized);
    if (!item) return;

    item.status = 'done';
    item.leaseUntil = undefined;
    item.claimedBy = undefined;
    item.reason = undefined;
    item.updatedAt = new Date().toISOString();

    caseState.updatedAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();
    writeState(state);
  });
}

export function invalidateDynamicCandidate(caseId: string, key: string, reason: string): void {
  const runId = currentRunId();
  if (!runId) return;

  ensureReportesDir();

  withFileLock<void>(() => {
    const state = readState();
    if (state.runId !== runId) return;

    const caseState = state.cases[caseId];
    if (!caseState) return;

    const normalized = normalizeKey(key);
    const item = caseState.candidates.find((c) => c.key === normalized);
    if (!item) return;

    item.status = 'invalid';
    item.reason = String(reason || 'invalid');
    item.leaseUntil = undefined;
    item.claimedBy = undefined;
    item.updatedAt = new Date().toISOString();

    caseState.updatedAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();
    writeState(state);
  });
}

export function getDynamicPoolStats(caseId: string): DynamicPoolStats {
  const runId = currentRunId();
  if (!runId) {
    return { total: 0, pending: 0, claimed: 0, done: 0, invalid: 0 };
  }

  ensureReportesDir();

  return withFileLock<DynamicPoolStats>(() => {
    const state = readState();
    if (state.runId !== runId) {
      return { total: 0, pending: 0, claimed: 0, done: 0, invalid: 0 };
    }

    const caseState = state.cases[caseId];
    if (!caseState) {
      return { total: 0, pending: 0, claimed: 0, done: 0, invalid: 0 };
    }

    releaseExpiredLeases(caseState);
    writeState(state);

    const total = caseState.candidates.length;
    const pending = caseState.candidates.filter((c) => c.status === 'pending').length;
    const claimed = caseState.candidates.filter((c) => c.status === 'claimed').length;
    const done = caseState.candidates.filter((c) => c.status === 'done').length;
    const invalid = caseState.candidates.filter((c) => c.status === 'invalid').length;

    return { total, pending, claimed, done, invalid };
  });
}
