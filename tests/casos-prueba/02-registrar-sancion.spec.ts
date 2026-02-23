import { test } from '@playwright/test';
import {
  iniciarSesionYNavegar,
  abrirFormularioRegistrarSancion,
  obtenerAdministradoAleatorio,
  capturarPantallaMejorada,
  capturarFormularioLleno,
  capturarToastExito,
  generarFechaPonderada,
  resolverDocumentoPrueba
} from 'tests/utilidades/reginsa-actions';

/**
 * EJECUCIÓN (rápido)
 * - Headless por defecto. Para ver navegador: `--headed`.
 * - Con capturas: scripts normales `npm run test:*`.
 * - Sin capturas: scripts `:fast`.
 * - Paralelismo (suite completa): `npm run test:all:w2` / `test:all:w4`.
 */

/**
 * CASO 02: REGISTRAR SANCIÓN
 * 
 * Flujo:
 * 1. Login + navegación al módulo
 * 2. Abrir formulario
 * 3. Seleccionar UN administrado (aleatorio, sin repetir)
 * 4. Llenar datos básicos (expediente, resolución, fecha)
 * 5. Subir PDF
 * 6. Agregar 2-3 medidas correctivas
 * 7. Navegar a "Detalle de sanciones"
 * 8. Agregar 8 SANCIONES para el mismo administrado:
 *    - Seleccionar RIS aplicable y Tipo de Infracción
 *    - Sanción 1: MULTA (SOLES o UIT aleatorio)
 *    - Sanción 2: SUSPENSIÓN (Año/Mes/Día aleatorio)
 *    - Sanción 3: CANCELACIÓN (solo marcar)
 *    - Sanción 4: MULTA + SUSPENSIÓN (ambas)
 *    - Sanción 5: MULTA + CANCELACIÓN (ambas)
 *    - Sanción 6: MULTA (UIT 1-10) + SUSPENSIÓN (ambas)
 *    - Sanción 7: MULTA (UIT 1-10)
 *    - Sanción 8: MULTA (UIT 1-10) + CANCELACIÓN (ambas)
 * 9. Guardar formulario final
 *
 * Capturas:
 * - Exitosas dependen del modo de ejecución (:fast omite).
 * - Errores se guardan siempre en errors/.
 */

