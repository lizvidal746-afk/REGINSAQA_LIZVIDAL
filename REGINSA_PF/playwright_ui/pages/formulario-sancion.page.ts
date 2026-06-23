import { expect, Page, Response } from '@playwright/test';
import { BasePage } from './base.page';

type JsonMap = Record<string, unknown>;

type SaveApiObservation = {
  method: string;
  url: string;
  endpoint: string;
  status: number;
  registroId?: string;
  authHeaderCaptured?: boolean;
  bodyPreview?: string;
  payloadPreview?: string;
};

export type GuardarFormularioResult = {
  id: string;
  registroId: string;
  endpoint: string;
  status: number;
  url: string;
  responseBody: unknown;
  observed: SaveApiObservation[];
  toastVisible: boolean;
  authorizationHeader?: string;
};

const SAVE_ENDPOINTS = [
  'CabeceraInfraccionSancion/Crear',
  'CabeceraInfraccionSancion/CrearConDetalles',
  'CabeceraInfraccionSancion/Actualizar',
  'MedidaCorrectiva/Crear',
  'DetalleInfraccionSancion/Crear',
] as const;

function isJsonMap(value: unknown): value is JsonMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonBody(bodyText: string): unknown {
  if (!bodyText.trim()) return {};
  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}

function preview(value: string, maxLength = 700): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function findEndpoint(url: string): string | null {
  const normalized = url.toLowerCase();
  return SAVE_ENDPOINTS.find((endpoint) => normalized.includes(endpoint.toLowerCase())) || null;
}

function getNested(value: unknown, keys: string[]): unknown {
  if (!isJsonMap(value)) return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }
  }
  return undefined;
}

function stringifyId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractCabeceraId(body: unknown, url: string): string | null {
  const idFromUrl = /cabecerainfraccionsancion\/actualizar\/(\d+)/i.exec(url)?.[1];
  if (idFromUrl) return idFromUrl;

  const directId = stringifyId(
    getNested(body, ['idCabeceraInfraccionSancion', 'IdCabeceraInfraccionSancion', 'RESULTADO', 'resultado'])
  );
  if (directId) return directId;

  const oData = getNested(body, ['oData', 'OData', 'data', 'Data']);
  const oDataId = stringifyId(oData);
  if (oDataId) return oDataId;

  if (isJsonMap(oData)) {
    const nestedId = stringifyId(
      getNested(oData, ['idCabeceraInfraccionSancion', 'IdCabeceraInfraccionSancion', 'id', 'Id', 'RESULTADO', 'resultado'])
    );
    if (nestedId) return nestedId;
  }

  if (Array.isArray(oData)) {
    for (const item of oData) {
      if (!isJsonMap(item)) continue;
      const nestedId = stringifyId(
        getNested(item, ['idCabeceraInfraccionSancion', 'IdCabeceraInfraccionSancion', 'id', 'Id', 'RESULTADO', 'resultado'])
      );
      if (nestedId) return nestedId;
    }
  }

  return null;
}

function summarizeObservations(observed: SaveApiObservation[]): string {
  if (observed.length === 0) return 'sin respuestas relevantes capturadas';
  return observed
    .map((item, index) => {
      const id = item.registroId ? ` id=${item.registroId}` : '';
      const body = item.bodyPreview ? ` body=${item.bodyPreview}` : '';
      return `${index + 1}) ${item.method} ${item.endpoint} status=${item.status}${id}${body}`;
    })
    .join(' | ');
}

