import { Page } from '@playwright/test';
import { BasePage } from './pages/base.page';
import { LoginPage } from './pages/login.page';
import { HomePage } from './pages/home.page';
import { SancionesPage } from './pages/sanciones.page';
import { FormularioSancionPage } from './pages/formulario-sancion.page';
import { ModalAgregarSancionPage } from './pages/modal-agregar-sancion.page';

export class POManager {
  private readonly page: Page;
  private readonly basePage: BasePage;
  private readonly loginPage: LoginPage;
  private readonly homePage: HomePage;
  private readonly sancionesPage: SancionesPage;
  private readonly formularioSancionPage: FormularioSancionPage;
  private readonly modalAgregarSancionPage: ModalAgregarSancionPage;

  constructor(page: Page) {
    this.page = page;
    this.basePage = new BasePage(page);
    this.loginPage = new LoginPage(page);
    this.homePage = new HomePage(page);
    this.sancionesPage = new SancionesPage(page);
    this.formularioSancionPage = new FormularioSancionPage(page);
    this.modalAgregarSancionPage = new ModalAgregarSancionPage(page);
  }

  getBasePage(): BasePage {
    return this.basePage;
  }

  getLoginPage(): LoginPage {
    return this.loginPage;
  }

  getHomePage(): HomePage {
    return this.homePage;
  }

  getSancionesPage(): SancionesPage {
    return this.sancionesPage;
  }

  getFormularioSancionPage(): FormularioSancionPage {
    return this.formularioSancionPage;
  }

  getModalAgregarSancionPage(): ModalAgregarSancionPage {
    return this.modalAgregarSancionPage;
  }
}
