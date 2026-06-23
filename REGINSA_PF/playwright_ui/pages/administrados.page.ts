import { expect, Locator, Page, Response } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { BasePage } from './base.page';
import { buildPfRunSuffix, getPfRunLabel } from '../helpers/pf-run-label';

type JsonMap = Record<string, unknown>;
type RecoveryHttpResult = {
  source: 'apiRequest' | 'browserFetch';
  status: number;
  ok: boolean;
  bodyText: string;
};

export type AdministradoData = {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  estado: string;
};

export type GuardarAdministradoResult = {
  registroId: string;
  endpoint: string;
  status: number;
  url: string;
  responseBody: unknown;
  authorizationHeader?: string;
};

const DUPLICADO_REGEX = /duplicad|ya existe|registrad[oa]|ruc|raz[oó]n social/i;

function isJsonMap(value: unknown): value is JsonMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNested(value: unknown, keys: string[]): unknown {
  if (!isJsonMap(value)) return undefined;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  }
  return undefined;
}

function stringifyId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function preview(value: string, maxLength = 700): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function parseJsonBody(bodyText: string): unknown {
  if (!bodyText.trim()) return {};
  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}

function extractEntidadId(body: unknown): string | null {
  const direct = stringifyId(getNested(body, ['idEntidad', 'IdEntidad', 'id', 'Id']));
  if (direct) return direct;

  const oData = getNested(body, ['oData', 'OData', 'data', 'Data']);
  const oDataId = stringifyId(oData);
  if (oDataId) return oDataId;

  if (isJsonMap(oData)) {
    return stringifyId(getNested(oData, ['idEntidad', 'IdEntidad', 'id', 'Id']));
  }

  return null;
}

