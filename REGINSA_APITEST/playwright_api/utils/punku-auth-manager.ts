import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class PunkuAuthManager {
  private static tokenCachePath = path.resolve(__dirname, '../.auth/token.json');

  /**
   * Obtiene un token válido. Si existe en caché y no ha expirado (o expira en más de 5 minutos),
   * retorna el token en caché. Si no, ejecuta get-punku-token.js para renovarlo.
   */
  public static async getValidToken(): Promise<string> {
    // 1. Intentar leer desde caché en disco
    const cachedTokenData = this.readTokenFromCache();
    if (cachedTokenData) {
      const { token, expiresAt } = cachedTokenData;
      const now = Math.floor(Date.now() / 1000);
      
      // Si el token expira en más de 5 minutos (300s), es válido
      if (expiresAt && now < expiresAt - 300) {
        // console.log('[PunkuAuthManager] Usando token JWT de la caché.');
        return token;
      }
      console.log('[PunkuAuthManager] Token en caché expirado o cercano a expirar. Renovando...');
    }

    // 2. Renovar ejecutando el script legacy
    const token = this.renewTokenViaLegacyScript();
    
    // 3. Obtener fecha de expiración desde el JWT
    const expiresAt = this.decodeJwtExpiration(token);

    // 4. Guardar en caché
    this.saveTokenToCache(token, expiresAt);

    return token;
  }

  private static readTokenFromCache(): { token: string; expiresAt: number } | null {
    try {
      if (fs.existsSync(this.tokenCachePath)) {
        const content = fs.readFileSync(this.tokenCachePath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn('[PunkuAuthManager] Error al leer caché de token:', error);
    }
    return null;
  }

  private static saveTokenToCache(token: string, expiresAt: number): void {
    try {
      const dir = path.dirname(this.tokenCachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.tokenCachePath, JSON.stringify({ token, expiresAt }, null, 2), 'utf8');
      // console.log('[PunkuAuthManager] Token guardado en caché.');
    } catch (error) {
      console.warn('[PunkuAuthManager] No se pudo guardar el token en caché:', error);
    }
  }

  private static renewTokenViaLegacyScript(): string {
    const scriptPath = path.resolve(__dirname, '../../../scripts/postman/get-punku-token.js');
    console.log(`[PunkuAuthManager] Ejecutando: node ${scriptPath}`);

    // Extraer credenciales de variables de entorno para pasarlas al script
    const user = process.env.REGINSA_USER_1 || '';
    const pass = process.env.REGINSA_PASS_1 || '';
    const baseUrl = process.env.REGINSA_BASE_URL || '';

    if (!user || !pass) {
      throw new Error(
        'Faltan credenciales en variables de entorno (REGINSA_USER_1 / REGINSA_PASS_1). ' +
        'Asegúrate de configurar tu archivo .env'
      );
    }

    try {
      // Ejecutar el script y capturar la salida de stdout
      const stdout = execSync(`node "${scriptPath}" "${user}" "${pass}" "${baseUrl}"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'inherit'], // Deja que stderr se imprima para diagnóstico
        env: {
          ...process.env,
          // Evitar advertencias SSL
          NODE_TLS_REJECT_UNAUTHORIZED: '0'
        }
      });

      const token = stdout.trim();
      if (!token || token.length < 50) {
        throw new Error('El script devolvió un token vacío o inválido.');
      }

      console.log('[PunkuAuthManager] Token JWT de Punku obtenido exitosamente.');
      return token;
    } catch (error: any) {
      console.error('[PunkuAuthManager] Error al renovar token con script legacy:', error.message);
      throw error;
    }
  }

  private static decodeJwtExpiration(token: string): number {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payloadBase64 = parts[1];
        const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
        const payload = JSON.parse(payloadJson);
        if (payload.exp) {
          return payload.exp;
        }
      }
    } catch (error) {
      console.warn('[PunkuAuthManager] No se pudo decodificar la expiración del JWT, usando expiración por defecto (1 hora).');
    }
    // Fallback: 1 hora desde ahora si falla el parseo
    return Math.floor(Date.now() / 1000) + 3600;
  }
}
