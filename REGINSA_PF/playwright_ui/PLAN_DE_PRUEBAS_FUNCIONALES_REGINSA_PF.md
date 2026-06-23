# Plan de pruebas funcionales automatizadas - REGINSA_PF

## 1. Objetivo

Mantener una ejecucion repetible, trazable y auditable para los casos funcionales criticos de REGINSA mediante Playwright UI, con reportes funcionales y tecnicos por corrida.

La carpeta operativa vigente es:

```text
D:\SUNEDU\AUTOMATIZACION\REGINSA\REGINSA_PF\playwright_ui
```

## 2. Alcance funcional

| Caso | Flujo | Prioridad | Smoke | Phase1 | Phase2 | Negativas |
|---|---|---:|---|---|---|---|
| CP-REG-01 | Agregar administrado | Alta | `npm run pf:smoke:caso01` | `npm run pf:phase1:caso01` | `npm run pf:phase2:caso01` | `npm run pf:negative:caso01` |
| CP-REG-02 | Registrar sancion | Critica | `npm run pf:smoke:caso02` | `npm run pf:phase1:caso02` | `npm run pf:phase2:caso02` | `npm run pf:negative:caso02:sin-sanciones` |
| CP-REG-04 | Reconsiderar con sanciones | Alta | `npm run pf:smoke:caso04` | `npm run pf:phase1:caso04` | `npm run pf:phase2:caso04` | `npm run pf:negative:caso04` |

## 3. Modelo de ejecucion vigente

| Tipo / Fase | Objetivo | Workers / Auth slots | Registros esperados | Apertura de reportes |
|---|---|---:|---:|---|
| Listado | Confirmar que el spec carga sin ejecutar dependencias. | 1 | 0 | No genera ni abre reportes |
| Smoke | Validar un flujo critico controlado. | 1 | 1 registro funcional | Automatica |
| Negative | Validar controles funcionales obligatorios. | 1 | 0 o fallo controlado | Automatica |
| Phase1 | Validar aislamiento multiusuario con costo moderado. | Usuarios declarados en `.env` | 1 por slot | Automatica |
| Phase1 multi | Cobertura amplia con mas combinaciones por registro. | Usuarios declarados en `.env` | 1 por slot con mayor cobertura | Automatica |
| Phase2 | Volumen funcional controlado. | Usuarios declarados en `.env` | 4 por slot | Automatica |

Reglas vigentes:

- `smoke` y `negative` usan 1 worker y 1 auth slot.
- `phase1`, `phase2` y `audit` calculan workers segun `REGINSA_USER_1..N`.
- `REGINSA_AUTH_SLOTS` limita la autenticacion al numero real de workers.
- Los reportes se abren automaticamente salvo que se use `-NoOpenReports`.
- Ollama esta pausado por defecto; solo se activa con `REGINSA_USE_OLLAMA=1` u `OLLAMA_ENABLED=1`.

## 4. Carpeta vigente de reportes

La unica carpeta vigente para nuevas ejecuciones es:

```text
REGINSA_PF\playwright_ui\reportes\<RUN_ID>
```

Estructura por corrida:

```text
reportes\<RUN_ID>\
  RUN_SUMMARY.txt
  caso00_*.html
  REGINSA_PLAYWRIGHT_UI_AUDITORIA_*.xlsx
  REGINSA_PLAYWRIGHT_INFORME_WORD_*.doc
  _technical\
    playwright-report\
      index.html
      results.json
      pf-report.json
    allure-results\
      *.json
      environment.properties
      categories.json
    allure-report\
      index.html
      data\
    test-results\
```

Carpetas legacy eliminadas o fuera de ejecucion:

```text
REGINSA_PF\allure-report
REGINSA_PF\playwright-report
REGINSA_PF\playwright-ui-report
REGINSA_PF\reportes
```

## 5. Comandos de ejecucion

Ejecutar siempre desde:

```powershell
D:\SUNEDU\AUTOMATIZACION\REGINSA\REGINSA_PF\playwright_ui
```

| Comando | Uso | Resultado esperado |
|---|---|---|
| `npm run pf:list:caso01` | Lista Caso 01 sin ejecutar. | Specs detectados sin reportes. |
| `npm run pf:list:caso02` | Lista Caso 02 sin ejecutar. | 1 test funcional listado. |
| `npm run pf:list:caso04` | Lista Caso 04 sin ejecutar. | Specs detectados sin reportes. |
| `npm run pf:smoke:caso02` | Smoke headless de Caso 02. | 1 usuario, 1 registro, reportes abiertos. |
| `npm run pf:smoke:caso02:headed` | Smoke visible de Caso 02. | Navegador visible y reportes abiertos. |
| `npm run pf:phase1:caso02` | Escalado minimo. | 1 registro por usuario declarado. |
| `npm run pf:phase1:caso02:multi` | Escalado con cobertura amplia. | 1 registro por usuario con mas combinaciones. |
| `npm run pf:phase2:caso02` | Volumen funcional. | 4 registros por usuario declarado. |
| `npm run report:playwright:open` | Abre Playwright HTML de la ultima corrida. | Reporte tecnico visible. |
| `npm run report:allure:open` | Abre Allure por servidor local. | No usar `file://`. |
| `npm run report:all` | Regenera HTML, Excel y Word sobre la ultima corrida. | Reportes funcionales actualizados. |

## 6. Detalle CP-REG-02 - Registrar sancion

El smoke validado para CP-REG-02 debe:

| Paso | Validacion esperada | Evidencia |
|---|---|---|
| Autenticacion | Login correcto con `user-1.json` y fallback `user.json`. | Test `setup` PASS. |
| Datos de cabecera | Administrado, expediente y resolucion unicos. | Anotaciones en reporte. |
| RIS aplicable | Selector carga y valor queda seleccionado. | Paso sin timeout. |
| Tipo infractor | Selector carga aunque demore. | Paso sin timeout. |
| Detalle de sancion | Se agrega al menos una sancion valida. | Toast/grilla. |
| Guardado final | Intercepcion de API de guardado. | `Registro ID` real. |
| Persistencia | Validacion posterior del ID/expediente. | El test falla si no aparece. |

## 7. Criterios Go/No-Go

GO si:

- El caso critico alcanza al menos 95% de exito funcional.
- Los registros esperados se crean y quedan trazados.
- No hay colision de sesion ni interferencia entre workers.
- Todo fallo tiene evidencia tecnica y clasificacion inicial.
- El reporte permite distinguir caso, escenario, worker, usuario, IP y resultado.

NO-GO si:

- Un caso critico no carga en `pf:list`.
- Un slot esperado no ejecuta o no queda trazado.
- Hay perdida, duplicidad indebida o inconsistencia de registros.
- El resultado depende de retries frecuentes.
- No se puede distinguir si el fallo es funcional, automatizacion o entorno.

## 8. Evidencia validada

| Fecha | Caso | Escenario | Resultado | Evidencia |
|---|---|---|---|---|
| 2026-06-16 10:29 | CP-REG-02 | Smoke | PASS | 1 usuario autenticado, registro 3926, reportes en `playwright_ui\reportes\CP-REG-02_PF_smoke_RUN_2026-06-16_10-29-30` |

## 9. Pendientes controlados

- Validar `pf:list:caso01` y `pf:list:caso04`.
- Ejecutar smoke controlado de Caso 01 y Caso 04.
- Validar que `phase1` y `phase2` usen todos los usuarios declarados.
- Consolidar mejoras visuales del HTML funcional.
- Revisar si `run-ui-tests.ps1` de la raiz queda como wrapper oficial o se documenta como compatibilidad.
