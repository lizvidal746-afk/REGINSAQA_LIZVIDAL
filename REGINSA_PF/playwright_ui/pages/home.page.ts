import { expect, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class HomePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async abrirHome(): Promise<void> {
    const baseUrl = process.env.REGINSA_UI_BASE_URL || 'https://reginsaqa.sunedu.gob.pe';
    await this.irA(baseUrl);
  }

  async validarHomeCargado(): Promise<void> {
    // Esperar que el título o algún elemento de la página principal esté visible
    await expect(this.page).toHaveTitle(/REGINSA/i);
  }

  async navegarA(ruta: string): Promise<void> {
    await this.irA(ruta);
  }
}
