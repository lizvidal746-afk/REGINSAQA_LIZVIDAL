# Análisis Completo — REGINSA_PF (Playwright Funcional)

## 📊 Resumen Ejecutivo

**Proyecto:** Suite de Pruebas Funcionales UI automatizadas para el sistema REGINSA (Registro de Infracciones y Sanciones - SUNEDU)
**Framework:** Playwright + TypeScript
**Responsable QA:** Liz Vidal
**Estado:** En ejecución activa — Fase 1 (Estabilización)
**Casos cubiertos:** CP-REG-01, CP-REG-02, CP-REG-04

---

## 1. 📁 Estructura del Proyecto

```
REGINSA_PF/
├── run-ui-tests.ps1                        # Entry point wrapper (modo simplificado)
└── playwright_ui/                          # Directorio de trabajo principal
    ├── .env                                # Credenciales, IPs, timeouts
    ├── .env.example                        # Template de variables de entorno
    ├── package.json                        # Dependencias + +40 scripts npm
    ├── playwright.config.ts                # Config Playwright (4 proyectos)
    ├── tsconfig.json                       # TypeScript config
    ├── POManager.ts                        # Facade de Page Objects
    │
    ├── pages/                              # 🎯 PAGE OBJECTS (8 archivos)
    │   ├── base.page.ts                    # Base con utilidades: safeClick, fillFirstEditable, selectPrimeOption, esperarCapaCarga
    │   ├── login.page.ts                   # Login SSO (Punku)
    │   ├── home.page.ts                    # Home/Dashboard
    │   ├── sanciones.page.ts               # Lista de sanciones + abrir formulario
    │   ├── formulario-sancion.page.ts      # ⭐ Formulario complejo con intercepción API + recuperación activa
    │   ├── modal-agregar-sancion.page.ts   # Modal de detalle de sanción
    │   ├── administrados.page.ts           # ⭐ CRUD administrados con RUC pool + bloqueo distribuido
    │   └── reconsideracion.page.ts         # ⭐ Flujo de reconsideración con paginación y reserva de candidatos
    │
    ├── tests/                              # 🧪 SPECS (11 archivos)
    │   ├── fixtures/
    │   │   └── test-base.ts                # Fixture personalizada con storageState dinámico por worker
    │   ├── auth.setup.ts                   # Autenticación multi-usuario (1 storageState por slot)
    │   ├── sanciones.e2e.spec.ts           # CP-REG-02: Flujo completo (8 combinaciones de sanción)
    │   ├── sanciones-phase1.e2e.spec.ts    # CP-REG-02 Phase1: 1 sanción aleatoria o multi
    │   ├── sanciones-phase2.e2e.spec.ts    # CP-REG-02 Phase2: 1 sanción aleatoria, escalado x4
    │   ├── sanciones-negative.e2e.spec.ts  # CP-REG-02 Negativo: guardar sin sanciones
    │   ├── administrados.e2e.spec.ts       # CP-REG-01: Agregar administrado
    │   ├── administrados-negative.e2e.spec.ts # CP-REG-01 Negativo: campos obligatorios + duplicados
    │   ├── reconsideracion.e2e.spec.ts     # CP-REG-04: Reconsiderar con sanciones
    │   ├── reconsideracion-negative.e2e.spec.ts # CP-REG-04 Negativo
    │   ├── home.smoke.spec.ts              # Smoke test de Home
    │   ├── 02-auditoria-ui.spec.ts         # Auditoría UI
    │   ├── utilidades/                     # (9 archivos) Acciones compartidas, debug, captura de payload
    │   └── legacy_tests/                   # (9 archivos) Tests legacy de respaldo
    │
    ├── helpers/                            # 🔧 HELPERS (8 archivos)
    │   ├── pf-run-label.ts                 # Etiquetas PF-XX WXXRXX
    │   ├── test-context.ts                 # Contexto de ejecución (workerIndex, repeatIndex)
    │   ├── test-run-metadata.ts            # ⭐ Contexto enriquecido + carga de release-changelog + Allure
    │   ├── sancion-identifiers.ts          # Identificadores únicos de sanción
    │   ├── data-generator.ts               # Generación de datos de prueba con RUC válido
    │   ├── state-distributor.ts            # Distribución de estados
    │   ├── resource-lock.ts                # ⭐ Bloqueo distribuido vía filesystem (mkdir atómico)
    │   └── strict-sequential.ts            # ⭐ Máquina de estado secuencial estricta (lock con archivos)
    │
    ├── tools/                              # 🛠 TOOLS (10 archivos)
    │   ├── run-pf.ps1                      # ⭐ ORQUESTADOR PRINCIPAL (PowerShell)
    │   ├── lib/
    │   │   └── playwright-reader.js        # ⭐ Lector canónico de results.json (dual-view)
    │   ├── validate-dual-view.js           # Valida dual-view + genera pf-report.json
    │   ├── generar-html.js                 # Reporte HTML profesional con Chart.js
    │   ├── generar-excel.js                # Reporte Excel con KPIs
    │   ├── generar-word.js                 # Reporte Word formal
    │   ├── generar-plan-excel.js           # Actualizador de plan Excel
    │   ├── update-plan.js                  # Utilidad de actualización
    │   ├── post-procesar-allure.js         # Post-procesamiento Allure
    │   ├── ai-prompts.js                   # Templates de prompts para IA
    │   └── diagnosticar-cp01.js            # Diagnóstico CP-REG-01
    │
    ├── fixtures/
    │   ├── test-data.json                  # 8 combinaciones de sanción
    │   └── dummy.pdf                       # PDF de prueba
    │
    ├── .auth/                              # 11 archivos de storageState (user.json + user-1..10.json)
    ├── reportes/                           # Output de ejecuciones (carpeta por corrida)
    ├── allure-results/                     # Resultados Allure
    ├── errors/                             # Screenshots de errores
    └── screenshots/                        # Screenshots de pasos
```