test('02-REGISTRAR SANCIÓN: 8 sanciones para 1 administrado', async ({ page }, testInfo) => {
  test.setTimeout(300000); // 5 minutos de timeout

  console.log('\n================================================================================');
  console.log('⚖️ CASO 02: REGISTRAR SANCIÓN');
  console.log('================================================================================\n');

  // ═══════════════════════════════════════════════════════════════════
  // PASO 1: LOGIN + NAVEGACIÓN
  // Reutiliza `iniciarSesionYNavegar`
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(90));
  console.log('🔐 LOGIN Y NAVEGACIÓN');
  console.log('═'.repeat(90));

  await iniciarSesionYNavegar(page, 'infractor', testInfo.workerIndex);
  console.log('  ✅ Sesión iniciada y módulo cargado\n');

  // ═══════════════════════════════════════════════════════════════════
  // PASO 2: ABRIR FORMULARIO
  // ═══════════════════════════════════════════════════════════════════
  console.log('═'.repeat(90));
  console.log('📋 PASO 2: ABRIENDO FORMULARIO');
  console.log('═'.repeat(90));

  // Reutiliza `abrirFormularioRegistrarSancion`
  await abrirFormularioRegistrarSancion(page);
  await page.waitForTimeout(2000);
  console.log('  ✅ Formulario abierto\n');

  // ═══════════════════════════════════════════════════════════════════
  // PASO 3: SELECCIONAR ADMINISTRADO (UNA SOLA VEZ)
  // ═══════════════════════════════════════════════════════════════════
  console.log('═'.repeat(90));
  console.log('🎲 PASO 3: SELECCIONANDO ADMINISTRADO');
  console.log('═'.repeat(90));

  // Reutiliza `obtenerAdministradoAleatorio` pero reduce espera
  const admin = await obtenerAdministradoAleatorio(page);
  // Espera mínima, solo para asegurar carga
  await page.waitForTimeout(800);
  console.log(`  ✅ Administrado seleccionado: ${admin}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // PASO 4: LLENAR DATOS BÁSICOS
  // ═══════════════════════════════════════════════════════════════════
  console.log('═'.repeat(90));
  console.log('📝 PASO 4: DATOS BÁSICOS');
  console.log('═'.repeat(90));

  const hoy = new Date();
  const maxFecha = new Date(hoy);
  maxFecha.setDate(maxFecha.getDate() - 2);
  // Reutiliza `generarFechaPonderada`
  const fechaResolucion = generarFechaPonderada(
    [
      { anio: 2024, peso: 0.2 },
      { anio: 2025, peso: 0.4 },
      { anio: 2026, peso: 0.4 }
    ],
    maxFecha
  );
  const yearResolucion = fechaResolucion.getFullYear();

  const numExp = Math.floor(Math.random() * 10000);
  const expInput = page.getByRole('textbox').nth(1);
  await expInput.click();
  await expInput.fill(`Exp N° ${numExp}-${yearResolucion}`);
  console.log(`  ✓ Expediente: Exp N° ${numExp}-${yearResolucion}`);

  const numRes = Math.floor(Math.random() * 10000);
  const resInput = page.locator('input[formcontrolname="numeroResolucion"]');
  await resInput.click();
  await resInput.fill(`Res N° ${numRes}-${yearResolucion}`);
  console.log(`  ✓ Resolución: Res N° ${numRes}-${yearResolucion}`);

  const formatFecha = (date: Date) => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const btnFecha = page.getByRole('button', { name: /Choose|Seleccionar/i });
  const fechaInput = btnFecha.locator('..').locator('input');
  const fechaTexto = formatFecha(fechaResolucion);

  const asegurarFecha = async () => {
    if (await fechaInput.isVisible().catch(() => false)) {
      await fechaInput.click();
      await fechaInput.fill(fechaTexto);
      await page.keyboard.press('Tab');
      await page.waitForTimeout(500);
    } else {
      await btnFecha.click();
      await page.waitForTimeout(1000);
      const dayBtn = page.getByText(String(fechaResolucion.getDate()), { exact: true }).first();
      await dayBtn.click();
      await page.waitForTimeout(500);
    }

    const valor = await fechaInput.inputValue().catch(() => '');
    return valor?.includes(fechaTexto);
  };

  let fechaOk = false;
  for (let intento = 0; intento < 3; intento++) {
    fechaOk = await asegurarFecha();
    if (fechaOk) break;
    await page.waitForTimeout(500);
  }

  if (!fechaOk) {
    throw new Error(`No se pudo fijar la fecha de resolución (${fechaTexto})`);
  }

  console.log(`  ✓ Fecha: ${fechaTexto}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // PASO 5: SUBIR PDF
  // ═══════════════════════════════════════════════════════════════════
  console.log('═'.repeat(90));
  console.log('📁 PASO 5: SUBIENDO PDF');
  console.log('═'.repeat(90));

  const pdfPath = resolverDocumentoPrueba();
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(pdfPath);
  await page.waitForTimeout(5000);
  console.log('  ✅ PDF subido\n');

  // ═══════════════════════════════════════════════════════════════════
  // PASO 6: MEDIDAS CORRECTIVAS
  // ═══════════════════════════════════════════════════════════════════
  console.log('═'.repeat(90));
  console.log('📋 PASO 6: MEDIDAS CORRECTIVAS');
  console.log('═'.repeat(90));

  for (let i = 1; i <= 3; i++) {
    const medidaInput = page.getByRole('textbox', { name: 'Ingrese la medida correctiva' }).nth(i - 1);
    await medidaInput.click();
    await medidaInput.fill(`Medida correctiva ${i}`);

    if (i < 3) {
      const btnAgregarMedida = page.getByRole('button', { name: 'Agregar medida' });
      if (await btnAgregarMedida.isVisible().catch(() => false)) {
        await btnAgregarMedida.click();
        await page.waitForTimeout(500);
      }
    }
    console.log(`  ✓ Medida ${i} agregada`);
  }

  console.log('  ✅ Medidas ingresadas (guardado final al terminar las 8 sanciones)\n');

  // ═══════════════════════════════════════════════════════════════════
  // PASO 7: IR A PESTAÑA "DETALLE DE SANCIONES"
  // ═══════════════════════════════════════════════════════════════════
  console.log('═'.repeat(90));
  console.log('📋 PASO 7: NAVEGANDO A DETALLE DE SANCIONES');
  console.log('═'.repeat(90));

  await page.waitForTimeout(2000);
  const tabDetalleSanciones = page.getByRole('tab', { name: 'Detalle de sanciones' });
  await tabDetalleSanciones.click();
  await page.waitForTimeout(2000);
  console.log('  ✅ Tab seleccionado\n');

  // ═══════════════════════════════════════════════════════════════════
  // PASO 8: AGREGAR 8 SANCIONES
  // ═══════════════════════════════════════════════════════════════════
  console.log('═'.repeat(90));
  console.log('⚖️  PASO 8: AGREGANDO 8 SANCIONES');
  console.log('═'.repeat(90));

  const sanciones = [
    { numero: 1, nombre: 'MULTA', multa: true, suspension: false, cancelacion: false },
    { numero: 2, nombre: 'SUSPENSIÓN', multa: false, suspension: true, cancelacion: false },
    { numero: 3, nombre: 'CANCELACIÓN', multa: false, suspension: false, cancelacion: true },
    { numero: 4, nombre: 'MULTA + SUSPENSIÓN', multa: true, suspension: true, cancelacion: false },
    { numero: 5, nombre: 'MULTA + CANCELACIÓN', multa: true, suspension: false, cancelacion: true },
    { numero: 6, nombre: 'MULTA (UIT) + SUSPENSIÓN', multa: true, suspension: true, cancelacion: false, forceUIT: true },
    { numero: 7, nombre: 'MULTA (UIT)', multa: true, suspension: false, cancelacion: false, forceUIT: true },
    { numero: 8, nombre: 'MULTA (UIT) + CANCELACIÓN', multa: true, suspension: false, cancelacion: true, forceUIT: true }
  ];

  let exitosas = 0;
  const esScale = process.env.REGINSA_SCALE_MODE === '1';
  const strictVerify = process.env.REGINSA_STRICT_VERIFY !== '0';
  const requireFinalApiConfirm = process.env.REGINSA_REQUIRE_FINAL_API_CONFIRM === '1';
  const minSancionesScale = Number(process.env.REGINSA_MIN_SANCIONES_SCALE || 5);
  // En este flujo: casos 1, 4 y 5 son SOLES; casos 6, 7 y 8 son UIT.

  const esperarRespuestaApiGuardado = async (timeoutMs: number): Promise<boolean> => {
    try {
      const response = await page.waitForResponse((res) => {
        const method = res.request().method().toUpperCase();
        if (!['POST', 'PUT', 'PATCH'].includes(method)) return false;

        const url = res.url().toLowerCase();
        if (!url.includes('/api/')) return false;
        if (!/(sanci|infractor|resoluci|detalle)/i.test(url)) return false;

        const status = res.status();
        return status >= 200 && status < 300;
      }, { timeout: timeoutMs });

      return !!response;
    } catch {
      return false;
    }
  };

  const contarFilasDetalle = async (): Promise<number> => {
    const candidatos = [
      page.locator('.p-tabview-panel[aria-hidden="false"] table tbody tr'),
      page.locator('table tbody tr')
    ];

    let max = 0;
    for (const locator of candidatos) {
      const total = await locator.count().catch(() => 0);
      if (total > max) {
        max = total;
      }
    }
    return max;
  };

  for (const sancion of sanciones) {
    console.log(`\n  ┌─ SANCIÓN ${sancion.numero}/${sanciones.length}: ${sancion.nombre}`);

    try {
      const filasAntes = await contarFilasDetalle();

      // PASO 8A: ABRIR MODAL
      const btnAgregarSancionCandidatos = [
        page.locator('button[label="Agregar sanción"][icon="pi pi-plus"]').first(),
        page.locator('.p-tabview-panel[aria-hidden="false"] button[label="Agregar sanción"]').first(),
        page.getByRole('button', { name: /^Agregar\s*sanci[oó]n$/i }).first(),
        page.locator('button.p-button-success:has-text("Agregar sanción")').first()
      ];
      const dialog = page.locator('.p-dialog:visible', { hasText: /Agregar\s*Sanci[oó]n/i }).first();

      for (let intento = 0; intento < 8; intento++) {
        let clicado = false;
        for (const boton of btnAgregarSancionCandidatos) {
          const isEnabled = await boton.isEnabled({ timeout: 1000 }).catch(() => false);
          const isVisible = await boton.isVisible({ timeout: 1000 }).catch(() => false);
          if (!isEnabled || !isVisible) continue;

          await boton.scrollIntoViewIfNeeded().catch(() => {});
          await boton.click({ force: true });
          clicado = true;
          break;
        }

        if (clicado) {
          const modalVisible = await dialog.isVisible({ timeout: 3500 }).catch(() => false);
          if (modalVisible) break;
        }

        await page.waitForTimeout(200); // Menor espera entre intentos
      }

      await dialog.waitFor({ state: 'visible', timeout: 10000 });

      console.log(`  │  ✓ Modal abierto`);

      // PASO 8B: RIS (aleatorio, selector exacto)
      const risDropdown = dialog.locator('p-dropdown[name="risSeleccionado"]');
      await risDropdown.waitFor({ state: 'visible', timeout: 3000 });
      const risTrigger = risDropdown.locator('.p-dropdown-trigger');
      let risSeleccionado = false;
      for (let intentoRis = 1; intentoRis <= 5 && !risSeleccionado; intentoRis++) {
        await risTrigger.click({ force: true });
        await page.waitForTimeout(260);

        const panelRis = page.locator('.p-dropdown-panel:visible').last();
        await panelRis.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
        const risOptions = panelRis.locator('.p-dropdown-item, [role="option"]');
        const risCount = await risOptions.count().catch(() => 0);

        const indicesValidos: number[] = [];
        for (let idx = 0; idx < risCount; idx++) {
          const texto = ((await risOptions.nth(idx).textContent()) || '').trim();
          if (!texto || /seleccione/i.test(texto)) continue;
          indicesValidos.push(idx);
        }

        if (indicesValidos.length > 0) {
          const risIndex = indicesValidos[Math.floor(Math.random() * indicesValidos.length)];
          await risOptions.nth(risIndex).click();
          await page.waitForTimeout(220);
          risSeleccionado = true;
          console.log('  │  ✓ RIS aplicable seleccionado');
          break;
        }

        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(280);
      }

      if (!risSeleccionado) {
        throw new Error('No se encontraron opciones RIS aplicable');
      }

      // PASO 8C: TIPO INFRACCIÓN (aleatorio, rápido y variable)
      await page.waitForTimeout(200);
      const tipoDropdown = dialog.locator('p-dropdown[name="infraccionSeleccionada"], p-dropdown[formcontrolname="idTipoInfractor"], p-dropdown[optionlabel*="Infractor" i]').first();
      await tipoDropdown.waitFor({ state: 'visible', timeout: 4000 });

      let tipoSeleccionado = false;
      for (let intentoTipo = 1; intentoTipo <= 4 && !tipoSeleccionado; intentoTipo++) {
        const tipoRoot = tipoDropdown.locator('.p-dropdown').first();
        const disabledAttr = await tipoRoot.getAttribute('aria-disabled').catch(() => null);
        const clase = (await tipoRoot.getAttribute('class').catch(() => '')) || '';
        const deshabilitado = disabledAttr === 'true' || /\bp-disabled\b/i.test(clase);

        if (deshabilitado) {
          await page.waitForTimeout(300);
          continue;
        }

        const tipoTrigger = tipoDropdown.locator('.p-dropdown-trigger').first();
        await tipoTrigger.click({ force: true });
        await page.waitForTimeout(220);

        const panelTipo = page.locator('.dropdown-panel-wrap--tipo:visible, .p-dropdown-panel:visible').last();
        await panelTipo.waitFor({ state: 'visible', timeout: 2500 }).catch(() => {});

        const tipoOptions = panelTipo.locator('.p-dropdown-item, [role="option"]');
        const tipoCount = await tipoOptions.count().catch(() => 0);

        const indicesValidos: number[] = [];
        for (let idx = 0; idx < tipoCount; idx++) {
          const texto = ((await tipoOptions.nth(idx).textContent()) || '').trim();
          if (!texto || /seleccione/i.test(texto)) continue;
          indicesValidos.push(idx);
        }

        if (indicesValidos.length > 0) {
          const elegido = indicesValidos[Math.floor(Math.random() * indicesValidos.length)];
          await tipoOptions.nth(elegido).click();
          await page.waitForTimeout(180);
          tipoSeleccionado = true;
          console.log('  │  ✓ Tipo Infractor seleccionado');
          break;
        }

        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(280);
      }

      if (!tipoSeleccionado) {
        throw new Error('No se encontraron opciones de Tipo Infractor');
      }

      // PASO 8D: HECHO INFRACTOR
      const hechoInput = dialog.getByPlaceholder('Describe el hecho infractor');
      await hechoInput.click();
      await hechoInput.fill('hecho infractor');
      await page.waitForTimeout(1000);
      console.log(`  │  ✓ Hecho Infractor llenado`);

      // PASO 8E: CHECKBOXES
      console.log(`  │  ☑️  Marcando sanciones:`);

      const marcarCheckbox = async (id: string, label: string) => {
        const input = page.locator(`#${id}`);
        const visible = await input.isVisible({ timeout: 3000 }).catch(() => false);
        if (visible) {
          const marcado = await input.isChecked().catch(() => false);
          if (!marcado) {
            await input.click({ force: true });
            await page.waitForTimeout(800);
          }
          console.log(`  │    ✓ ${label} marcada`);
          return;
        }

        const labelLocator = page.locator(`label[for="${id}"]`);
        if (await labelLocator.isVisible({ timeout: 3000 }).catch(() => false)) {
          await labelLocator.click();
          await page.waitForTimeout(800);
          console.log(`  │    ✓ ${label} marcada`);
        }
      };

      if (sancion.multa) {
        await marcarCheckbox('multa', 'Multa');
      }

      if (sancion.suspension) {
        await marcarCheckbox('suspension', 'Suspensión');
      }

      if (sancion.cancelacion) {
        await marcarCheckbox('cancelacion', 'Cancelación');
      }

      // PASO 8F: MULTA - MONTO
      if (sancion.multa) {
        const forceUIT = (sancion as { forceUIT?: boolean }).forceUIT === true;
        const usarUIT = forceUIT;
        const cantidad = usarUIT
          ? (Math.floor(Math.random() * 10) + 1).toString()
          : (Math.floor(Math.random() * 200000) + 1).toString();
        const tipoMoneda = usarUIT ? 'UIT' : 'SOLES';

        const radioId = usarUIT ? 'uit' : 'soles';
        const radioInput = dialog.locator(`#${radioId}`);
        const radioBoxById = dialog.locator(`p-radiobutton[inputid="${radioId}"] .p-radiobutton-box`).first();

        if (await radioBoxById.isVisible({ timeout: 1000 }).catch(() => false)) {
          await radioBoxById.click({ force: true });
        } else if (await radioInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await radioInput.click({ force: true });
        }
        await page.waitForTimeout(800);

        if (forceUIT) {
          console.log('  │    ✓ UIT forzado seleccionado');
        }

        const inputMoneda = usarUIT
          ? dialog.locator('input[name="valorUIT"]').first()
          : dialog.locator('input[name="valorSoles"], input[placeholder="0.00"]').first();
        if (await inputMoneda.isVisible({ timeout: 3000 }).catch(() => false)) {
          await inputMoneda.click();
          await inputMoneda.fill(cantidad);
          await page.waitForTimeout(600);
          console.log(`  │    ✓ Monto: ${cantidad} ${tipoMoneda}`);
        }
      }

      // PASO 8G: TIEMPO (SOLO SUSPENSIÓN)
      if (sancion.suspension) {
        const dialog = page.locator('[role="dialog"]').first();

        const tiempoLabel = dialog.locator('label', { hasText: /Tiempo/i }).first();
        const tiempoDropdown = tiempoLabel.locator('..').locator('p-dropdown, .p-dropdown').first();
        const tiempoCombobox = dialog.getByRole('combobox', { name: /Tiempo/i }).first();
        let tiempoButton = tiempoDropdown.locator('.p-dropdown-trigger, [role="button"], [role="combobox"]').first();

        if (!(await tiempoButton.isVisible({ timeout: 1500 }).catch(() => false))) {
          tiempoButton = tiempoCombobox;
        }

        await tiempoButton.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

        let tipoSeleccionado: 'Año' | 'Mes' | 'Día' | null = null;
        const opcionesTiempo = page.getByRole('option').filter({ hasText: /Año|Mes|Día/i });

        for (let intento = 0; intento < 3; intento++) {
          await tiempoButton.click({ force: true });
          await page.waitForTimeout(800);

          const totalOpciones = await opcionesTiempo.count().catch(() => 0);
          if (totalOpciones > 0) {
            const index = Math.floor(Math.random() * totalOpciones);
            const opcion = opcionesTiempo.nth(index);
            const texto = (await opcion.innerText()).trim();
            if (/Año/i.test(texto)) tipoSeleccionado = 'Año';
            else if (/Mes/i.test(texto)) tipoSeleccionado = 'Mes';
            else tipoSeleccionado = 'Día';

            await opcion.click();
            await page.waitForTimeout(800);
            break;
          }

          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }

        const tipoFinal = tipoSeleccionado ?? 'Año';
        let cantidad = 1;
        if (tipoFinal === 'Año') cantidad = Math.floor(Math.random() * 5) + 1;
        else if (tipoFinal === 'Mes') cantidad = Math.floor(Math.random() * 11) + 1;
        else cantidad = Math.floor(Math.random() * 29) + 1;

        const cantidadInput = dialog.getByPlaceholder('Cantidad');
        if (await cantidadInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await cantidadInput.click();
          await cantidadInput.fill(cantidad.toString());
          await page.waitForTimeout(600);
          console.log(`  │    ✓ Tiempo: ${tipoFinal} (${cantidad})`);
        }
      }

      // PASO 8H: GUARDAR DETALLE
      const btnGuardarDetalle = page.locator('button[label="Guardar detalle"][icon="pi pi-save"]');
      await btnGuardarDetalle.waitFor({ state: 'visible', timeout: 5000 });

      const apiDetalleOkPromise = esperarRespuestaApiGuardado(esScale ? 6500 : 9000);
      await btnGuardarDetalle.click({ force: true });

      // Validar que el detalle fue guardado correctamente
      let guardado = false;
      const maxIntentosGuardado = esScale ? 4 : 3;
      const esperaGuardadoMs = esScale ? 450 : 1000;
      let toastDetalleVisible = false;
      let filasIncrementaron = false;

      for (let intento = 0; intento < maxIntentosGuardado; intento++) {
        const toastExito = page.locator('.p-toast-message-success, .p-toast-message[aria-label*="Éxito"], .p-toast-message[style*="green"]').first();
        toastDetalleVisible = await toastExito.isVisible().catch(() => false);
        const filasDespues = await contarFilasDetalle();
        filasIncrementaron = filasDespues > filasAntes;

        if (toastDetalleVisible || filasIncrementaron) {
          guardado = true;
          break;
        }
        await page.waitForTimeout(esperaGuardadoMs);
      }

      const apiDetalleOk = await apiDetalleOkPromise;
      guardado = guardado || apiDetalleOk;

      if (!guardado) {
        throw new Error(`No se confirmó el guardado del detalle de sanción (toast=${toastDetalleVisible}, filasIncrementaron=${filasIncrementaron}, api=${apiDetalleOk})`);
      }
      await page.waitForTimeout(esScale ? 120 : 1000);
      exitosas++;
      console.log(`  │  ✅ GUARDADA (Detalle agregado ${exitosas}/${sanciones.length})`);

      if (!esScale && (sancion.numero === 5 || sancion.numero === sanciones.length)) {
        // Espera a que el toast de éxito esté visible
        const toast = page.locator('.p-toast-message-success, .p-toast-message[aria-label*="Éxito"], .p-toast-message[style*="green"]');
        await toast.waitFor({ state: 'visible', timeout: 4000 });
        await page.waitForTimeout(300); // Breve espera para asegurar render
        await page.screenshot({
          path: `screenshots/02-REGISTRAR_SANCION_DETALLE_${sancion.numero}_VENTANA.png`,
          fullPage: true
        });
      }

      // PASO 8I: CERRAR MODAL
      await page.keyboard.press('Escape');
      await page.waitForTimeout(esScale ? 120 : 1500);

    } catch (error) {
      const msg = error instanceof Error ? error.message.substring(0, 35) : 'Error';
      console.log(`  │  ❌ ${msg}`);
    }

    console.log(`  └───────────────────────────────────────────────────────────────────────────────────────────`);
  }

  console.log(`\n  ✅ SANCIONES COMPLETADAS: ${exitosas}/${sanciones.length}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // PASO 9: GUARDAR FORMULARIO FINAL
  // ═══════════════════════════════════════════════════════════════════
  console.log('═'.repeat(90));
  console.log('✅ PASO 9: GUARDANDO FORMULARIO FINAL');
  console.log('═'.repeat(90));

  // Captura formulario lleno antes de guardar
  // Reutiliza `capturarFormularioLleno`
  if (!esScale) {
    await capturarFormularioLleno(page, '02-REGISTRAR_SANCION', admin, '', 'REGISTRAR_SANCION', '09_FORMULARIO_FINAL');
  }

  await page.waitForTimeout(esScale ? 200 : 2000);
  const btnGuardarFinal = page.locator('button[label="Guardar"][icon="pi pi-save"]');
  await btnGuardarFinal.waitFor({ state: 'visible', timeout: 5000 });

  const apiFinalOkPromise = esperarRespuestaApiGuardado(esScale ? 6500 : 10000);
  await btnGuardarFinal.click({ force: true });

  await page.waitForTimeout(esScale ? 900 : 4000);
  const toastFinal = page.locator('.p-toast-message-success, .p-toast-message[aria-label*="Éxito"], .p-toast-message[style*="green"]').first();
  const toastVisible = await toastFinal.isVisible({ timeout: esScale ? 3000 : 5000 }).catch(() => false);
  const apiFinalOk = await apiFinalOkPromise;

  if (strictVerify) {
    if (!toastVisible && !apiFinalOk) {
      throw new Error('No se confirmó el guardado final del formulario (sin toast ni confirmación API).');
    }
    if (requireFinalApiConfirm && !apiFinalOk) {
      throw new Error('No se confirmó el guardado final del formulario por API.');
    }
  }

  console.log('  ✅ Formulario guardado');

  if (!esScale) {
    // Captura pantalla completa de éxito final
    const toastVisible = await toastFinal.isVisible({ timeout: 4000 }).catch(() => false);
    if (toastVisible) {
      await page.waitForTimeout(300);
    } else {
      console.warn('  ⚠️ Toast final no visible dentro del timeout. Se continúa por validación de guardado ya completada.');
    }
    await page.screenshot({
      path: 'screenshots/02-REGISTRAR_SANCION_EXITO_FINAL.png',
      fullPage: true
    });

    // Reutiliza `capturarToastExito`
    await capturarToastExito(page, '02-REGISTRAR_SANCION', '10_EXITO_GUARDAR_GENERAL', admin, '', 'REGISTRAR_SANCION', 2500);

    try {
      // Reutiliza `capturarPantallaMejorada`
      await capturarPantallaMejorada(page, '02-REGISTRAR_SANCION', '11_FINAL', 'Éxito', 'Final');
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      console.warn(`  ⚠️ No se pudo capturar pantalla final mejorada: ${detalle}`);
    }
  }
  console.log(`\n  ✅ TEST COMPLETADO - Sanciones: ${exitosas}/${sanciones.length}\n`);

  let minSancionesRequeridas = 3;
  if (strictVerify) {
    minSancionesRequeridas = esScale
      ? Math.max(1, Math.min(sanciones.length, minSancionesScale))
      : sanciones.length;
  }
  if (exitosas >= minSancionesRequeridas) {
    console.log(`  ✅ EXITOSO: ${exitosas}/${sanciones.length} sanciones registradas`);
    if (strictVerify && esScale && exitosas < sanciones.length) {
      console.warn(`  ⚠️ Modo scale: sanciones parciales ${exitosas}/${sanciones.length} (umbral=${minSancionesRequeridas}).`);
    }
  } else {
    throw new Error(`Solo ${exitosas} sanciones registradas (se requieren al menos ${minSancionesRequeridas})`);
  }
});