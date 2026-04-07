// @ts-nocheck — CT Angular deshabilitado. Ver cobertura equivalente en test:03/test:04.
import { test, expect } from '@playwright/test';

/**
 * Component Tests — Checkboxes Reconsideracion (BitPago / BitReconsidera)
 *
 * Verifica que los checkboxes respetan la logica de habilitacion/deshabilitacion
 * definida en InfractorComponent: solo editables cuando reconsEditando=true.
 *
 * Ejecutar:  npm run ct:test
 *            npm run ct:test:headed
 */

// DESHABILITADO: @playwright/experimental-ct-angular no existe en npm.
// Playwright CT solo soporta React, Vue, Svelte y Solid — no Angular.
// Cobertura equivalente: npm run test:03 y npm run test:04
test.describe.skip('Reconsideracion — Reglas de habilitacion de checkboxes [CT DISABLED]', () => {

  // ── Sin fila seleccionada ──────────────────────────────────────────────────

  test('sin fila seleccionada: boton Editar esta deshabilitado', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: null },
    });
    await expect(component.getByTestId('btn-editar')).toBeDisabled();
  });

  test('sin fila seleccionada: checkboxes estan deshabilitados', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: null },
    });
    await expect(component.getByTestId('ck-pago')).toBeDisabled();
    await expect(component.getByTestId('ck-reconsidera')).toBeDisabled();
    await expect(component.getByTestId('ck-presento-reconsideracion')).toBeDisabled();
  });

  // ── Con fila seleccionada, modo lectura ────────────────────────────────────

  test('con fila seleccionada: boton Editar se habilita', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 42 },
    });
    await expect(component.getByTestId('btn-editar')).toBeEnabled();
  });

  test('con fila seleccionada pero sin editar: checkboxes siguen deshabilitados', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 42 },
    });
    await expect(component.getByTestId('ck-pago')).toBeDisabled();
    await expect(component.getByTestId('ck-reconsidera')).toBeDisabled();
  });

  test('BitPago=1 se refleja como checked en modo lectura', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 42, bitPago: 1, bitReconsidera: 0 },
    });
    await expect(component.getByTestId('ck-pago')).toBeChecked();
    await expect(component.getByTestId('ck-reconsidera')).not.toBeChecked();
  });

  test('BitReconsidera=1 se refleja como checked en modo lectura', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 99, bitPago: 0, bitReconsidera: 1 },
    });
    await expect(component.getByTestId('ck-reconsidera')).toBeChecked();
    await expect(component.getByTestId('ck-pago')).not.toBeChecked();
  });

  // ── Activar edicion ────────────────────────────────────────────────────────

  test('al clicar Editar: los tres checkboxes se habilitan', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 42 },
    });
    await component.getByTestId('btn-editar').click();
    await expect(component.getByTestId('ck-pago')).toBeEnabled();
    await expect(component.getByTestId('ck-reconsidera')).toBeEnabled();
    await expect(component.getByTestId('ck-presento-reconsideracion')).toBeEnabled();
  });

  test('en modo edicion: Editar se deshabilita, Guardar y Cancelar se habilitan', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 42 },
    });
    await component.getByTestId('btn-editar').click();
    await expect(component.getByTestId('btn-editar')).toBeDisabled();
    await expect(component.getByTestId('btn-guardar')).toBeEnabled();
    await expect(component.getByTestId('btn-cancelar')).toBeEnabled();
  });

  // ── Modificar checkboxes ───────────────────────────────────────────────────

  test('en modo edicion: se puede marcar ck-pago', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 42, bitPago: 0 },
    });
    await component.getByTestId('btn-editar').click();
    await component.getByTestId('ck-pago').check();
    await expect(component.getByTestId('ck-pago')).toBeChecked();
  });

  test('en modo edicion: se puede marcar ck-reconsidera', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 42, bitReconsidera: 0 },
    });
    await component.getByTestId('btn-editar').click();
    await component.getByTestId('ck-reconsidera').check();
    await expect(component.getByTestId('ck-reconsidera')).toBeChecked();
  });

  test('en modo edicion: se puede desmarcar ck-pago ya marcado', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 42, bitPago: 1 },
    });
    await component.getByTestId('btn-editar').click();
    await component.getByTestId('ck-pago').uncheck();
    await expect(component.getByTestId('ck-pago')).not.toBeChecked();
  });

  // ── Cancelar: revertir valores ─────────────────────────────────────────────

  test('cancelar: BitPago vuelve al valor original', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 42, bitPago: 1 },
    });
    await component.getByTestId('btn-editar').click();
    await component.getByTestId('ck-pago').uncheck();                    // cambia a false
    await component.getByTestId('btn-cancelar').click();                  // cancela

    // Vuelve a editar para verificar que el valor se revirtio a 1
    await component.getByTestId('btn-editar').click();
    await expect(component.getByTestId('ck-pago')).toBeChecked();
  });

  test('cancelar: BitReconsidera vuelve al valor original', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 88, bitReconsidera: 0 },
    });
    await component.getByTestId('btn-editar').click();
    await component.getByTestId('ck-reconsidera').check();
    await component.getByTestId('btn-cancelar').click();

    await component.getByTestId('btn-editar').click();
    await expect(component.getByTestId('ck-reconsidera')).not.toBeChecked();
  });

  test('cancelar: checkboxes quedan deshabilitados', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 42 },
    });
    await component.getByTestId('btn-editar').click();
    await component.getByTestId('btn-cancelar').click();
    await expect(component.getByTestId('ck-pago')).toBeDisabled();
    await expect(component.getByTestId('ck-reconsidera')).toBeDisabled();
  });

  // ── Guardar ────────────────────────────────────────────────────────────────

  test('guardar emite bitPago=1 y bitReconsidera=1 cuando ambos marcados', async ({ mount }) => {
    const events: unknown[] = [];
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 55, bitPago: 0, bitReconsidera: 0 },
      on: { saved: (e: unknown) => events.push(e) },
    });
    await component.getByTestId('btn-editar').click();
    await component.getByTestId('ck-pago').check();
    await component.getByTestId('ck-reconsidera').check();
    await component.getByTestId('btn-guardar').click();

    await component.getByTestId('btn-editar').waitFor({ state: 'enabled' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ bitPago: 1, bitReconsidera: 1 });
  });

  test('guardar emite bitPago=0 y bitReconsidera=0 cuando ambos desmarcados', async ({ mount }) => {
    const events: unknown[] = [];
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 1, bitPago: 1, bitReconsidera: 1 },
      on: { saved: (e: unknown) => events.push(e) },
    });
    await component.getByTestId('btn-editar').click();
    await component.getByTestId('ck-pago').uncheck();
    await component.getByTestId('ck-reconsidera').uncheck();
    await component.getByTestId('btn-guardar').click();

    await component.getByTestId('btn-editar').waitFor({ state: 'enabled' });
    expect(events[0]).toMatchObject({ bitPago: 0, bitReconsidera: 0 });
  });

  test('despues de guardar: checkboxes vuelven a estar deshabilitados', async ({ mount }) => {
    const component = await mount(ReconsideracionCheckboxFixture, {
      props: { idSeleccionado: 7 },
    });
    await component.getByTestId('btn-editar').click();
    await component.getByTestId('btn-guardar').click();
    await component.getByTestId('btn-editar').waitFor({ state: 'enabled' });
    await expect(component.getByTestId('ck-pago')).toBeDisabled();
    await expect(component.getByTestId('ck-reconsidera')).toBeDisabled();
  });
});
