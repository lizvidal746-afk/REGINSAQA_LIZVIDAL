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
    await this.irA(`${baseUrl}/#/pages/infractor`);
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(1000);
    return this;
  }

  /**
   * Abre el formulario para registrar una nueva sanción.
   * CORRECCIÓN (2026-06-10): Se eliminó waitForLoadState('networkidle') post-click
   * porque Angular/PrimeNG mantiene polling activo bajo alta concurrencia,
   * lo que impide que 'networkidle' se resuelva → timeout de 120s.
   * Estrategia: esperar directamente a que el campo del formulario sea visible,
   * con hasta 3 intentos de click en caso de que el modal tarde en abrirse.
   */
  async abrirFormularioRegistrarSancion(): Promise<this> {
    // Esperar DOM básico (no networkidle → evita colgarse con Angular polling)
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(1000);

    // Esperar a que desaparezcan overlays/spinners
    await this.page.locator('.swal2-container').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await this.page.locator('.p-progress-spinner').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});

    const btnAgregar = this.page
      .locator('button[label="Registrar Sancionar"]')
      .first()
      .or(this.page.getByRole('button', { name: /Registrar Sancionar/i }))
      .first();

    await expect(btnAgregar).toBeVisible({ timeout: this.uiTimeout() });
    await btnAgregar.scrollIntoViewIfNeeded();

    // Estrategia de apertura con retry: intentar hasta 3 veces si el modal no abre
    const inputExpediente = this.page.locator('input[formcontrolname="numeroExpediente"]').first();
    let opened = false;
    for (let intento = 1; intento <= 3; intento++) {
      await this.page.waitForTimeout(300 * intento);
      await btnAgregar.click({ force: true });
      try {
        await expect(inputExpediente).toBeVisible({ timeout: this.uiTimeout() });
        opened = true;
        break;
      } catch {
        // El modal no abrió — esperar y reintentar
        if (intento < 3) {
          await this.page.waitForTimeout(1500);
        }
      }
    }
    if (!opened) {
      await expect(inputExpediente).toBeVisible({ timeout: 5000 }); // Lanzar error claro
    }
    return this;
  }

  /**
   * Valida que el módulo de sanciones esté cargado correctamente
   */
  async validarModuloCargado(): Promise<this> {
    const señalesModulo = [
      this.page.getByText(/Registro\s+de\s+Infracci[oó]n\s+y\s+Sanci[oó]n/i).first(),
      this.page.locator('button[label="Registrar Sancionar"]').first(),
      this.page.locator('table').first()
    ];

    await expect(
      Promise.any(señalesModulo.map((señal) => señal.waitFor({ state: 'visible', timeout: this.uiTimeout() })))
    ).resolves.not.toThrow();

    return this;
  }
}