---

## 2. 🧠 Arquitectura y Patrones

### 2.1 Modelo de Ejecución por Fases

```
Smoke  → 1 worker, 1 registro → Validar flujo crítico
Phase1 → N workers, 1 registro c/u → Validar aislamiento multi-usuario
Phase2 → N workers, 4 registros c/u → Volumen funcional controlado
```

### 2.2 Distribución de Workers (auto-escalado)

- **Smoke/Negative**: 1 worker, 1 slot de autenticación
- **Phase1/Phase2**: Workers = usuarios declarados en `.env` (REGINSA_USER_1..N)
- **Mapeo funcional**: workerIndex lógico = physicalRepeatIndex % workers

### 2.3 Page Object Manager (Facade)

`POManager.ts` expone 8 Page Objects como getters, inyectando `Page` única.

### 2.4 Dual-View Architecture (Reportes)

El `playwright-reader.js` procesa el `results.json` en 2 vistas:
- **testListFinal**: 1 entrada por test (estado consolidado final)
- **attemptList**: 1 entrada por intento (incluye retries)

Esto permite distinguir: passed limpio vs flaky (pasó con retry) y persistencia indeterminada.

### 2.5 Recurso Compartido y Lock Distribuido

**resource-lock.ts**: Reserva de recursos entre workers vía `mkdir` atómico del sistema de archivos. Usado para:
- Reservar candidatos de reconsideración (evitar que 2 workers usen el mismo registro)
- Reservar administrados en dropdown selector

**strict-sequential.ts**: Máquina de estado secuencial con lock de archivos para:
- Asignación ordinal de reconsideraciones
- Conteo global por corrida
- Marcado de páginas agotadas

**administrados.page.ts**: Bloqueo funcional `REGINSA_ADMIN_SERIALIZE_SAVE` para serializar `Entidad/Crear` en modo estable.

### 2.6 Autenticación Multi-Usuario

`auth.setup.ts` → genera `user-1.json`..`user-N.json` en `.auth/`
`test-base.ts` → fixture `storageState` que selecciona el archivo según slot funcional

### 2.7 Recuperación Activa (Active Recovery)

