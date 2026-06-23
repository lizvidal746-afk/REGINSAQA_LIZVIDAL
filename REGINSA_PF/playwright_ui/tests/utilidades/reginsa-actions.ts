import { Page, expect, type Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';
import { reserveRunResource } from '../../helpers/resource-lock';

/**
 * Funciones Reutilizables - REGINSA SUNEDU
 * Utilizadas en múltiples casos de prueba
 */

// Credenciales
// Ubicación principal de usuarios/contraseñas:
// - Archivo `.env` en la raíz del proyecto (recomendado)
// - Variables usadas: REGINSA_USER/REGINSA_PASS (usuario único)
// - Para paralelismo: REGINSA_USER_1..N y REGINSA_PASS_1..N
// Este archivo SOLO lee esas variables; no guardar claves en código.
const construirPoolCredenciales = () => {
  const pool: Array<{ usuario: string; contraseña: string }> = [];
  const vistos = new Set<string>();

  const agregar = (usuarioRaw: string, contraseñaRaw: string) => {
    const usuario = (usuarioRaw || '').trim();
    const contraseña = (contraseñaRaw || '').trim();
    if (!usuario || !contraseña) return;
    const clave = `${usuario}::${contraseña}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    pool.push({ usuario, contraseña });
  };

  const jsonCredenciales = (process.env.REGINSA_CREDENTIALS_JSON || '').trim();
  if (jsonCredenciales) {
    try {
      const items = JSON.parse(jsonCredenciales);
      if (Array.isArray(items)) {
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const registro = item as Record<string, unknown>;
          const usuario = String(
            registro.usuario ||
            registro.user ||
            registro.username ||
            ''
          );
          const contraseña = String(
            registro.contraseña ||
            registro.contrasena ||
            registro.pass ||
            registro.password ||
            ''
          );
          agregar(usuario, contraseña);
        }
      }
    } catch {
      console.warn('⚠️ REGINSA_CREDENTIALS_JSON no tiene formato JSON válido. Se ignora este origen.');
    }
  }

  const slots = Object.keys(process.env)
    .map((key) => {
      const m = /^REGINSA_USER_(\d+)$/.exec(key);
      return m ? Number(m[1]) : NaN;
    })
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  for (const slot of slots) {
    const usuario = process.env[`REGINSA_USER_${slot}`] || '';
    const contraseña = process.env[`REGINSA_PASS_${slot}`] || '';
    agregar(usuario, contraseña);
  }

  return pool;
};

const obtenerCredencialesConfiguradas = () => ({
  url: process.env.REGINSA_URL || process.env.BASE_URL || 'https://example-reginsa.local/#/home',
  usuario: process.env.REGINSA_USER || process.env.REGINSA_USER_1 || '',
  contraseña: process.env.REGINSA_PASS || process.env.REGINSA_PASS_1 || '',
  usuarios: construirPoolCredenciales()
});

export function resolverDocumentoPrueba(nombreArchivo = 'GENERAL N° 00001-2026-SUNEDU-SG-OTI.pdf'): string {
  const candidatos = [
    path.resolve(process.cwd(), 'test-files', nombreArchivo),
    path.resolve(process.cwd(), 'playwrigth', 'test-files', nombreArchivo),
    path.resolve(process.cwd(), 'files', nombreArchivo)
  ];

  const encontrado = candidatos.find((ruta) => fs.existsSync(ruta));
  if (encontrado) {
    return encontrado;
  }

  throw new Error(
    `No se encontró el archivo de prueba "${nombreArchivo}". ` +
    `Buscado en: ${candidatos.join(' | ')}`
  );
}

const permitirUsuarioUnicoEnParalelo = process.env.REGINSA_ALLOW_SINGLE_USER_PARALLEL === '1';

const seleccionarCredencial = (workerIndex?: number): { usuario: string; contraseña: string } => {
  const credenciales = obtenerCredencialesConfiguradas();
  const usuarios = credenciales.usuarios;
  const usuarioEnv = process.env.REGINSA_USER || '';
  const contraseñaEnv = process.env.REGINSA_PASS || '';
  const hayPool = usuarios.length > 0;

  if (typeof workerIndex === 'number' && hayPool && !permitirUsuarioUnicoEnParalelo) {
    return usuarios[workerIndex % usuarios.length];
  }

  if (usuarioEnv && contraseñaEnv) {
    return { usuario: usuarioEnv, contraseña: contraseñaEnv };
  }

  if (usuarios.length === 0) {
    throw new Error('No hay credenciales configuradas. Define REGINSA_USER/REGINSA_PASS o REGINSA_USER_N/REGINSA_PASS_N.');
  }
  if (typeof workerIndex === 'number') {
    return usuarios[workerIndex % usuarios.length];
  }
  return usuarios[0];
};

const esModoCompactoLogs = (): boolean => {
  const executionMode = (process.env.REGINSA_EXECUTION_MODE || '').toLowerCase();
  return executionMode === 'fast' || executionMode === 'scale' || process.env.SKIP_SCREENSHOTS === '1';
};

const permitirLogsDetallados = (overrideVarName?: string): boolean => {
  if (overrideVarName && process.env[overrideVarName] === '1') {
    return true;
  }
  return !esModoCompactoLogs();
};

export function obtenerCredencial(workerIndex?: number): { usuario: string; contraseña: string } {
  return seleccionarCredencial(workerIndex);
}

function construirUrlModulo(baseUrlActual: string, fallbackUrl: string, hashTarget: string): string {
  const rutaHash = hashTarget.replace(/^#\/?/, '').replace(/^\/+/, '');
  const baseOrigen = (() => {
    try {
      return new URL(baseUrlActual).origin;
    } catch {
      try {
        return new URL(fallbackUrl).origin;
      } catch {
        return '';
      }
    }
  })();

  if (baseOrigen) {
    return `${baseOrigen}/#/${rutaHash}`;
  }

  const fallbackPlano = (fallbackUrl || '').replace(/#.*$/, '').replace(/\/$/, '');
  if (/^https?:\/\//i.test(fallbackPlano)) {
    return `${fallbackPlano}/#/${rutaHash}`;
  }
  return `https://${fallbackPlano}/#/${rutaHash}`;
}

/**
 * FUNCIÓN PRINCIPAL DE SETUP
 * Realiza login + navegación en una sola llamada
 * Reutilizable en todos los tests
 */
export async function iniciarSesionYNavegar(
  page: Page,
  modulo: 'infractor' | 'administrado' | 'sancion' = 'infractor',
  workerIndex?: number
): Promise<void> {
  const detailedAuthLogs = permitirLogsDetallados('REGINSA_VERBOSE_AUTH_LOGS');
  const logAuth = (message: string) => {
    if (detailedAuthLogs) {
      console.log(message);
    }
  };

  logAuth('🔐 INICIALIZANDO SESIÓN Y NAVEGACIÓN...');
  const executionMode = (process.env.REGINSA_EXECUTION_MODE || '').toLowerCase();
  const isFast = executionMode === 'fast' || process.env.SKIP_SCREENSHOTS === '1';
  const pauseShort = isFast ? 120 : 300;
  const pauseMedium = isFast ? 250 : 800;
  const pauseLong = isFast ? 350 : 1000;
  const credenciales = obtenerCredencialesConfiguradas();
  const usuarioEnv = process.env.REGINSA_USER || '';
  const contraseñaEnv = process.env.REGINSA_PASS || '';
  const credencialActiva = seleccionarCredencial(workerIndex);
  if (usuarioEnv && contraseñaEnv && !(typeof workerIndex === 'number' && credenciales.usuarios.length > 0 && !permitirUsuarioUnicoEnParalelo)) {
    logAuth('⚠️ REGINSA_USER/REGINSA_PASS definidos: todos los workers usarán el mismo usuario.');
  } else if (typeof workerIndex === 'number' && credenciales.usuarios.length > 0) {
    logAuth(`🔁 Pool paralelo activo: ${credenciales.usuarios.length} usuarios disponibles.`);
    const usuariosDisponibles = credenciales.usuarios
      .map((item) => item.usuario)
      .filter((usuario) => !!usuario)
      .join(', ');
    if (usuariosDisponibles) {
      logAuth(`👥 Usuarios disponibles: ${usuariosDisponibles}`);
    }

    const slotsDetectados = Object.keys(process.env)
      .map((key) => {
        const m = /^REGINSA_USER_(\d+)$/.exec(key);
        return m ? Number(m[1]) : NaN;
      })
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    const slotsFaltantes = slotsDetectados.filter((slot) => {
      const hasUser = !!(process.env[`REGINSA_USER_${slot}`] || '').trim();
      const hasPass = !!(process.env[`REGINSA_PASS_${slot}`] || '').trim();
      return !hasUser || !hasPass;
    });
    if (slotsFaltantes.length > 0) {
      console.warn(`⚠️ Slots de credenciales incompletos: ${slotsFaltantes.join(', ')}.`);
    }
  }
  logAuth(`👤 Usuario asignado: ${credencialActiva.usuario} (worker ${typeof workerIndex === 'number' ? workerIndex : 0})`);

  const esperarPaginaEstable = async (): Promise<void> => {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: isFast ? 7000 : 12000 }).catch(() => {});
  };

  const esPantallaErrorSistema = async (): Promise<boolean> => {
    const btnAcceder = page.getByRole('button', { name: /Acceder Ahora/i }).first();
    if (await btnAcceder.isVisible().catch(() => false)) {
      return false;
    }

    const urlActual = page.url() || '';
    if (/#\/home\b/i.test(urlActual)) {
      return false;
    }

    const errorVisible = await page
      .getByText(/no\s*se\s*complet[oó]\s*el\s*proceso|identificador\s*del\s*sistema\s*no\s*ha\s*sido\s*correctamente\s*enviado/i)
      .first()
      .isVisible()
      .catch(() => false);

    return errorVisible;
  };

  const recuperarPantallaErrorSistema = async (): Promise<boolean> => {
    const hayError = await esPantallaErrorSistema();
    if (!hayError) return false;

    console.warn('⚠️ Pantalla de error del sistema detectada. Aplicando recuperación automática...');
    await page.goto(credenciales.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await esperarPaginaEstable();
    await page.waitForTimeout(pauseMedium);

    const persiste = await esPantallaErrorSistema();
    if (persiste) {
      await page.reload().catch(() => {});
      await esperarPaginaEstable();
      await page.waitForTimeout(pauseMedium);
    }

    return true;
  };

  const esModuloObjetivoVisible = async (moduloTarget: 'infractor' | 'administrado'): Promise<boolean> => {
    const btnAcceder = page.getByRole('button', { name: /Acceder Ahora/i }).first();
    if (await btnAcceder.isVisible().catch(() => false)) {
      return false;
    }

    if (moduloTarget === 'infractor') {
      const señalesInfractor = [
        page.getByText(/Registro\s+de\s+Infracci[oó]n\s+y\s+Sanci[oó]n/i).first(),
        page.locator('button:has-text("Registrar Sancionar")').first(),
        page.locator('button[label="Registrar Sancionar"]').first(),
        page.locator('table').first()
      ];

      for (const señal of señalesInfractor) {
        if (await señal.isVisible().catch(() => false)) return true;
      }

      return false;
    }

    const señalesAdministrado = [
      page.getByText(/Administrado|Administrados/i).first(),
      page.locator('input[placeholder*="ruc" i], input[aria-label*="ruc" i]').first(),
      page.locator('input[placeholder*="raz[oó]n" i], input[aria-label*="raz[oó]n" i]').first(),
      page.locator('table').first()
    ];

    for (const señal of señalesAdministrado) {
      if (await señal.isVisible().catch(() => false)) return true;
    }

    return false;
  };

  const esPantallaOperativa = async (): Promise<boolean> => esModuloObjetivoVisible(modulo === 'administrado' ? 'administrado' : 'infractor');

  const normalizarBearer = (valor: string): string => {
    const limpio = String(valor || '').trim().replace(/^Bearer\s+/i, '');
    if (!limpio) return '';
    if (/^(null|undefined)$/i.test(limpio)) return '';
    return limpio;
  };

  const obtenerTokenAplicativo = async (): Promise<string> => {
    const tokenRaw = await page.evaluate(() => {
      const clavesDirectas = ['token', 'access_token', 'authToken', 'jwtToken', 'Authorization'];
      for (const clave of clavesDirectas) {
        const valor = window.localStorage.getItem(clave) || window.sessionStorage.getItem(clave);
        if (valor) return valor;
      }

      const recolectar = (storage: Storage): string => {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (!key || !/token|auth|bearer|jwt/i.test(key)) continue;
          const valor = storage.getItem(key);
          if (!valor) continue;
          try {
            const parseado = JSON.parse(valor);
            if (parseado && typeof parseado === 'object') {
              const registro = parseado as Record<string, unknown>;
              const candidato =
                registro.token ||
                registro.access_token ||
                registro.accessToken ||
                registro.authToken ||
                registro.jwt;
              if (typeof candidato === 'string' && candidato.trim()) {
                return candidato;
              }
            }
          } catch {
            // valor no JSON, continuar con cadena plana
          }
          return valor;
        }
        return '';
      };

      return recolectar(window.localStorage) || recolectar(window.sessionStorage) || '';
    }).catch(() => '');

    return normalizarBearer(String(tokenRaw || ''));
  };

  const esperarTokenAplicativo = async (timeoutMs: number): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const token = await obtenerTokenAplicativo();
      if (token) return true;
      await page.waitForTimeout(pauseShort);
    }
    return false;
  };

  const esperarSesionAllData = async (timeoutMs: number): Promise<boolean> => {
    try {
      await page.waitForResponse((res) => {
        const url = res.url().toLowerCase();
        if (!url.includes('/api/authorization/sesionalldata')) return false;
        const status = res.status();
        if (status < 200 || status >= 300) return false;
        const auth = (res.request().headers()['authorization'] || '').trim();
        return /^bearer\s+.+/i.test(auth) && !/^bearer\s*(null|undefined)?\s*$/i.test(auth);
      }, { timeout: timeoutMs });
      return true;
    } catch {
      return false;
    }
  };

  const ejecutarLogin = async (): Promise<boolean> => {
    const btnAccederAhora = page.getByRole('button', { name: /Acceder Ahora/i }).first();
    const inputUsuario = page.getByRole('textbox', { name: 'Usuario' });
    const inputContraseña = page.getByRole('textbox', { name: 'Contraseña' });

    const accedeVisible = await btnAccederAhora.isVisible().catch(() => false);
    const usuarioVisible = await inputUsuario.isVisible().catch(() => false);

    if (!accedeVisible && !usuarioVisible) {
      return false;
    }

    if (accedeVisible) {
      await btnAccederAhora.click().catch(() => {});
      await page.waitForTimeout(pauseMedium);

      // Punku puede demorar en mostrar form o redirigir de vuelta.
      await Promise.race([
        inputUsuario.waitFor({ state: 'visible', timeout: isFast ? 9000 : 15000 }),
        page.waitForURL(/punkuloginv2|reginsaqa\.sunedu\.gob\.pe/i, { timeout: isFast ? 9000 : 15000 })
      ]).catch(() => {});
    }

    await inputUsuario.waitFor({ state: 'visible', timeout: 12000 });
    await inputUsuario.fill(credencialActiva.usuario);
    await page.waitForTimeout(pauseShort);

    await inputContraseña.waitFor({ state: 'visible', timeout: 12000 });
    await inputContraseña.fill(credencialActiva.contraseña);
    await page.waitForTimeout(pauseShort);

    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    // Esperar retorno desde Punku a REGINSA antes de validar módulo.
    await page.waitForURL(/reginsaqa\.sunedu\.gob\.pe/i, { timeout: isFast ? 12000 : 22000 }).catch(() => {});
    await esperarPaginaEstable();
    await page.waitForTimeout(pauseMedium);

    return true;
  };
  
  try {
    // Navegar a home
    let seRecuperoPantallaError = false;

    await page.goto(credenciales.url);
    await page.waitForLoadState('domcontentloaded');
    seRecuperoPantallaError = (await recuperarPantallaErrorSistema()) || seRecuperoPantallaError;

    if (process.env.REGINSA_FORCE_LOGIN === '1') {
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      }).catch(() => {});
      await page.context().clearCookies().catch(() => {});
      if (page.isClosed()) {
        throw new Error('La página se cerró antes de recargar en login.');
      }
      await page.reload().catch((error) => {
        if (page.isClosed()) {
          throw new Error('La página se cerró durante la recarga en login.');
        }
        throw error;
      });
      await page.waitForLoadState('domcontentloaded');
    }

    const loginEjecutado = await ejecutarLogin();
    if (loginEjecutado) {
      logAuth('✅ Sesión iniciada');
    } else {
      logAuth('✅ Sesión ya activa (login omitido)');
    }

    seRecuperoPantallaError = (await recuperarPantallaErrorSistema()) || seRecuperoPantallaError;

    let paginaCerradaDuranteNavegacion = false;

    const esperarModuloObjetivo = async (moduloTarget: 'infractor' | 'administrado'): Promise<boolean> => {
      const timeoutModulo = isFast ? 8000 : 15000;
      const señales = moduloTarget === 'administrado'
        ? [
            page.getByText(/Administrado|Administrados/i).first(),
            page.locator('input[placeholder*="ruc" i], input[aria-label*="ruc" i]').first(),
            page.locator('input[placeholder*="raz[oó]n" i], input[aria-label*="raz[oó]n" i]').first(),
            page.locator('table').first()
          ]
        : [
            page.getByText(/Registro\s+de\s+Infracci[oó]n\s+y\s+Sanci[oó]n/i).first(),
            page.locator('button:has-text("Registrar Sancionar")').first(),
            page.locator('button[label="Registrar Sancionar"]').first(),
            page.locator('table').first()
          ];

      try {
        await Promise.any(
          señales.map((señal) => señal.waitFor({ state: 'visible', timeout: timeoutModulo }))
        );
        return true;
      } catch {
        if (page.isClosed()) {
          paginaCerradaDuranteNavegacion = true;
        }
        return false;
      }
    };

    const navegarDirectoPorRuta = async (moduloTarget: 'infractor' | 'administrado'): Promise<boolean> => {
      const permitirFallback = process.env.REGINSA_DIRECT_NAV_FALLBACK !== '0';
      if (!permitirFallback) return false;
      if (page.isClosed()) {
        paginaCerradaDuranteNavegacion = true;
        return false;
      }

      const hashTarget = moduloTarget === 'administrado' ? 'pages/administrado' : 'pages/infractor';
      const targetUrl = construirUrlModulo(page.url() || '', credenciales.url, hashTarget);

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      if (page.isClosed()) {
        paginaCerradaDuranteNavegacion = true;
        return false;
      }
      await esperarPaginaEstable();
      if (page.isClosed()) {
        paginaCerradaDuranteNavegacion = true;
        return false;
      }
      seRecuperoPantallaError = (await recuperarPantallaErrorSistema()) || seRecuperoPantallaError;
      if (page.isClosed()) {
        paginaCerradaDuranteNavegacion = true;
        return false;
      }

      const sigueEnError = await esPantallaErrorSistema();
      if (sigueEnError) return false;

      if (await esModuloObjetivoVisible(moduloTarget)) {
        return true;
      }

      return esperarModuloObjetivo(moduloTarget);
    };

    // Navegación determinística por ruta para evitar regresiones de menú/home.
    const etiqueta = modulo === 'administrado' ? 'Administrado' : 'Infractor';

    const moduloFallback = modulo === 'administrado' ? 'administrado' : 'infractor';
    let moduloResuelto = false;

    const navegoDirectoInicial = await navegarDirectoPorRuta(moduloFallback);
    if (paginaCerradaDuranteNavegacion || page.isClosed()) {
      throw new Error('La página o el contexto del navegador se cerró durante la navegación post-login. Posible cierre de sesión forzado, redirección crítica del sistema o crash del navegador.');
    }
    moduloResuelto = navegoDirectoInicial;

    if (!moduloResuelto || !(await esPantallaOperativa())) {
      // Último intento limpio: volver a home y reintentar ruta una vez.
      await page.goto(credenciales.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await esperarPaginaEstable();
      seRecuperoPantallaError = (await recuperarPantallaErrorSistema()) || seRecuperoPantallaError;

      const navegoDirectoFinal = await navegarDirectoPorRuta(moduloFallback);
      if (paginaCerradaDuranteNavegacion || page.isClosed()) {
        throw new Error('La página o el contexto del navegador se cerró durante el reintento de navegación al módulo después del login.');
      }
      const pantallaOperativaFinal = await esPantallaOperativa();
      if (!navegoDirectoFinal || !pantallaOperativaFinal) {
        const btnAccederVisible = await page.getByRole('button', { name: /Acceder Ahora/i }).first().isVisible().catch(() => false);
        if (btnAccederVisible) {
          console.warn('⚠️ Rebote a Home detectado tras login. Reintentando inicio de sesión y navegación una vez...');
          await page.goto(credenciales.url, { waitUntil: 'domcontentloaded' }).catch(() => {});
          await esperarPaginaEstable();
          await ejecutarLogin().catch(() => {});
          const navegoTrasReLogin = await navegarDirectoPorRuta(moduloFallback);
          const pantallaOperativaTrasReLogin = await esPantallaOperativa();
          if (!navegoTrasReLogin || !pantallaOperativaTrasReLogin) {
            throw new Error(`Navegación incompleta: la sesión volvió a Home (Acceder Ahora visible) antes de cargar el módulo ${etiqueta}.`);
          }
        } else {
          throw new Error(`Navegación incompleta: el módulo ${etiqueta} no quedó visible después de recuperación.`);
        }
      }
    }

    logAuth(modulo === 'administrado'
      ? '✅ Módulo Administrado cargado'
      : '✅ Módulo Infractor y Sanción cargado');

    await page.waitForTimeout(pauseLong);

  } catch (error) {
    console.error('❌ Error en inicialización:', error);
    throw error;
  }
}

