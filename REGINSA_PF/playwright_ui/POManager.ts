import { Page } from '@playwright/test';
import { BasePage } from './pages/base.page';
import { LoginPage } from './pages/login.page';
import { HomePage } from './pages/home.page';

export class POManager {
  private readonly page: Page;
  private readonly basePage: BasePage;
  private readonly loginPage: LoginPage;
  private readonly homePage: HomePage;

  constructor(page: Page) {
    this.page = page;
    this.basePage = new BasePage(page);
    this.loginPage = new LoginPage(page);
    this.homePage = new HomePage(page);
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
}
