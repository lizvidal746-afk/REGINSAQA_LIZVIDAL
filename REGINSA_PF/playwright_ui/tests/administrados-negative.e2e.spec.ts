import { test } from './fixtures/test-base';
import { POManager } from '../POManager';
import { configurarContextoReginsa, ReginsaRunContext } from '../helpers/test-run-metadata';

test.describe('CP-REG-01 - Validaciones negativas de administrado', () => {
  let poManager: POManager;
  let runContext: ReginsaRunContext;

  test.beforeEach(async ({ page }, testInfo) => {
    runContext = await configurarContextoReginsa(page, testInfo, {
      scenario: 'NEG-ADMINISTRADO',
      timeoutJustification: 'Caso 01 negativo separa reglas de obligatoriedad de reglas de duplicidad RUC/Razon Social.',
    });
    poManager = new POManager(page);
  });

  test('No deberia permitir guardar sin campos obligatorios', async ({}, testInfo) => {
    test.setTimeout(120000);
    const administradosPage = poManager.getAdministradosPage();

    testInfo.annotations.push({ type: 'validacionNegativa', description: 'Todos los campos del administrado son obligatorios.' });
    testInfo.annotations.push({ type: 'defectoEsperadoSiPermiteGuardar', description: 'DEFECTO FUNCIONAL: guardar administrado vacio no debe persistir.' });

    await administradosPage.navegarAlModulo();
    await administradosPage.validarModuloCargado();
    await administradosPage.abrirFormularioNuevoAdministrado();
    await administradosPage.validarObligatoriosBloqueanGuardado();
  });

  test('No deberia permitir duplicar RUC ni Razon Social', async ({}, testInfo) => {
    test.setTimeout(240000);
    const administradosPage = poManager.getAdministradosPage();
    const data = administradosPage.generarDatos(runContext.slot, runContext.repeatIndex);

    testInfo.annotations.push({ type: 'validacionNegativa', description: 'RUC y Razon Social duplicados deben bloquearse como regla distinta a obligatoriedad.' });
    testInfo.annotations.push({ type: 'rucDuplicado', description: data.ruc });
    testInfo.annotations.push({ type: 'razonSocialDuplicada', description: data.razonSocial });

    await test.step('1. Crear administrado base para prueba de duplicidad', async () => {
      await administradosPage.navegarAlModulo();
      await administradosPage.validarModuloCargado();
      await administradosPage.abrirFormularioNuevoAdministrado();
      await administradosPage.llenarFormulario(data);
      const result = await administradosPage.guardarFormulario();
      testInfo.annotations.push({ type: 'registroIdBase', description: result.registroId });
      await administradosPage.validarPersistencia(data, result.authorizationHeader);
    });

    await test.step('2. Intentar registrar el mismo RUC/Razon Social', async () => {
      await administradosPage.navegarAlModulo();
      await administradosPage.validarModuloCargado();
      await administradosPage.abrirFormularioNuevoAdministrado();
      await administradosPage.llenarFormulario(data);
      await administradosPage.validarDuplicadoBloqueaGuardado();
    });
  });
});
