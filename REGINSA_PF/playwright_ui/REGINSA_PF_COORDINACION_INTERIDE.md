# REGINSA_PF - Coordinacion Inter-IDE

Este documento ordena el trabajo entre Codex, Trae y Antigravity para mantener el framework Playwright UI de REGINSA sin duplicar esfuerzos ni volver a rutas legacy.

## Fuente de verdad

- Bitacora global: `../../REGINSA_EVOLUTION_STATE.md`
- Carpeta activa: `REGINSA_PF/playwright_ui`
- Runner vigente: `tools/run-pf.ps1`
- Plan de pruebas vigente: `PLAN_DE_PRUEBAS_FUNCIONALES_REGINSA_PF.md`
- Plan de reportes vigente: `PLAN_DE_REPORTES_PLAYWRIGHT.md`
- Resultados base por corrida: `reportes/<run-id>/_technical/playwright-report/results.json`
- Reportes propios por corrida: `reportes/<run-id>/`
- Reportes tecnicos Playwright: `reportes/<run-id>/_technical/playwright-report`
- Resultados tecnicos Allure: `reportes/<run-id>/_technical/allure-results`
- Reportes tecnicos Allure: `reportes/<run-id>/_technical/allure-report`
- Carpetas legacy fuera de ejecucion: `../allure-report`, `../playwright-report`, `../playwright-ui-report`, `../reportes`

## Decision principal

REGINSA_PF usa dos niveles de reporte:

- Dashboard/HTML operativo: lectura rapida por corrida, KPIs, worker, usuario, IP, fallos y recomendaciones.
- Word/Excel formal: cierre de fase, auditoria, comite, riesgos, evidencia y criterio Go/No-Go.

Si no existen variables `REGINSA_IP_1..N`, el reporte debe declarar slots/usuarios con IP de host compartida. No debe afirmar multi-IP real si solo hay una IP del host.

## Reglas operativas vigentes

- `smoke` y `negative` ejecutan con 1 worker y 1 slot de autenticacion.
- `phase1`, `phase2` y `audit` calculan workers segun usuarios declarados en `.env`.
- Los reportes se abren automaticamente salvo que se use `-NoOpenReports`.
- Allure debe abrirse con servidor local mediante `npx allure open`; no usar `file://`.
- Ollama esta pausado por defecto y solo se activa por variables de entorno explicitas.
- Las carpetas legacy de raiz no deben recrearse en ejecuciones normales.

## Reparto de trabajo

### Codex

Responsable de consolidar herramientas de reporting, runner y estructura compartida.

Archivos principales:

- `tools/run-pf.ps1`
- `tools/lib/playwright-reader.js`
- `tools/generar-html.js`
- `tools/generar-excel.js`
- `tools/generar-word.js`
- `package.json`
- `PLAN_DE_PRUEBAS_FUNCIONALES_REGINSA_PF.md`
- `PLAN_DE_REPORTES_PLAYWRIGHT.md`
- `REGINSA_PF_COORDINACION_INTERIDE.md`

Tareas:

- Mantener `results.json` como entrada estable.
- Enriquecer resultados con worker, slot, usuario, IP y modo IP.
- Generar HTML/Excel/Word desde la misma corrida.
- Dejar scripts `report:*` claros y repetibles.
- Mantener Allure con apertura por servidor local.
- Actualizar bitacora global cuando cambie el estado.

### Trae

Responsable de ejecucion funcional y estabilidad de los casos 01, 02 y 04 en modelo nuevo, manteniendo legacy solo como contingencia documentada.

Archivos principales:

- `tests/administrados.e2e.spec.ts`
- `tests/sanciones.e2e.spec.ts`
- `tests/sanciones-phase1.e2e.spec.ts`
- `tests/sanciones-phase2.e2e.spec.ts`
- `tests/reconsideracion.e2e.spec.ts`
- `tests/auth.setup.ts`
- `pages/*.page.ts`
- `fixtures/test-data.json`
- `.env`

Tareas:

- Validar `pf:list:caso01`, `pf:list:caso02` y `pf:list:caso04`.
- Ejecutar smoke controlado antes de crear datos masivos.
- Validar que `pf:phase1:caso02` ejecute segun usuarios declarados.
- Validar que `pf:phase2:caso02` ejecute 4 registros por slot.
- Clasificar errores en funcional, automatizacion o entorno.
- Mantener datos de prueba y credenciales sin colision.
- No modificar generadores de reportes salvo coordinacion previa.