function normalizarTexto(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function generarRucUnico(slot: number, repeatIndex: number, retryIndex = 0): string {
  const runSeed =
    process.env.REGINSA_FUNC_RUN_SEED ||
    process.env.TEST_RUN_SEED ||
    process.env.REGINSA_FUNC_RUN_ID ||
    new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const seed = String(runSeed).replace(/\D/g, '').slice(-6).padStart(6, '2');
  const slotPart = String(slot).padStart(2, '0');
  const repeatPart = String(repeatIndex + 1).padStart(2, '0');
  const retryPart = String(retryIndex).padStart(1, '0').slice(-1);
  return `2${seed}${slotPart}${repeatPart}${retryPart}`.slice(-11);
}

function normalizarRucPool(value: string): string | null {
  const ruc = value.replace(/\D/g, '');
  return /^\d{11}$/.test(ruc) ? ruc : null;
}

function leerRucsDesdeTexto(value: string): string[] {
  const vistos = new Set<string>();
  return value
    .split(/[\r\n,;|\t ]+/)
    .map((item) => normalizarRucPool(item))
    .filter((ruc): ruc is string => Boolean(ruc))
    .filter((ruc) => {
      if (vistos.has(ruc)) return false;
      vistos.add(ruc);
      return true;
    });
}

function resolverRutaPoolRucs(): string | null {
  const configured = process.env.REGINSA_ADMIN_RUC_POOL_FILE?.trim();
  if (!configured) return null;
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

function leerPoolRucsConfigurado(): string[] {
  const inlinePool = process.env.REGINSA_ADMIN_RUC_POOL?.trim();
  if (inlinePool) return leerRucsDesdeTexto(inlinePool);

  const poolPath = resolverRutaPoolRucs();
  if (!poolPath || !fs.existsSync(poolPath)) return [];
  return leerRucsDesdeTexto(fs.readFileSync(poolPath, 'utf-8'));
}

function tomarRucDesdePool(slot: number, repeatIndex: number, retryIndex = 0): string | null {
  const pool = leerPoolRucsConfigurado();
  if (pool.length === 0) return null;

  const repeatEach = Number.parseInt(process.env.REGINSA_REPEAT_EACH || '1', 10);
  const registrosPorSlot = Number.isFinite(repeatEach) && repeatEach > 0 ? repeatEach : 1;
  const offset = Number.parseInt(process.env.REGINSA_ADMIN_RUC_POOL_OFFSET || '0', 10);
  const inicio = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const retryPadding = Math.max(retryIndex, 0) * Math.max(pool.length, registrosPorSlot);
  const index = inicio + retryPadding + ((Math.max(slot, 1) - 1) * registrosPorSlot) + Math.max(repeatIndex, 0);
  const ruc = pool[index];

  if (!ruc) {
    throw new Error(
      `Pool de RUC agotado para CP-REG-01. index=${index}, total=${pool.length}. Ajusta REGINSA_ADMIN_RUC_POOL_OFFSET o agrega mas RUCs al pool.`
    );
  }

  return ruc;
}

function serializeAdminSaveEnabled(): boolean {
  return /^(1|true|si|sí|yes|stable)$/i.test(process.env.REGINSA_ADMIN_SERIALIZE_SAVE || '');
}

export class AdministradosPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navegarAlModulo(): Promise<this> {
    const baseUrl = process.env.REGINSA_UI_BASE_URL || 'https://reginsaqa.sunedu.gob.pe';
    await this.irA(`${baseUrl}/#/pages/administrado`);
    await this.page.waitForLoadState('domcontentloaded');
    await this.esperarCapaCarga();
    return this;
  }

  async validarModuloCargado(): Promise<this> {
    await expect(
      this.page.locator('body').filter({ hasText: /administrado|r\.?u\.?c|raz[oó]n social/i })
    ).toBeVisible({ timeout: this.uiTimeout() });
    return this;
  }

  async abrirFormularioNuevoAdministrado(): Promise<this> {
    await this.esperarCapaCarga();
    const toolbarFiltros = this.page
      .locator('p-toolbar, .p-toolbar, [role="toolbar"]')
      .filter({ has: this.page.locator('input[placeholder*="RUC" i]') })
      .first();
    const botones = [
      this.page.getByRole('button', { name: /agregar administrado|nuevo administrado|agregar|nuevo/i }).first(),
      this.page.locator('button:has(.pi-plus), button:has(.pi-user-plus), button[label*="Agregar" i], button[label*="Nuevo" i]').first(),
      toolbarFiltros.locator('button').first(),
    ];

    for (const boton of botones) {
      if (await boton.isVisible().catch(() => false)) {
        await this.safeClick(boton);
        await this.esperarFormularioVisible();
        return this;
      }
    }

    throw new Error('No se encontro boton para abrir el formulario de administrado.');
  }

  generarDatos(slot: number, repeatIndex: number, retryIndex = 0): AdministradoData {
    const runLabel = getPfRunLabel();
    const retrySuffix = retryIndex > 0 ? `T${String(retryIndex + 1).padStart(2, '0')}` : '';
    const suffix = `${buildPfRunSuffix(slot, repeatIndex)}${retrySuffix}`;
    const ruc = tomarRucDesdePool(slot, repeatIndex, retryIndex) || generarRucUnico(slot, repeatIndex, retryIndex);
    return {
      ruc,
      razonSocial: `${runLabel} EMPRESA QA REGINSA ${ruc} ${suffix}`,
      nombreComercial: `${runLabel} COM REGINSA ${ruc} ${suffix}`,
      estado: process.env.REGINSA_ADMIN_ESTADO || 'Formal',
    };
  }

  async llenarFormulario(data: AdministradoData): Promise<this> {
    const form = await this.esperarFormularioVisible();
    await this.llenarCampo(form, /r\.?u\.?c/i, data.ruc, [
      form.locator('input[formcontrolname*="ruc" i], input[name*="ruc" i], input[id*="ruc" i], input[placeholder*="ruc" i]'),
    ]);
    await this.llenarCampo(form, /raz[oó]n social/i, data.razonSocial, [
      form.locator('input[formcontrolname*="razon" i], input[name*="razon" i], input[id*="razon" i], input[placeholder*="razon" i]'),
    ]);
    await this.llenarCampo(form, /nombre comercial/i, data.nombreComercial, [
      form.locator('input[formcontrolname*="comercial" i], input[name*="comercial" i], input[id*="comercial" i], input[placeholder*="comercial" i]'),
      form.locator('input[formcontrolname*="nombre" i], input[name*="nombre" i], input[id*="nombre" i], input[placeholder*="nombre" i]'),
    ]);
    await this.seleccionarEstado(data.estado);
    return this;
  }

  async guardarFormulario(data?: AdministradoData): Promise<GuardarAdministradoResult> {
    const btnGuardar = this.page.locator('button[label="Guardar"]').or(this.page.getByRole('button', { name: /^Guardar$/i })).first();
    await expect(btnGuardar).toBeVisible({ timeout: this.uiTimeout() });
    await this.esperarCapaCarga();
    if (data) await this.esperarFormularioListoParaGuardar(data, btnGuardar);
    await this.aplicarPausaDiagnosticaAntesDeGuardar(data);
    const releaseSaveLock = await this.adquirirBloqueoGuardadoAdministrado(data);

    const timeoutMs = this.apiTimeout();
    let observedAuthorizationHeader = '';
    let createRequestSeen = false;
    let createResponseSeen = false;
    let createResponseStatus = '';
    let createResponseBody = '';
    let createRequestFailure = '';
    let rejectCreateFailure: ((error: Error) => void) | null = null;
    const captureAuthorization = (request: { url(): string; headers(): Record<string, string> }) => {
      if (!/reginsaapiqa|\/api\//i.test(request.url())) return;
      const authorization = request.headers().authorization;
      if (authorization) observedAuthorizationHeader = authorization;
    };
    const captureCreateResponse = async (response: Response) => {
      const request = response.request();
      if (request.method().toUpperCase() !== 'POST' || !/\/api\/entidad\/crear/i.test(response.url())) return;
      createRequestSeen = true;
      createResponseSeen = true;
      createResponseStatus = String(response.status());
      createResponseBody = preview(await response.text().catch(() => ''), 350);
    };
    const captureRequestFailure = (request: { url(): string; method(): string; failure(): { errorText: string } | null }) => {
      if (request.method().toUpperCase() !== 'POST' || !/\/api\/entidad\/crear/i.test(request.url())) return;
      createRequestSeen = true;
      createRequestFailure = request.failure()?.errorText || 'requestfailed sin detalle';
      rejectCreateFailure?.(new Error(`Entidad/Crear requestfailed: ${createRequestFailure}`));
    };
    this.page.on('request', captureAuthorization);
    this.page.on('response', captureCreateResponse);
    this.page.on('requestfailed', captureRequestFailure);
    const createRequestPromise = this.page.waitForRequest((request) => {
      const method = request.method().toUpperCase();
      return method === 'POST' && /\/api\/entidad\/crear/i.test(request.url());
    }, { timeout: 10000 }).then(() => {
      createRequestSeen = true;
    }).catch(() => {});
    const requestFailedPromise = new Promise<never>((_, reject) => {
      rejectCreateFailure = reject;
    });
    const responsePromise = Promise.race([
      this.esperarRespuestaCrearEntidad(timeoutMs),
      requestFailedPromise,
    ]);
    try {
      await btnGuardar.click().catch(async () => btnGuardar.click({ force: true }));
      return await responsePromise;
    } catch (error) {
      if (!data) throw error;

      await createRequestPromise;
      const token = await this.extraerTokenAplicativo();
      const authorizationHeader = observedAuthorizationHeader || (token ? `Bearer ${token}` : undefined);
      const snapshots: string[] = [];
      const recovery = await this.buscarEntidadPersistidaConReintentos(data, authorizationHeader, snapshots);
      if (!recovery) {
        const original = error instanceof Error ? error.message : String(error);
        throw new Error(
          `No se pudo confirmar creacion de administrado por respuesta ni por Entidad/ListarPaginado. ruc=${data.ruc}, razonSocial=${data.razonSocial}. ` +
          `Original=${original}. SubmitRequest=${createRequestSeen ? 'SI' : 'NO'}. ` +
          `CreateResponse=${createResponseSeen ? `SI status=${createResponseStatus} body=${createResponseBody}` : 'NO'}. ` +
          `RequestFailed=${createRequestFailure || 'NO'}. AuthRecovery=${authorizationHeader ? 'SI' : 'NO'}. Recuperacion=${snapshots.join('; ')}`
        );
      }

      return {
        registroId: recovery.registroId,
        endpoint: 'Entidad/Crear (ID recuperado por Entidad/ListarPaginado)',
        status: 200,
        url: recovery.url,
        responseBody: recovery.row,
        ...(authorizationHeader ? { authorizationHeader } : {}),
      };
    } finally {
      releaseSaveLock();
      this.page.off('request', captureAuthorization);
      this.page.off('response', captureCreateResponse);
      this.page.off('requestfailed', captureRequestFailure);
    }
  }

  private async aplicarPausaDiagnosticaAntesDeGuardar(data?: AdministradoData): Promise<void> {
    const baseMs = Number.parseInt(process.env.REGINSA_ADMIN_SAVE_STAGGER_MS || '0', 10);
    if (!Number.isFinite(baseMs) || baseMs <= 0) return;

    const ruc = data?.ruc || '';
    const slot = Number.parseInt(ruc.slice(-5, -3), 10);
    const repeatIndex = Number.parseInt(ruc.slice(-3, -1), 10) - 1;
    const safeSlot = Number.isFinite(slot) && slot > 0 ? slot : 1;
    const safeRepeat = Number.isFinite(repeatIndex) && repeatIndex >= 0 ? repeatIndex : 0;
    const delay = (safeSlot - 1) * baseMs + safeRepeat * Math.min(baseMs, 1000);
    if (delay > 0) await this.page.waitForTimeout(delay);
  }

  private async adquirirBloqueoGuardadoAdministrado(data?: AdministradoData): Promise<() => void> {
    if (!serializeAdminSaveEnabled()) return () => {};

    const lockRoot = path.resolve(
      process.cwd(),
      '.tmp',
      'locks',
      process.env.TEST_RUN_ID || process.env.REGINSA_FUNC_RUN_ID || 'manual'
    );
    const lockDir = path.join(lockRoot, 'cp-reg-01-entidad-crear.lock');
    fs.mkdirSync(lockRoot, { recursive: true });

    const startedAt = Date.now();
    const maxWaitMs = Number.parseInt(process.env.REGINSA_ADMIN_SAVE_LOCK_TIMEOUT_MS || '180000', 10);
    const waitLimit = Number.isFinite(maxWaitMs) && maxWaitMs > 0 ? maxWaitMs : 180000;

    while (true) {
      try {
        fs.mkdirSync(lockDir);
        fs.writeFileSync(
          path.join(lockDir, 'owner.json'),
          JSON.stringify({
            pid: process.pid,
            ruc: data?.ruc || '',
            razonSocial: data?.razonSocial || '',
            createdAt: new Date().toISOString(),
          }, null, 2)
        );
        return () => {
          fs.rmSync(lockDir, { recursive: true, force: true });
        };
      } catch {
        const elapsed = Date.now() - startedAt;
        if (elapsed > waitLimit) {
          throw new Error(`Timeout esperando bloqueo funcional de Entidad/Crear. ruc=${data?.ruc || 'N/D'}`);
        }

        const ownerPath = path.join(lockDir, 'owner.json');
        const lockAgeMs = fs.existsSync(ownerPath) ? Date.now() - fs.statSync(ownerPath).mtimeMs : elapsed;
        if (lockAgeMs > waitLimit) fs.rmSync(lockDir, { recursive: true, force: true });
        await this.page.waitForTimeout(500);
      }
    }
  }

  private async esperarFormularioListoParaGuardar(data: AdministradoData, btnGuardar: Locator): Promise<void> {
    await expect.poll(async () => {
      const form = await this.esperarFormularioVisible();
      const values = await form.locator('input').evaluateAll((inputs) =>
        inputs.map((input) => {
          const element = input as HTMLInputElement;
          return {
            name: element.getAttribute('formcontrolname') || element.getAttribute('name') || element.id || '',
            value: element.value || '',
            disabled: element.disabled,
            readonly: element.readOnly,
          };
        })
      ).catch(() => []);

      const hasRuc = values.some((item) => /ruc/i.test(item.name) && item.value.trim() === data.ruc);
      const hasRazon = values.some((item) => /razon/i.test(item.name) && item.value.trim() === data.razonSocial);
      const hasComercial = values.some((item) => /comercial|nombre/i.test(item.name) && item.value.trim() === data.nombreComercial);
      const invalidCount = await form.locator('.ng-invalid[formcontrolname], input.ng-invalid').count().catch(() => 0);
      const pendingCount = await form.locator('.ng-pending').count().catch(() => 0);
      const enabled = await btnGuardar.isEnabled().catch(() => false);
      const disabledAttr = await btnGuardar.getAttribute('disabled').catch(() => null);
      const classAttr = await btnGuardar.getAttribute('class').catch(() => '');
      const blocked = disabledAttr !== null || /p-disabled|disabled/i.test(classAttr || '');

      return hasRuc && hasRazon && hasComercial && invalidCount === 0 && pendingCount === 0 && enabled && !blocked;
    }, {
      timeout: this.uiTimeout(),
      intervals: [500, 1000, 2000],
      message: `El formulario de administrado no quedo listo para guardar. ruc=${data.ruc}, razonSocial=${data.razonSocial}`,
    }).toBeTruthy();
  }

  async validarPersistencia(data: AdministradoData, authorizationHeader?: string): Promise<void> {
    const token = await this.extraerTokenAplicativo();
    const snapshots: string[] = [];
    const recovery = await this.buscarEntidadPersistida(data, authorizationHeader || (token ? `Bearer ${token}` : undefined), snapshots);
    if (recovery) return;

    throw new Error(
      `El administrado guardado no aparece en Entidad/ListarPaginado. ruc=${data.ruc}, razonSocial=${data.razonSocial}. Consultas: ${snapshots.join('; ')}`
    );
  }

  async validarObligatoriosBloqueanGuardado(): Promise<void> {
    const btnGuardar = this.page.locator('button[label="Guardar"]').or(this.page.getByRole('button', { name: /^Guardar$/i })).first();
    await expect(btnGuardar).toBeVisible({ timeout: this.uiTimeout() });

    const responsePromise = this.page.waitForResponse((response) => {
      const method = response.request().method().toUpperCase();
      return method === 'POST' && /\/api\/entidad\/crear/i.test(response.url());
    }, { timeout: 6000 }).catch(() => null);

    await btnGuardar.click({ force: true });
    const response = await responsePromise;
    if (response && response.status() >= 200 && response.status() < 300) {
      throw new Error('DEFECTO FUNCIONAL: El sistema permitio guardar administrado sin completar campos obligatorios.');
    }

    await expect(this.page.locator('body')).toContainText(/obligatorio|required|requerido|complete|ingrese|seleccione/i, {
      timeout: 8000,
    });
  }

  async validarMensajeDuplicadoEsperado(timeout = 12000): Promise<void> {
    await expect(this.page.locator('body')).toContainText(DUPLICADO_REGEX, {
      timeout,
    });
  }

  async validarDuplicadoBloqueaGuardado(): Promise<void> {
    const btnGuardar = this.page.locator('button[label="Guardar"]').or(this.page.getByRole('button', { name: /^Guardar$/i })).first();
    await expect(btnGuardar).toBeVisible({ timeout: this.uiTimeout() });

    const responsePromise = this.page.waitForResponse((response) => {
      const method = response.request().method().toUpperCase();
      return method === 'POST' && /\/api\/entidad\/crear/i.test(response.url());
    }, { timeout: 8000 }).catch(() => null);

    await btnGuardar.click({ force: true });
    const response = await responsePromise;
    if (response && response.status() >= 200 && response.status() < 300) {
      throw new Error('DEFECTO FUNCIONAL: El sistema permitio guardar RUC/Razon Social duplicados.');
    }

    await this.validarMensajeDuplicadoEsperado();
  }

  private async esperarFormularioVisible(): Promise<Locator> {
    const form = this.page
      .locator('form, p-dialog:visible, .p-dialog:visible, .card, .container')
      .filter({ has: this.page.locator('input[formcontrolname*="ruc" i], input[name*="ruc" i], input[id*="ruc" i]') })
      .first();
    await expect(form).toBeVisible({ timeout: this.uiTimeout() });
    return form;
  }

  private async llenarCampo(form: Locator, label: RegExp, value: string, preferred: Locator[]): Promise<void> {
    await this.fillFirstEditable([
      ...preferred,
      form.getByLabel(label),
      form.getByPlaceholder(label),
      form.locator('label', { hasText: label }).locator('xpath=following::input[1]'),
    ], value, 20000);
  }

  private async seleccionarEstado(estado: string): Promise<void> {
    const form = await this.esperarFormularioVisible();
    const actual = await form
      .locator('.p-dropdown-label, [role="combobox"], input[formcontrolname*="estado" i]')
      .first()
      .innerText()
      .catch(async () => form.locator('input[formcontrolname*="estado" i]').first().inputValue().catch(() => ''));

    if (actual && !/seleccione|select/i.test(actual)) return;

    const triggers = [
      form.locator('#estado, .p-dropdown:has([id*="estado" i]), p-dropdown[formcontrolname*="estado" i]').first(),
      form.getByRole('combobox', { name: /estado|seleccione/i }).first(),
      form.locator('.p-dropdown, [aria-haspopup="listbox"]').first(),
    ];

    for (const trigger of triggers) {
      if (!(await trigger.isVisible().catch(() => false))) continue;
      await this.selectPrimeOption(trigger, new RegExp(estado, 'i')).catch(async () => this.selectPrimeOption(trigger));
      return;
    }

    throw new Error(`No se pudo seleccionar estado "${estado}".`);
  }

  private async esperarRespuestaCrearEntidad(timeoutMs: number): Promise<GuardarAdministradoResult> {
    const response = await this.page.waitForResponse((res) => {
      const request = res.request();
      const method = request.method().toUpperCase();
      return method === 'POST' && /\/api\/entidad\/crear/i.test(res.url());
    }, { timeout: timeoutMs });

    const bodyText = await response.text().catch(() => '');
    const responseBody = parseJsonBody(bodyText);
    const registroId = extractEntidadId(responseBody);
    const authorizationHeader = response.request().headers().authorization;

    if (response.status() < 200 || response.status() >= 300 || !registroId) {
      throw new Error(
        `No se capturo ID real al crear administrado. status=${response.status()} body=${preview(bodyText)}`
      );
    }

    return {
      registroId,
      endpoint: 'Entidad/Crear',
      status: response.status(),
      url: response.url(),
      responseBody,
      ...(authorizationHeader ? { authorizationHeader } : {}),
    };
  }

  private extraerFilasEntidad(payload: unknown): JsonMap[] {
    const candidates = [
      getNested(getNested(payload, ['oData', 'OData']), ['Results', 'results']),
      getNested(getNested(payload, ['oData', 'OData']), ['Data', 'data', 'Items', 'items', 'Rows', 'rows']),
      getNested(payload, ['Results', 'results']),
      getNested(payload, ['Data', 'data', 'Items', 'items', 'Rows', 'rows']),
      getNested(payload, ['oData', 'OData']),
      payload,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate.filter(isJsonMap);
    }
    return [];
  }

  private entidadCoincide(row: JsonMap, data: AdministradoData): boolean {
    const ruc = stringifyId(getNested(row, ['Ruc', 'ruc', 'RUC']));
    const razonSocial = stringifyId(getNested(row, ['RazonSocial', 'razonSocial', 'razon_social']));
    return (
      (ruc ? normalizarTexto(ruc) === normalizarTexto(data.ruc) : false) ||
      (razonSocial ? normalizarTexto(razonSocial) === normalizarTexto(data.razonSocial) : false)
    );
  }

  private extraerEntidadIdFila(row: JsonMap): string | null {
    return stringifyId(getNested(row, ['idEntidad', 'IdEntidad', 'id', 'Id', 'nIdEntidad', 'NIdEntidad']));
  }

  private async buscarEntidadPersistida(
    data: AdministradoData,
    authorizationHeader?: string,
    snapshots: string[] = []
  ): Promise<{ registroId: string; row: JsonMap; url: string } | null> {
    const apiBase = (process.env.REGINSA_API_BASE_URL || 'https://reginsaapiqa.sunedu.gob.pe/api').replace(/\/+$/, '');
    const url = `${apiBase}/Entidad/ListarPaginado`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (authorizationHeader) headers.Authorization = authorizationHeader;

    const paginadoBase = {
      nPageNumber: 1,
      nPageSize: 20,
      sSortColumnName: 'FECHA_CREACION',
      sSortOrder: 'DESC',
      sFilterNombreComercial: '',
      nFilterIdEstado: null,
    };
    const attempts = [
      { name: 'RUC', data: { ...paginadoBase, sFilterRuc: data.ruc, sFilterValue: '' } },
      { name: 'RazonSocial', data: { ...paginadoBase, sFilterRuc: '', sFilterValue: data.razonSocial } },
      { name: 'PaginaReciente', data: { ...paginadoBase, sFilterRuc: '', sFilterValue: '', nPageSize: 100 } },
    ];

    for (const attempt of attempts) {
      const results = await this.consultarEntidadPersistida(url, attempt.data, headers);
      for (const result of results) {
        if (!result.ok) {
          snapshots.push(`${attempt.name}/${result.source}: status=${result.status} body=${preview(result.bodyText)}`);
          continue;
        }

        const rows = this.extraerFilasEntidad(parseJsonBody(result.bodyText));
        const match = rows.find((row) => this.entidadCoincide(row, data));
        snapshots.push(`${attempt.name}/${result.source}: filas=${rows.length}${match ? ' match=1' : ''}`);
        if (!match) continue;

        const registroId = this.extraerEntidadIdFila(match) || data.ruc;
        return { registroId, row: match, url };
      }
    }

    return null;
  }

  private async consultarEntidadPersistida(
    url: string,
    data: JsonMap,
    headers: Record<string, string>
  ): Promise<RecoveryHttpResult[]> {
    const results: RecoveryHttpResult[] = [];

    const apiResponse = await this.page.request.post(url, { data, headers }).catch((error: unknown) => {
      results.push({
        source: 'apiRequest',
        status: 0,
        ok: false,
        bodyText: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    if (apiResponse) {
      results.push({
        source: 'apiRequest',
        status: apiResponse.status(),
        ok: apiResponse.ok(),
        bodyText: await apiResponse.text().catch(() => ''),
      });
    }

    const apiRequestSucceeded = results.some((result) => result.source === 'apiRequest' && result.ok);
    if (apiRequestSucceeded) return results;

    const browserResult = await this.page.evaluate(
      async ({ endpoint, payload, requestHeaders }) => {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(payload),
            credentials: 'include',
          });
          return {
            source: 'browserFetch' as const,
            status: response.status,
            ok: response.ok,
            bodyText: await response.text(),
          };
        } catch (error) {
          return {
            source: 'browserFetch' as const,
            status: 0,
            ok: false,
            bodyText: error instanceof Error ? error.message : String(error),
          };
        }
      },
      { endpoint: url, payload: data, requestHeaders: headers }
    ).catch((error: unknown): RecoveryHttpResult => ({
      source: 'browserFetch',
      status: 0,
      ok: false,
      bodyText: error instanceof Error ? error.message : String(error),
    }));

    results.push(browserResult);
    return results;
  }

  private async buscarEntidadPersistidaConReintentos(
    data: AdministradoData,
    authorizationHeader?: string,
    snapshots: string[] = []
  ): Promise<{ registroId: string; row: JsonMap; url: string } | null> {
    const retriesRaw = Number.parseInt(process.env.REGINSA_ADMIN_RECOVERY_RETRIES || '6', 10);
    const waitRaw = Number.parseInt(process.env.REGINSA_ADMIN_RECOVERY_WAIT_MS || '2000', 10);
    const retries = Number.isFinite(retriesRaw) && retriesRaw > 0 ? retriesRaw : 6;
    const waitMs = Number.isFinite(waitRaw) && waitRaw > 0 ? waitRaw : 2000;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      const recovery = await this.buscarEntidadPersistida(data, authorizationHeader, snapshots);
      if (recovery) return recovery;
      if (attempt < retries) await this.page.waitForTimeout(waitMs);
    }

    return null;
  }

  private async extraerTokenAplicativo(): Promise<string> {
    const tokenRaw = await this.page.evaluate(() => {
      const storages = [window.localStorage, window.sessionStorage];
      const directKeys = ['token', 'access_token', 'authToken', 'jwtToken', 'Authorization'];

      const normalize = (value: string | null): string => {
        if (!value) return '';
        try {
          const parsed = JSON.parse(value) as Record<string, unknown>;
          for (const key of ['token', 'access_token', 'accessToken', 'authToken', 'jwt']) {
            const candidate = parsed?.[key];
            if (typeof candidate === 'string' && candidate.trim()) return candidate;
          }
        } catch {
          return value;
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
