import { expect, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class FormularioSancionPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Llena el campo de número de expediente
   */
  async llenarNumeroExpediente(numero: string): Promise<this> {
    const expedienteInput = this.page.locator('input[formcontrolname="numeroExpediente"]');
    await expect(expedienteInput).toBeVisible({ timeout: 10000 });
    await expedienteInput.click();
    await expedienteInput.fill(numero);
    return this;
  }

  /**
   * Llena el campo de número de resolución
   */
  async llenarNumeroResolucion(numero: string): Promise<this> {
    const resolucionInput = this.page.locator('input[formcontrolname="numeroResolucion"]');
    await expect(resolucionInput).toBeVisible({ timeout: 10000 });
    await resolucionInput.click();
    await resolucionInput.fill(numero);
    return this;
  }

  /**
   * Llena la fecha de resolución
   */
  async llenarFechaResolucion(fecha: string): Promise<this> {
    const btnFecha = this.page.getByRole('button', { name: /Choose|Seleccionar/i });
    const fechaInput = btnFecha.locator('..').locator('input');
    if (await fechaInput.isVisible().catch(() => false)) {
      await fechaInput.click();
      await fechaInput.fill(fecha);
      await this.page.keyboard.press('Tab');
    } else {
      await btnFecha.click();
      await this.page.waitForTimeout(1000);
      const fechaParts = fecha.split('/');
      const dia = fechaParts[0];
      const dayBtn = this.page.getByText(dia, { exact: true }).first();
      await dayBtn.click();
    }
    await this.page.waitForTimeout(500);
    return this;
  }

  /**
   * Sube un documento PDF
   */
  async subirDocumento(ruta: string): Promise<this> {
    const fileInput = this.page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(ruta);
    await this.page.waitForTimeout(5000);
    return this;
  }

  /**
   * Agrega una medida correctiva
   */
  async agregarMedidaCorrectiva(medida: string): Promise<this> {
    const medidaInput = this.page.getByRole('textbox', { name: 'Ingrese la medida correctiva' }).first();
    await medidaInput.click();
    await medidaInput.fill(medida);
    return this;
  }

  /**
   * Hace clic en el botón de agregar medida
   */
  async clickAgregarMedida(): Promise<this> {
    const btnAgregar = this.page.getByRole('button', { name: 'Agregar medida' });
    if (await btnAgregar.isVisible().catch(() => false)) {
      await btnAgregar.click();
      await this.page.waitForTimeout(500);
    }
    return this;
  }

  /**
   * Navega a la pestaña de Detalle de sanciones
   */
  async irADetalleSanciones(): Promise<this> {
    const tabDetalle = this.page.getByRole('tab', { name: 'Detalle de sanciones' });
    await expect(tabDetalle).toBeVisible({ timeout: 10000 });
    await tabDetalle.click();
    await this.page.waitForTimeout(2000);
    return this;
  }

  /**
   * Hace clic en el botón de agregar sanción
   */
  async clickAgregarSancion(): Promise<this> {
    const btnAgregar = this.page
      .locator('button[label="Agregar sanción"][icon="pi pi-plus"]')
      .first()
      .or(this.page.getByRole('button', { name: /^Agregar\s*sanci[oó]n$/i }).first());
    await expect(btnAgregar).toBeVisible({ timeout: 10000 });
    await btnAgregar.click();
    await this.page.waitForTimeout(1000);
    return this;
  }

  /**
   * Guarda el formulario completo
   */
  async guardarFormulario(): Promise<this> {
    const btnGuardar = this.page
      .getByRole('button', { name: /Guardar|Finalizar/i })
      .first();
    await expect(btnGuardar).toBeVisible({ timeout: 10000 });
    await btnGuardar.click();
    await this.page.waitForTimeout(2000);
    return this;
  }
}
