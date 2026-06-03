import { expect, Page } from '@playwright/test';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async abrirLogin(): Promise<void> {
    await this.irA('/login');
  }

  async iniciarSesion(usuario: string, clave: string): Promise<void> {
    await this.page.getByLabel(/usuario|email/i).fill(usuario);
    await this.page.getByLabel(/contraseña|password/i).fill(clave);
    await this.page.getByRole('button', { name: /ingresar|iniciar sesión|login/i }).click();
  }

  async validarSesionActiva(): Promise<void> {
    await expect(this.page.getByRole('navigation')).toBeVisible();
  }
}
