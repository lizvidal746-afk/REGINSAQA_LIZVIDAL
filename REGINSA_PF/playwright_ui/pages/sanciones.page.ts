import { expect, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class SancionesPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navega al módulo de sanciones
   */
  async navegarAlModulo(): Promise<this> {
    const baseUrl = process.env.REGINSA_UI_BASE_URL || 'https://reginsaqa.sunedu.gob.pe';
    await this.irA(`${baseUrl}/#/home`);
    await this.page.waitForTimeout(2000);
    return this;
  }

  /**
   * Abre el formulario para registrar una nueva sanción
   */
  async abrirFormularioRegistrarSancion(): Promise<this> {
    const btnAgregar = this.page
      .getByRole('button', { name: /Registrar sanción|Agregar sanción|Nueva sanción/i })
      .first();
    await expect(btnAgregar).toBeVisible({ timeout: 15000 });
    await btnAgregar.click();
    await this.page.waitForTimeout(2000);
    return this;
  }

  /**
   * Valida que el módulo de sanciones esté cargado correctamente
   */
  async validarModuloCargado(): Promise<this> {
    await expect(this.page.getByText(/Registro de Infracción y Sanción/i).first()).toBeVisible({
      timeout: 10000
    });
    return this;
  }
}
