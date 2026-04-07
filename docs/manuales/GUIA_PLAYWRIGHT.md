# Guia Playwright REGINSA

Automatizacion funcional E2E de los 5 flujos de negocio REGINSA con Playwright.

---

## 1. Casos de prueba

| Caso | Nombre | Spec | Pool |
| ------ | -------- | ------ | ------ |
| 00 | Login | `00-login.spec.ts` | - |
| 01 | Agregar Administrado | `01-agregar-administrado.spec.ts` | Pool compartido funcional/k6 |
| 02 | Registrar Sancion | `02-registrar-sancion.spec.ts` | - |
| 03 | Reconsiderar sin Sanciones | `03-reconsiderar-sin-sanciones.spec.ts` | Secuencial paginado |
| 04 | Reconsiderar con Sanciones | `04-reconsiderar-con-sanciones.spec.ts` | Pool dinamico |

Ubicacion: `tests/casos-prueba/`

Validaciones (campos de formulario): `tests/casos-prueba/*-validaciones.plantilla.spec.ts`

---

## 2. Comandos de ejecucion

### Por caso (estandar)

```bash
npm run test:00   # Login
npm run test:01   # Agregar Administrado
npm run test:02   # Registrar Sancion
npm run test:03   # Reconsiderar sin Sanciones
npm run test:04   # Reconsiderar con Sanciones
```

### Modo rapido (scripts PowerShell optimizados)

```bash
npm run test:01:fast
npm run test:02:fast
npm run test:03:fast
npm run test:04:fast
```

### Modo escala (paralelo + repeticiones)

```bash
npm run test:01:scale
npm run test:02:scale
npm run test:03:scale
npm run test:04:scale
```

### Modo demo (headed + lento para presentaciones)

```bash
npm run test:01:demo
npm run test:02:demo
npm run test:03:demo
npm run test:04:demo
```

### Validaciones de campos

```bash
npm run test:01:validaciones
npm run test:02:validaciones
npm run test:03:validaciones
npm run test:04:validaciones
```

### Suite completa

```bash
npm run test:functional:all     # Los 4 casos en secuencia
npm run test:regression         # Regresion completa
npm run test:smoke              # Solo caso 01 + 02
```

### Parametros avanzados directos

```bash
npx playwright test --project=chromium --workers=4 --repeat-each=3 --grep "01-AGREGAR"
```

---

## 3. Headed vs Headless

Headless (rapido, CI):

```bash
REGINSA_HEADLESS=1 npm run test:01
```

Headed (visible, debug):

```bash
npm run test:e2e:headed
# o
REGINSA_HEADLESS=0 npm run test:01
```

---

## 4. Pool del Caso 01

El caso 01 usa un pool de datos compartido entre Playwright y k6.

### Prewarm (precalentar pool)

```bash
npm run pool:prewarm
```

### Ver estado del pool

```bash
npm run pool:status
```

### Resetear pool a datos base

```bash
npm run pool:reset-base
```

### Ciclo completo reinicio + prewarm

```bash
npm run base:reiniciar-completo
```

Archivos de estado:

- `reportes/administrados-pool.json` — Pool actual
- `reportes/k6-caso01-dataset.json` — Dataset k6 generado desde pool
- `reportes/funcional-caso01-secuencia.json` — Estado de secuencia funcional

---

## 5. Pool dinamico Caso 04

El caso 04 usa un pool de candidatos dinamico que:

1. Consulta la API `ListarPaginado` (misma que la UI).
2. Filtra registros con 3 campos vacios (candidatos a reconsiderar).
3. Reserva un registro por worker para evitar colisiones.
4. Trackea paginas exhaustas para no re-procesarlas.

Archivos de estado:

- `reportes/dynamic-candidate-pool.json`
- `reportes/reconsideracion-sequential.json`
- `reportes/reconsideracion-exhausted-pages.json`

---

## 6. Crear un nuevo caso de prueba

1. Crear spec: `tests/casos-prueba/05-nuevo-flujo.spec.ts`
2. Importar utilidades de `tests/utilidades/` y helpers de `helpers/`
3. Mantener etiqueta estandar en titulo: `test('05-NUEVO FLUJO — descripcion', ...)`
4. Agregar script npm en `package.json`:

```json
"test:05": "playwright test --project=chromium --workers=1 --grep \"05-NUEVO FLUJO\""
```

1. Crear runner PowerShell `scripts/run-test05-fast.ps1` si aplica.
2. Documentar en esta guia.

---

## 7. Depuracion de fallos

### Inspector Playwright

```bash
npx playwright test --debug
```

### Trace Viewer

```bash
npx playwright show-trace test-results/xxx/trace.zip
```

### Screenshots automaticos (en errores)

Ubicacion: `errors/` y `test-results/`

Configurar en `.env`:

```text
REGINSA_TRACE=on-first-retry
REGINSA_SCREENSHOT=only-on-failure
REGINSA_VIDEO=retain-on-failure
```

---

## 8. Reportes

### Playwright HTML Reporter

```bash
npm run report:html
```

Abre `playwright-report/index.html` con resultados visuales.

### Allure Reporter

```bash
npm run report:allure:generate
npm run report:allure:open
```

Genera reportes detallados con:

- Timeline de ejecucion
- Historial de reintentos
- Adjuntos (screenshots, videos, traces)
- Categorias de fallos

### JSON/JUnit (CI)

Generados automaticamente en `test-results/`:

- `results.json` — Resultados completos
- `junit.xml` — Para integracion con CI/CD

---

## 9. Configuracion clave

Archivo: `playwright.config.ts`

| Parametro | Default | Variable de entorno |
| ----------- | --------- | ------------------- |
| workers | 1 (local) / 2 (CI) | `REGINSA_WORKERS` |
| retries | 0 (local) / 2 (CI) | `REGINSA_PW_RETRIES` |
| timeout | 120s | - |
| headless | true | `REGINSA_HEADLESS` |
| baseURL | localhost:3000 | `REGINSA_URL` / `BASE_URL` |
| trace | on-first-retry | `REGINSA_TRACE` |
| screenshot | only-on-failure | `REGINSA_SCREENSHOT` |
| video | retain-on-failure | `REGINSA_VIDEO` |
| reporter | full (allure+html+junit+json) | `REGINSA_REPORTER_MODE` |

---

## 10. Buenas practicas

- No usar `page.waitForTimeout()` con tiempos fijos largos — usar esperas por estado.
- Mantener selectores CSS/aria estables.
- Preservar secuencialidad en flujos con datos compartidos (caso 01 pool, caso 04 sequential).
- Usar `--repeat-each` para ampliar cobertura, no duplicar specs.
- Generar evidencia solo cuando se necesita (modo `minimal` para velocidad en CI).
