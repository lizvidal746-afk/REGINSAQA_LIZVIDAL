import { test } from './fixtures/test-base';

import { POManager } from '../POManager';
import { configurarContextoReginsa, ReginsaRunContext } from '../helpers/test-run-metadata';

test.describe('CP-REG-01 - Agregar administrado', () => {
  let poManager: POManager;
  let runContext: ReginsaRunContext;

  test.beforeEach(async ({ page }, testInfo) => {
    runContext = await configurarContextoReginsa(page, testInfo, {
      scenario: process.env.SCENARIO || 'SMOKE',
      timeoutJustification: 'Caso 01 valida alta de administrado con ID real backend y persistencia; RUC/Razon Social se generan unicos por worker/repeticion.',
    });
    poManager = new POManager(page);
  });

  test('Deberia registrar administrado con RUC y Razon Social unicos', async ({}, testInfo) => {
    test.setTimeout(240000);
    const administradosPage = poManager.getAdministradosPage();
    const data = administradosPage.generarDatos(runContext.slot, runContext.repeatIndex, testInfo.retry);

    testInfo.annotations.push({ type: 'flujo', description: 'CP-REG-01 Agregar administrado' });
    testInfo.annotations.push({ type: 'criterioUnicidad', description: 'RUC y Razon Social no deben repetirse.' });
    testInfo.annotations.push({ type: 'criterioObligatoriedad', description: 'Todos los campos del formulario son obligatorios.' });
    testInfo.annotations.push({ type: 'ruc', description: data.ruc });
    testInfo.annotations.push({ type: 'razonSocial', description: data.razonSocial });
    const case01Mode = process.env.REGINSA_ADMIN_SERIALIZE_SAVE === '1' ? 'stable-serialized-save' : 'audit-concurrent-save';
    testInfo.annotations.push({ type: 'case01Mode', description: case01Mode });
    testInfo.annotations.push({
      type: 'alcanceConcurrencia',
      description: case01Mode === 'stable-serialized-save'
        ? 'Funcional estable: usuarios/IPs distribuidos; Entidad/Crear se serializa para validar altas completas.'
        : 'Auditoria concurrente: Entidad/Crear se ejecuta con concurrencia real para evidenciar estabilidad del endpoint.',
    });

    await test.step('1. Navegar al modulo Administrado', async () => {
      await administradosPage.navegarAlModulo();
      await administradosPage.validarModuloCargado();
    });

    await test.step('2. Abrir formulario y llenar datos unicos', async () => {
      await administradosPage.abrirFormularioNuevoAdministrado();
      await administradosPage.llenarFormulario(data);
    });

    await test.step('3. Guardar con confirmacion real de backend', async () => {
      const result = await administradosPage.guardarFormulario(data);
      testInfo.annotations.push({ type: 'registroId', description: result.registroId });
      testInfo.annotations.push({ type: 'apiEndpoint', description: result.endpoint });
      testInfo.annotations.push({ type: 'apiStatus', description: String(result.status) });
      await administradosPage.validarPersistencia(data, result.authorizationHeader);
    });
  });
});