/**
 * Realiza login en REGINSA SUNEDU (DEPRECATED - usar iniciarSesionYNavegar)
 */
export async function loginReginsa(page: Page): Promise<void> {
  console.log('🔐 Iniciando sesión en REGINSA SUNEDU...');

  const credenciales = obtenerCredencialesConfiguradas();

  if (!credenciales.usuario || !credenciales.contraseña) {
    throw new Error('Faltan credenciales. Define REGINSA_USER y REGINSA_PASS.');
  }
  
  await page.goto(credenciales.url);
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'Acceder Ahora' }).click();
  await page.waitForTimeout(1000);

  const inputUsuario = page.getByRole('textbox', { name: 'Usuario' });
  await inputUsuario.click();
  await inputUsuario.fill(credenciales.usuario);
  await page.waitForTimeout(300);

  const inputContraseña = page.getByRole('textbox', { name: 'Contraseña' });
  await inputContraseña.click();
  await inputContraseña.fill(credenciales.contraseña);
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  console.log('✅ Sesión iniciada correctamente');
}

/**
 * Navega a "Infractor y Sanción" (DEPRECATED - usar iniciarSesionYNavegar)
 */
export async function navegarAInfraccionSancion(page: Page): Promise<void> {
  console.log('📋 Navegando a Infractor y Sanción...');
  const credenciales = obtenerCredencialesConfiguradas();

  const yaEnModulo = async (): Promise<boolean> => {
    const señales = [
      page.locator('table').first(),
      page.getByText(/Registro\s+de\s+Infracci[oó]n\s+y\s+Sanci[oó]n/i).first(),
      page.locator('button:has-text("Registrar Sancionar")').first()
    ];

    for (const señal of señales) {
      if (await señal.isVisible().catch(() => false)) {
        return true;
      }
    }

    return false;
  };

  if (await yaEnModulo()) {
    console.log('✅ En sección Infractor y Sanción (ya estaba cargada)');
    return;
  }

  const targetUrl = construirUrlModulo(page.url() || '', credenciales.url, 'pages/infractor');
  for (let intento = 0; intento < 2; intento++) {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(500);
    if (await yaEnModulo()) break;
  }

  if (!(await yaEnModulo())) {
    throw new Error('No se pudo navegar a Infractor y Sanción (link no visible y fallback directo sin tabla).');
  }

  console.log('✅ En sección Infractor y Sanción');
}

