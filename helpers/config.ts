/**
 * Configuración centralizada del framework REGINSA QA.
 * Importar: import { config } from '../helpers/config';
 */
import 'dotenv/config';
import path from 'path';

const parseBool = (v: string | undefined, fallback = false): boolean => {
  if (!v) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
};

const parseInt = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const config = {
  // Rutas
  projectRoot: path.resolve(__dirname, '..'),
  testsDir: path.resolve(__dirname, '..', 'tests'),
  reportesDir: path.resolve(__dirname, '..', 'reportes'),
  apiTestDir: path.resolve(__dirname, '..', 'API_TEST', 'postman'),
  scriptsDir: path.resolve(__dirname, '..', 'scripts'),

  // URLs
  baseUrl: process.env.REGINSA_URL || process.env.BASE_URL || 'https://reginsaqa.sunedu.gob.pe',
  apiUrl: process.env.REGINSA_API_URL || 'https://reginsaapiqa.sunedu.gob.pe/api',

  // Playwright
  headless: parseBool(process.env.REGINSA_HEADLESS, true),
  workers: parseInt(process.env.REGINSA_WORKERS, 1),
  retries: parseInt(process.env.REGINSA_PW_RETRIES, 0),
  scaleMode: parseBool(process.env.REGINSA_SCALE_MODE, false),
  strictVerify: parseBool(process.env.REGINSA_STRICT_VERIFY, true),
  targetRegistros: parseInt(process.env.REGINSA_TARGET_REGISTROS, 10),

  // k6
  k6Vus: parseInt(process.env.K6_VUS, 5),
  k6Duration: process.env.K6_DURATION || '1m',
  k6AuthHeader: process.env.K6_AUTH_HEADER || '',
  k6HttpDetailMode: process.env.K6_HTTP_DETAIL_MODE || 'all',

  // SonarQube
  sonarUrl: process.env.SONAR_HOST_URL || 'http://localhost:9000',
  sonarToken: process.env.SONAR_TOKEN || '',

  // Ambientes
  environment: process.env.REGINSA_ENVIRONMENT || 'qa',

  // Timeouts (ms)
  defaultTimeout: 120_000,
  actionTimeout: 20_000,
  navigationTimeout: 30_000,
  expectTimeout: 15_000,

  // Casos de prueba
  casos: {
    '00': { nombre: 'Login', grep: '00-LOGIN' },
    '01': { nombre: 'Agregar Administrado', grep: '01-AGREGAR ADMINISTRADO' },
    '02': { nombre: 'Registrar Sancion', grep: '02-REGISTRAR SANCIÓN' },
    '03': { nombre: 'Reconsiderar Sin Sanciones', grep: '03-RECONSIDERAR SIN SANCIONES' },
    '04': { nombre: 'Reconsiderar Con Sanciones', grep: '04-RECONSIDERAR CON SANCIONES' },
  },

  // Proyectos SonarQube
  sonarProjects: {
    frontend: 'si091reginsafrontend',
    backend: 'si091reginsabackend',
    enlinea: 'si091reginsaenlinea',
    config: 'si091reginsaconfig',
  },
} as const;
