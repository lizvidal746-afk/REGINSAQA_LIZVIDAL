import { test as base } from '@playwright/test';

type UsuarioPrueba = {
  username: string;
  password: string;
};

export const test = base.extend<{ usuario: UsuarioPrueba }>({
  usuario: async ({}, use) => {
    const username = process.env.E2E_USERNAME ?? 'usuario_demo';
    const password = process.env.E2E_PASSWORD ?? 'password_demo';
    await use({ username, password });
  }
});

export const expect = test.expect;