`formulario-sancion.page.ts` implementa un patrón crítico:
1. Intercepta respuesta POST a `CabeceraInfraccionSancion/Crear` o `CrearConDetalles`
2. Si el ID no se captura (timeout), hace una consulta POST a `ListarPaginado` para recuperar el ID
3. Esto asegura que el test no falle falsamente por latencia de red

---

## 3. 🔌 API Endpoints Clave

| Endpoint | Método | Uso | Status |
|---|---|---|---|
| `/api/Entidad/Crear` | POST | Crear administrado | ✅ Funcional |
| `/api/Entidad/ListarPaginado` | POST | Validar persistencia administrado | ✅ |
| `/api/CabeceraInfraccionSancion/CrearConDetalles` | POST | Crear sanción con detalles | ✅ (nuevo unificado) |
| `/api/CabeceraInfraccionSancion/ListarPaginado` | POST | Validar persistencia sanción | ✅ |
| `/api/CabeceraInfraccionSancion/Crear` | POST | Endpoint anterior (deprecado) | ⚠️ Legacy |
| `/api/MedidaCorrectiva/Crear` | POST | Endpoint anterior (deprecado) | ⚠️ Legacy |
| `/api/DetalleInfraccionSancion/Crear` | POST | Endpoint anterior (deprecado) | ⚠️ Legacy |

---

## 4. 📊 Pipeline de Reportes

```
results.json (Playwright nativo)
    → validate-dual-view.js
        → pf-report.json (fuente canónica funcional)
            → generar-html.js → HTML profesional con Chart.js
            → generar-excel.js → Excel con KPIs
            → generar-word.js → Word formal
        → Allure (allure-playwright)
```

---

## 5. 🎯 Cobertura Funcional

| Caso | Smoke | Phase1 | Phase2 | Negativo | Prioridad |
|---|---|---|---|---|---|
| CP-REG-01 Agregar Administrado | ✅ | ✅ | ✅ | ✅ | Alta |
| CP-REG-02 Registrar Sanción | ✅ | ✅ | ✅ | ✅ | Crítica |
| CP-REG-04 Reconsiderar | ✅ | ✅ | ✅ | ✅ | Alta |

---

## 6. 📐 Convenciones y Estándares

1. **Nomenclatura archivos**: `{nombre}.page.ts`, `{nombre}.e2e.spec.ts`, `{nombre}.{funcion}.ts`
2. **Nomenclatura tests**: Debería + acción + criterio (formato BDD)
3. **Anotaciones**: Todo test registra en `testInfo.annotations`: tipo worker, slot, IP, usuario, registroId, endpoint
4. **Allure**: Parámetros QA Audit, QA API, QA Defecto + attachment release-changelog
5. **IDs únicos**: Formato `PF-XX WXXRXX` para expedientes, resoluciones, RUCs
6. **Commitments**: Sin `networkidle` (Angular polling), sin `waitForTimeout` como espera principal, sin escapeHtml (runtime lo procesa)
7. **Errores**: Los errores clasificados en UI/API/PERSISTENCIA/TIMEOUT determinan audiencia Frontend/Backend/DevOps

---

## 7. 🔧 Comandos de Ejecución

```powershell
# Listar tests
npm run pf:list:caso01 / caso02 / caso04

# Smoke
npm run pf:smoke:caso02
npm run pf:smoke:caso02:headed

# Phase1
npm run pf:phase1:caso02
npm run pf:phase1:caso02:multi

# Phase2
npm run pf:phase2:caso02

# Negativos
npm run pf:negative:caso02:sin-sanciones

# Reportes
npm run report:all
npm run report:allure:open
npm run report:playwright:open

# Runner directo
powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 02 -Scenario phase1 -Headed
```

---

## 8. ⚠️ Pendientes Conocidos

- [ ] Fix `waitForTimeout` en `formulario-sancion.page.ts` (líneas 59, 108)
- [ ] Completar `administrados.e2e.spec.ts` y `reconsideracion.e2e.spec.ts` en modelo nuevo
- [ ] Especificar si `run-ui-tests.ps1` es wrapper oficial
- [ ] Ejecutar smoke de Caso 01 y Caso 04
- [ ] Validar que `phase1` y `phase2` usen todos los usuarios declarados
