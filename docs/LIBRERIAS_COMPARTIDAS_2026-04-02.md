# Librerías Compartidas: Código Reutilizable Entre Tests

## 1. Estructura de Librerías Compartidas

```text
tests/
├── shared/                          # Librerías reutilizables
│   ├── utils/
│   │   ├── logger.ts               # Log unificado
│   │   ├── http-client.ts          # HTTP reutilizable
│   │   ├── retry.ts                # Reintentos
│   │   └── validators.ts           # Validaciones comunes
│   │
│   ├── fixtures/                   # Test data compartida
│   │   ├── users.json              # Usuarios test
│   │   ├── entities.json           # Entidades test
│   │   ├── payloads/
│   │   │   ├── admin-payloads.ts
│   │   │   ├── sancion-payloads.ts
│   │   │   └── reconsideracion-payloads.ts
│   │   ├── mock-files/
│   │   │   ├── sample.pdf
│   │   │   └── valid-excel.xlsx
│   │   └── test-accounts.ts        # Cuentas pre-generadas
│   │
│   ├── api-contracts/              # Contratos API compartidos
│   │   ├── entidad.contracts.ts
│   │   ├── sancion.contracts.ts
│   │   ├── reconsideracion.contracts.ts
│   │   └── auth.contracts.ts
│   │
│   ├── auth/                       # Autenticación centralizada
│   │   ├── auth-service.ts         # Generar tokens
│   │   ├── oauth2-handler.ts       # OAuth 2.0
│   │   └── session-manager.ts      # Gestión de sesiones
│   │
│   └── report/                     # Reportes compartidos
│       ├── results-formatter.ts
│       ├── metrics-collector.ts
│       └── summary-generator.ts
│
├── e2e/
│   ├── ...
│   └── utils/playwright-helpers.ts # Importa shared/utils
│
├── performance/
│   ├── ...
│   └── lib/k6-helpers.js           # Importa shared/utils
│
├── api/
│   ├── ...
│   └── pre-scripts/                # Importa shared/auth
│
└── security/
    ├── ...
    └── helpers/                    # Importa shared/fixtures
```

---

## 2. Ejemplo: Auth Service Compartida

### 2.1 shared/auth/auth-service.ts

```typescript
// Servicio de autenticación único - usado por todos los test types

import axios from 'axios';
import { Logger } from '../utils/logger';

export class AuthService {
  private baseUrl: string;
  private tokenCache: Map<string, TokenInfo> = new Map();

  constructor(baseUrl: string = process.env.BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Obtiene token JWT para un usuario
   * @param email - Email del usuario
   * @param password - Contraseña
   * @param cacheKey - Clave para cache (si null, no cachea)
   * @returns Token JWT
   */
  async getToken(email: string, password: string, cacheKey?: string): Promise<string> {
    // Verificar cache
    if (cacheKey && this.tokenCache.has(cacheKey)) {
      const cached = this.tokenCache.get(cacheKey)!;
      if (!this.isTokenExpired(cached.token)) {
        Logger.debug(`✓ Token cache hit for ${email}`);
        return cached.token;
      }
    }

    Logger.debug(`→ Requesting token for ${email}...`);

    try {
      const response = await axios.post(`${this.baseUrl}/Autenticacion/Login`, {
        email,
        password,
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      const token = response.data.token;

      if (cacheKey) {
        this.tokenCache.set(cacheKey, {
          token,
          expiresAt: this.getTokenExpiration(token),
        });
        Logger.debug(`✓ Token cached for ${cacheKey}`);
      }

      return token;
    } catch (error) {
      Logger.error(`✗ Failed to get token for ${email}: ${error}`);
      throw error;
    }
  }

  /**
   * Obtiene token con reintentos automáticos
   */
  async getTokenWithRetry(
    email: string,
    password: string,
    maxRetries: number = 3
  ): Promise<string> {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        Logger.debug(`[Attempt ${attempt}/${maxRetries}] Getting token...`);
        return await this.getToken(email, password);
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
          Logger.warn(`Retry in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Valida que un token sea válido
   */
  isTokenValid(token: string): boolean {
    if (!token) return false;
    try {
      // Decodificar JWT (sin verificar firma)
      const parts = token.split('.');
      if (parts.length !== 3) return false;

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      const exp = payload.exp * 1000; // Convertir a ms

      return exp > Date.now();
    } catch {
      return false;
    }
  }

  private isTokenExpired(token: string): boolean {
    return !this.isTokenValid(token);
  }

  private getTokenExpiration(token: string): Date {
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return new Date(payload.exp * 1000);
  }

  clearCache(): void {
    this.tokenCache.clear();
    Logger.debug('Auth cache cleared');
  }
}

