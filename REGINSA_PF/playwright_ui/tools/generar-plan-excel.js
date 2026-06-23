const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

function styleHeader(sheet, color = 'FF1A237E') {
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.columnCount }
    };
}

function wrapRows(sheet) {
    sheet.eachRow((row) => {
        row.alignment = { vertical: 'top', wrapText: true };
    });
}

async function generatePlan() {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'REGINSA_PF - Playwright UI';
    workbook.created = new Date();
    workbook.modified = new Date();

    const planSheet = workbook.addWorksheet('Casos');
    planSheet.columns = [
        { header: 'ID Caso', key: 'id', width: 18 },
        { header: 'Flujo', key: 'flujo', width: 28 },
        { header: 'Prioridad', key: 'prioridad', width: 12 },
        { header: 'Tipo / Fase', key: 'fase', width: 24 },
        { header: 'Modo', key: 'modo', width: 18 },
        { header: 'Objetivo', key: 'objetivo', width: 42 },
        { header: 'Cobertura de Sanciones', key: 'sanciones', width: 44 },
        { header: 'Workers', key: 'workers', width: 12 },
        { header: 'Registros Esperados', key: 'registros', width: 18 },
        { header: 'Comando desde playwright_ui', key: 'command', width: 48 },
        { header: 'Comando desde REGINSA_PF', key: 'wrapper', width: 56 },
        { header: 'Validacion Esperada', key: 'validacion', width: 48 },
        { header: 'Estado', key: 'estado', width: 20 },
        { header: 'Observaciones', key: 'observaciones', width: 52 }
    ];

    planSheet.addRows([
        {
            id: 'CP-REG-02-SMOKE-H',
            flujo: 'Registrar sancion',
            prioridad: 'Critica',
            fase: 'Smoke',
            modo: 'Headless',
            objetivo: 'Validar un expediente completo con la cobertura total de sanciones en ejecucion rapida.',
            sanciones: '8 combinaciones: multa soles, multa UIT, suspension anio, suspension mes, suspension dia, multa soles + suspension, multa UIT + suspension, cancelacion.',
            workers: 1,
            registros: 1,
            command: 'npm run pf:smoke:caso02',
            wrapper: 'powershell -ExecutionPolicy Bypass -File .\\run-ui-tests.ps1 -Mode smoke',
            validacion: 'Debe capturar ID real del backend, validar persistencia de cabecera y reportar todas las sanciones ejecutadas.',
            estado: 'Activo',
            observaciones: 'Es la prueba base para validar antes de escalar.'
        },
        {
            id: 'CP-REG-02-SMOKE-V',
            flujo: 'Registrar sancion',
            prioridad: 'Critica',
            fase: 'Smoke Headed',
            modo: 'Headed visible',
            objetivo: 'Permitir observacion manual del flujo mientras se ejecuta la misma cobertura completa del smoke.',
            sanciones: 'Las mismas 8 combinaciones del smoke headless.',
            workers: 1,
            registros: 1,
            command: 'npm run pf:smoke:caso02:headed',
            wrapper: 'powershell -ExecutionPolicy Bypass -File .\\run-ui-tests.ps1 -Mode smoke-headed',
            validacion: 'Debe abrir reportes con comando, no con file://. Playwright y Allure se abren desde servidor local.',
            estado: 'Activo',
            observaciones: 'Puede abrir varias ventanas por setup auth, prueba funcional y reportes.'
        },
        {
            id: 'CP-REG-02-NEG-01',
            flujo: 'Registrar sancion',
            prioridad: 'Critica',
            fase: 'Negativa negocio',
            modo: 'Manual primero / automatizable',
            objetivo: 'Detectar si REGINSA permite guardar un expediente sin ninguna sancion asociada.',
            sanciones: '0 sanciones',
            workers: 1,
            registros: 0,
            command: 'npm run pf:negative:caso02:sin-sanciones',
            wrapper: 'powershell -ExecutionPolicy Bypass -File .\\run-ui-tests.ps1 -Mode negative-sin-sanciones',
            validacion: 'El sistema debe bloquear el guardado o mostrar validacion obligatoria. Si permite guardar, se registra defecto funcional critico.',
            estado: 'Activo',
            observaciones: 'Comentario del usuario: la automatizacion esta evidenciando que algunos registros se guardan sin sanciones.'
        },
        {
            id: 'CP-REG-02-P1-MIN',
            flujo: 'Registrar sancion',
            prioridad: 'Alta',
            fase: 'Phase 1 minimo',
            modo: 'Headless',
            objetivo: 'Validar concurrencia inicial con 9 usuarios/workers sin saturar cada expediente.',
            sanciones: '1 sancion aleatoria por expediente.',
            workers: 9,
            registros: 9,
            command: 'npm run pf:phase1:caso02:minimo',
            wrapper: 'powershell -ExecutionPolicy Bypass -File .\\run-ui-tests.ps1 -Mode phase1',
            validacion: 'Debe crear 9 expedientes trazables, cada uno con ID real backend y sin colision de datos.',
            estado: 'Activo',
            observaciones: 'Es el default recomendado para Phase 1.'
        },
        {
            id: 'CP-REG-02-P1-MULTI',
            flujo: 'Registrar sancion',
            prioridad: 'Alta',
            fase: 'Phase 1 multi',
            modo: 'Headless',
            objetivo: 'Ejecutar 9 expedientes concurrentes con cobertura amplia de sanciones.',
            sanciones: '8 combinaciones por expediente, sujeto a tiempos y estabilidad del ambiente.',
            workers: 9,
            registros: 9,
            command: 'npm run pf:phase1:caso02:multi',
            wrapper: 'powershell -ExecutionPolicy Bypass -File .\\run-ui-tests.ps1 -Mode phase1-multi',
            validacion: 'Cada expediente debe tener ID real, persistencia de cabecera y detalle de sanciones acorde al modo.',
            estado: 'Activo con cautela',
            observaciones: 'Usar despues de confirmar smoke y Phase 1 minimo.'
        },
        {
            id: 'CP-REG-02-P2',
            flujo: 'Registrar sancion',
            prioridad: 'Alta',
            fase: 'Phase 2',
            modo: 'Headless',
            objetivo: 'Validar repeticion controlada: 9 workers x 4 repeticiones.',
            sanciones: '1 sancion aleatoria por expediente.',
            workers: 9,
            registros: 36,
            command: 'npm run pf:phase2:caso02',
            wrapper: 'powershell -ExecutionPolicy Bypass -File .\\run-ui-tests.ps1 -Mode phase2',
            validacion: '36 registros esperados, con trazabilidad de worker/repeticion y persistencia real.',
            estado: 'Activo',
            observaciones: 'Ejecutar cuando smoke y Phase 1 minimo esten estables.'
        },
        {
            id: 'CP-REG-02-POST-01',
            flujo: 'Busqueda post-condicion',
            prioridad: 'Critica',
            fase: 'Post-condicion',
            modo: 'Headless / Headed',
            objetivo: 'Buscar el expediente recien creado para confirmar que aparece en la grilla o consulta del sistema.',
            sanciones: 'Aplica al expediente creado por el flujo.',
            workers: 1,
            registros: 1,
            command: 'Pendiente integrar en el spec principal',
            wrapper: 'Pendiente integrar en run-ui-tests.ps1',
            validacion: 'El expediente creado debe encontrarse por ID real o numero de expediente.',
            estado: 'Pendiente',
            observaciones: 'Complementa la validacion por API y reduce riesgo de falso positivo.'
        },
        {
            id: 'CP-REG-02-POM-01',
            flujo: 'Robustez POM',
            prioridad: 'Alta',
            fase: 'Estabilidad UI',
            modo: 'No aplica',
            objetivo: 'Mejorar esperas inteligentes para combos, botones, modales y PrimeNG/Angular.',
            sanciones: 'Aplica a selects de administrado, RIS, tipo infractor y controles de sancion.',
            workers: 1,
            registros: 0,
            command: 'No ejecuta prueba directa',
            wrapper: 'No ejecuta prueba directa',
            validacion: 'Menos falsos fallos por elementos visibles pero aun no interactuables.',
            estado: 'Propuesto',
            observaciones: 'Implementar poco a poco para no romper el flujo que ya pasa.'
        },
        {
            id: 'CP-REG-02-REPORT-01',
            flujo: 'Reporte funcional HTML',
            prioridad: 'Alta',
            fase: 'Reporte',
            modo: 'No aplica',
            objetivo: 'Replicar el estilo validado del reporte K6 en reportes funcionales Playwright.',
            sanciones: 'Debe mostrar cobertura de sanciones y trazabilidad de ID real.',
            workers: 0,
            registros: 0,
            command: 'npm run report:html',
            wrapper: 'powershell -ExecutionPolicy Bypass -File .\\run-ui-tests.ps1 -Mode reports',
            validacion: 'HTML con logo SUNEDU, secciones funcionales, metricas, trazabilidad, errores y recomendaciones.',
            estado: 'Activo en mejora',
            observaciones: 'REGINSA_K6_STRESS solo se consulta como referencia visual; no se modifica.'
        },
        {
            id: 'CP-REG-01-SMOKE',
            flujo: 'Agregar administrado',
            prioridad: 'Alta',
            fase: 'Smoke',
            modo: 'Headless',
            objetivo: 'Crear 1 administrado unico con RUC, Razon Social, Nombre Comercial y Estado.',
            sanciones: 'No aplica.',
            workers: 1,
            registros: 1,
            command: 'npm run pf:smoke:caso01',
            wrapper: 'powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 01 -Scenario smoke',
            validacion: 'Debe capturar ID real de Entidad/Crear y validar persistencia en Entidad/Listar.',
            estado: 'Activo nuevo',
            observaciones: 'RUC y Razon Social se validan como unicidad, distinto a obligatoriedad.'
        },
        {
            id: 'CP-REG-01-SMOKE-H',
            flujo: 'Agregar administrado',
            prioridad: 'Alta',
            fase: 'Smoke Headed',
            modo: 'Headed visible',
            objetivo: 'Ejecutar el alta de administrado de forma visible para revision manual asistida.',
            sanciones: 'No aplica.',
            workers: 1,
            registros: 1,
            command: 'npm run pf:smoke:caso01:headed',
            wrapper: 'powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 01 -Scenario smoke -Headed -OpenReports',
            validacion: 'Misma validacion del smoke, abriendo reportes al finalizar.',
            estado: 'Activo nuevo',
            observaciones: 'Usar primero si se quiere observar campos y mensajes de validacion.'
        },
        {
            id: 'CP-REG-01-NEG',
            flujo: 'Agregar administrado',
            prioridad: 'Alta',
            fase: 'Negativa negocio',
            modo: 'Headless / Headed opcional',
            objetivo: 'Validar reglas separadas: todos los campos obligatorios y bloqueo de RUC/Razon Social duplicados.',
            sanciones: 'No aplica.',
            workers: 1,
            registros: 1,
            command: 'npm run pf:negative:caso01',
            wrapper: 'powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 01 -Scenario negative',
            validacion: 'Guardar vacio debe bloquearse; duplicar RUC/Razon Social debe bloquearse con mensaje de duplicidad.',
            estado: 'Activo nuevo',
            observaciones: 'La prueba de duplicidad crea un administrado base y luego intenta repetirlo.'
        },
        {
            id: 'CP-REG-01-P1-P2',
            flujo: 'Agregar administrado',
            prioridad: 'Alta',
            fase: 'Phase 1 / Phase 2',
            modo: 'Headless',
            objetivo: 'Escalar altas de administrados con datos unicos por worker/repeticion.',
            sanciones: 'No aplica.',
            workers: 9,
            registros: '9 / 36',
            command: 'npm run pf:phase1:caso01 / npm run pf:phase2:caso01',
            wrapper: 'powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 01 -Scenario phase1|phase2',
            validacion: 'Cada administrado debe tener ID real y persistencia confirmada.',
            estado: 'Activo con cautela',
            observaciones: 'Ejecutar escala despues de validar smoke y negative.'
        },
        {
            id: 'CP-REG-04-SMOKE',
            flujo: 'Reconsiderar con sanciones',
            prioridad: 'Alta',
            fase: 'Smoke',
            modo: 'Headless',
            objetivo: 'Abrir registro candidato, marcar reconsideracion y llenar archivo, numero y fecha.',
            sanciones: 'Debe conservar al menos 1 sancion en detalle.',
            workers: 1,
            registros: 1,
            command: 'npm run pf:smoke:caso04',
            wrapper: 'powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 04 -Scenario smoke',
            validacion: 'Guardar cabecera con respuesta API 2xx y validar detalle de sanciones >= 1.',
            estado: 'Activo nuevo',
            observaciones: 'Depende de que existan registros candidatos en la grilla.'
        },
        {
            id: 'CP-REG-04-SMOKE-H',
            flujo: 'Reconsiderar con sanciones',
            prioridad: 'Alta',
            fase: 'Smoke Headed',
            modo: 'Headed visible',
            objetivo: 'Observar manualmente el flujo de reconsideracion y los campos condicionales.',
            sanciones: 'Debe conservar al menos 1 sancion en detalle.',
            workers: 1,
            registros: 1,
            command: 'npm run pf:smoke:caso04:headed',
            wrapper: 'powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 04 -Scenario smoke -Headed -OpenReports',
            validacion: 'Misma validacion del smoke, abriendo reportes al finalizar.',
            estado: 'Activo nuevo',
            observaciones: 'Usar para confirmar visualmente selector de candidato y carga de archivo.'
        },
        {
            id: 'CP-REG-04-NEG',
            flujo: 'Reconsiderar con sanciones',
            prioridad: 'Alta',
            fase: 'Negativa negocio',
            modo: 'Headless / Headed opcional',
            objetivo: 'Validar que al marcar Presento recurso se vuelvan obligatorios Archivo, Numero y Fecha.',
            sanciones: 'No modifica detalle; valida bloqueo de cabecera.',
            workers: 1,
            registros: 0,
            command: 'npm run pf:negative:caso04',
            wrapper: 'powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 04 -Scenario negative',
            validacion: 'El sistema debe bloquear guardar sin los 3 campos condicionales. Si guarda, se reporta defecto funcional.',
            estado: 'Activo nuevo',
            observaciones: 'Importante para ejecuciones masivas donde una omision podria pasar desapercibida.'
        },
        {
            id: 'CP-REG-04-P1-P2',
            flujo: 'Reconsiderar con sanciones',
            prioridad: 'Alta',
            fase: 'Phase 1 / Phase 2',
            modo: 'Headless',
            objetivo: 'Escalar reconsideraciones sobre candidatos disponibles, manteniendo sanciones asociadas.',
            sanciones: 'Debe conservar al menos 1 sancion en detalle por registro.',
            workers: 9,
            registros: '9 / 36',
            command: 'npm run pf:phase1:caso04 / npm run pf:phase2:caso04',
            wrapper: 'powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 04 -Scenario phase1|phase2',
            validacion: 'Cada actualizacion debe registrar respuesta API 2xx y detalle de sanciones >= 1.',
            estado: 'Activo con cautela',
            observaciones: 'Ejecutar escala despues de confirmar que hay suficientes candidatos elegibles.'
        }
    ]);
    styleHeader(planSheet, 'FF1A237E');
    wrapRows(planSheet);

    const scriptsSheet = workbook.addWorksheet('Scripts');
    scriptsSheet.columns = [
        { header: 'Comando', key: 'comando', width: 60 },
        { header: 'Ejecutar desde', key: 'desde', width: 24 },
        { header: 'Para que sirve', key: 'uso', width: 58 },
        { header: 'Abre navegador', key: 'browser', width: 18 },
        { header: 'Genera reportes', key: 'reportes', width: 18 },
        { header: 'Notas', key: 'notas', width: 52 }
    ];
    scriptsSheet.addRows([
        { comando: 'npm run smoke', desde: 'playwright_ui', uso: 'Alias corto para smoke headless de Caso 02.', browser: 'No visible', reportes: 'Si', notas: 'Equivale a pf:smoke:caso02.' },
        { comando: 'npm run smoke:headed', desde: 'playwright_ui', uso: 'Alias corto para smoke visible de Caso 02.', browser: 'Si', reportes: 'Si, y los abre', notas: 'Ideal para que el usuario observe manualmente el flujo.' },
        { comando: 'npm run smoke:headed:fast', desde: 'playwright_ui', uso: 'Smoke visible reutilizando .auth/user.json para omitir la ventana de login/setup.', browser: 'Si', reportes: 'Si, y los abre', notas: 'Usar en debug manual si la sesion guardada sigue vigente.' },
        { comando: 'npm run pf:negative:caso02:sin-sanciones', desde: 'playwright_ui', uso: 'Valida que REGINSA no permita guardar expediente sin sanciones.', browser: 'No visible', reportes: 'Si', notas: 'Si persiste un registro, el test falla como defecto funcional critico.' },
        { comando: 'npm run pf:negative:caso02:sin-sanciones:headed', desde: 'playwright_ui', uso: 'Misma validacion negativa con navegador visible.', browser: 'Si', reportes: 'Si, y los abre', notas: 'Util para demostrar visualmente el defecto.' },
        { comando: 'npm run phase1:minimo', desde: 'playwright_ui', uso: 'Concurrencia controlada: 9 expedientes con 1 sancion cada uno.', browser: 'No visible', reportes: 'Si', notas: 'Ejecucion recomendada despues del smoke.' },
        { comando: 'npm run phase1:multi', desde: 'playwright_ui', uso: 'Concurrencia amplia: 9 expedientes con 8 sanciones cada uno.', browser: 'No visible', reportes: 'Si', notas: 'Usar con cautela por duracion y carga.' },
        { comando: 'npm run phase2', desde: 'playwright_ui', uso: 'Escala controlada: 36 expedientes esperados.', browser: 'No visible', reportes: 'Si', notas: 'Ejecutar cuando Phase 1 minimo este estable.' },
        { comando: 'npm run report:html', desde: 'playwright_ui', uso: 'Genera reporte HTML funcional desde results.json.', browser: 'No', reportes: 'HTML', notas: 'Usa diseno inspirado en K6, orientado a pruebas funcionales.' },
        { comando: 'npm run report:excel', desde: 'playwright_ui', uso: 'Genera reporte Excel de resultados de ejecucion.', browser: 'No', reportes: 'Excel', notas: 'No confundir con este plan de pruebas.' },
        { comando: 'npm run report:playwright:open', desde: 'playwright_ui', uso: 'Abre reporte nativo Playwright con servidor local.', browser: 'Si', reportes: 'Playwright HTML', notas: 'No abrir por file://.' },
        { comando: 'npm run report:allure:generate', desde: 'playwright_ui', uso: 'Regenera reporte Allure desde allure-results.', browser: 'No', reportes: 'Allure', notas: 'Debe ejecutarse antes de allure open si el reporte esta vacio.' },
        { comando: 'npm run report:allure:open', desde: 'playwright_ui', uso: 'Abre Allure con servidor local.', browser: 'Si', reportes: 'Allure', notas: 'No abrir index.html por file://.' },
        { comando: 'powershell -ExecutionPolicy Bypass -File .\\run-ui-tests.ps1 -Mode list', desde: 'REGINSA_PF', uso: 'Lista pruebas disponibles sin ejecutarlas.', browser: 'No', reportes: 'No', notas: 'Puede sobrescribir results.json con cero pruebas si se usa reporter JSON.' },
        { comando: 'powershell -ExecutionPolicy Bypass -File .\\run-ui-tests.ps1 -Mode smoke', desde: 'REGINSA_PF', uso: 'Ejecuta smoke headless desde la raiz funcional.', browser: 'No visible', reportes: 'Si', notas: 'Entrada recomendada para usuario final.' },
        { comando: 'powershell -ExecutionPolicy Bypass -File .\\run-ui-tests.ps1 -Mode smoke-headed', desde: 'REGINSA_PF', uso: 'Ejecuta smoke visible y abre reportes.', browser: 'Si', reportes: 'Si', notas: 'Usar para validacion manual asistida.' },
        { comando: 'powershell -ExecutionPolicy Bypass -File .\\run-ui-tests.ps1 -Mode smoke-headed-fast', desde: 'REGINSA_PF', uso: 'Ejecuta smoke visible omitiendo setup si ya existe storageState.', browser: 'Si', reportes: 'Si', notas: 'Reduce tiempo inicial; si falla por sesion expirada, usar smoke-headed normal.' },
        { comando: 'powershell -ExecutionPolicy Bypass -File .\\run-ui-tests.ps1 -Mode negative-sin-sanciones', desde: 'REGINSA_PF', uso: 'Ejecuta la prueba negativa sin sanciones.', browser: 'No visible', reportes: 'Si', notas: 'Debe pasar solo si el sistema bloquea el guardado.' },
        { comando: 'powershell -ExecutionPolicy Bypass -File .\\run-ui-tests.ps1 -Mode negative-sin-sanciones-headed', desde: 'REGINSA_PF', uso: 'Ejecuta la prueba negativa visible.', browser: 'Si', reportes: 'Si', notas: 'Para validacion manual del defecto.' },
        { comando: 'powershell -ExecutionPolicy Bypass -File .\\run-ui-tests.ps1 -Mode reports', desde: 'REGINSA_PF', uso: 'Regenera y abre reportes Playwright/Allure.', browser: 'Si', reportes: 'Si', notas: 'Usar si el reporte no abre directamente.' },
        { comando: 'npm run pf:smoke:caso01', desde: 'playwright_ui', uso: 'Smoke headless de Caso 01 Agregar administrado.', browser: 'No visible', reportes: 'Si', notas: 'Valida ID real Entidad/Crear y persistencia en Entidad/Listar.' },
        { comando: 'npm run pf:smoke:caso01:headed', desde: 'playwright_ui', uso: 'Smoke visible de Caso 01.', browser: 'Si', reportes: 'Si, y los abre', notas: 'Recomendado para primera validacion manual asistida.' },
        { comando: 'npm run pf:negative:caso01', desde: 'playwright_ui', uso: 'Valida obligatorios y duplicidad de RUC/Razon Social.', browser: 'No visible', reportes: 'Si', notas: 'Distingue obligatoriedad de unicidad.' },
        { comando: 'npm run pf:phase1:caso01 / npm run pf:phase2:caso01', desde: 'playwright_ui', uso: 'Escala del alta de administrados.', browser: 'No visible', reportes: 'Si', notas: 'Ejecutar despues de smoke/negative.' },
        { comando: 'npm run pf:smoke:caso04', desde: 'playwright_ui', uso: 'Smoke headless de Caso 04 Reconsiderar con sanciones.', browser: 'No visible', reportes: 'Si', notas: 'Valida archivo, numero, fecha y detalle de sanciones.' },
        { comando: 'npm run pf:smoke:caso04:headed', desde: 'playwright_ui', uso: 'Smoke visible de Caso 04.', browser: 'Si', reportes: 'Si, y los abre', notas: 'Util para confirmar visualmente candidato y campos condicionales.' },
        { comando: 'npm run pf:negative:caso04', desde: 'playwright_ui', uso: 'Valida que reconsideracion no guarde sin archivo, numero ni fecha.', browser: 'No visible', reportes: 'Si', notas: 'Si el backend permite guardar, falla como defecto funcional.' },
        { comando: 'npm run pf:phase1:caso04 / npm run pf:phase2:caso04', desde: 'playwright_ui', uso: 'Escala de reconsideraciones con sanciones.', browser: 'No visible', reportes: 'Si', notas: 'Requiere candidatos suficientes en la grilla.' }
    ]);
    styleHeader(scriptsSheet, 'FF0F766E');
    wrapRows(scriptsSheet);

    const validationsSheet = workbook.addWorksheet('Validaciones');
    validationsSheet.columns = [
        { header: 'ID Validacion', key: 'id', width: 18 },
        { header: 'Regla / Riesgo', key: 'regla', width: 42 },
        { header: 'Como se valida', key: 'como', width: 58 },
        { header: 'Resultado esperado', key: 'esperado', width: 46 },
        { header: 'Severidad si falla', key: 'severidad', width: 18 },
        { header: 'Estado', key: 'estado', width: 22 },
        { header: 'Evidencia requerida', key: 'evidencia', width: 48 }
    ];
    validationsSheet.addRows([
        { id: 'VAL-ID-REAL', regla: 'No aceptar IDs falsos ni fallback por toast.', como: 'Interceptar respuesta real de CabeceraInfraccionSancion/Crear o Actualizar.', esperado: 'El reporte contiene ID real del backend.', severidad: 'Critica', estado: 'Activo', evidencia: 'Registro ID real, request/response y anotacion Playwright.' },
        { id: 'VAL-PERSIST-CAB', regla: 'La cabecera debe persistir despues de guardar.', como: 'Consultar ListarPaginado por ID y por expediente usando el token real capturado.', esperado: 'El expediente aparece en backend despues del guardado.', severidad: 'Critica', estado: 'Activo', evidencia: 'ID real y respuesta de busqueda.' },
        { id: 'VAL-SANCIONES-DET', regla: 'El expediente debe tener detalle de sanciones.', como: 'Comparar sanciones esperadas contra sanciones ejecutadas/anotadas y, cuando sea posible, contra backend.', esperado: 'Smoke debe reportar 8 combinaciones ejecutadas.', severidad: 'Critica', estado: 'Parcial / mejorar', evidencia: 'Anotacion coberturaSanciones y detalle por expediente.' },
        { id: 'VAL-SIN-SANCIONES', regla: 'No se debe guardar un expediente sin sanciones.', como: 'Intentar guardar sin agregar sancion y verificar bloqueo UI/backend.', esperado: 'El sistema rechaza el guardado. Si guarda, se levanta defecto funcional.', severidad: 'Critica', estado: 'Activo', evidencia: 'Screenshot, trace, payload, respuesta backend y registro si fue creado.' },
        { id: 'VAL-BUSQUEDA-POST', regla: 'El registro creado debe poder encontrarse en la grilla.', como: 'Buscar por ID real o numero de expediente al final del flujo.', esperado: 'El expediente aparece visualmente en consulta/listado.', severidad: 'Alta', estado: 'Pendiente', evidencia: 'Screenshot de resultado de busqueda.' },
        { id: 'VAL-COMBOS', regla: 'Combos y botones no deben fallar por carga asincrona.', como: 'Esperar opciones minimas, modal visible, botones habilitados y red estable cuando aplique.', esperado: 'Menos flakiness por elementos visibles pero no listos.', severidad: 'Alta', estado: 'Propuesto', evidencia: 'Antes/despues de fallos por timeout.' },
        { id: 'VAL-REPORTES', regla: 'Reportes deben generarse y abrirse correctamente.', como: 'Generar HTML/Excel/Word, Playwright y Allure desde comandos.', esperado: 'Reporte HTML funcional no vacio y Allure abierto por servidor local.', severidad: 'Media', estado: 'Activo', evidencia: 'Ruta de carpeta RUN y capturas si aplica.' },
        { id: 'VAL-ADM-OBL', regla: 'Caso 01: todos los campos de administrado son obligatorios.', como: 'Intentar guardar formulario vacio y verificar que no exista respuesta 2xx de Entidad/Crear.', esperado: 'UI/backend bloquea el guardado y muestra mensajes de obligatoriedad.', severidad: 'Alta', estado: 'Activo nuevo', evidencia: 'Mensaje de validacion, ausencia de ID real y trace.' },
        { id: 'VAL-ADM-DUP', regla: 'Caso 01: RUC y Razon Social no deben repetirse.', como: 'Crear administrado base y luego intentar repetir mismo RUC/Razon Social.', esperado: 'El sistema bloquea duplicidad; no debe persistir un segundo registro.', severidad: 'Alta', estado: 'Activo nuevo', evidencia: 'RUC/Razon Social usados, mensaje de duplicidad y ausencia de segundo ID.' },
        { id: 'VAL-REC-OBL', regla: 'Caso 04: al marcar Presento recurso, Archivo, Numero y Fecha son obligatorios.', como: 'Marcar reconsideracion, limpiar esos campos e intentar guardar.', esperado: 'El sistema bloquea el guardado; si devuelve 2xx se reporta defecto funcional.', severidad: 'Alta', estado: 'Activo nuevo', evidencia: 'Campos visibles, intento de guardado, mensaje de validacion o respuesta API defectuosa.' },
        { id: 'VAL-REC-SANC', regla: 'Caso 04: la reconsideracion debe mantener sanciones asociadas.', como: 'Despues de guardar, ir a Detalle de sanciones y contar filas validas.', esperado: 'Detalle de sanciones >= 1.', severidad: 'Critica', estado: 'Activo nuevo', evidencia: 'Conteo de filas y captura del detalle.' },
        { id: 'VAL-DATOS-UNICOS', regla: 'No colisionar expedientes entre workers.', como: 'Usar sufijos por worker/repeticion y registrar trazabilidad.', esperado: 'Cada worker crea un expediente unico.', severidad: 'Alta', estado: 'Activo', evidencia: 'Expediente, worker, registro ID y timestamp.' }
    ]);
    styleHeader(validationsSheet, 'FF7C2D12');
    wrapRows(validationsSheet);

    const findingsSheet = workbook.addWorksheet('Hallazgos_Actuales');
    findingsSheet.columns = [
        { header: 'Fecha / Run', key: 'run', width: 30 },
        { header: 'Hallazgo', key: 'hallazgo', width: 56 },
        { header: 'Impacto', key: 'impacto', width: 54 },
        { header: 'Causa observada', key: 'causa', width: 58 },
        { header: 'Accion tomada / siguiente paso', key: 'accion', width: 62 },
        { header: 'Estado', key: 'estado', width: 20 }
    ];
    findingsSheet.addRows([
        {
            run: '2026-06-06 10:31 smoke headed',
            hallazgo: 'No se creo ningun caso en el sistema.',
            impacto: 'El flujo no puede considerarse exitoso ni generar evidencia de persistencia.',
            causa: 'La prueba fallo antes del guardado final, durante el paso de agregar las combinaciones de sanciones; hubo timeout en combo/unidad de suspension.',
            accion: 'Ajustar POM del modal con clicks robustos y timeout especifico de 5 minutos para smoke de 8 sanciones. Repetir prueba manual/headed.',
            estado: 'En correccion'
        },
        {
            run: '2026-06-05 / 2026-06-06',
            hallazgo: 'El reporte puede generarse aunque la prueba falle.',
            impacto: 'El reporte debe leerse como evidencia de falla, no como caso creado.',
            causa: 'El runner genera HTML/Excel/Word aun cuando Playwright devuelve fallo, para conservar evidencia.',
            accion: 'Mantener generacion de reportes, pero revisar columna de estado y ausencia de registroId real.',
            estado: 'Aclarado'
        },
        {
            run: 'Pruebas manuales siguientes',
            hallazgo: 'Validar que no se pueda guardar sin sanciones.',
            impacto: 'Si REGINSA permite guardar sin detalle de sancion, es defecto funcional critico.',
            causa: 'Riesgo observado por el usuario durante automatizacion/manual.',
            accion: 'Primero reproducir manualmente; luego crear prueba negativa automatizada dentro de REGINSA_PF.',
            estado: 'Pendiente priorizado'
        }
    ]);
    styleHeader(findingsSheet, 'FF991B1B');
    wrapRows(findingsSheet);

    const manualSheet = workbook.addWorksheet('Manual_Checklist');
    manualSheet.columns = [
        { header: 'Paso', key: 'paso', width: 10 },
        { header: 'Pantalla / Control', key: 'control', width: 34 },
        { header: 'Que observar manualmente', key: 'observacion', width: 64 },
        { header: 'Resultado esperado', key: 'esperado', width: 54 },
        { header: 'Estado Manual', key: 'estado', width: 20 },
        { header: 'Notas del usuario', key: 'notas', width: 52 }
    ];
    manualSheet.addRows([
        { paso: 1, control: 'Login Punku / storageState', observacion: 'Confirmar que la sesion se crea una vez y la prueba funcional reutiliza storageState.', esperado: 'Autenticacion completa sin pedir credenciales repetidas.', estado: 'Por probar', notas: '' },
        { paso: 2, control: 'Administrado', observacion: 'Verificar que se llena correctamente y no demora de forma anormal.', esperado: 'Administrado seleccionado correctamente.', estado: 'Por probar', notas: 'El usuario observo que esta parte llenaba bien.' },
        { paso: 3, control: 'RIS aplicable', observacion: 'Confirmar que el combo aparece, carga opciones y selecciona una opcion valida.', esperado: 'RIS seleccionado sin click extra innecesario.', estado: 'Por probar', notas: 'El usuario observo que estaba bien.' },
        { paso: 4, control: 'Tipo infractor', observacion: 'Medir demora visual y si necesita espera inteligente.', esperado: 'Seleccion sin timeout ni seleccion incorrecta.', estado: 'Por probar', notas: 'El usuario observo demora.' },
        { paso: 5, control: 'Multa', observacion: 'Confirmar monto, unidad y campos obligatorios.', esperado: 'Sancion multa agregada a la lista.', estado: 'Por probar', notas: '' },
        { paso: 6, control: 'Suspension', observacion: 'Confirmar unidad de tiempo y campos obligatorios.', esperado: 'Sancion suspension agregada a la lista.', estado: 'Por probar', notas: '' },
        { paso: 7, control: 'Multa + suspension', observacion: 'Confirmar que ambas sanciones quedan asociadas antes de guardar.', esperado: 'Ambos detalles visibles o trazables.', estado: 'Por probar', notas: '' },
        { paso: 8, control: 'Guardar', observacion: 'Confirmar que el guardado devuelve ID real y no solo toast verde.', esperado: 'ID real capturado; si no hay ID real, la prueba falla.', estado: 'Por probar', notas: '' },
        { paso: 9, control: 'Guardar sin sanciones', observacion: 'Intentar guardar sin agregar sancion.', esperado: 'Debe bloquearse. Si permite guardar, defecto funcional critico.', estado: 'Por probar', notas: 'Nueva validacion solicitada por usuario.' },
        { paso: 10, control: 'Busqueda posterior', observacion: 'Buscar expediente por ID real o numero.', esperado: 'Debe encontrarse en la grilla principal o consulta.', estado: 'Por probar', notas: '' },
        { paso: 11, control: 'Reportes', observacion: 'Confirmar que HTML funcional, Excel, Playwright y Allure no quedan vacios.', esperado: 'Reportes generados en carpeta RUN y abribles con comando.', estado: 'Por probar', notas: '' }
    ]);
    styleHeader(manualSheet, 'FF6D28D9');
    wrapRows(manualSheet);

    const kpiSheet = workbook.addWorksheet('KPIs');
    kpiSheet.columns = [
        { header: 'Categoria', key: 'cat', width: 22 },
        { header: 'Metrica / KPI', key: 'kpi', width: 34 },
        { header: 'Por que importa', key: 'por_que', width: 56 },
        { header: 'Criterio Go/No-Go', key: 'criterio', width: 48 },
        { header: 'Fuente', key: 'fuente', width: 36 }
    ];
    kpiSheet.addRows([
        { cat: 'Confiabilidad', kpi: 'Tasa de exito funcional', por_que: 'Asegura que el flujo critico se completa sin errores reales.', criterio: '>= 95% en flujos activos; 100% en smoke antes de escalar.', fuente: 'Playwright results.json y reporte HTML.' },
        { cat: 'Trazabilidad', kpi: 'Porcentaje con ID real backend', por_que: 'Evita falsos positivos por toast o IDs inventados.', criterio: '100% de registros creados deben tener ID real.', fuente: 'Anotaciones Playwright y reporte funcional.' },
        { cat: 'Integridad', kpi: 'Persistencia confirmada', por_que: 'Un guardado exitoso debe existir despues en backend/UI.', criterio: '100% de registros creados encontrados por ID o expediente.', fuente: 'Consulta post-guardado y busqueda post-condicion.' },
        { cat: 'Reglas negocio', kpi: 'Defectos de validacion detectados', por_que: 'La suite debe evidenciar errores como guardar sin sanciones.', criterio: 'Todo defecto critico queda documentado con evidencia.', fuente: 'Validaciones negativas, screenshot, trace y reporte.' },
        { cat: 'Estabilidad', kpi: 'Flakiness', por_que: 'Fallos aleatorios ocultan defectos reales.', criterio: '< 5% y sin retries permanentes en smoke.', fuente: 'Retries y duracion de Playwright.' },
        { cat: 'Cobertura', kpi: 'Cobertura smoke de sanciones', por_que: 'Smoke de un registro debe cubrir las 8 combinaciones completas.', criterio: '8/8 combinaciones reportadas.', fuente: 'testInfo.annotations y reporte funcional.' },
        { cat: 'Reportabilidad', kpi: 'Reportes completos', por_que: 'La evidencia debe ser util para auditoria y seguimiento.', criterio: 'HTML, Excel, Word, Playwright y Allure disponibles cuando aplique.', fuente: 'Carpeta RUN versionada.' }
    ]);
    styleHeader(kpiSheet, 'FF166534');
    wrapRows(kpiSheet);

    const roadmapSheet = workbook.addWorksheet('Roadmap');
    roadmapSheet.columns = [
        { header: 'Iniciativa', key: 'iniciativa', width: 34 },
        { header: 'Descripcion', key: 'descripcion', width: 62 },
        { header: 'Carpeta permitida', key: 'carpeta', width: 28 },
        { header: 'Estado', key: 'estado', width: 20 },
        { header: 'Decision acordada', key: 'decision', width: 56 }
    ];
    roadmapSheet.addRows([
        { iniciativa: 'Reporte HTML estilo K6', descripcion: 'Tomar como referencia visual el reporte de REGINSA_K6_STRESS: logo, secciones, metricas, detalle y recomendaciones.', carpeta: 'REGINSA_PF', estado: 'En mejora', decision: 'K6 se consulta solamente; no se modifica.' },
        { iniciativa: 'Custom reporter compacto', descripcion: 'Crear JSON compacto propio para funcionales si el results.json de Playwright queda insuficiente.', carpeta: 'REGINSA_PF', estado: 'Propuesto', decision: 'Evaluar despues de estabilizar smoke y validaciones negativas.' },
        { iniciativa: 'Agente IA local con Ollama', descripcion: 'Analizar resultados Playwright y sugerir causa raiz de fallos, sin servicios cloud.', carpeta: 'REGINSA_PF', estado: 'Propuesto', decision: 'No crear aun en REGINSA_APITEST ni root; documentarlo como siguiente fase.' },
        { iniciativa: 'n8n / orquestacion local', descripcion: 'Disparar ejecuciones y enviar resumen automatico.', carpeta: 'REGINSA_PF o externo futuro', estado: 'Opcional', decision: 'No tocar por ahora; primero pruebas manuales y smoke estable.' },
        { iniciativa: 'BasePage / esperas inteligentes', descripcion: 'Agregar helpers reutilizables para safeClick, selects con opciones, modales, tabs y carga asincrona.', carpeta: 'REGINSA_PF', estado: 'Propuesto', decision: 'Implementar por POM, empezando por sanciones, sin refactor masivo.' },
        { iniciativa: 'Pruebas API', descripcion: 'Podrian complementar persistencia, pero el usuario indico que REGINSA_API no esta validado.', carpeta: 'Solo consultar si aplica', estado: 'No priorizado', decision: 'No basarse en API externa hasta que el usuario la valide.' }
    ]);
    styleHeader(roadmapSheet, 'FF334155');
    wrapRows(roadmapSheet);

    const ipSheet = workbook.addWorksheet('IP_Metricas');
    ipSheet.columns = [
        { header: 'IP / Host', key: 'ip', width: 22 },
        { header: 'Fase', key: 'fase', width: 24 },
        { header: 'Workers', key: 'workers', width: 14 },
        { header: 'Intentos', key: 'intentos', width: 14 },
        { header: 'Registros con ID real', key: 'exitos', width: 22 },
        { header: 'Tasa de trazabilidad (%)', key: 'tasa', width: 24 },
        { header: 'Observacion', key: 'observacion', width: 50 }
    ];
    ipSheet.addRows([
        { ip: 'Local', fase: 'Smoke', workers: 1, intentos: 1, exitos: 'Por completar', tasa: 'Por calcular', observacion: 'Completar despues de la prueba manual/headed.' },
        { ip: 'Local', fase: 'Phase 1 minimo', workers: 9, intentos: 9, exitos: 'Por completar', tasa: 'Por calcular', observacion: 'Completar despues de estabilizar smoke.' },
        { ip: 'Local', fase: 'Phase 2', workers: 9, intentos: 36, exitos: 'Por completar', tasa: 'Por calcular', observacion: 'Completar cuando Phase 1 este estable.' }
    ]);
    styleHeader(ipSheet, 'FF827717');
    wrapRows(ipSheet);

    const leyenda = workbook.addWorksheet('Leyenda');
    leyenda.columns = [
        { header: 'Concepto', key: 'concepto', width: 28 },
        { header: 'Descripcion', key: 'descripcion', width: 60 },
        { header: 'Aplicacion en REGINSA_PF', key: 'aplicacion', width: 68 }
    ];
    leyenda.addRows([
        { concepto: 'Smoke', descripcion: 'Prueba corta y critica para decidir si se puede seguir probando.', aplicacion: 'Caso 02: 1 expediente con las 8 combinaciones de sanciones.' },
        { concepto: 'Headed', descripcion: 'Ejecucion con navegador visible.', aplicacion: 'Usada para inspeccion manual del flujo y tiempos de controles.' },
        { concepto: 'Phase 1 minimo', descripcion: 'Concurrencia inicial con carga moderada.', aplicacion: '9 expedientes, una sancion por expediente.' },
        { concepto: 'Phase 1 multi', descripcion: 'Concurrencia con cobertura amplia por expediente.', aplicacion: '9 expedientes con las 8 combinaciones por expediente.' },
        { concepto: 'Phase 2', descripcion: 'Escala controlada por repeticiones.', aplicacion: '9 workers x 4 repeticiones = 36 registros esperados.' },
        { concepto: 'ID real', descripcion: 'Identificador devuelto por backend o correlativo real persistido.', aplicacion: 'El reporte no debe usar IDs falsos derivados del numero de expediente.' },
        { concepto: 'Toast', descripcion: 'Mensaje visual de exito o error.', aplicacion: 'No es suficiente para aprobar el guardado si no hay ID real y persistencia.' },
        { concepto: 'K6 como referencia', descripcion: 'Carpeta de pruebas de stress con reporte visual validado.', aplicacion: 'Se consulta para estilo, pero no se modifica.' }
    ]);
    styleHeader(leyenda, 'FFE11D48');
    wrapRows(leyenda);

    const outputRoot = path.resolve(__dirname, '..', 'PLAN_DE_PRUEBAS_FUNCIONALES_REGINSA.xlsx');
    const outputTools = path.resolve(__dirname, 'PLAN_DE_PRUEBAS_FUNCIONALES_REGINSA.xlsx');

    await workbook.xlsx.writeFile(outputRoot);
    if (outputRoot !== outputTools) {
        fs.copyFileSync(outputRoot, outputTools);
    }

    console.log('>> EXCEL GENERADO CON EXITO EN:', outputRoot);
    console.log('>> COPIA ACTUALIZADA EN:', outputTools);
}

generatePlan().catch((error) => {
    console.error(error);
    process.exit(1);
});
