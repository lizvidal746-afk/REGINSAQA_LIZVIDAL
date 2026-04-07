// @ts-nocheck — CT Angular deshabilitado. Ver cobertura equivalente en test:02/test:04.
import { test, expect } from '@playwright/test';

/**
 * Component Tests — Validaciones del formulario de Sancion
 *
 * Verifica que el Reactive Form aplica Validators.required antes de
 * habilitar el submit, replicando la logica de InfractorComponent.
 */

// DESHABILITADO: @playwright/experimental-ct-angular no existe en npm.
// Playwright CT solo soporta React, Vue, Svelte y Solid — no Angular.
// Cobertura equivalente: npm run test:02 y npm run test:04
test.describe.skip('Sancion Form — Validaciones de campos requeridos [CT DISABLED]', () => {

  // ── Estado inicial ─────────────────────────────────────────────────────────

  test('boton Guardar deshabilitado con formulario vacio', async ({ mount }) => {
    const component = await mount(SancionFormFixture);
    await expect(component.getByTestId('btn-submit')).toBeDisabled();
  });

  test('mensajes de error no visibles hasta que el campo es tocado', async ({ mount }) => {
    const component = await mount(SancionFormFixture);
    await expect(component.getByTestId('err-expediente')).not.toBeVisible();
    await expect(component.getByTestId('err-resolucion')).not.toBeVisible();
    await expect(component.getByTestId('err-fecha')).not.toBeVisible();
  });

  // ── Validacion campo a campo ───────────────────────────────────────────────

  test('tocar expediente vacio y salir: muestra error Requerido', async ({ mount }) => {
    const component = await mount(SancionFormFixture);
    await component.getByTestId('inp-expediente').click();
    await component.getByTestId('inp-expediente').blur();
    await expect(component.getByTestId('err-expediente')).toBeVisible();
  });

  test('tocar resolucion vacio y salir: muestra error Requerido', async ({ mount }) => {
    const component = await mount(SancionFormFixture);
    await component.getByTestId('inp-resolucion').click();
    await component.getByTestId('inp-resolucion').blur();
    await expect(component.getByTestId('err-resolucion')).toBeVisible();
  });

  test('llenar expediente: desaparece el error de ese campo', async ({ mount }) => {
    const component = await mount(SancionFormFixture);
    await component.getByTestId('inp-expediente').click();
    await component.getByTestId('inp-expediente').blur();
    await expect(component.getByTestId('err-expediente')).toBeVisible();

    await component.getByTestId('inp-expediente').fill('EXP-2026-001');
    await expect(component.getByTestId('err-expediente')).not.toBeVisible();
  });

  // ── Formulario valido ──────────────────────────────────────────────────────

  test('con todos los campos llenos: boton Guardar se habilita', async ({ mount }) => {
    const component = await mount(SancionFormFixture);
    await component.getByTestId('inp-expediente').fill('EXP-2026-001');
    await component.getByTestId('inp-resolucion').fill('RES-100-2026');
    await component.getByTestId('inp-fecha').fill('2026-04-01');
    await expect(component.getByTestId('btn-submit')).toBeEnabled();
  });

  test('falta solo la fecha: boton sigue deshabilitado', async ({ mount }) => {
    const component = await mount(SancionFormFixture);
    await component.getByTestId('inp-expediente').fill('EXP-2026-002');
    await component.getByTestId('inp-resolucion').fill('RES-200-2026');
    await expect(component.getByTestId('btn-submit')).toBeDisabled();
  });

  test('falta solo el expediente: boton sigue deshabilitado', async ({ mount }) => {
    const component = await mount(SancionFormFixture);
    await component.getByTestId('inp-resolucion').fill('RES-300-2026');
    await component.getByTestId('inp-fecha').fill('2026-04-01');
    await expect(component.getByTestId('btn-submit')).toBeDisabled();
  });

  // ── Submit ─────────────────────────────────────────────────────────────────

  test('submit emite los valores correctos', async ({ mount }) => {
    const events: unknown[] = [];
    const component = await mount(SancionFormFixture, {
      on: { submitted: (e: unknown) => events.push(e) },
    });
    await component.getByTestId('inp-expediente').fill('EXP-PRUEBA-001');
    await component.getByTestId('inp-resolucion').fill('RES-001-2026');
    await component.getByTestId('inp-fecha').fill('2026-04-04');
    await component.getByTestId('btn-submit').click();

    expect(events).toHaveLength(1);
    const data = events[0] as Record<string, string>;
    expect(data['numeroExpediente']).toBe('EXP-PRUEBA-001');
    expect(data['numeroResolucion']).toBe('RES-001-2026');
    expect(data['fechaResolucion']).toBe('2026-04-04');
  });

  test('submit con form invalido: no emite evento y muestra todos los errores', async ({ mount }) => {
    const events: unknown[] = [];
    const component = await mount(SancionFormFixture, {
      on: { submitted: (e: unknown) => events.push(e) },
    });
    await component.getByTestId('inp-expediente').fill('EXP-INCOMPLETO');
    await component.getByTestId('btn-submit').click();

    expect(events).toHaveLength(0);
    await expect(component.getByTestId('err-resolucion')).toBeVisible();
    await expect(component.getByTestId('err-fecha')).toBeVisible();
  });

  // ── Prop saving ────────────────────────────────────────────────────────────

  test('saving=true: boton deshabilitado aunque el form sea valido', async ({ mount }) => {
    const component = await mount(SancionFormFixture, {
      props: { saving: true },
    });
    await component.getByTestId('inp-expediente').fill('EXP-2026-003');
    await component.getByTestId('inp-resolucion').fill('RES-003-2026');
    await component.getByTestId('inp-fecha').fill('2026-04-04');
    await expect(component.getByTestId('btn-submit')).toBeDisabled();
  });
});
