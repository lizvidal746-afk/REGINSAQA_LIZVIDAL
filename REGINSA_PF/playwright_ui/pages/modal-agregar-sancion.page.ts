import { expect, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class ModalAgregarSancionPage extends BasePage {
  private readonly modalLocator = this.page.locator('.p-dialog:visible', { hasText: /Agregar\s*Sanci[oó]n/i }).first();

  constructor(page: Page) {
    super(page);
  }

  /**
   * Selecciona una opción de RIS
   */
  async seleccionarRIS(): Promise<this> {
    const risDropdown = this.modalLocator.locator('p-dropdown[name="risSeleccionado"]');
    await expect(risDropdown).toBeVisible({ timeout: 10000 });
    const risTrigger = risDropdown.locator('.p-dropdown-trigger');
    await risTrigger.click();
    await this.page.waitForTimeout(1000);
    const panelRis = this.page.locator('.p-dropdown-panel:visible').last();
    const risOptions = panelRis.locator('.p-dropdown-item, [role="option"]');
    await risOptions.first().waitFor({ state: 'visible', timeout: 5000 });
    const indicesValidos: number[] = [];
    for (let idx = 0; idx < await risOptions.count(); idx++) {
      const texto = (await risOptions.nth(idx).textContent() || '').trim();
      if (texto && !/seleccione/i.test(texto)) {
        indicesValidos.push(idx);
      }
    }
    if (indicesValidos.length > 0) {
      const risIndex = indicesValidos[Math.floor(Math.random() * indicesValidos.length)];
      await risOptions.nth(risIndex).click();
    }
    await this.page.waitForTimeout(500);
    return this;
  }

  /**
   * Selecciona un tipo de infracción
   */
  async seleccionarTipoInfraccion(): Promise<this> {
    const tipoDropdown = this.modalLocator
      .locator('p-dropdown[name="infraccionSeleccionada"], p-dropdown[formcontrolname="idTipoInfractor"], p-dropdown[optionlabel*="Infractor" i]')
      .first();
    await expect(tipoDropdown).toBeVisible({ timeout: 10000 });
    const tipoTrigger = tipoDropdown.locator('.p-dropdown-trigger');
    await tipoTrigger.click();
    await this.page.waitForTimeout(1000);
    const panelTipo = this.page.locator('.p-dropdown-panel:visible').last();
    const tipoOptions = panelTipo.locator('.p-dropdown-item, [role="option"]');
    await tipoOptions.first().waitFor({ state: 'visible', timeout: 5000 });
    const indicesValidos: number[] = [];
    for (let idx = 0; idx < await tipoOptions.count(); idx++) {
      const texto = (await tipoOptions.nth(idx).textContent() || '').trim();
      if (texto && !/seleccione/i.test(texto)) {
        indicesValidos.push(idx);
      }
    }
    if (indicesValidos.length > 0) {
      const tipoIndex = indicesValidos[Math.floor(Math.random() * indicesValidos.length)];
      await tipoOptions.nth(tipoIndex).click();
    }
    await this.page.waitForTimeout(500);
    return this;
  }

  /**
   * Llena el campo de hecho infractor
   */
  async llenarHechoInfractor(hecho: string = 'hecho infractor'): Promise<this> {
    const hechoInput = this.modalLocator.getByPlaceholder('Describe el hecho infractor');
    await expect(hechoInput).toBeVisible({ timeout: 10000 });
    await hechoInput.click();
    await hechoInput.fill(hecho);
    await this.page.waitForTimeout(500);
    return this;
  }

  /**
   * Marca el checkbox de Multa
   */
  async marcarMulta(): Promise<this> {
    const multaCheckbox = this.modalLocator.locator('#multa');
    const multaLabel = this.modalLocator.locator('label[for="multa"]');
    if (await multaCheckbox.isVisible().catch(() => false)) {
      if (!(await multaCheckbox.isChecked().catch(() => false))) {
        await multaCheckbox.click();
      }
    } else if (await multaLabel.isVisible().catch(() => false)) {
      await multaLabel.click();
    }
    await this.page.waitForTimeout(500);
    return this;
  }

  /**
   * Marca el checkbox de Suspensión
   */
  async marcarSuspension(): Promise<this> {
    const suspensionCheckbox = this.modalLocator.locator('#suspension');
    const suspensionLabel = this.modalLocator.locator('label[for="suspension"]');
    if (await suspensionCheckbox.isVisible().catch(() => false)) {
      if (!(await suspensionCheckbox.isChecked().catch(() => false))) {
        await suspensionCheckbox.click();
      }
    } else if (await suspensionLabel.isVisible().catch(() => false)) {
      await suspensionLabel.click();
    }
    await this.page.waitForTimeout(500);
    return this;
  }

  /**
   * Marca el checkbox de Cancelación
   */
  async marcarCancelacion(): Promise<this> {
    const cancelacionCheckbox = this.modalLocator.locator('#cancelacion');
    const cancelacionLabel = this.modalLocator.locator('label[for="cancelacion"]');
    if (await cancelacionCheckbox.isVisible().catch(() => false)) {
      if (!(await cancelacionCheckbox.isChecked().catch(() => false))) {
        await cancelacionCheckbox.click();
      }
    } else if (await cancelacionLabel.isVisible().catch(() => false)) {
      await cancelacionLabel.click();
    }
    await this.page.waitForTimeout(500);
    return this;
  }

  /**
   * Selecciona el tipo de moneda (SOLES o UIT)
   */
  async seleccionarTipoMoneda(usarUIT: boolean = false): Promise<this> {
    const radioId = usarUIT ? 'uit' : 'soles';
    const radioBox = this.modalLocator.locator(`p-radiobutton[inputid="${radioId}"] .p-radiobutton-box`).first();
    const radioInput = this.modalLocator.locator(`#${radioId}`);
    if (await radioBox.isVisible().catch(() => false)) {
      await radioBox.click();
    } else if (await radioInput.isVisible().catch(() => false)) {
      await radioInput.click();
    }
    await this.page.waitForTimeout(500);
    return this;
  }

  /**
   * Llena el monto de la multa
   */
  async llenarMontoMulta(monto: string): Promise<this> {
    const inputMoneda = this.modalLocator.locator('input[name="valorUIT"], input[name="valorSoles"], input[placeholder="0.00"]').first();
    if (await inputMoneda.isVisible().catch(() => false)) {
      await inputMoneda.click();
      await inputMoneda.fill(monto);
      await this.page.waitForTimeout(500);
    }
    return this;
  }

  /**
   * Llena el tiempo de suspensión
   */
  async llenarTiempoSuspension(tipo: 'Año' | 'Mes' | 'Día', cantidad: number): Promise<this> {
    const tiempoButton = this.modalLocator
      .getByRole('combobox', { name: /Tiempo/i })
      .first()
      .or(this.modalLocator.locator('p-dropdown .p-dropdown-trigger'));
    await tiempoButton.click();
    await this.page.waitForTimeout(500);
    const opcionesTiempo = this.page.getByRole('option').filter({ hasText: /Año|Mes|Día/i });
    await opcionesTiempo.first().waitFor({ state: 'visible', timeout: 5000 });
    for (let i = 0; i < await opcionesTiempo.count(); i++) {
      const texto = await opcionesTiempo.nth(i).innerText();
      if (new RegExp(tipo, 'i').test(texto.trim())) {
        await opcionesTiempo.nth(i).click();
        break;
      }
    }
    await this.page.waitForTimeout(500);
    const cantidadInput = this.modalLocator.getByPlaceholder('Cantidad');
    if (await cantidadInput.isVisible().catch(() => false)) {
      await cantidadInput.click();
      await cantidadInput.fill(cantidad.toString());
      await this.page.waitForTimeout(500);
    }
    return this;
  }

  /**
   * Hace clic en el botón de guardar detalle
   */
  async clickGuardarDetalle(): Promise<this> {
    const btnGuardar = this.page.locator('button[label="Guardar detalle"][icon="pi pi-save"]');
    await expect(btnGuardar).toBeVisible({ timeout: 10000 });
    await btnGuardar.click();
    await this.page.waitForTimeout(1000);
    return this;
  }

  /**
   * Cierra el modal
   */
  async cerrar(): Promise<this> {
    const btnCerrar = this.modalLocator
      .locator('.p-dialog-header-close, button[aria-label*="close" i], button[icon="pi pi-times"]')
      .first();
    if (await btnCerrar.isVisible().catch(() => false)) {
      await btnCerrar.click({ force: true }).catch(() => {});
    }
    await this.page.keyboard.press('Escape').catch(() => {});
    await this.modalLocator.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    return this;
  }

  /**
   * Valida que el modal esté visible
   */
  async validarModalVisible(): Promise<this> {
    await expect(this.modalLocator).toBeVisible({ timeout: 10000 });
    return this;
  }
}