/**
 * Completa cabecera de reconsideración (checkbox, archivo, número y fecha)
 * Retorna el número de reconsideración generado.
 */
function formatearFecha(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function parseFechaTexto(texto: string): Date | null {
  const match = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [_, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function calcularFechaReconsideracion(fechaResolucion: Date | null): Date {
  const base = fechaResolucion ?? new Date();
  const minFecha = new Date(base);
  minFecha.setHours(0, 0, 0, 0);

  const maxFecha = new Date();
  maxFecha.setHours(0, 0, 0, 0);

  if (minFecha > maxFecha) {
    throw new Error('No hay fecha válida de reconsideración (resolución > hoy).');
  }

  const diff = Math.floor((maxFecha.getTime() - minFecha.getTime()) / (24 * 60 * 60 * 1000));
  const offset = Math.floor(Math.random() * (diff + 1));
  const fechaReconsideracion = new Date(minFecha);
  fechaReconsideracion.setDate(minFecha.getDate() + offset);
  return fechaReconsideracion;
}

export function generarFechaPonderada(
  pesosPorAnio: Array<{ anio: number; peso: number }>,
  fechaMaxima: Date
): Date {
  const pesosValidos = pesosPorAnio.filter(p => p.anio >= 0 && p.peso > 0);
  const total = pesosValidos.reduce((acc, p) => acc + p.peso, 0);
  if (total <= 0) {
    return new Date(fechaMaxima);
  }

  const r = Math.random() * total;
  let acumulado = 0;
  let anioSeleccionado = pesosValidos[0].anio;
  for (const p of pesosValidos) {
    acumulado += p.peso;
    if (r <= acumulado) {
      anioSeleccionado = p.anio;
      break;
    }
  }

  const inicio = new Date(anioSeleccionado, 0, 1);
  const fin = new Date(anioSeleccionado, 11, 31);
  const limite = fechaMaxima < fin ? fechaMaxima : fin;

  if (limite <= inicio) {
    return new Date(limite);
  }

  const diffMs = limite.getTime() - inicio.getTime();
  const randomMs = Math.floor(Math.random() * (diffMs + 1));
  return new Date(inicio.getTime() + randomMs);
}

export async function completarCabeceraReconsideracion(
  page: Page,
  rutaArchivo: string,
  fechaReconsideracion?: Date,
  numeroPrefix = 'Reconsid N°'
): Promise<string> {
  const cabeceraPanel = page.getByRole('tabpanel').filter({ hasText: /Datos del administrado/i }).first();
  const tabDatos = page.getByRole('tab', { name: /Datos del administrado/i });
  if (await tabDatos.isVisible().catch(() => false)) {
    const selected = await tabDatos.getAttribute('aria-selected').catch(() => 'true');
    if (selected !== 'true') {
      await tabDatos.click();
      await cabeceraPanel.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    }
  }
  const scope = (await cabeceraPanel.isVisible().catch(() => false)) ? cabeceraPanel : page;

  const btnEditarCabecera = scope.getByRole('button', { name: /Editar cabecera/i }).first();
  const btnGuardarCabecera = scope.getByRole('button', { name: /Guardar cabecera/i }).first();

  const esperarEnabled = async (locator: Locator, timeout = 6000) => {
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
      if (await locator.isEnabled().catch(() => false)) return true;
      await page.waitForTimeout(250);
    }
    return false;
  };

  const habilitarEdicion = async () => {
    await btnEditarCabecera.waitFor({ state: 'visible', timeout: 8000 });
    await btnGuardarCabecera.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});

    const inicio = Date.now();
    while (Date.now() - inicio < 4000) {
      if (await btnGuardarCabecera.isEnabled().catch(() => false)) return true;
      if (await btnEditarCabecera.isEnabled().catch(() => false)) {
        await btnEditarCabecera.click().catch(() => {});
      }
      const presentoEnabled = await scope.locator('input#presentoReconsideracion').isEnabled().catch(() => false);
      if (presentoEnabled) return true;
      await page.waitForTimeout(150);
    }
    return false;
  };

  const edicionOk = await habilitarEdicion();
  if (!edicionOk) {
    throw new Error('No se pudo habilitar la edición de cabecera.');
  }

  await esperarEnabled(btnGuardarCabecera, 3000).catch(() => {});

  const labelPresento = scope.locator('label[for="presentoReconsideracion"]').first();
  if (await labelPresento.isVisible().catch(() => false)) {
    await labelPresento.scrollIntoViewIfNeeded().catch(() => {});
  }

  const presentoInput = scope.locator('input#presentoReconsideracion').first();
  const presentoBox = scope.locator('p-checkbox[inputid="presentoReconsideracion"] .p-checkbox-box').first();

  const estadoPresento = async () => {
    const visible = await presentoInput.isVisible().catch(() => false);
    const enabled = await presentoInput.isEnabled().catch(() => false);
    const inputChecked = await presentoInput.isChecked().catch(() => false);
    const ariaChecked = await presentoInput.getAttribute('aria-checked').catch(() => null);
    const boxClass = await presentoBox.getAttribute('class').catch(() => '');
    const checked = inputChecked || ariaChecked === 'true' || String(boxClass || '').includes('p-highlight');
    return { visible, enabled, checked };
  };

  const forzarPresentoMarcado = async () => {
    for (let intento = 0; intento < 6; intento++) {
      const estado = await estadoPresento();
      if (estado.checked) return true;
      if (!estado.enabled) {
        await page.waitForTimeout(150);
        continue;
      }
      if (await presentoBox.isVisible().catch(() => false)) {
        await presentoBox.click({ force: true });
      } else {
        await scope.locator('label[for="presentoReconsideracion"]').click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(180);
    }
    return (await estadoPresento()).checked;
  };

  if (await presentoInput.isVisible().catch(() => false)) {
    const presentoOk = await forzarPresentoMarcado();
    if (!presentoOk) {
      throw new Error('No se pudo marcar "¿Presentó recurso de reconsideración?".');
    }
  }

  const seccionReconsideracion = scope.locator('label').filter({ hasText: /Resoluci[oó]n de Reconsideraci[oó]n/i }).first();
  for (let intento = 0; intento < 3; intento++) {
    if (await seccionReconsideracion.isVisible().catch(() => false)) break;
    if (await presentoBox.isVisible().catch(() => false)) {
      await presentoBox.click({ force: true });
    } else if (await labelPresento.isVisible().catch(() => false)) {
      await labelPresento.click({ force: true });
    }
    await page.waitForTimeout(300);
  }
  await seccionReconsideracion.waitFor({ state: 'visible', timeout: 8000 });
  await seccionReconsideracion.scrollIntoViewIfNeeded().catch(() => {});

  // 1) Adjuntar archivo de reconsideración
  const fileUpload = seccionReconsideracion
    .locator('xpath=following::p-fileupload[@name="rutaArchivoReconsideracion" or @name="rutaArchivoRecons"][1]')
    .first();
  const fileInput = fileUpload.locator('input[type="file"]').first();
  const nombreArchivo = rutaArchivo.split(/[\/\\]/).pop() || '';
  await fileInput.waitFor({ state: 'attached', timeout: 7000 });
  await fileInput.setInputFiles(rutaArchivo);
  const archivoNombre = scope.locator('.p-fileupload-filename, .p-fileupload-files').filter({ hasText: nombreArchivo }).first();
  const archivoTexto = scope.getByText(nombreArchivo).first();
  const archivoRuta = scope.locator('text=/Archivo:/i').first();
  const botonVerReconsideracion = scope.getByRole('button', { name: /Ver reconsideraci[oó]n/i }).first();
  const inputValor = await fileInput.inputValue().catch(() => '');
  let archivoVisible = await archivoNombre.isVisible().catch(() => false)
    || await archivoTexto.isVisible().catch(() => false)
    || await archivoRuta.isVisible().catch(() => false)
    || await botonVerReconsideracion.isEnabled().catch(() => false)
    || inputValor.includes(nombreArchivo);
  for (let i = 0; i < 3 && !archivoVisible; i++) {
    await page.waitForTimeout(500);
    const valorActual = await fileInput.inputValue().catch(() => '');
    archivoVisible = await archivoNombre.isVisible().catch(() => false)
      || await archivoTexto.isVisible().catch(() => false)
      || await archivoRuta.isVisible().catch(() => false)
      || await botonVerReconsideracion.isEnabled().catch(() => false)
      || valorActual.includes(nombreArchivo);
  }
  if (!archivoVisible) {
    throw new Error('No se pudo validar el archivo de reconsideración.');
  }

  // 2) Número de reconsideración
  const fechaUsar = fechaReconsideracion ?? new Date();
  const numeroAleatorio = String(Math.floor(Math.random() * 9000) + 1000);
  const prefijoNormalizado = (numeroPrefix || 'Reconsid N°').trim();
  const numeroReconsideracion = `${prefijoNormalizado} ${numeroAleatorio}-${fechaUsar.getFullYear()}`;
  const inputNumero = page
    .locator('label', { hasText: /Nº\s*de\s*Reconsideraci[oó]n/i })
    .locator('..')
    .locator('input[formcontrolname="desResolucionReconsideracion"], input')
    .first();
  await inputNumero.waitFor({ state: 'attached', timeout: 12000 });
  for (let i = 0; i < 5; i++) {
    const visible = await inputNumero.isVisible().catch(() => false);
    const enabled = await inputNumero.isEnabled().catch(() => false);
    if (visible && enabled) break;
    if (await btnEditarCabecera.isEnabled().catch(() => false)) {
      await btnEditarCabecera.click().catch(() => {});
    }
    if (await labelPresento.isVisible().catch(() => false)) {
      await labelPresento.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(150);
  }
  if (!(await inputNumero.isVisible().catch(() => false))) {
    throw new Error('No se encontró el campo "N° de Reconsideración".');
  }
  if (!(await inputNumero.isEnabled().catch(() => false))) {
    throw new Error('El campo "N° de Reconsideración" está deshabilitado.');
  }
  await inputNumero.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(200);
  await inputNumero.fill(numeroReconsideracion);
  await page.waitForTimeout(300);
  const numeroValor = await inputNumero.inputValue().catch(() => '');
  if (!numeroValor.includes(numeroReconsideracion)) {
    await inputNumero.fill(numeroReconsideracion);
    await page.waitForTimeout(400);
  }

  // 3) Fecha de reconsideración (con botón de fecha)
  const fechaInput = page
    .locator('label', { hasText: /Fecha\s*de\s*Reconsideraci[oó]n/i })
    .locator('..')
    .locator('p-calendar[formcontrolname="fechaResolucionReconsideracion"], p-calendar[formcontrolname="fechaReconsideracion"], input')
    .locator('input')
    .first();
  await fechaInput.waitFor({ state: 'visible', timeout: 12000 });
  await fechaInput.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(200);
  const fechaTexto = formatearFecha(fechaUsar);

  for (let i = 0; i < 4; i++) {
    const enabled = await fechaInput.isEnabled().catch(() => false);
    if (enabled) break;
    if (await btnEditarCabecera.isEnabled().catch(() => false)) {
      await btnEditarCabecera.click().catch(() => {});
    }
    if (await labelPresento.isVisible().catch(() => false)) {
      await labelPresento.click({ force: true }).catch(() => {});
    }
    await page.waitForTimeout(150);
  }
  if (!(await fechaInput.isEnabled().catch(() => false))) {
    throw new Error('El campo "Fecha de Reconsideración" está deshabilitado.');
  }

  const setFechaPorTexto = async () => {
    const enabled = await fechaInput.isEnabled().catch(() => false);
    if (!enabled) return false;
    await fechaInput.scrollIntoViewIfNeeded().catch(() => {});
    await fechaInput.click({ force: true }).catch(() => {});
    await fechaInput.fill(fechaTexto);
    await page.keyboard.press('Tab').catch(() => {});
    await fechaInput.blur().catch(() => {});
    await page.waitForTimeout(200);
    const valor = await fechaInput.inputValue().catch(() => '');
    return valor.includes(fechaTexto);
  };

  const setFechaPorCalendario = async () => {
    try {
      const panelId = await fechaInput.getAttribute('aria-controls').catch(() => null);
      const calendarContainer = fechaInput.locator('..');
      const trigger = calendarContainer.locator('button[aria-label="Choose Date"]').first();
      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click({ force: true });
      }
      const calendario = panelId ? page.locator(`#${panelId}`) : page.locator('.p-datepicker').last();
      await calendario.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});

      const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const targetMonth = monthNames[fechaUsar.getMonth()];
      const targetYear = String(fechaUsar.getFullYear());
      const prevBtn = calendario.getByRole('button', { name: /Previous Month/i }).first();
      const nextBtn = calendario.getByRole('button', { name: /Next Month/i }).first();

      const getVisibleMonthYear = async () => {
        const monthText = (await calendario.getByRole('button', { name: /Choose Month/i }).first().textContent().catch(() => ''))?.toLowerCase() || '';
        const yearText = (await calendario.getByRole('button', { name: /Choose Year/i }).first().textContent().catch(() => ''))?.trim() || '';
        return { monthText, yearText };
      };

      for (let i = 0; i < 24; i++) {
        const { monthText, yearText } = await getVisibleMonthYear();
        if (monthText.includes(targetMonth) && yearText.includes(targetYear)) break;
        if (yearText > targetYear || (yearText === targetYear && monthText.localeCompare(targetMonth) > 0)) {
          if (await prevBtn.isVisible().catch(() => false)) await prevBtn.click();
        } else {
          if (await nextBtn.isVisible().catch(() => false)) await nextBtn.click();
        }
        await page.waitForTimeout(120);
      }

      const diaBtn = calendario.getByRole('gridcell', { name: String(fechaUsar.getDate()) }).first();
      if (!(await diaBtn.isVisible().catch(() => false))) return false;
      await diaBtn.click();
      await page.waitForTimeout(200);
      const valor = await fechaInput.inputValue().catch(() => '');
      return valor.includes(fechaTexto);
    } catch {
      return false;
    }
  };

  const setFechaPorJs = async () => {
    try {
      await fechaInput.evaluate((input, valor) => {
        const el = input as HTMLInputElement | null;
        if (el) {
          el.value = valor;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, fechaTexto);
      await page.waitForTimeout(200);
      const valor = await fechaInput.inputValue().catch(() => '');
      return valor.includes(fechaTexto);
    } catch {
      return false;
    }
  };

  let fechaOk = await setFechaPorTexto();
  if (!fechaOk) {
    fechaOk = await setFechaPorJs();
  }
  if (!fechaOk) {
    fechaOk = await setFechaPorCalendario();
  }

  // Revalidar checkbox presentó reconsideración al final sin desmarcar accidentalmente
  if (await presentoInput.isVisible().catch(() => false)) {
    const checkedFinal = (await estadoPresento()).checked;
    if (!checkedFinal) {
      const presentoOkFinal = await forzarPresentoMarcado();
      if (!presentoOkFinal) {
        throw new Error('No se pudo confirmar el check "¿Presentó recurso de reconsideración?" al final.');
      }
    }
  }

  if (!(await seccionReconsideracion.isVisible().catch(() => false))) {
    throw new Error('La sección de reconsideración no quedó visible tras completar cabecera.');
  }

  return numeroReconsideracion;
}

/**
 * Abre el formulario de nuevo administrado
 */
export async function abrirFormularioNuevoAdministrado(page: Page): Promise<void> {
  console.log('➕ Abriendo formulario nuevo administrado...');
  const formularioAdministradoAbierto = async (): Promise<boolean> => {
    const modalAdmin = page
      .locator('.ant-modal:visible, .p-dialog:visible, [role="dialog"]:visible')
      .filter({
        has: page.locator(
          'input[formcontrolname*="ruc" i], input[name*="ruc" i], input[id*="ruc" i], input[placeholder*="ruc" i], input[aria-label*="ruc" i]'
        )
      })
      .first();

    const visible = await modalAdmin.isVisible().catch(() => false);
    if (!visible) return false;

    const razonSocial = modalAdmin.locator(
      'input[formcontrolname*="razon" i], input[name*="razon" i], input[id*="razon" i], input[placeholder*="razon" i], input[aria-label*="razon" i]'
    ).first();
    return razonSocial.isVisible().catch(() => false);
  };

  if (await formularioAdministradoAbierto()) {
    console.log('✅ Formulario ya abierto');
    return;
  }

  const recuperarSesionSiEsNecesario = async (): Promise<void> => {
    const btnAcceder = page.getByRole('button', { name: /^Acceder Ahora$/i });
    const requiereLogin = await btnAcceder.isVisible().catch(() => false);
    if (!requiereLogin) return;

    const credencial = seleccionarCredencial();
    if (!credencial.usuario || !credencial.contraseña) {
      throw new Error('Sesión expirada y sin credenciales disponibles para relogin.');
    }

    console.log('↪️ Sesión no activa detectada. Reintentando login rápido...');
    await btnAcceder.click({ timeout: 12000 });
    const inputUsuario = page.getByRole('textbox', { name: 'Usuario' });
    const inputContraseña = page.getByRole('textbox', { name: 'Contraseña' });
    await inputUsuario.waitFor({ state: 'visible', timeout: 12000 });
    await inputUsuario.fill(credencial.usuario);
    await inputContraseña.fill(credencial.contraseña);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle').catch(() => {});

    const linkModulo = page.getByRole('link', { name: /Infractor y Sanci[oó]n/i }).first();
    if (await linkModulo.isVisible().catch(() => false)) {
      await linkModulo.click({ timeout: 12000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle').catch(() => {});
    }
  };

  const asegurarVistaAdministrado = async (): Promise<void> => {
    const rucFiltro = page.locator('input[placeholder*="ruc" i], input[aria-label*="ruc" i]').first();
    const razonFiltro = page.locator('input[placeholder*="raz[oó]n" i], input[aria-label*="raz[oó]n" i]').first();

    const yaEnVista = (await rucFiltro.isVisible().catch(() => false)) || (await razonFiltro.isVisible().catch(() => false));
    if (yaEnVista) return;

    const linkAdministrado = page.getByRole('link', { name: /Administrado|Administrados/i }).first();
    if (await linkAdministrado.isVisible().catch(() => false)) {
      await linkAdministrado.click({ timeout: 12000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
    }

    const sigueSinVista = !(await rucFiltro.isVisible().catch(() => false)) && !(await razonFiltro.isVisible().catch(() => false));
    if (sigueSinVista) {
      await page.goto('#/pages/administrado', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
    }
  };

  const recuperarPantalla = async (intento: number): Promise<void> => {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);

    const linkAdministrado = page.getByRole('link', { name: /Administrado|Administrados/i }).first();
    if (await linkAdministrado.isVisible().catch(() => false)) {
      await linkAdministrado.click({ timeout: 10000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
    }

    if (intento >= 1) {
      await page.reload().catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
    }

    await asegurarVistaAdministrado();
  };
  
  await page.waitForLoadState('networkidle');
  await recuperarSesionSiEsNecesario();
  await asegurarVistaAdministrado();
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});

  const overlay = page.locator('.p-dialog-mask, .p-component-overlay');
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.first().waitFor({ state: 'hidden', timeout: 10000 }).catch(async () => {
      await page.keyboard.press('Escape').catch(() => {});
      await overlay.first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    });
  }

  const btnRegistrarSancionar = page.locator([
    'button[label="Registrar Sancionar"][icon="pi pi-plus"]',
    'button[label="Registrar Sancionar"]',
    'div.mb-3.sm\\:mb-0 button[label="Registrar Sancionar"]',
    'button.p-button-info:has-text("Registrar Sancionar")'
  ].join(', ')).first();

  const candidatos = [
    page.locator('div.flex.align-items-end button.btn-royal-blue.p-button-icon-only:has(span.pi.pi-user-plus)').first(),
    page.locator('button.btn-royal-blue.p-button-icon-only').first(),
    page.locator('div.flex.align-items-end span.pi.pi-user-plus').first().locator('xpath=ancestor::button[1]'),
    btnRegistrarSancionar,
    page.locator('button[aria-label*="agregar" i], button[title*="agregar" i]').first(),
    page.getByRole('button', { name: /^Registrar\s*Sancionar$/i }).first(),
    page.getByRole('button', { name: /Registrar\s*Sancionar/i }).first(),
    page.locator('button:has-text("Registrar Sancionar")').first(),
    page.locator('button:has(span.pi.pi-user-plus)').first(),
    page.locator('button:has(span.pi.pi-plus)').first(),
    page.locator('span.pi.pi-user-plus').first().locator('xpath=ancestor::button[1]')
  ];

  const modal = page.getByRole('dialog').filter({ hasText: /Agregar\s*Administrado/i }).first();
  const modalAlt = page.locator('.ant-modal, .p-dialog').filter({ hasText: /Agregar\s*Administrado/i }).first();
  const formularioSancion = page.locator('input[formcontrolname="numeroExpediente"]').first();

  let abierto = false;
  for (let intento = 0; intento < 6 && !abierto; intento++) {
    for (const boton of candidatos) {
      if (!(await boton.isVisible().catch(() => false))) continue;
      await boton.scrollIntoViewIfNeeded().catch(() => {});
      await boton.click({ force: true }).catch(() => {});
      await page.waitForTimeout(550);

      if (await formularioAdministradoAbierto()) {
        abierto = true;
        break;
      }

      const sancionVisible = await formularioSancion.isVisible().catch(() => false);
      if (sancionVisible) {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(250);
      }
    }

    if (!abierto) {
      console.log(`⚠️ No se pudo abrir formulario (intento ${intento + 1}/6). Aplicando recuperación...`);
      await recuperarPantalla(intento);
      await recuperarSesionSiEsNecesario();
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }
  }

  if (!abierto) {
    throw new Error('No se pudo abrir formulario de Administrado. Botones intentados sin exito (Registrar Sancionar / icono usuario-plus).');
  }

  const modalVisible = await modal.isVisible().catch(() => false);
  const modalAltVisible = await modalAlt.isVisible().catch(() => false);
  const scope = modalVisible ? modal : (modalAltVisible ? modalAlt : page);
  const formulario = scope.locator('form').first();
  await formulario.waitFor({ state: 'visible', timeout: 20000 });

  const rucInput = scope.getByLabel(/R\.\?U\.\?C/i).first();
  const rucInputFallback = scope.locator(
    'input[formcontrolname*="ruc" i], input[name*="ruc" i], input[placeholder*="ruc" i], input[aria-label*="ruc" i]'
  ).first();

  if (await rucInput.isVisible().catch(() => false)) {
    await rucInput.scrollIntoViewIfNeeded().catch(() => {});
    await rucInput.waitFor({ state: 'visible', timeout: 20000 });
  } else if (await rucInputFallback.isVisible().catch(() => false)) {
    await rucInputFallback.scrollIntoViewIfNeeded().catch(() => {});
    await rucInputFallback.waitFor({ state: 'visible', timeout: 20000 });
  } else {
    throw new Error('Formulario abierto sin campo RUC visible. Revisar selector del modal de Administrado.');
  }
  await page.waitForTimeout(500);

  console.log('✅ Formulario abierto');
}

/**
 * Abre el formulario de registrar sanción
 */
export async function abrirFormularioRegistrarSancion(page: Page): Promise<void> {
  console.log('➕ Abriendo formulario registrar sanción...');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});

  const asegurarVistaInfractor = async (): Promise<void> => {
    const yaEnInfractor =
      (await page.locator('button:has-text("Registrar Sancionar")').first().isVisible().catch(() => false)) ||
      (await page.getByText(/Registro\s+de\s+Infracci[oó]n\s+y\s+Sanci[oó]n/i).first().isVisible().catch(() => false));

    if (yaEnInfractor) return;

    const linkInfractor = page.getByRole('link', { name: /Infractor\s+y\s+Sanci[oó]n|Infractor/i }).first();
    if (await linkInfractor.isVisible().catch(() => false)) {
      await linkInfractor.click({ timeout: 10000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
    }

    const sigueFuera =
      !(await page.locator('button:has-text("Registrar Sancionar")').first().isVisible().catch(() => false)) &&
      !(await page.getByText(/Registro\s+de\s+Infracci[oó]n\s+y\s+Sanci[oó]n/i).first().isVisible().catch(() => false));

    if (sigueFuera) {
      await page.goto('#/pages/infractor', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
    }
  };

  const formularioAbierto = async (): Promise<boolean> => {
    const indicadores = [
      page.getByRole('button', { name: /^Guardar$/i }).first(),
      page.getByRole('tab', { name: /Datos del administrado/i }).first(),
      page.locator('input[formcontrolname="numeroExpediente"]').first()
    ];

    for (const indicador of indicadores) {
      if (await indicador.isVisible().catch(() => false)) {
        return true;
      }
    }
    return false;
  };

  const recuperarSesionSiEsNecesario = async (): Promise<void> => {
    const btnAcceder = page.getByRole('button', { name: /^Acceder Ahora$/i });
    const requiereLogin = await btnAcceder.isVisible().catch(() => false);
    if (!requiereLogin) return;

    const credencial = seleccionarCredencial();
    if (!credencial.usuario || !credencial.contraseña) {
      throw new Error('Sesión expirada y sin credenciales disponibles para relogin.');
    }

    console.log('↪️ Sesión no activa detectada. Reintentando login rápido...');
    await btnAcceder.click({ timeout: 12000 });
    const inputUsuario = page.getByRole('textbox', { name: 'Usuario' });
    const inputContraseña = page.getByRole('textbox', { name: 'Contraseña' });
    await inputUsuario.waitFor({ state: 'visible', timeout: 12000 });
    await inputUsuario.fill(credencial.usuario);
    await inputContraseña.fill(credencial.contraseña);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.goto('#/pages/infractor', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
  };

  if (await formularioAbierto()) {
    console.log('✅ Formulario ya estaba abierto');
    return;
  }

  await recuperarSesionSiEsNecesario();
  await asegurarVistaInfractor();

  const candidatos = [
    page.locator('button[label="Registrar Sancionar"]').first(),
    page.locator('div.mb-3.sm\\:mb-0 button[label="Registrar Sancionar"]').first(),
    page.locator('button.p-button-info:has-text("Registrar Sancionar")').first(),
    page.locator('button.btn-royal-blue.p-button-icon-only:has(span.pi.pi-user-plus)').first(),
    page.getByRole('button', { name: /^Registrar\s*Sancionar$/i }).first(),
    page.getByRole('button').filter({ hasText: /Registrar\s*Sanci[oó]n|Registrar|Sanci[oó]n/i }).first(),
    page.getByRole('button', { name: /Registrar\s*Sanci[oó]n|Registrar|Sanci[oó]n/i }).first(),
    page.locator('button:has-text("Registrar")').first(),
    page.locator('button:has-text("Sanción")').first(),
    page.locator('button:has-text("Sancion")').first(),
    page.locator('button:has(span.pi.pi-user-plus), button:has(span.pi.pi-plus)').first()
  ];

  let abierto = false;
  for (let intento = 1; intento <= 3 && !abierto; intento++) {
    for (const boton of candidatos) {
      if (await boton.isVisible().catch(() => false)) {
        await boton.scrollIntoViewIfNeeded().catch(() => {});
        await boton.click({ timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(300);
        abierto = await formularioAbierto();
        break;
      }
    }

    if (!abierto) {
      console.log(`⚠️ Botón no visible (intento ${intento}/3). Esperando y reintentando...`);
      await page.waitForTimeout(2000);
      await page.waitForLoadState('networkidle').catch(() => {});
      await asegurarVistaInfractor();
    }
  }

  if (!abierto) {
    const botonAlt = page.locator('button[label="Registrar Sancionar"], button:has-text("Registrar Sancionar"), button:has-text("Registrar Sanción")').first();
    await botonAlt.waitFor({ state: 'visible', timeout: 12000 });
    await botonAlt.click({ timeout: 12000 });
    await page.waitForTimeout(300);
    abierto = await formularioAbierto();
  }

  if (!abierto) {
    throw new Error('No se pudo abrir formulario de Registrar Sancionar con los selectores actuales.');
  }

  await page.locator('input[formcontrolname="numeroExpediente"]').first().waitFor({ state: 'visible', timeout: 45000 });
  console.log('✅ Formulario abierto');
}

// ===============================
// EXPORTAR ADMINISTRADOS
// ===============================

export interface AdministradoListado {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  estado?: string;
}

export async function extraerAdministradosDesdeTabla(
  page: Page,
  maxPaginas: number = 5
): Promise<AdministradoListado[]> {
  const resultados: AdministradoListado[] = [];

  const tabla = page.locator('table').first();
  await tabla.waitFor({ state: 'visible', timeout: 10000 });

  const obtenerIndiceColumna = async (regex: RegExp): Promise<number> => {
    const headers = tabla.locator('thead tr th');
    const total = await headers.count();
    for (let i = 0; i < total; i++) {
      const texto = (await headers.nth(i).textContent())?.trim() || '';
      if (regex.test(texto)) return i;
    }
    return -1;
  };

  const idxRuc = await obtenerIndiceColumna(/R\.?U\.?C|RUC/i);
  const idxRazon = await obtenerIndiceColumna(/Raz[oó]n\s+Social/i);
  const idxNombre = await obtenerIndiceColumna(/Nombre\s+Comercial/i);
  const idxEstado = await obtenerIndiceColumna(/Estado/i);

  let pagina = 1;
  while (pagina <= maxPaginas) {
    const filas = tabla.locator('tbody tr');
    const totalFilas = await filas.count();
    if (totalFilas === 0) break;

    for (let i = 0; i < totalFilas; i++) {
      const celdas = filas.nth(i).locator('td');
      const totalCeldas = await celdas.count();
      if (totalCeldas === 0) continue;

      const ruc = idxRuc >= 0 ? (await celdas.nth(idxRuc).textContent())?.trim() || '' : '';
      const razon = idxRazon >= 0 ? (await celdas.nth(idxRazon).textContent())?.trim() || '' : '';
      const nombre = idxNombre >= 0 ? (await celdas.nth(idxNombre).textContent())?.trim() || '' : '';
      const estado = idxEstado >= 0 ? (await celdas.nth(idxEstado).textContent())?.trim() || '' : '';

      if (ruc || razon) {
        resultados.push({
          ruc,
          razonSocial: razon,
          nombreComercial: nombre || undefined,
          estado: estado || undefined
        });
      }
    }

    const btnNext = page.getByRole('button', { name: /Next Page|Siguiente|>/i });
    const puedeAvanzar = await btnNext.isEnabled().catch(() => false);
    if (!puedeAvanzar) break;
    await btnNext.click();
    await page.waitForTimeout(800);
    pagina++;
  }

  return resultados;
}

/**
 * Genera número aleatorio entre min y max
 */
export function generarNumeroAleatorio(min: number = 100, max: number = 9999): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Abre un dropdown de PrimeNG de forma robusta:
 * - espera trigger visible/enabled
 * - click + espera de panel visible con opciones
 * - reintentos con backoff corto (solo en este paso)
 */
export async function abrirDropdownRobusto(
  page: Page,
  trigger: Locator,
  panel: Locator,
  options: Locator,
  config?: { maxIntentos?: number; timeoutPasoMs?: number }
): Promise<number> {
  const maxIntentos = Math.max(1, config?.maxIntentos ?? 4);
  const timeoutPasoMs = Math.max(1000, config?.timeoutPasoMs ?? 2500);

  for (let intento = 1; intento <= maxIntentos; intento++) {
    const espera = Math.min(900, 120 * intento);
    try {
      await trigger.waitFor({ state: 'visible', timeout: timeoutPasoMs });
      await trigger.scrollIntoViewIfNeeded().catch(() => {});

      const enabled = await trigger.isEnabled().catch(() => true);
      if (!enabled) {
        await page.waitForTimeout(espera);
        continue;
      }

      await trigger.click({ force: true });
      const panelVisible = await panel.isVisible({ timeout: timeoutPasoMs }).catch(() => false);
      if (!panelVisible) {
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(espera);
        continue;
      }

      const count = await options.count();
      if (count > 0) {
        return count;
      }

      // Panel abierto pero vacío: cerrar y reintentar.
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(espera);
    } catch {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(espera);
    }
  }

  throw new Error('No se pudo abrir dropdown con opciones disponibles.');
}

export type AdministradoSelectionMetadata = {
  repeatIndex?: number;
  slot?: number;
  scenario?: string;
  workerIndex?: number;
};

/**
 * Obtiene un administrado de la lista de forma deterministica por worker/repeticion.
 * En ejecuciones paralelas reserva el texto elegido para evitar que dos IPs usen el mismo administrado si hay opciones disponibles.
 */
export async function obtenerAdministradoAleatorio(
  page: Page,
  indicePreferido?: number,
  metadata: AdministradoSelectionMetadata = {}
): Promise<string> {
  const detailedPickerLogs = permitirLogsDetallados('REGINSA_VERBOSE_PICKER_LOGS');
  const logPicker = (message: string) => {
    if (detailedPickerLogs) {
      console.log(message);
    }
  };

  logPicker('🎯 Seleccionando administrado deterministico...');
  
  try {
    // PASO 0: Abrir dropdown de forma robusta
    logPicker('   Paso 0: Abriendo dropdown...');
    const dropdown = page.locator('p-dropdown[formcontrolname="idAdministrado"], p-dropdown[formcontrolname="administrado"]').first();
    const triggerPrimario = dropdown.locator('.p-dropdown, .p-dropdown-trigger, [role="combobox"]').first();
    const triggerAlternativo = page.getByRole('combobox').first();
    const panel = page.locator('.p-dropdown-panel:visible').last();
    const options = page.locator('.p-dropdown-panel:visible .p-dropdown-item');

    let cantidad = 0;
    let abierto = false;
    const maxIntentosAbrir = 6;
    for (let intento = 1; intento <= maxIntentosAbrir && !abierto; intento++) {
      const trigger = (await triggerPrimario.isVisible().catch(() => false)) ? triggerPrimario : triggerAlternativo;
      try {
        cantidad = await abrirDropdownRobusto(page, trigger, panel, options, {
          maxIntentos: 2,
          timeoutPasoMs: 2600
        });
        abierto = cantidad > 0;
      } catch {
        // Fallback adicional: click sobre host + teclado para abrir panel.
        await dropdown.click({ force: true }).catch(() => {});
        await page.keyboard.press('ArrowDown').catch(() => {});
        await page.waitForTimeout(180 * intento);
        cantidad = await options.count().catch(() => 0);
        abierto = cantidad > 0;
      }
    }
    if (!abierto) {
      throw new Error('No se pudo abrir dropdown con opciones disponibles.');
    }
    logPicker('   ✓ Dropdown clickeado');

    // PASO 1: Esperar que el panel del dropdown esté visible
    logPicker('   Paso 1: Esperando panel del dropdown...');
    await panel.waitFor({ state: 'visible', timeout: 5000 });
    logPicker('   ✓ Panel visible');

    // PASO 2: Esperar que existan opciones en el panel
    logPicker('   Paso 2: Esperando opciones...');
    await options.first().waitFor({ state: 'visible', timeout: 5000 });
    const count = Math.max(cantidad, await options.count());
    logPicker(`   ✓ ${count} opciones encontradas`);

    if (count === 0) {
      throw new Error('No hay opciones en el dropdown de Administrado');
    }

    // PASO 3: Seleccionar opción deterministica y reservarla para este run
    logPicker('   Paso 3: Seleccionando opción deterministica...');
    const indiceBase = typeof indicePreferido === 'number'
      ? ((indicePreferido + (metadata.repeatIndex ?? 0) * 7) % count + count) % count
      : ((metadata.repeatIndex ?? 0) % count + count) % count;

    let indiceSeleccionado = indiceBase;
    let administradoSeleccionado = '';
    let reservado = false;

    for (let offset = 0; offset < count; offset++) {
      const indiceCandidato = (indiceBase + offset) % count;
      const textoCandidato = ((await options.nth(indiceCandidato).innerText()) || '').trim() || `Opcion_${indiceCandidato}`;
      reservado = reserveRunResource('administrado-selector', textoCandidato, {
        ...metadata,
        indicePreferido,
        indiceBase,
        indiceSeleccionado: indiceCandidato,
        totalOpciones: count,
      });

      if (reservado) {
        indiceSeleccionado = indiceCandidato;
        administradoSeleccionado = textoCandidato;
        break;
      }
    }

    if (!administradoSeleccionado) {
      indiceSeleccionado = indiceBase;
      administradoSeleccionado = ((await options.nth(indiceSeleccionado).innerText()) || '').trim() || `Opcion_${indiceSeleccionado}`;
      console.warn(
        `   ⚠️ Administrados agotados para reserva en este run; usando fallback deterministico ${indiceSeleccionado + 1}/${count}.`
      );
    }

    const optionSeleccionada = options.nth(indiceSeleccionado);
    logPicker(`   Opción ${indiceSeleccionado + 1}/${count}: "${administradoSeleccionado}"${reservado ? ' [reservada]' : ''}`);
    
    // PASO 4: Clickear la opción
    logPicker('   Paso 4: Clickeando opción...');
    
    // Scroll into view si es necesario
    await optionSeleccionada.scrollIntoViewIfNeeded();
    
    // Pequeño delay sin esperar (usar setImmediate en lugar de waitForTimeout)
    await new Promise(r => setTimeout(r, 100));
    
    // Hacer el clic
    await optionSeleccionada.click({ force: true });
    
    // PASO 5: Esperar que el panel del dropdown se cierre (indicador de selección exitosa)
    logPicker('   Paso 5: Esperando confirmación del cambio...');
    const panelDropdown = page.locator('.p-dropdown-panel');
    
    // Esperar a que el panel desaparezca (indicador de que la selección se procesó)
    try {
      await panelDropdown.waitFor({ state: 'hidden', timeout: 3000 });
      logPicker(`   ✅ Opción seleccionada y confirmada\n`);
    } catch (e) {
      // Si el panel no desaparece, seguir adelante (a veces sucede)
      logPicker(`   ⚠️  Panel no desapareció, pero continuando...\n`);
    }
    
    return administradoSeleccionado;
  } catch (error) {
    console.error('   ❌ Error en obtenerAdministradoAleatorio:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Genera expediente con formato: Exp N° XXXX-2026
 */
export function generarExpediente(): string {
  const numero = generarNumeroAleatorio(100, 9999);
  return `Exp N° ${numero}-2026`;
}

/**
 * Genera resolución con formato: Res N° XXXX-2026
 */
export function generarResolucion(): string {
  const numero = generarNumeroAleatorio(100, 9999);
  return `Res N° ${numero}-2026`;
}

/**
 * Selecciona una sanción aleatoria (primera o segunda)
 */
export async function seleccionarSancionAleatoria(page: Page): Promise<string> {
  console.log('🎲 Seleccionando sanción aleatoria...');
  
  const sanciones = ['RIS 018-2015-MINEDU', 'RIS 018-2015-MINEDU'];
  const sancionAleatoria = sanciones[Math.floor(Math.random() * sanciones.length)];

  await page.locator('#pn_id_72').getByRole('combobox').click();
  await page.waitForTimeout(300);
  
  await page.getByRole('option', { name: sancionAleatoria }).click();
  await page.waitForTimeout(300);

  console.log(`✅ Sanción seleccionada: ${sancionAleatoria}`);
  return sancionAleatoria;
}

/**
 * Selecciona tipo de infractor aleatorio
 */
export async function seleccionarTipoInfratorAleatorio(page: Page): Promise<string> {
  console.log('🎲 Seleccionando tipo infractor aleatorio...');
  
  await page.getByRole('combobox', { name: 'Seleccione' }).click();
  await page.waitForTimeout(300);

  const options = await page.getByRole('option').all();
  const indiceAleatorio = Math.floor(Math.random() * options.length);
  const opcionSeleccionada = options[indiceAleatorio];
  const nombreOpcion = await opcionSeleccionada.textContent();

  await opcionSeleccionada.click();
  await page.waitForTimeout(300);

  console.log(`✅ Tipo infractor seleccionado: ${nombreOpcion}`);
  return nombreOpcion || 'desconocido';
}

/**
 * Selecciona tipo de multa aleatorio (Soles o IUT)
 */
export async function seleccionarTipoMultaAleatorio(): Promise<'Soles' | 'IUT'> {
  const tiposMulta: ('Soles' | 'IUT')[] = ['Soles', 'IUT'];
  return tiposMulta[Math.floor(Math.random() * tiposMulta.length)];
}

/**
 * Obtiene screenshot con nombre del caso
 */
export async function capturarPantalla(page: Page, nombreCaso: string, paso: string): Promise<string> {
  if (process.env.SKIP_SCREENSHOTS === '1') {
    console.log('⏩ Captura omitida por SKIP_SCREENSHOTS=1');
    return '';
  }
  if (page.isClosed()) {
    console.log('⏩ Captura omitida: la página ya está cerrada.');
    return '';
  }
  const isError = /error/i.test(paso);
  const carpeta = isError ? 'errors' : 'screenshots';
  if (!fs.existsSync(`./${carpeta}`)) {
    fs.mkdirSync(`./${carpeta}`, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const nombreArchivo = `./${carpeta}/${nombreCaso}_${paso}_${timestamp}.png`;
  try {
    await page.screenshot({ path: nombreArchivo });
    console.log(`📸 Screenshot: ${nombreArchivo}`);
  } catch (error) {
    if (page.isClosed()) {
      console.log('⏩ Captura omitida: la página se cerró antes del screenshot.');
      return '';
    }
    throw error;
  }
  return nombreArchivo;
}

function normalizarParaNombre(valor: string): string {
  return valor
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .substring(0, 40);
}

function normalizarParaComparar(valor: string): string {
  return valor
    .toUpperCase()
    .replace(/\d+/g, '')
    .replace(/[_\-\s]+/g, '')
    .trim();
}

function construirNombreScreenshot(
  caso: string,
  paso: string,
  ref1?: string,
  ref2?: string,
  modal?: string
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const casoNorm = normalizarParaComparar(caso);
  const modalNorm = modal ? normalizarParaComparar(modal) : '';
  const incluirModal = modal && modalNorm && modalNorm !== casoNorm;

  const partes = [
    caso,
    incluirModal ? normalizarParaNombre(modal as string) : '',
    paso,
    ref1 ? normalizarParaNombre(ref1) : '',
    ref2 ? normalizarParaNombre(ref2) : '',
    timestamp
  ].filter(Boolean);
  return `./screenshots/${partes.join('_')}.png`;
}

/**
 * Obtiene screenshot mejorado con información detallada del caso
 * Formato: CASO_PASO_RUC_RAZONSOCIAL_TIMESTAMP.png
 */
export async function capturarPantallaMejorada(
  page: Page,
  caso: string,
  paso: string,
  ruc: string,
  razonSocial: string
): Promise<string> {
  if (process.env.SKIP_SCREENSHOTS === '1') {
    console.log('⏩ Captura omitida por SKIP_SCREENSHOTS=1');
    return '';
  }
  if (page.isClosed()) {
    console.log('⏩ Captura omitida: la página ya está cerrada.');
    return '';
  }
  const nombreArchivo = construirNombreScreenshot(caso, paso, ruc, razonSocial);
  // Captura full page para ver todo el contenido
  try {
    await page.screenshot({ path: nombreArchivo, fullPage: true });
    console.log(`📸 Screenshot: ${nombreArchivo}`);
  } catch (error) {
    if (page.isClosed()) {
      console.log('⏩ Captura omitida: la página se cerró antes del screenshot.');
      return '';
    }
    throw error;
  }
  return nombreArchivo;
}

/**
 * Captura formulario lleno antes de guardar
 */
export async function capturarFormularioLleno(
  page: Page,
  caso: string,
  ref1?: string,
  ref2?: string,
  modal?: string,
  paso?: string
): Promise<string> {
  if (process.env.SKIP_SCREENSHOTS === '1') {
    console.log('⏩ Captura omitida por SKIP_SCREENSHOTS=1');
    return '';
  }
  if (page.isClosed()) {
    console.log('⏩ Captura omitida: la página ya está cerrada.');
    return '';
  }
  const nombreArchivo = construirNombreScreenshot(caso, paso ?? 'FORMULARIO', ref1, ref2, modal);
  try {
    await page.screenshot({ path: nombreArchivo, fullPage: true });
    console.log(`📸 Screenshot formulario lleno: ${nombreArchivo}`);
  } catch (error) {
    if (page.isClosed()) {
      console.log('⏩ Captura omitida: la página se cerró antes del screenshot.');
      return '';
    }
    throw error;
  }
  return nombreArchivo;
}

/**
 * Captura mensaje de éxito (toast verde)
 */
export async function capturarToastExito(
  page: Page,
  caso: string,
  etiqueta: string,
  ref1?: string,
  ref2?: string,
  modal?: string,
  timeoutMs = 15000
): Promise<string | null> {
  if (process.env.SKIP_SCREENSHOTS === '1') {
    console.log('⏩ Captura omitida por SKIP_SCREENSHOTS=1');
    return null;
  }
  if (page.isClosed()) {
    console.log('⏩ Captura omitida: la página ya está cerrada.');
    return null;
  }
  const toast = page
    .locator('.p-toast-message-success, .p-toast-message')
    .filter({ hasText: /registro|registrad|guardad|Éxito|exito/i })
    .first();

  const visible = await toast.isVisible({ timeout: timeoutMs }).catch(() => false);
  if (!visible) return null;

  const paso = /EXITO/i.test(etiqueta) ? etiqueta : `EXITO_${etiqueta}`;
  const nombreArchivo = construirNombreScreenshot(caso, paso, ref1, ref2, modal);
  try {
    await toast.screenshot({ path: nombreArchivo });
    console.log(`📸 Screenshot toast éxito: ${nombreArchivo}`);
  } catch (error) {
    if (page.isClosed()) {
      console.log('⏩ Captura omitida: la página se cerró antes del screenshot.');
      return null;
    }
    throw error;
  }
  return nombreArchivo;
}

/**
 * Genera RUC aleatorio de 11 dígitos
 */
export function generarRUC(): string {
  return Math.floor(Math.random() * 99999999999)
    .toString()
    .padStart(11, '0');
}