export interface TokenInfo {
  token: string;
  expiresAt: Date;
}
```

### 2.2 Cómo usarla en E2E (Playwright)

```typescript
// tests/e2e/fixtures/auth.fixture.ts
import { test as base } from '@playwright/test';
import { AuthService } from '../../shared/auth/auth-service';

export const test = base.extend({
  authService: async ({}, use) => {
    const authService = new AuthService();
    await use(authService);
    authService.clearCache();
  },

  authenticatedPage: async ({ page, authService }, use) => {
    const token = await authService.getToken(
      process.env.ADMIN_EMAIL!,
      process.env.ADMIN_PASSWORD!,
      'admin_session'
    );

    // Inyectar token en localStorage/sessionStorage
    await page.goto(process.env.BASE_URL!);
    await page.evaluate(t => {
      localStorage.setItem('authToken', t);
      sessionStorage.setItem('jwt', t);
    }, token);

    await use(page);
  },
});

export { expect };
```

### 2.3 Cómo usarla en k6

```javascript
// tests/performance/lib/auth-handler.js
import http from 'k6/http';
import { Logger } from '../../../shared/utils/logger'; // Podría ser importado dinámicamente

const tokenCache = {};

export function getToken(email, password, cacheKey = null) {
  // Verificar cache
  if (cacheKey && tokenCache[cacheKey]) {
    console.log(`✓ Token cache hit for ${email}`);
    return tokenCache[cacheKey];
  }

  console.log(`→ Requesting token for ${email}...`);

  const response = http.post(`${__ENV.BASE_URL}/Autenticacion/Login`, {
    email,
    password,
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s',
  });

  if (response.status !== 200) {
    throw new Error(`Failed to get token: ${response.status}`);
  }

  const token = response.json('token');

  if (cacheKey) {
    tokenCache[cacheKey] = token;
    console.log(`✓ Token cached for ${cacheKey}`);
  }

  return token;
}

export function clearCache() {
  Object.keys(tokenCache).forEach(key => delete tokenCache[key]);
}
```

### 2.4 Cómo usarla en Postman (pre-request script)

```javascript
// tests/api/pre-scripts/auth-setup.js
// (Se ejecuta vía pm.sendRequest en pre-request)

const authService = {
  async getToken(email, password) {
    const request = {
      url: pm.environment.get('base_url') + '/Autenticacion/Login',
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      body: {
        mode: 'raw',
        raw: JSON.stringify({ email, password })
      }
    };

    return new Promise((resolve, reject) => {
      pm.sendRequest(request, (err, response) => {
        if (err) reject(err);
        const token = response.json().token;
        pm.environment.set('token', token);
        resolve(token);
      });
    });
  }
};

// Usar en pre-request de colección:
await authService.getToken(
  pm.environment.get('admin_email'),
  pm.environment.get('admin_password')
);
```

---

## 3. Ejemplo: Test Data Compartida

### 3.1 shared/fixtures/test-accounts.ts

```typescript
// Cuentas de prueba - compartidas entre tests

export const TEST_ACCOUNTS = {
  ADMIN: {
    email: process.env.ADMIN_EMAIL || 'admin@test.local',
    password: process.env.ADMIN_PASSWORD || 'TestPassword123!',
    name: 'Admin Test',
    expected_roles: ['admin', 'superuser'],
  },

  AUDITOR: {
    email: process.env.AUDITOR_EMAIL || 'auditor@test.local',
    password: process.env.AUDITOR_PASSWORD || 'TestPassword123!',
    name: 'Auditor Test',
    expected_roles: ['auditor'],
  },

  VIEWER: {
    email: process.env.VIEWER_EMAIL || 'viewer@test.local',
    password: process.env.VIEWER_PASSWORD || 'TestPassword123!',
    name: 'Viewer Test',
    expected_roles: ['viewer'],
  },
};

export const TEST_ENTITIES = [
  {
    id: 'ENT001',
    name: 'Entidad Test 001',
    ruc: '20000000001',
    type: 'PUBLICA',
  },
  {
    id: 'ENT002',
    name: 'Entidad Test 002',
    ruc: '20000000002',
    type: 'PRIVADA',
  },
  // ... más entidades
];
```

### 3.2 shared/fixtures/payloads/sancion-payloads.ts

```typescript
// Payloads de reutilizables para sanciones

export function generateSancionPayload(overrides?: Partial<SancionPayload>): SancionPayload {
  const base = {
    tipoFalta: 'LEVE',
    descripcion: `Sanción de prueba ${Date.now()}`,
    monto: 1000,
    fechaSancion: new Date().toISOString().split('T')[0],
    expediente: `EXP-${Date.now()}`,
    articulo: 'ART-01',
    medidaCorrectiva: 'CLAUSURA_TEMPORAL',
    ...overrides,
  };

  return base;
}

