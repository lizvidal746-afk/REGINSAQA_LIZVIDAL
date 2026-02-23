# Documentación QA y DevSecOps - REGINSA

## Objetivo

Guiar la implementación y operación del framework de calidad sin modificar código productivo oficial.

Repositorio de trabajo actual:

- [Repositorio Reginsa QA](https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL.git)

Nota operativa:

- Mientras no existan permisos de escritura en Azure DevOps, la simulación de flujo SUNEDU se documenta y ejecuta en este mismo repositorio GitHub con separación de contexto.

## Índice

- Guía maestra paso a paso: [GUIA_MAESTRA_QA_DEVSECOPS_REGINSA.md](GUIA_MAESTRA_QA_DEVSECOPS_REGINSA.md)
- Estrategia QA y cobertura: [ESTRATEGIA_QA_REGINSA.md](ESTRATEGIA_QA_REGINSA.md)
- Guía de subida a 2 repos y ejecución CI: [GUIA_SUBIDA_DOS_REPOS_Y_AZURE.md](GUIA_SUBIDA_DOS_REPOS_Y_AZURE.md)
- Guía rápida de ejecución de pipelines: [GUIA_EJECUCION_PIPELINES_PASO_A_PASO.md](GUIA_EJECUCION_PIPELINES_PASO_A_PASO.md)
- Guía de runner self-hosted en GitHub: [GUIA_RUNNER_SELF_HOSTED_GITHUB.md](GUIA_RUNNER_SELF_HOSTED_GITHUB.md)
- Checklist operativo runner self-hosted: [CHECKLIST_RUNNER_SELF_HOSTED_OPERATIVO.md](CHECKLIST_RUNNER_SELF_HOSTED_OPERATIVO.md)
- Guía funcional + K6 casos 02/03/04: [GUIA_FUNCIONAL_Y_K6_CASOS_02_03_04.md](GUIA_FUNCIONAL_Y_K6_CASOS_02_03_04.md)
- Plan de migración Casos 02/03/04: [PLAN_MIGRACION_CASOS_02_03_04.md](PLAN_MIGRACION_CASOS_02_03_04.md)
- Prompt operativo del agente: [prompts/AGENTE_QA_DEVSECOPS_REGINSA.md](prompts/AGENTE_QA_DEVSECOPS_REGINSA.md)
- Pipeline Azure plantilla: [plantillas/azure-pipelines.qa-devsecops.yml](plantillas/azure-pipelines.qa-devsecops.yml)
- K6 smoke plantilla: [plantillas/k6_smoke_reginsa.js](plantillas/k6_smoke_reginsa.js)
- Checklist PR QA/Seguridad: [plantillas/CHECKLIST_PR_QA_SEGURIDAD.md](plantillas/CHECKLIST_PR_QA_SEGURIDAD.md)
- Variables seguras de ejemplo: [plantillas/.env.example](plantillas/.env.example)
- Usuarios y credenciales: [USUARIOS_CREDENCIALES.md](USUARIOS_CREDENCIALES.md)
- Documentación repositorio personal: [personal/README.md](personal/README.md)
- Documentación entorno SUNEDU: [sunedu/README.md](sunedu/README.md)
- Plan de migración a Azure: [sunedu/PLAN_MIGRACION_AZURE_DEVOPS.md](sunedu/PLAN_MIGRACION_AZURE_DEVOPS.md)

## Framework de pruebas en raíz

- Configuración Playwright: [../playwright.config.ts](../playwright.config.ts)
- Estructura de pruebas: [../tests](../tests)
- Configuración TypeScript: [../tsconfig.json](../tsconfig.json)

## Modelo de trabajo

### Entorno empresa SUNEDU

- Solo lectura, análisis y recomendaciones.
- Propuestas por Pull Request controlado.
- Sin modificación directa de productivo.

### Entorno personal GitHub

- Construcción del framework QA.
- Pruebas experimentales controladas.
- Automatización y documentación.

## Regla de seguridad

No trasladar código sensible de Azure DevOps SUNEDU al repositorio personal.
