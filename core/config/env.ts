import 'dotenv/config';

export interface ReginsaEnv {
  baseUrl: string;
  apiUrl: string;
  headless: boolean;
  workers: number;
  retries: number;
  scaleMode: boolean;
  strictVerify: boolean;
}

const parseBool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const parseIntOr = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const env: ReginsaEnv = {
  baseUrl: process.env.REGINSA_URL || process.env.BASE_URL || '',
  apiUrl: process.env.REGINSA_API_URL || '',
  headless: parseBool(process.env.REGINSA_HEADLESS, true),
  workers: parseIntOr(process.env.REGINSA_WORKERS, 1),
  retries: parseIntOr(process.env.REGINSA_PW_RETRIES, 0),
  scaleMode: parseBool(process.env.REGINSA_SCALE_MODE, false),
  strictVerify: parseBool(process.env.REGINSA_STRICT_VERIFY, true)
};

export const ensureEnv = (): void => {
  if (!env.baseUrl) {
    throw new Error('Falta REGINSA_URL o BASE_URL en el entorno.');
  }
};
