# Mapa Maestro del Proyecto REGINSA

Fecha: 2026-04-02

## Estado actual del trabajo

- Fase actual: inventario y mapeo completo con verificacion de limpieza temporal realizada.
- Postman actualizado y alineado con Swagger QA en casos 03 y 04 para listados paginados.
- Limpieza verificada: no se detectaron carpetas .scannerwork ni archivos .tmp* en el barrido actual.
- Workflows Smoke por caso actualizados: dejaron de ser placeholder y ejecutan k6 real en self-hosted.
- Lo siguiente: consolidar depuracion de duplicados controlados con respaldo.

## Cobertura del inventario

- Raiz de automatizacion (incluye subrepos dentro de la raiz): 2380 archivos detectados.
- Frontend principal SI091_REGINSA_FRONTEND-1: 614 archivos detectados.
- Backend SI091_REGINSA_BACKEND: 160 archivos detectados.
- En linea SI091_REGINSA_ENLINEA: 53 archivos detectados.
- Config SI091_REGINSA_CONFIG: 10 archivos detectados.

## 1) Automatizacion raiz REGINSA

Carpetas principales:

- API_TEST
- core
- docs
- helpers
- MANUAL
- pipelines
- reportes
- scripts
- tests
- SI091_REGINSA_FRONTEND-1
- SI091_REGINSA_BACKEND
- SI091_REGINSA_ENLINEA
- SI091_REGINSA_CONFIG

Archivos operativos clave:

- package.json
- playwright.config.ts
- sonar-project.properties
- zap.yaml
- azure-pipelines.yml
- README.md
- README_OPERACION_PACKS.md

Entradas de pruebas y ejecucion:

- tests/casos-prueba/00-login.spec.ts
- tests/casos-prueba/01-agregar-administrado.spec.ts
- tests/casos-prueba/02-registrar-sancion.spec.ts
- tests/casos-prueba/03-reconsiderar-sin-sanciones.spec.ts
- tests/casos-prueba/04-reconsiderar-con-sanciones.spec.ts
- tests/performance/k6/k6_caso_00_login.js
- tests/performance/k6/k6_caso_01_agregar_administrado.js
- tests/performance/k6/k6_caso_02_registrar_sancion.js
- tests/performance/k6/k6_caso_03_reconsiderar_sin_sanciones.js
- tests/performance/k6/k6_caso_04_reconsiderar_con_sanciones.js
- tests/performance/k6-grafana/k6_caso_00_login.js
- tests/performance/k6-grafana/k6_caso_01_agregar_administrado.js
- tests/performance/k6-grafana/k6_caso_02_registrar_sancion.js
- tests/performance/k6-grafana/k6_caso_03_reconsiderar_sin_sanciones.js
- tests/performance/k6-grafana/k6_caso_04_reconsiderar_con_sanciones.js

Scripts clave:

- scripts/run-caso00-login.ps1
- scripts/run-caso01-local.ps1
- scripts/run-caso02-local.ps1
- scripts/run-caso03-local.ps1
- scripts/run-caso04-local.ps1
- scripts/security/escanear-repos-sonar.ps1
- scripts/security/generar-reportes-sonar-fechados.ps1
- scripts/security/generar-reportes-owasp-fechados.ps1
- scripts/postman/run-newman-completo.ps1

Actualizacion reciente Postman (2026-04-02):

- API_TEST/postman/reginsa-caso03-api-test.collection.json: migrado de `CabeceraInfraccionSancion/Listar` y `DetalleInfraccionSancion/Listar` a `ListarPaginado`.
- API_TEST/postman/reginsa-caso04-api-test.collection.json: migrado de `DetalleInfraccionSancion/Listar` a `ListarPaginado`.
- docs/GUIA_POSTMAN_NEWMAN_CASOS_01_04.md: documentacion ajustada a endpoints de Swagger QA.

Reportes y evidencia:

- reportes/security/sonar
- reportes/security/owasp
- reportes/newman
- reportes/historico

Workflows GitHub Actions por casos (actualizado 2026-04-02):

- Funcional PRO (self-hosted):
  - .github/workflows/reginsa-funcional-pro-caso01-selfhosted.yml
  - .github/workflows/reginsa-funcional-pro-caso02-selfhosted.yml
  - .github/workflows/reginsa-funcional-pro-caso03-selfhosted.yml
  - .github/workflows/reginsa-funcional-pro-caso04-selfhosted.yml
- Validaciones por caso (self-hosted):
  - .github/workflows/reginsa-validaciones-caso01-selfhosted.yml
  - .github/workflows/reginsa-validaciones-caso02-selfhosted.yml
  - .github/workflows/reginsa-validaciones-caso03-selfhosted.yml
  - .github/workflows/reginsa-validaciones-caso04-selfhosted.yml
  - Ajuste aplicado: ahora respetan inputs workers y repeat_each (ya no estan fijos en 1).
- K6 por caso (self-hosted):
  - .github/workflows/reginsa-k6-caso00-selfhosted.yml
  - .github/workflows/reginsa-k6-caso01-selfhosted.yml
  - .github/workflows/reginsa-k6-caso02-selfhosted.yml
  - .github/workflows/reginsa-k6-caso03-selfhosted.yml
  - .github/workflows/reginsa-k6-caso04-selfhosted.yml
  - Alineado a ejecucion por cantidad y modo de salida local/cloud.