export function generateSancionesEnMasa(cantidad: number): SancionPayload[] {
  return Array.from({ length: cantidad }, (_, i) =>
    generateSancionPayload({
      expediente: `EXP-${Date.now()}-${i + 1}`
    })
  );
}

export interface SancionPayload {
  tipoFalta: string;
  descripcion: string;
  monto: number;
  fechaSancion: string;
  expediente: string;
  articulo: string;
  medidaCorrectiva: string;
}
```

### 3.3 Usar en k6

```javascript
// tests/performance/scripts/caso-02-register-sancion/local.js

import { generateSancionPayload, generateSancionesEnMasa }
  from '../../fixtures/sancion-payloads.js';

export default function () {
  const sancion = generateSancionPayload({
    monto: 5000,
    tipoFalta: 'GRAVE',
  });

  // Usar en request
  const response = http.post(`${BASE_URL}/Infracciones/Crear`, sancion);
  // ...
}
```

---

## 4. Ejemplo: HTTP Client Compartida

### 4.1 shared/utils/http-client.ts

```typescript
// Cliente HTTP reutilizable con retry, logging, etc.

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Logger } from './logger';
import { RetryPolicy, retryWithExponentialBackoff } from './retry';

export class HttpClient {
  private client: AxiosInstance;
  private logger: Logger;
  private retryPolicy: RetryPolicy;

  constructor(baseUrl: string, retryPolicy?: RetryPolicy) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
    });

    this.logger = new Logger('HttpClient');
    this.retryPolicy = retryPolicy || {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
    };
  }

  async get<T>(endpoint: string, config?: AxiosRequestConfig): Promise<T> {
    return this.executeWithRetry(() =>
      this.client.get<T>(endpoint, config)
    );
  }

  async post<T>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.executeWithRetry(() =>
      this.client.post<T>(endpoint, data, config)
    );
  }

  async put<T>(endpoint: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.executeWithRetry(() =>
      this.client.put<T>(endpoint, data, config)
    );
  }

  async delete<T>(endpoint: string, config?: AxiosRequestConfig): Promise<T> {
    return this.executeWithRetry(() =>
      this.client.delete<T>(endpoint, config)
    );
  }

  private async executeWithRetry<T>(
    executor: () => Promise<{ data: T }>,
    attempt: number = 1
  ): Promise<T> {
    try {
      const response = await executor();
      this.logger.debug(`Request successful on attempt ${attempt}`);
      return response.data;
    } catch (error) {
      if (attempt < this.retryPolicy.maxRetries) {
        const delay = Math.min(
          this.retryPolicy.initialDelayMs *
          Math.pow(this.retryPolicy.backoffMultiplier, attempt - 1),
          this.retryPolicy.maxDelayMs
        );

        this.logger.warn(
          `Request failed, retrying in ${delay}ms (attempt ${attempt}/${this.retryPolicy.maxRetries})`,
          error
        );

        await new Promise(r => setTimeout(r, delay));
        return this.executeWithRetry(executor, attempt + 1);
      }

      this.logger.error(`Request failed after ${attempt} attempts`, error);
      throw error;
    }
  }
}
```

### 4.2 Usar en tests E2E

```typescript
// tests/e2e/utils/api-helper.ts
import { HttpClient } from '../../shared/utils/http-client';

export class AdminApiHelper {
  private http: HttpClient;

  constructor(baseUrl: string, token: string) {
    this.http = new HttpClient(baseUrl);
    this.http.setHeader('Authorization', `Bearer ${token}`);
  }

  async createAdministrados(adminPayload: any) {
    return this.http.post('/Administrados/Crear', adminPayload);
  }

  async listEntities() {
    return this.http.get('/Entidad/Listar');
  }
}
```

---

## 5. Ejemplo: Logger Centralizado

### 5.1 shared/utils/logger.ts

```typescript
// Logger único - salida consistente en E2E, k6, Postman, etc.

export class Logger {
  private context: string;
  private isDev = process.env.NODE_ENV !== 'production';

  constructor(context: string = 'APP') {
    this.context = context;
  }

  debug(message: string, data?: any): void {
    if (this.isDev) {
      console.debug(`[${this.context}] 🔍 ${message}`, data || '');
    }
  }

  info(message: string, data?: any): void {
    console.log(`[${this.context}] ℹ️  ${message}`, data || '');
  }

  warn(message: string, data?: any): void {
    console.warn(`[${this.context}] ⚠️  ${message}`, data || '');
  }