### Antigravity

Responsable de revision visual, dashboard y evidencia ejecutiva.

Archivos principales:

- `tools/generar-html.js`
- `reportes/<run-id>/*.html`
- `PLAN_DE_REPORTES_PLAYWRIGHT.md`

Tareas:

- Revisar usabilidad del dashboard HTML.
- Proponer visualizaciones: KPIs, tabla por slot, fallos, evidencia, Go/No-Go.
- Validar que el reporte no use lenguaje de performance/K6 donde corresponde funcional.
- Revisar que los textos sean aptos para QA Lead, comite y auditoria.
- Confirmar que las graficas no recorten etiquetas ni valores.

## Orden de ejecucion recomendado

1. Ejecutar listado seguro:

```powershell
npm run pf:list:caso01
npm run pf:list:caso02
npm run pf:list:caso04
```

Resultado esperado: listado sin dependencias, sin autenticacion masiva y sin reportes.

2. Ejecutar smoke controlado:

```powershell
npm run pf:smoke:caso02
```

Resultado esperado: 1 usuario, 1 slot, 1 registro funcional y reportes abiertos automaticamente.

3. Revisar reportes de la corrida:

```text
reportes/<run-id>/RUN_SUMMARY.txt
reportes/<run-id>/*.html
reportes/<run-id>/_technical/playwright-report
reportes/<run-id>/_technical/allure-report
```

4. Ejecutar Phase1 cuando smoke este estable:

```powershell
npm run pf:phase1:caso02
```

Resultado esperado: ejecuciones segun usuarios declarados en `.env`, 1 registro por slot.

5. Ejecutar Phase2 solo si Phase1 esta estable:

```powershell
npm run pf:phase2:caso02
```

Resultado esperado: 4 registros por slot declarado.

## Metricas funcionales oficiales

- Tasa de exito funcional critica.
- Tasa de exito por slot/usuario.
- Integridad de registros creados.
- Tasa de defectos criticos del flujo.
- Tasa de flakiness.
- Presion de retries.
- Duracion P95 del flujo critico.
- Estabilidad por corrida.
- Cobertura de condiciones funcionales.
- Completitud de evidencia.
- Tasa de aislamiento por usuario.
- Cumplimiento Go/No-Go.

## Criterio Go/No-Go inicial

Go:

- El caso critico completa registros esperados por fase.
- No hay defectos funcionales criticos abiertos.
- No hay interferencia entre slots/usuarios.
- Evidencia disponible para fallos.
- Flakiness controlada y no oculta defectos.
- Reportes funcionales y tecnicos quedan bajo `playwright_ui/reportes/<run-id>`.

No-Go:

- Un slot no completa el flujo esperado.
- Hay perdida, duplicidad indebida o inconsistencia de registros.
- Hay colision de sesion o datos entre usuarios.
- El resultado depende de retries frecuentes.
- No se puede clasificar si el fallo es funcional, automatizacion o entorno.
- Reaparecen reportes generados en carpetas legacy de raiz.

## Estado validado

- [x] Smoke CP-REG-02 ejecutado con 1 usuario y 1 slot.
- [x] `results.json` queda en `reportes/<run-id>/_technical/playwright-report/results.json`.
- [x] HTML/Excel/Word quedan en `reportes/<run-id>/`.
- [x] Allure queda en `reportes/<run-id>/_technical/allure-report`.
- [x] Reportes se abren automaticamente salvo `-NoOpenReports`.
- [x] Allure se debe abrir por servidor local.
- [x] Carpetas legacy de raiz fueron limpiadas.
- [x] `PLAN_DE_PRUEBAS_FUNCIONALES_REGINSA_PF.md` actualizado.
- [x] `PLAN_DE_REPORTES_PLAYWRIGHT.md` actualizado.

## Pendientes controlados

- [ ] Confirmar que los specs de `tests/utilidades/*.spec.ts` no entran en `ui-regression`.
- [ ] Validar `pf:list:caso01` y `pf:list:caso04`.
- [ ] Ejecutar smoke controlado de Caso 01 y Caso 04.
- [ ] Ejecutar `phase1` y `phase2` en entorno con permisos normales de Playwright.
- [ ] Definir si `run-ui-tests.ps1` queda como wrapper oficial para usuarios no tecnicos.