- Smoke por caso (self-hosted):
  - .github/workflows/reginsa-smoke-caso01-cloud-selfhosted.yml
  - .github/workflows/reginsa-smoke-caso02-cloud-selfhosted.yml
  - .github/workflows/reginsa-smoke-caso03-cloud-selfhosted.yml
  - .github/workflows/reginsa-smoke-caso04-cloud-selfhosted.yml
  - Ajuste aplicado: ahora ejecutan scripts k6 reales (sin placeholders) con inputs k6_output y cantidad.
- Postman por caso (self-hosted):
  - .github/workflows/reginsa-postman-caso01-selfhosted.yml
  - .github/workflows/reginsa-postman-caso02-selfhosted.yml
  - .github/workflows/reginsa-postman-caso03-selfhosted.yml
  - .github/workflows/reginsa-postman-caso04-selfhosted.yml
  - Ajuste aplicado: ahora usan comandos npm canonicos api:test:caso01..04 y publican XML+JSON.
- Suites globales (self-hosted):
  - .github/workflows/reginsa-funcional-selfhosted.yml
  - .github/workflows/reginsa-performance-selfhosted.yml
  - .github/workflows/reginsa-postman-selfhosted.yml
  - .github/workflows/reginsa-sonarqube-selfhosted.yml
  - .github/workflows/reginsa-owasp-selfhosted.yml
  - .github/workflows/reginsa-quality-gate-selfhosted.yml
- Orquestador unificado:
  - .github/workflows/reginsa-enterprise.yml

Clasificacion operativa recomendada (canonica vs referencia):

- Canonicos para ejecucion principal:
  - Funcional por caso: reginsa-funcional-pro-caso01..04-selfhosted.yml
  - Validaciones por caso: reginsa-validaciones-caso01..04-selfhosted.yml
  - K6 por caso: reginsa-k6-caso00..04-selfhosted.yml
  - Smoke por caso: reginsa-smoke-caso01..04-cloud-selfhosted.yml
  - Postman por caso: reginsa-postman-caso01..04-selfhosted.yml
  - Seguridad OWASP: reginsa-owasp-selfhosted.yml
  - SonarQube: reginsa-sonarqube-selfhosted.yml
  - Gate consolidado: reginsa-quality-gate-selfhosted.yml

- De referencia o transicion:
  - reginsa-performance.yml (ubuntu smoke k6 generico)
  - reginsa-security.yml (pipeline security generico)
  - reginsa-sonarqube.yml (workflow informativo para guiar a self-hosted)

## 2) Frontend SI091_REGINSA_FRONTEND-1

Estructura principal:

- src/app/components
- src/app/services
- src/app/models
- src/app/layout
- src/assets
- src/environments

Archivos raiz:

- angular.json
- package.json
- tsconfig.json
- tsconfig.app.json
- tsconfig.spec.json
- README.md

Entradas de app:

- src/main.ts
- src/index.html
- src/styles.scss
- src/app/app.module.ts
- src/app/app-routing.module.ts

## 3) Backend SI091_REGINSA_BACKEND

Estructura por capas:

- 01Distribution/Sunedu.BackEnd.Reginsa.Rest
- 02Application
- 03Domain
- 04Infrastructure
- 05Transversal
- 06Test

Archivos raiz:

- Reginsa.sln
- docker-compose.yml
- README.md

API Rest:

- 01Distribution/Sunedu.BackEnd.Reginsa.Rest/Program.cs
- 01Distribution/Sunedu.BackEnd.Reginsa.Rest/appsettings.json
- 01Distribution/Sunedu.BackEnd.Reginsa.Rest/Controllers
- 01Distribution/Sunedu.BackEnd.Reginsa.Rest/Extensions

## 4) En linea SI091_REGINSA_ENLINEA

Estructura principal:

- src/app/services
- src/models
- src/assets/files
- src/assets/images
- src/assets/json
- src/package
- src/environments

Archivos raiz:

- angular.json
- package.json
- tsconfig.json
- README.md

Entradas:

- src/main.ts
- src/index.html
- src/app.routes.ts
- src/app.config.ts

## 5) Config SI091_REGINSA_CONFIG

Estructura principal:

- ReginsaApi
- ReginsaEnLineaWeb
- ReginsaWeb

Archivos clave:

- ReginsaApi/appsettings.json
- ReginsaApi/ipratelimit.json
- ReginsaApi/serilog.json
- ReginsaApi/web.config
- ReginsaEnLineaWeb/environment.production.ts
- ReginsaEnLineaWeb/web.config
- ReginsaWeb/environment.production.ts
- ReginsaWeb/web.config

## Hallazgos importantes para depuracion

- Verificacion actual (2026-04-02): no se detectaron carpetas .scannerwork en el workspace.
- Verificacion actual (2026-04-02): no se detectaron archivos temporales con patron .tmp* en el workspace.
- Coexisten dos carpetas frontend en la raiz: SI091_REGINSA_FRONTEND y SI091_REGINSA_FRONTEND-1.
- Existe un archivo historico en raiz potencialmente duplicado de k6: k6_caso_02_registrar_sancion_completo.js.

## Siguiente paso sugerido para limpieza segura

1. Congelar hito de respaldo.
2. Validar referencias activas a SI091_REGINSA_FRONTEND vs SI091_REGINSA_FRONTEND-1.
3. Confirmar si k6_caso_02_registrar_sancion_completo.js de raiz se conserva o archiva.
4. Ejecutar limpieza final de duplicados solo despues de respaldo.

Estado de cierre de este mapa: actualizado al 2026-04-02 y listo para validacion en GitHub Actions.
