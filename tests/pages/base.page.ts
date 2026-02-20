import { Page } from '@playwright/test';

export class BasePage {
  constructor(protected readonly page: Page) {}

  async irA(ruta: string): Promise<void> {
    await this.page.goto(ruta, { waitUntil: 'domcontentloaded' });
  }
}