  error(message: string, error?: any): void {
    console.error(`[${this.context}] ❌ ${message}`, error || '');
  }

  success(message: string, data?: any): void {
    console.log(`[${this.context}] ✓ ${message}`, data || '');
  }

  // Para k6 specific
  static k6Check(name: string, condition: boolean, metadata?: any): boolean {
    const symbol = condition ? '✓' : '✗';
    console.log(`${symbol} [K6] ${name}`, metadata || '');
    return condition;
  }
}

export const logger = new Logger();
```

### 5.2 Uso en tests

```javascript
// k6
import { Logger } from '../../../shared/utils/logger';
const log = new Logger('Caso04');
log.info('Starting test');
log.success('Test completed');
```

---

## 6. Validadores Compartidos

### 6.1 shared/utils/validators.ts

```typescript
// Validadores reutilizables

export class Validators {
  static isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  static isValidRUC(ruc: string): boolean {
    return /^\d{11}$/.test(ruc);
  }

  static isValidDNI(dni: string): boolean {
    return /^\d{8}$/.test(dni);
  }

  static isValidUUID(uuid: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  }

  static isValidJSON(text: string): boolean {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }

  static assertHttpStatus(status: number, expected: number | number[]): boolean {
    const expectedArray = Array.isArray(expected) ? expected : [expected];
    return expectedArray.includes(status);
  }

  static assertResponseSchema(response: any, schema: any): boolean {
    // Implementar validación de schema JSON
    return true;
  }
}
```

---

## 7. Estructura de Imports

### 7.1 Desde E2E (Playwright)

```typescript
// tests/e2e/cases/caso-01/01-login.spec.ts

import { TEST_ACCOUNTS } from '../../../shared/fixtures/test-accounts';
import { Logger } from '../../../shared/utils/logger';
import { AdminApiHelper } from '../../utils/api-helper';

test('Login exitoso', async ({ page, authenticatedPage }) => {
  const logger = new Logger('LoginTest');
  logger.info('Testing login...');
  // ...
});
```

### 7.2 Desde k6

```javascript
// tests/performance/scripts/caso-02/local.js

import { getToken } from '../../lib/auth-handler';
import { generateSancionPayload } from '../../fixtures/sancion-payloads';
import { Logger } from '../../../shared/utils/logger';

export default function () {
  const token = getToken(
    __ENV.ADMIN_EMAIL,
    __ENV.ADMIN_PASSWORD,
    'admin'
  );

  const sancion = generateSancionPayload();
  // ...
}
```

### 7.3 Desde Postman (variables)

```javascript
// pre-request script en collection

// Setear variables globales desde shared fixtures
pm.globals.set('admin_email', 'admin@test.local');
pm.globals.set('admin_password', 'TestPassword123!');
pm.globals.set('base_url', 'https://reginsaqa.sunedu.gob.pe');
```

---

## 8. Archivo Central: shared/index.ts

```typescript
// Punto de entrada único para importar todo compartido

export * from './auth/auth-service';
export * from './utils/logger';
export * from './utils/http-client';
export * from './utils/validators';
export * from './utils/retry';
export * from './fixtures/test-accounts';
export * from './fixtures/payloads/sancion-payloads';
export * from './api-contracts/sancion.contracts';
```

Luego importar así:

```typescript
import {
  AuthService,
  Logger,
  TEST_ACCOUNTS,
  generateSancionPayload
} from '../../../shared';
```

---

## 9. Beneficios de Librerías Compartidas

✅ **DRY (Don't Repeat Yourself)**: Un solo lugar para auth, logging, validación
✅ **Consistencia**: Todos los tests usan la misma lógica
✅ **Mantenimiento**: Cambiar en un lugar, actualiza todos los test types
✅ **Sinergia**: E2E + k6 + API usan los mismos datos de prueba
✅ **Eficiencia**: No recrear helpers en cada carpeta
✅ **Testing Cross-Type**: Validaciones compartidas entre tests

---

## 10. Implementación Step-by-Step

### Semana 1: Setup

1. Crear carpeta `tests/shared/`
2. Crear auth service
3. Crear fixtures básicas
4. Crear logger

### Semana 2: Expansion

1. Http client
2. Validators
3. Retry policy
4. API contracts

### Semana 3: Integration

1. Integrar en E2E
2. Integrar en k6
3. Integrar en Postman
4. Integrar en Security tests

---

## Próximos Pasos

1. ¿Te parece bien esta estructura de librerías?
2. ¿Empiezas con AuthService + fixtures?
3. ¿Necesitas ejemplos de más casos de uso?
4. ¿Prefieres TypeScript o JavaScript para shared/?
