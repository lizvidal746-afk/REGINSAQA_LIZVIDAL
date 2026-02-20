import { Page, expect, type Locator } from '@playwright/test';
import * as fs from 'fs';

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
const CREDENCIALES = {
  url: process.env.REGINSA_URL || process.env.BASE_URL || 'https://example-reginsa.local/#/home',
  usuario: process.env.REGINSA_USER || process.env.REGINSA_USER_1 || '',
  contraseña: process.env.REGINSA_PASS || process.env.REGINSA_PASS_1 || '',
  usuarios: [
    { usuario: process.env.REGINSA_USER_1 || '', contraseña: process.env.REGINSA_PASS_1 || '' },
    { usuario: process.env.REGINSA_USER_2 || '', contraseña: process.env.REGINSA_PASS_2 || '' },
    { usuario: process.env.REGINSA_USER_3 || '', contraseña: process.env.REGINSA_PASS_3 || '' },
    { usuario: process.env.REGINSA_USER_4 || '', contraseña: process.env.REGINSA_PASS_4 || '' },
    { usuario: process.env.REGINSA_USER_5 || '', contraseña: process.env.REGINSA_PASS_5 || '' },
    { usuario: process.env.REGINSA_USER_6 || '', contraseña: process.env.REGINSA_PASS_6 || '' }
  ].filter((credencial) => credencial.usuario && credencial.contraseña)
};

const usuarioEnv = process.env.REGINSA_USER;
const contraseñaEnv = process.env.REGINSA_PASS;
const permitirUsuarioUnicoEnParalelo = process.env.REGINSA_ALLOW_SINGLE_USER_PARALLEL === '1';

