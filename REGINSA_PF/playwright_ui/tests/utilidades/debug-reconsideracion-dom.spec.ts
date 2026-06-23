/**
 * Script de diagnóstico: imprime el DOM del formulario de reconsideración
 * DESPUÉS de activar modo edición y marcar el checkbox, para depurar locators.
 * Ejecutar: npx playwright test tests/utilidades/debug-reconsideracion-dom.spec.ts --project=ui-regression --reporter=list
 */
import { test, expect } from '@playwright/test';
import { POManager } from '../../POManager';

test.describe('DEBUG - DOM de reconsideracion post-checkbox', () => {
  test('Imprimir DOM luego de marcar checkbox presentoReconsideracion', async ({ page }) => {
    test.setTimeout(120000);
    const pm = new POManager(page);
    const rp = pm.getReconsideracionPage();

    await rp.navegarAlModulo();
    await rp.validarModuloCargado();
    await rp.abrirPrimerRegistroParaReconsiderar();

    // Activar modo edición
    await rp.activarModoEdicion();

    // Marcar checkbox sin validar
    const btnEditar = page.getByRole('button', { name: /editar.*cabecera/i }).first();
    console.log('btnEditar visible?', await btnEditar.isVisible().catch(() => false));

    // Imprimir inputs antes del checkbox
    const allInputsBefore = await page.locator('input').all();
    console.log(`\n=== INPUTS ANTES DEL CHECKBOX (total: ${allInputsBefore.length}) ===`);
    for (const inp of allInputsBefore) {
      const type = await inp.getAttribute('type').catch(() => '?');
      const id = await inp.getAttribute('id').catch(() => '');
      const name = await inp.getAttribute('name').catch(() => '');
      const fc = await inp.getAttribute('formcontrolname').catch(() => '');
      const ph = await inp.getAttribute('placeholder').catch(() => '');
      const aria = await inp.getAttribute('aria-label').catch(() => '');
      const vis = await inp.isVisible().catch(() => false);
      console.log(`  input[type="${type}"] id="${id}" name="${name}" fc="${fc}" ph="${ph}" aria="${aria}" visible=${vis}`);
    }

    // Marcar checkbox
    const checkbox = page.locator('input[id="presentoReconsideracion"], p-checkbox input[type="checkbox"]').first();
    const isChecked = await checkbox.isChecked().catch(() => false);
    if (!isChecked) {
      await checkbox.click({ force: true }).catch(async () => {
        // Intentar clic en el elemento padre p-checkbox
        await page.locator('p-checkbox').first().click({ force: true });
      });
    }
    await page.waitForTimeout(2000);

    // Imprimir inputs DESPUÉS del checkbox marcado
    const allInputsAfter = await page.locator('input').all();
    console.log(`\n=== INPUTS DESPUES DEL CHECKBOX (total: ${allInputsAfter.length}) ===`);
    for (const inp of allInputsAfter) {
      const type = await inp.getAttribute('type').catch(() => '?');
      const id = await inp.getAttribute('id').catch(() => '');
      const name = await inp.getAttribute('name').catch(() => '');
      const fc = await inp.getAttribute('formcontrolname').catch(() => '');
      const ph = await inp.getAttribute('placeholder').catch(() => '');
      const aria = await inp.getAttribute('aria-label').catch(() => '');
      const vis = await inp.isVisible().catch(() => false);
      const disabled = await inp.getAttribute('disabled').catch(() => null);
      console.log(`  input[type="${type}"] id="${id}" name="${name}" fc="${fc}" ph="${ph}" aria="${aria}" visible=${vis} disabled=${disabled !== null}`);
    }

    // Imprimir texto circundante del área de reconsideración
    console.log('\n=== ARIA SNAPSHOT DEL FORMULARIO ===');
    const snapshot = await page.locator('tabpanel, [role="tabpanel"]').first().ariaSnapshot().catch(async () => {
      return await page.locator('body').ariaSnapshot();
    });
    console.log(snapshot.slice(0, 3000));
  });
});
