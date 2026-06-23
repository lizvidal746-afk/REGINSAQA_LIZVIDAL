import { expect, Locator, Page } from '@playwright/test';

export class BasePage {
  constructor(protected readonly page: Page) {}

  protected readTimeout(name: string, fallback: number): number {
    const raw = Number.parseInt(process.env[name] || '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  protected uiTimeout(fallback = 30000): number {
    return this.readTimeout('REGINSA_UI_WAIT_TIMEOUT_MS', fallback);
  }

  protected apiTimeout(fallback = 60000): number {
    return this.readTimeout('REGINSA_SAVE_API_TIMEOUT_MS', fallback);
  }

  protected overlayTimeout(fallback = 30000): number {
    return this.readTimeout('REGINSA_OVERLAY_TIMEOUT_MS', fallback);
  }

  async irA(ruta: string): Promise<void> {
    await this.page.goto(ruta, { waitUntil: 'domcontentloaded' });
  }

  async esperarCapaCarga(timeout = this.overlayTimeout()): Promise<void> {
    await this.page.waitForFunction(() => {
      const isVisible = (element: Element): boolean => {
        const style = window.getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
      };

      return !Array.from(document.querySelectorAll('.swal2-container, .p-blockui, .p-progress-spinner')).some(isVisible);
    }, undefined, { timeout }).catch(() => {});
  }

  async safeClick(locator: Locator, timeout = this.uiTimeout()): Promise<void> {
    await expect(locator).toBeVisible({ timeout });
    await locator.scrollIntoViewIfNeeded({ timeout });
    await locator.click({ timeout }).catch(async () => locator.click({ force: true, timeout }));
  }

  async fillFirstEditable(candidates: Locator[], value: string, timeout = this.uiTimeout()): Promise<Locator> {
    for (const candidate of candidates) {
      const locator = candidate.first();
      const visible = await locator.isVisible().catch(() => false);
      if (!visible) continue;

      const editable = await locator.isEditable().catch(() => false);
      const readonly = await locator.evaluate((element) => {
        const input = element as HTMLInputElement;
        return Boolean(input.readOnly || input.disabled);
      }).catch(() => false);

      if (!editable || readonly) continue;

      await expect(locator).toBeVisible({ timeout });
      await locator.scrollIntoViewIfNeeded();
      await locator.click({ force: true });
      await locator.fill(value);
      return locator;
    }

    throw new Error('No se encontro un campo editable para completar.');
  }

  async selectPrimeOption(trigger: Locator, optionName?: RegExp, timeout = this.uiTimeout()): Promise<string> {
    await this.safeClick(trigger.first(), timeout);

    const panel = this.page.locator('.p-dropdown-panel:visible, .p-overlay:visible, [role="listbox"]:visible').last();
    await panel.waitFor({ state: 'visible', timeout });

    const option = optionName
      ? this.page.getByRole('option', { name: optionName }).first()
      : panel.locator('li[role="option"], .p-dropdown-item').filter({ hasNotText: /seleccione/i }).first();

    await option.waitFor({ state: 'visible', timeout });
    const text = ((await option.innerText().catch(() => '')) || '').trim();
    await option.scrollIntoViewIfNeeded();
    await option.click({ force: true });
    await this.page.locator('.p-dropdown-panel, .p-overlay').waitFor({ state: 'hidden', timeout: this.overlayTimeout(10000) }).catch(() => {});
    return text;
  }
}