const seleccionarCredencial = (workerIndex?: number): { usuario: string; contraseña: string } => {
  const usuarios = CREDENCIALES.usuarios;
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

export function obtenerCredencial(workerIndex?: number): { usuario: string; contraseña: string } {
  return seleccionarCredencial(workerIndex);
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
  console.log('🔐 INICIALIZANDO SESIÓN Y NAVEGACIÓN...');
  const credencialActiva = seleccionarCredencial(workerIndex);
  if (usuarioEnv && contraseñaEnv && !(typeof workerIndex === 'number' && CREDENCIALES.usuarios.length > 0 && !permitirUsuarioUnicoEnParalelo)) {
    console.log('⚠️ REGINSA_USER/REGINSA_PASS definidos: todos los workers usarán el mismo usuario.');
  } else if (typeof workerIndex === 'number' && CREDENCIALES.usuarios.length > 0) {
    console.log(`🔁 Pool paralelo activo: ${CREDENCIALES.usuarios.length} usuarios disponibles.`);
  }
  console.log(`👤 Usuario asignado: ${credencialActiva.usuario} (worker ${typeof workerIndex === 'number' ? workerIndex : 0})`);
  
  try {
    // Navegar a home
    await page.goto(CREDENCIALES.url);
    await page.waitForLoadState('domcontentloaded');

    if (typeof workerIndex === 'number' || process.env.REGINSA_FORCE_LOGIN === '1') {
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
    await page.waitForLoadState('domcontentloaded');

    // Si ya hay sesión, el botón "Acceder Ahora" no aparece
    const btnAcceder = page.getByRole('button', { name: 'Acceder Ahora' });
    const requiereLogin = await btnAcceder.isVisible().catch(() => false);

    if (requiereLogin) {
      await btnAcceder.click();
      await page.waitForTimeout(800);

      // Ingresar usuario
      const inputUsuario = page.getByRole('textbox', { name: 'Usuario' });
      await inputUsuario.waitFor({ state: 'visible' });
      await inputUsuario.fill(credencialActiva.usuario);
      await page.waitForTimeout(300);

      // Ingresar contraseña
      const inputContraseña = page.getByRole('textbox', { name: 'Contraseña' });
      await inputContraseña.fill(credencialActiva.contraseña);
      await page.waitForTimeout(300);

      // Iniciar sesión
      await page.getByRole('button', { name: 'Iniciar sesión' }).click();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1500);

      console.log('✅ Sesión iniciada');
    } else {
      console.log('✅ Sesión ya activa (login omitido)');
    }

    const navegar = async (regex: RegExp, etiqueta: string): Promise<void> => {
      // Esperar a que el menú tenga links cargados
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1000);

      const primerItem = page.locator('a, [role="link"], [role="menuitem"]').first();
      if (!(await primerItem.isVisible().catch(() => false))) {
        if (page.isClosed()) {
          throw new Error('La página se cerró antes de recargar el menú.');
        }
        await page.reload().catch((error) => {
          if (page.isClosed()) {
            throw new Error('La página se cerró durante la recarga del menú.');
          }
          throw error;
        });
        await page.waitForLoadState('domcontentloaded');
        await page.waitForLoadState('networkidle').catch(() => {});
      }

      await primerItem.waitFor({ state: 'visible', timeout: 60000 });

      const candidatos = [
        page.getByRole('link', { name: regex }).first(),
        page.getByRole('menuitem', { name: regex }).first(),
        page.getByRole('button', { name: regex }).first(),
        page.locator(`a:has-text("${etiqueta}")`).first(),
        page.locator(`[role="menuitem"]:has-text("${etiqueta}")`).first(),
        page.locator(`button:has-text("${etiqueta}")`).first(),
        page.locator(`li:has-text("${etiqueta}")`).first()
      ];

      for (const candidato of candidatos) {
        if (!(await candidato.isVisible().catch(() => false))) continue;
        await candidato.scrollIntoViewIfNeeded().catch(() => {});
        await candidato.click({ timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(500);
        return;
      }

      throw new Error(`No se encontró el módulo ${etiqueta}.`);
    };

    // Navegar al módulo solicitado - Con reintentos y alternativas
    const regexModulo = modulo === 'administrado'
      ? /Administrado|Administrados/i
      : /Infractor y Sanci[oó]n/i;
    const etiqueta = modulo === 'administrado' ? 'Administrado' : 'Infractor';

    try {
      await navegar(regexModulo, etiqueta);
    } catch (error) {
      const esScale = process.env.REGINSA_SCALE_MODE === '1';
      if (esScale) {
        console.warn(`⚠️ Navegación de módulo no encontrada (${etiqueta}) en modo scale. Se continúa con recuperación posterior.`);
      } else {
        throw error;
      }
    }

    console.log(modulo === 'administrado'
      ? '✅ Módulo Administrado cargado'
      : '✅ Módulo Infractor y Sanción cargado');
    
    await page.waitForTimeout(1000);

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

  if (!CREDENCIALES.usuario || !CREDENCIALES.contraseña) {
    throw new Error('Faltan credenciales. Define REGINSA_USER y REGINSA_PASS.');
  }
  
  await page.goto(CREDENCIALES.url);
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'Acceder Ahora' }).click();
  await page.waitForTimeout(1000);

  const inputUsuario = page.getByRole('textbox', { name: 'Usuario' });
  await inputUsuario.click();
  await inputUsuario.fill(CREDENCIALES.usuario);
  await page.waitForTimeout(300);

  const inputContraseña = page.getByRole('textbox', { name: 'Contraseña' });
  await inputContraseña.click();
  await inputContraseña.fill(CREDENCIALES.contraseña);
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
  
  await page.getByRole('link', { name: ' Infractor y Sanción' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

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
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const base = fechaResolucion ?? new Date();
  const minFecha = new Date(base);
  minFecha.setDate(minFecha.getDate() + 1);

  const maxFecha = new Date();
  maxFecha.setHours(0, 0, 0, 0);

  if (minFecha > maxFecha) {
    throw new Error('No hay fecha válida de reconsideración (resolución >= hoy).');
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
  fechaReconsideracion?: Date
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
  if (await presentoInput.isVisible().catch(() => false)) {
    for (let intento = 0; intento < 3; intento++) {
      const enabled = await presentoInput.isEnabled().catch(() => false);
      const checked = await presentoInput.isChecked().catch(() => false);
      if (checked) break;
      if (enabled) {
        if (await presentoBox.isVisible().catch(() => false)) {
          await presentoBox.click({ force: true });
        } else {
          await scope.locator('label[for="presentoReconsideracion"]').click({ force: true }).catch(() => {});
        }
        await page.waitForTimeout(150);
      } else {
        await page.waitForTimeout(150);
      }
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
  const numeroReconsideracion = `Reconsid N° ${numeroAleatorio}-${fechaUsar.getFullYear()}`;
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

  // Revalidar checkbox presentó reconsideración al final
  if (await presentoInput.isVisible().catch(() => false)) {
    const checkedFinal = await presentoInput.isChecked().catch(() => false);
    if (!checkedFinal) {
      if (await presentoBox.isVisible().catch(() => false)) {
        await presentoBox.click({ force: true });
      } else {
        await scope.locator('label[for="presentoReconsideracion"]').click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(150);
    }
  }

  const checkPresento = scope.locator('input#presentoReconsideracion');
  if (await checkPresento.count().catch(() => 0)) {
    const enabled = await checkPresento.isEnabled().catch(() => false);
    if (enabled && !(await checkPresento.isChecked().catch(() => false))) {
      await scope.locator('label[for="presentoReconsideracion"]').click({ force: true }).catch(() => {});
      await page.waitForTimeout(150);
    }
  }

  return numeroReconsideracion;
}

/**
 * Abre el formulario de nuevo administrado
 */
export async function abrirFormularioNuevoAdministrado(page: Page): Promise<void> {
  console.log('➕ Abriendo formulario nuevo administrado...');
  const dialogAbierto = page.getByRole('dialog').filter({ hasText: /Agregar\s*Administrado|Registrar\s*Sancionar/i }).first();
  if (await dialogAbierto.isVisible().catch(() => false)) {
    console.log('✅ Formulario ya abierto');
    return;
  }

  const recuperarPantalla = async (intento: number): Promise<void> => {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);

    const linkModulo = page.getByRole('link', { name: /Infractor y Sanci[oó]n|Administrado|Administrados/i }).first();
    if (await linkModulo.isVisible().catch(() => false)) {
      await linkModulo.click({ timeout: 10000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle').catch(() => {});
    }

    if (intento >= 1) {
      await page.reload().catch(() => {});
      await page.waitForLoadState('domcontentloaded');
      await page.waitForLoadState('networkidle').catch(() => {});
    }
  };
  
  await page.waitForLoadState('networkidle');
  const overlay = page.locator('.p-dialog-mask, .p-component-overlay');
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.first().waitFor({ state: 'hidden', timeout: 10000 }).catch(async () => {
      await page.keyboard.press('Escape').catch(() => {});
      await overlay.first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    });
  }
  const candidatos = [
    page.locator('div.flex.align-items-end button.btn-royal-blue.p-button-icon-only:has(span.pi.pi-user-plus)').first(),
    page.locator('div.flex.align-items-end span.pi.pi-user-plus').first().locator('xpath=ancestor::button[1]'),
    page.getByRole('button', { name: /Registrar\s*Sancionar/i }).first(),
    page.getByRole('button', { name: /Agregar\s*Administrado|Nuevo\s*Administrado|Administrado/i }).first(),
    page.getByRole('button', { name: /Nuevo administrado|Nuevo/i }).first(),
    page.getByRole('button', { name: /Agregar|Registrar|Administrado/i }).first(),
    page.locator('button:has-text("Registrar Sancionar")').first(),
    page.locator('button:has-text("Nuevo")').first(),
    page.locator('button:has-text("Agregar")').first(),
    page.locator('button:has(span.pi.pi-user-plus)').first(),
    page.locator('span.pi.pi-user-plus').first().locator('xpath=ancestor::button[1]'),
    page.locator('button.ant-btn-primary.ant-btn-icon-only').first(),
    page.locator('button.ant-btn-primary').first()
  ];

  const modal = page.getByRole('dialog').filter({ hasText: /Agregar\s*Administrado|Registrar\s*Sancionar/i }).first();
  const modalAlt = page.locator('.ant-modal, .p-dialog').filter({ hasText: /Agregar\s*Administrado|Registrar\s*Sancionar/i }).first();
  const rucGlobal = page.locator('input[formcontrolname*="ruc" i], input[name*="ruc" i], input[id*="ruc" i], input[placeholder*="ruc" i], input[aria-label*="ruc" i]').first();

  let abierto = false;
  for (let intento = 0; intento < 3 && !abierto; intento++) {
    for (const boton of candidatos) {
      if (!(await boton.isVisible().catch(() => false))) continue;
      await boton.scrollIntoViewIfNeeded().catch(() => {});
      await boton.click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);

      const modalVisible = await modal.isVisible().catch(() => false);
      const modalAltVisible = await modalAlt.isVisible().catch(() => false);
      const rucVisible = await rucGlobal.isVisible().catch(() => false);
      if (modalVisible || modalAltVisible || rucVisible) {
        abierto = true;
        break;
      }
    }

    if (!abierto) {
      console.log(`⚠️ No se pudo abrir formulario (intento ${intento + 1}/3). Aplicando recuperación...`);
      await recuperarPantalla(intento);
    }
  }

  if (!abierto) {
    const botones = page.getByRole('button');
    const totalBotones = await botones.count().catch(() => 0);
    const maxExplorar = Math.min(totalBotones, 20);
    for (let i = 0; i < maxExplorar && !abierto; i++) {
      const boton = botones.nth(i);
      const visible = await boton.isVisible().catch(() => false);
      if (!visible) continue;

      const texto = (await boton.innerText().catch(() => '')).trim();
      if (/limpiar|buscar|exportar|expandir|profile|iniciar\s*sesi[oó]n|acceder/i.test(texto)) {
        continue;
      }

      await boton.scrollIntoViewIfNeeded().catch(() => {});
      await boton.click({ force: true }).catch(() => {});
      await page.waitForTimeout(250);

      const modalVisible = await modal.isVisible().catch(() => false);
      const modalAltVisible = await modalAlt.isVisible().catch(() => false);
      const rucVisible = await rucGlobal.isVisible().catch(() => false);
      if (modalVisible || modalAltVisible || rucVisible) {
        abierto = true;
      }
    }
  }

  if (!abierto) {
    throw new Error('No se pudo abrir formulario de Administrado. Botones intentados sin éxito (Agregar/Nuevo/Registrar Sancionar).');
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
  await page.waitForLoadState('networkidle');

  const candidatos = [
    page.getByRole('button').filter({ hasText: /Registrar\s*Sanci[oó]n|Registrar|Sanci[oó]n/i }).first(),
    page.getByRole('button', { name: /Registrar\s*Sanci[oó]n|Registrar|Sanci[oó]n/i }).first(),
    page.locator('button:has-text("Registrar")').first(),
    page.locator('button:has-text("Sanción")').first(),
    page.locator('button:has-text("Sancion")').first()
  ];

  let abierto = false;
  for (let intento = 1; intento <= 3 && !abierto; intento++) {
    for (const boton of candidatos) {
      if (await boton.isVisible().catch(() => false)) {
        await boton.scrollIntoViewIfNeeded().catch(() => {});
        await boton.click({ timeout: 45000 }).catch(() => {});
        abierto = true;
        break;
      }
    }

    if (!abierto) {
      console.log(`⚠️ Botón no visible (intento ${intento}/3). Esperando y reintentando...`);
      await page.waitForTimeout(2000);
      await page.waitForLoadState('networkidle');
    }
  }

  if (!abierto) {
    const botonAlt = page.getByRole('button').filter({ hasText: /Registrar|Sanci[oó]n/i }).first();
    await botonAlt.waitFor({ state: 'visible', timeout: 45000 });
    await botonAlt.click({ timeout: 45000 });
  }

  // Espera inteligente: esperar a que el formulario/modal esté visible
  await page.locator('form').first().waitFor({ state: 'visible', timeout: 45000 });
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
 * Obtiene un administrado aleatorio de la lista
 * SOLUCIÓN FINAL CORRECTA PARA PRIMENNG (con sincronización del DOM)
 */
export async function obtenerAdministradoAleatorio(page: Page, indicePreferido?: number): Promise<string> {
  console.log('🎲 Seleccionando administrado aleatorio...');
  
  try {
    // PASO 0: Hacer clic en el dropdown para abrirlo
    console.log('   Paso 0: Abriendo dropdown...');
    const dropdown = page.locator('p-dropdown[formcontrolname="idAdministrado"], p-dropdown[formcontrolname="administrado"]').first();
    
    if (await dropdown.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dropdown.click();
      await page.waitForTimeout(500);
      console.log('   ✓ Dropdown clickeado');
    } else {
      console.warn('   ⚠️ Dropdown no visible, intentando alternativa...');
      const allDropdowns = await page.locator('p-dropdown').all();
      if (allDropdowns.length > 0) {
        await allDropdowns[0].click();
        await page.waitForTimeout(500);
      }
    }

    // PASO 1: Esperar que el panel del dropdown esté visible
    console.log('   Paso 1: Esperando panel del dropdown...');
    const panel = page.locator('.p-dropdown-panel');
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    console.log('   ✓ Panel visible');

    // PASO 2: Esperar que existan opciones en el panel
    console.log('   Paso 2: Esperando opciones...');
    const options = panel.locator('.p-dropdown-item');
    await options.first().waitFor({ state: 'visible', timeout: 10000 });
    const count = await options.count();
    console.log(`   ✓ ${count} opciones encontradas`);

    if (count === 0) {
      throw new Error('No hay opciones en el dropdown de Administrado');
    }

    // PASO 3: Seleccionar opción aleatoria
    console.log('   Paso 3: Seleccionando opción aleatoria...');
    const indiceBase = typeof indicePreferido === 'number'
      ? ((indicePreferido % count) + count) % count
      : Math.floor(Math.random() * count);
    const optionSeleccionada = options.nth(indiceBase);
    
    const administradoSeleccionado = (await optionSeleccionada.innerText())?.trim() || `Opcion_${indiceBase}`;
    console.log(`   Opción ${indiceBase + 1}/${count}: "${administradoSeleccionado}"`);
    
    // PASO 4: Clickear la opción
    console.log('   Paso 4: Clickeando opción...');
    
    // Scroll into view si es necesario
    await optionSeleccionada.scrollIntoViewIfNeeded();
    
    // Pequeño delay sin esperar (usar setImmediate en lugar de waitForTimeout)
    await new Promise(r => setTimeout(r, 100));
    
    // Hacer el clic
    await optionSeleccionada.click({ force: true });
    
    // PASO 5: Esperar que el panel del dropdown se cierre (indicador de selección exitosa)
    console.log('   Paso 5: Esperando confirmación del cambio...');
    const panelDropdown = page.locator('.p-dropdown-panel');
    
    // Esperar a que el panel desaparezca (indicador de que la selección se procesó)
    try {
      await panelDropdown.waitFor({ state: 'hidden', timeout: 3000 });
      console.log(`   ✅ Opción seleccionada y confirmada\n`);
    } catch (e) {
      // Si el panel no desaparece, seguir adelante (a veces sucede)
      console.log(`   ⚠️  Panel no desapareció, pero continuando...\n`);
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
  modal?: string
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

  const visible = await toast.isVisible({ timeout: 15000 }).catch(() => false);
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