export class FormularioSancionPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Selecciona un administrado aleatoriamente del dropdown
   */
  async seleccionarAdministrado(indicePreferido?: number): Promise<string> {
    const dropdown = this.page.locator('p-dropdown[formcontrolname="idAdministrado"], p-dropdown[formcontrolname="administrado"], p-dropdown').first();
    await expect(dropdown).toBeVisible({ timeout: this.uiTimeout() });
    await dropdown.scrollIntoViewIfNeeded();
    await dropdown.click({ force: true });

    const panel = this.page.locator('.p-dropdown-panel:visible').last();
    await panel.waitFor({ state: 'visible', timeout: 5000 });

    const options = this.page.locator('.p-dropdown-panel:visible .p-dropdown-item');
    await options.first().waitFor({ state: 'visible', timeout: 5000 });
    const count = await options.count();

    if (count === 0) {
      throw new Error('No hay opciones en el dropdown de Administrado');
    }

    const index = typeof indicePreferido === 'number'
      ? ((indicePreferido % count) + count) % count
      : Math.floor(Math.random() * count);
    const option = options.nth(index);
    const nombre = (await option.innerText())?.trim() || `Opcion_${index}`;

    await option.scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(200);
    await option.click({ force: true });

    const panelDropdown = this.page.locator('.p-dropdown-panel');
    await panelDropdown.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    return nombre;
  }

  /**
   * Llena el campo de número de expediente
   */
  async llenarNumeroExpediente(numero: string): Promise<this> {
    // Esperar a que desaparezcan diálogos o toasts activos que puedan bloquear el DOM
    await this.page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    await this.page.locator('.p-toast-message').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await this.page.locator('.p-progress-spinner').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

    // Sin networkidle: esperar directamente el campo del formulario
    const expedienteInput = this.page.locator('input[formcontrolname="numeroExpediente"]');
    await expect(expedienteInput).toBeVisible({ timeout: this.uiTimeout() });
    await expedienteInput.scrollIntoViewIfNeeded();
    await expedienteInput.click({ force: true });
    await expedienteInput.fill(numero);
    await this.page.waitForTimeout(300);
    return this;
  }

  /**
   * Llena el campo de número de resolución
   */
  async llenarNumeroResolucion(numero: string): Promise<this> {
    const resolucionInput = this.page.locator('input[formcontrolname="numeroResolucion"]');
    await expect(resolucionInput).toBeVisible({ timeout: this.uiTimeout() });
    await resolucionInput.click();
    await resolucionInput.fill(numero);
    return this;
  }

  /**
   * Llena la fecha de resolución
   */
  async llenarFechaResolucion(fecha: string): Promise<this> {
    const calendarInput = this.page.locator('p-calendar[formcontrolname="fechaResolucion"] input, p-calendar input').first();
    await expect(calendarInput).toBeVisible({ timeout: this.uiTimeout() });
    await calendarInput.scrollIntoViewIfNeeded();
    await calendarInput.click({ force: true });
    // Borrar contenido previo y escribir
    await calendarInput.press('Control+a');
    await calendarInput.press('Backspace');
    await calendarInput.fill(fecha);
    await calendarInput.press('Enter');
    await calendarInput.press('Tab');
    await this.page.waitForTimeout(800);
    return this;
  }

  /**
   * Sube un documento PDF
   */
  async subirDocumento(ruta: string): Promise<this> {
    // Sin networkidle: esperar que el input de archivo esté adjunto al DOM
    const fileInput = this.page.locator('input[type="file"]').first();
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });
    await fileInput.setInputFiles(ruta);
    // Dar tiempo al servidor para procesar el upload
    await this.page.waitForTimeout(2000);
    return this;
  }

  /**
   * Agrega una medida correctiva
   */
  async agregarMedidaCorrectiva(medida: string): Promise<this> {
    // Sin networkidle: esperar directamente el textarea de medida
    const medidaInput = this.page.locator('textarea[placeholder*="medida correctiva"]').first();
    await expect(medidaInput).toBeVisible({ timeout: this.uiTimeout() });
    await medidaInput.scrollIntoViewIfNeeded();
    await medidaInput.click({ force: true });
    await medidaInput.fill(medida);
    await this.page.waitForTimeout(300);
    return this;
  }

  /**
   * Hace clic en el botón de agregar medida
   */
  async clickAgregarMedida(): Promise<this> {
    const btnAgregar = this.page.getByRole('button', { name: 'Agregar medida' });
    if (await btnAgregar.isVisible().catch(() => false)) {
      await this.page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      await btnAgregar.click({ force: true });
      await this.page.waitForTimeout(500);
    }
    return this;
  }

  /**
   * Navega a la pestaña de Detalle de sanciones
   */
  async irADetalleSanciones(): Promise<this> {
    const tabDetalle = this.page.getByRole('tab', { name: 'Detalle de sanciones' });
    await expect(tabDetalle).toBeVisible({ timeout: this.uiTimeout() });
    await tabDetalle.click();
    await this.page.waitForTimeout(2000);
    return this;
  }

  /**
   * Hace clic en el botón de agregar sanción
   */
  async clickAgregarSancion(): Promise<this> {
    // Sin networkidle: esperar desaparición de overlays y visibilidad del botón
    await this.page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    await this.page.locator('.p-progress-spinner').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await this.page.waitForTimeout(500);

    const btnAgregar = this.page
      .locator('button[label="Agregar sanción"][icon="pi pi-plus"]')
      .or(this.page.getByRole('button', { name: /^Agregar\s*sanci[oó]n$/i }))
      .or(this.page.locator('button:has-text("Agregar sanción")'))
      .or(this.page.locator('button:has(span.pi-plus)').filter({ hasText: /Agregar\s*sanci[oó]n/i }))
      .first();
    await expect(btnAgregar).toBeVisible({ timeout: this.uiTimeout() });
    await btnAgregar.scrollIntoViewIfNeeded();
    await this.page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    await btnAgregar.click({ force: true });
    await this.page.waitForTimeout(1500);
    return this;
  }

  async contarSancionesAgregadas(): Promise<number> {
    const rows = this.page.locator(
      '.p-tabview-panel:visible table tbody tr, ' +
      '.p-tabview-panel:visible .p-datatable-tbody tr, ' +
      '[role="tabpanel"]:visible table tbody tr, ' +
      '[role="tabpanel"]:visible .p-datatable-tbody tr'
    );
    const total = await rows.count();
    let validRows = 0;

    for (let index = 0; index < total; index += 1) {
      const text = normalizeText((await rows.nth(index).innerText().catch(() => '')) || '');
      if (!text) continue;
      if (/sin registros|no records|no se encontraron|empty|cargando/.test(text)) continue;
      validRows += 1;
    }

    return validRows;
  }

  async validarMinimoSancionesAgregadas(minimo: number): Promise<void> {
    await expect
      .poll(async () => this.contarSancionesAgregadas(), {
        timeout: 15000,
        intervals: [500, 1000, 2000],
        message: `DEFECTO FUNCIONAL: el expediente no debe guardarse sin al menos ${minimo} sancion(es) agregada(s).`,
      })
      .toBeGreaterThanOrEqual(minimo);
  }

  async guardarFormulario(): Promise<GuardarFormularioResult> {
    const btnGuardar = this.page
      .locator('button[label="Guardar"][icon="pi pi-save"]')
      .or(this.page.getByRole('button', { name: /^Guardar$/i }))
      .first();
    await expect(btnGuardar).toBeVisible({ timeout: this.uiTimeout() });
    await this.page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {});
    await this.page.locator('.p-toast-message').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});

    const observed: SaveApiObservation[] = [];
    const timeoutMs = this.apiTimeout();
    const capturePayload = process.env.REGINSA_CAPTURE_SAVE_PAYLOAD === '1';
    let settled = false;

    // CORRECCIÓN (2026-06-10): Registrar el interceptor ANTES del click
    // para no perder respuestas rápidas del servidor bajo baja latencia.
    // Bajo alta concurrencia en QA, el servidor puede responder en < 100ms.
    let resolveStrict!: (v: GuardarFormularioResult) => void;
    const strictApiPromise = new Promise<GuardarFormularioResult>((resolve) => {
      resolveStrict = resolve;
    });

    const onResponse = async (response: Response) => {
      if (settled) return;

      const request = response.request();
      const method = request.method().toUpperCase();
      if (!['POST', 'PUT', 'PATCH'].includes(method)) return;

      const url = response.url();
      const endpoint = findEndpoint(url);
      if (!endpoint) return;

      const bodyText = await response.text().catch(() => '');
      const responseBody = parseJsonBody(bodyText);
      const status = response.status();
      const isCabecera = endpoint.toLowerCase().includes('cabecerainfraccionsancion');
      const registroId = isCabecera ? extractCabeceraId(responseBody, url) : null;
      const authorizationHeader = request.headers().authorization;
      const observation: SaveApiObservation = {
        method,
        url,
        endpoint,
        status,
        ...(registroId ? { registroId } : {}),
        ...(authorizationHeader ? { authHeaderCaptured: true } : {}),
        ...(bodyText ? { bodyPreview: preview(bodyText) } : {}),
        ...(capturePayload && request.postData() ? { payloadPreview: preview(request.postData() || '') } : {}),
      };
      observed.push(observation);

      if (status >= 200 && status < 300 && registroId) {
        settled = true;
        this.page.off('response', onResponse);
        resolveStrict({
          id: registroId,
          registroId,
          endpoint,
          status,
          url,
          responseBody,
          observed,
          toastVisible: false,
          ...(authorizationHeader ? { authorizationHeader } : {}),
        });
      }
    };

    // Interceptor registrado ANTES del click
    this.page.on('response', onResponse);

    await btnGuardar.click({ force: true });

    const timeoutPromise = this.page.waitForTimeout(timeoutMs).then(async () => {
      this.page.off('response', onResponse);
      
      // Proactive recovery check: let's see if the page transitioned or if there is a success indicator
      const toastOk = this.page.locator(
        '.p-toast-message-success, .p-toast-message[aria-label*="Éxito"], .p-toast-message[style*="green"]'
      ).first();
      const toastVisible = await toastOk.isVisible({ timeout: 5000 }).catch(() => false);
      
      // Attempt recovery: extract the typed expediente number if possible
      const expInput = this.page.locator('input[formcontrolname="numeroExpediente"]').first();
      let numeroExpediente = '';
      try {
        if (await expInput.isVisible()) {
          numeroExpediente = await expInput.inputValue();
        }
      } catch (e) {}

      if (numeroExpediente) {
        console.log(`[FormularioSancionPage] Intercepción fallida/demorada. Iniciando recuperación activa proactiva por ListarPaginado para expediente: ${numeroExpediente}...`);
        try {
          const token = await this.extraerTokenAplicativo();
          const apiBase = (process.env.REGINSA_API_BASE_URL || 'https://reginsaapiqa.sunedu.gob.pe/api').replace(/\/+$/, '');
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          };
          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }
          
          const response = await this.page.request.post(`${apiBase}/CabeceraInfraccionSancion/ListarPaginado`, {
            data: {
              nPageNumber: 1,
              nPageSize: 10,
              filtroGeneral: numeroExpediente,
              numeroExpediente,
            },
            headers,
          });

          if (response.ok()) {
            const payload = await response.json().catch(() => ({}));
            const rows = this.extraerFilasCabecera(payload);
            // Buscar la fila que coincida con el número de expediente
            const matchingRow = rows.find((row) => {
              const rowExp = stringifyId(getNested(row, ['NumeroExpediente', 'numeroExpediente']));
              return rowExp ? normalizeText(rowExp) === normalizeText(numeroExpediente) : false;
            });

            if (matchingRow) {
              const recoveredId = stringifyId(getNested(matchingRow, ['idCabeceraInfraccionSancion', 'IdCabeceraInfraccionSancion', 'id', 'Id']));
              if (recoveredId) {
                console.log(`[FormularioSancionPage] ¡Recuperación exitosa! ID recuperado: ${recoveredId}`);
                return {
                  id: recoveredId,
                  registroId: recoveredId,
                  endpoint: 'CabeceraInfraccionSancion/ListarPaginado (Recuperado)',
                  status: 200,
                  url: `${apiBase}/CabeceraInfraccionSancion/ListarPaginado`,
                  responseBody: matchingRow,
                  observed,
                  toastVisible: true,
                };
              }
            }
          }
        } catch (recoverErr) {
          console.error('[FormularioSancionPage] Error durante la recuperación activa:', recoverErr);
        }
      }

      const toastNote = toastVisible
        ? ' Se detectó toast de éxito, pero no se pudo recuperar el ID desde ListarPaginado.'
        : '';
      throw new Error(
        `No se capturó un ID real de CabeceraInfraccionSancion al guardar.${toastNote} Evidencia API: ${summarizeObservations(observed)}`
      );
    });

    const result = await Promise.race([strictApiPromise, timeoutPromise]);

    await this.page.waitForTimeout(1000);
    return result;
  }

  async validarPersistenciaCabecera(
    numeroExpediente: string,
    registroId: string,
    authorizationHeader?: string
  ): Promise<void> {
    const token = await this.extraerTokenAplicativo();
    const apiBase = (process.env.REGINSA_API_BASE_URL || 'https://reginsaapiqa.sunedu.gob.pe/api').replace(/\/+$/, '');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (authorizationHeader) {
      headers.Authorization = authorizationHeader;
    } else if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const registroIdNumber = Number(registroId);
    const idFilter = Number.isFinite(registroIdNumber) ? registroIdNumber : registroId;
    const attempts = [
      {
        name: 'idCabeceraInfraccionSancion',
        data: {
          nPageNumber: 1,
          nPageSize: 20,
          idCabeceraInfraccionSancion: idFilter,
        },
      },
      {
        name: 'numeroExpediente',
        data: {
          nPageNumber: 1,
          nPageSize: 20,
          filtroGeneral: numeroExpediente,
          numeroExpediente,
        },
      },
      {
        name: 'paginaAmplia',
        data: {
          nPageNumber: 1,
          nPageSize: 100,
        },
      },
    ];
    const snapshots: string[] = [];

    for (const attempt of attempts) {
      const response = await this.page.request.post(`${apiBase}/CabeceraInfraccionSancion/ListarPaginado`, {
        data: attempt.data,
        headers,
      });

      if (!response.ok()) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `No se pudo validar la persistencia por API ListarPaginado (${attempt.name}). Status=${response.status()} Body=${preview(body)}`
        );
      }

      const payload = await response.json().catch(() => ({}));
      const rows = this.extraerFilasCabecera(payload);
      const encontrado = rows.some((row) => this.cabeceraCoincide(row, numeroExpediente, registroId));
      snapshots.push(`${attempt.name}: filas=${rows.length}`);

      if (encontrado) return;
    }

    throw new Error(
      `La cabecera guardada no aparece en CabeceraInfraccionSancion/ListarPaginado. registroId=${registroId}, expediente=${numeroExpediente}. Consultas: ${snapshots.join('; ')}`
    );
  }

  private cabeceraCoincide(row: JsonMap, numeroExpediente: string, registroId: string): boolean {
    const id = stringifyId(getNested(row, ['idCabeceraInfraccionSancion', 'IdCabeceraInfraccionSancion', 'id', 'Id']));
    const expediente = stringifyId(getNested(row, ['NumeroExpediente', 'numeroExpediente']));
    return id === registroId || (expediente ? normalizeText(expediente) === normalizeText(numeroExpediente) : false);
  }

  private extraerFilasCabecera(payload: unknown): JsonMap[] {
    const candidates = [
      getNested(getNested(payload, ['oData', 'OData']), ['Results', 'results']),
      getNested(getNested(payload, ['oData', 'OData']), ['Data', 'data', 'Items', 'items', 'Rows', 'rows']),
      getNested(payload, ['Results', 'results']),
      getNested(payload, ['Data', 'data', 'Items', 'items', 'Rows', 'rows']),
      getNested(payload, ['oData', 'OData']),
      payload,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter(isJsonMap);
      }
    }

    return [];
  }

  private async extraerTokenAplicativo(): Promise<string> {
    const tokenRaw = await this.page.evaluate(() => {
      const directKeys = ['token', 'access_token', 'authToken', 'jwtToken', 'Authorization'];
      const storages = [window.localStorage, window.sessionStorage];

      const normalize = (value: string | null): string => {
        if (!value) return '';
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object') {
            const record = parsed as Record<string, unknown>;
            for (const key of ['token', 'access_token', 'accessToken', 'authToken', 'jwt']) {
              const candidate = record[key];
              if (typeof candidate === 'string' && candidate.trim()) return candidate;
            }
          }
        } catch {
          // Continue with raw value.
        }
        return value;
      };

      for (const storage of storages) {
        for (const key of directKeys) {
          const value = normalize(storage.getItem(key));
          if (value) return value;
        }

        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (!key || !/token|auth|bearer|jwt/i.test(key)) continue;
          const value = normalize(storage.getItem(key));
          if (value) return value;
        }
      }

      return '';
    }).catch(() => '');

    return String(tokenRaw || '').trim().replace(/^Bearer\s+/i, '');
  }
}
