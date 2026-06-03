import { FullConfig } from '@playwright/test';
import { PunkuAuthManager } from './punku-auth-manager';

async function globalSetup(config: FullConfig) {
  console.log('\n[Global Setup] Iniciando autenticación global...');
  try {
    const token = await PunkuAuthManager.getValidToken();
    process.env.PUNKU_JWT = token;
    console.log('[Global Setup] Autenticación global exitosa. Token asignado a process.env.PUNKU_JWT.\n');
  } catch (error) {
    console.error('[Global Setup] ERROR: Falló la autenticación inicial.');
    throw error;
  }
}

export default globalSetup;
