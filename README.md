# REGINSAQA — Framework de QA Automation y DevSecOps

**Proyecto**: SI-091 REGINSA — Sistema de Registro de Sanciones
**Filosofia**: Todas las herramientas son **version gratuita / OSS**
**Alineamiento**: ISO/IEC 25010, TDR de consultoria QA

> Regla critica: No romper flujos ya probados en Playwright, k6, SonarQube, OWASP ZAP y Postman/Newman.

---

## Herramientas (13 — todas gratuitas)

| Herramienta | Tipo | Costo | Estado | Ubicacion principal |
| ------------- | ------ | ------- | -------- | ------------------- |
| Playwright | Funcional E2E | Gratis OSS | ✅ Probado | `tests/casos-prueba/` |
| k6 OSS | Rendimiento | Gratis OSS | ✅ Probado | `tests/performance/k6-grafana/` |
| Grafana Cloud | Dashboards k6 | Gratis (free tier) | ✅ Probado | Grafana Cloud web |
| Postman/Newman | API Testing | Gratis (free plan) | ✅ Probado | `API_TEST/postman/` |
| SonarQube Community | Calidad de codigo | Gratis (Docker) | ✅ Probado | `scripts/security/escanear-repos-sonar.ps1` |
| OWASP ZAP | DAST | Gratis OSS | ✅ Probado | `scripts/security/generar-reportes-owasp-fechados.ps1` |
| Nuclei | DAST (CVE) | Gratis OSS | ✅ Implementado | `scripts/security/run-nuclei.ps1` |
| Gitleaks | Secret Detection | Gratis OSS | ✅ Implementado | `.github/workflows/reginsa-sec-sast-gitleaks.yml` |
| Semgrep | SAST (patrones) | Gratis OSS | ✅ Implementado | `.github/workflows/reginsa-sec-sast-semgrep.yml` |
| CodeQL | SAST (semantico) | Gratis (GitHub) | ✅ Implementado | `.github/workflows/reginsa-sec-sast-codeql.yml` |
| Dependency-Check | SCA | Gratis OSS | ✅ Implementado | `scripts/security/run-dependency-check.ps1` |
| Trivy | Container + SCA | Gratis OSS | ✅ Implementado | `scripts/security/run-trivy.ps1` |
| Allure | Reporteria | Gratis OSS | ✅ Configurado | `allure-report/` |

---

## Arquitectura

```text
┌─────────────────────────────────────────────────────────────┐
│                    REGINSA QA Framework                      │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  Funcional   │ Rendimiento  │     API      │   Reporteria   │
│  Playwright  │  k6 + Grafana│ Postman/     │  Allure + HTML │
│  5 casos E2E │  5 casos     │ Newman 8 col │  + JSON + DOCX │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                    Calidad de Codigo                         │
│              SonarQube Community (4 proyectos)               │
├─────────────────────────────────────────────────────────────┤
│                      Seguridad (7 tools)                     │
│  DAST: ZAP + Nuclei  │  SAST: Gitleaks + Semgrep + CodeQL  │
│  SCA: Dependency-Check + Trivy                               │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ GitHub       │ Azure        │ Jenkins      │ AWS            │
│ Actions 35+  │ DevOps 3     │ 2 files      │ CodeBuild 7   │
│ workflows    │ pipelines    │              │ buildspecs     │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

---

## Quick Start

### Prerequisitos

- Node.js 20 LTS, PowerShell 7 (`pwsh`), Docker Desktop, Git

### Instalacion (3 comandos)

```bash
npm ci
npx playwright install chromium
cp .env.example .env   # Ajustar URLs y credenciales
```

### Primera ejecucion por herramienta

```bash
# Funcional (Playwright)
npm run test:01:fast

# Rendimiento (k6)
npm run k6:caso01 -- --cantidad 2

# API (Postman/Newman)
npm run api:test:caso01

# Calidad de codigo (SonarQube - requiere Docker)
npm run test:sonar:repos

# Seguridad (OWASP ZAP - requiere Docker)
npm run report:owasp:dated

# Metricas mensuales
pwsh scripts/generar-metricas-mensuales.ps1
```

---

## Casos de prueba

| Caso | Nombre | Funcional | k6 | API | Validaciones |
| ------ | -------- | :---------: | :--: | :---: | :------------: |
| 00 | Login Punku SSO | ● | ● | — | — |
| 01 | Agregar Administrado | ● | ● | ● | ● |
| 02 | Registrar Sancion | ● | ● | ● | ● |
| 03 | Reconsiderar sin Sanciones | ● | ● | ● | ● |
| 04 | Reconsiderar con Sanciones | ● | ● | ● | ● |

---

## Estructura del proyecto

```text
REGINSA/
├── tests/
│   ├── casos-prueba/          # Playwright specs (caso_00..04)
│   ├── performance/
│   │   ├── k6-grafana/        # k6 scripts canonicos
│   │   └── k6/                # k6 scripts alternativos
│   └── security/              # Scripts de seguridad
├── API_TEST/postman/           # Colecciones Postman
├── scripts/
│   ├── common/                # Modulo PowerShell compartido
│   ├── security/              # Scripts de seguridad
│   ├── shared/                # Utilidades compartidas
│   └── *.ps1                  # Scripts de ejecucion por caso
├── .github/workflows/          # GitHub Actions (35+ workflows)
├── pipelines/
│   ├── azure/                 # Azure DevOps
│   ├── jenkins/               # Jenkinsfiles
│   └── aws/                   # AWS CodeBuild buildspecs
├── docs/
│   ├── manuales/              # Guias de uso por herramienta
│   └── entregables/           # Templates TDR (informes, checklist)
├── helpers/                    # Config centralizada + utilidades
├── core/                       # Configuracion del framework
├── reportes/                   # Salida de reportes (no versionado)
└── allure-report/              # Reportes Allure (no versionado)
```

---

## Cobertura ISO/IEC 25010

| Caracteristica | Herramienta(s) | Cobertura |
| --------------- | --------------- | ----------- |
| Funcionalidad | Playwright + Postman/Newman | Alta ✅ |
| Rendimiento | k6 + Grafana Cloud | Alta ✅ |
| Compatibilidad | Playwright multi-browser + Newman | Media ⚠️ |
| Usabilidad | (Requiere evaluacion manual) | Baja ❌ |
| Fiabilidad | Playwright retries + k6 smoke | Media ⚠️ |
| Seguridad | ZAP + Nuclei + Gitleaks + Semgrep + CodeQL + Dep-Check + Trivy | Alta ✅ |
| Mantenibilidad | SonarQube Community (4 proyectos) | Alta ✅ |
| Portabilidad | 4 plataformas CI/CD | Media ⚠️ |

Detalle completo: [Checklist ISO 25010](docs/entregables/CHECKLIST_ISO_25010.md) | [Matriz herramientas vs ISO](docs/entregables/MATRIZ_HERRAMIENTAS_VS_ISO25010.md)

---

## Documentacion

### Guias de uso

| Guia | Descripcion |
| ------ | ------------ |
| [Setup Windows 11](docs/manuales/SETUP_WINDOWS_11.md) | Instalacion completa del entorno en Windows |
| [Setup macOS](docs/manuales/SETUP_MAC.md) | Instalacion completa del entorno en macOS |
| [Guia Playwright](docs/manuales/GUIA_PLAYWRIGHT.md) | Ejecucion funcional: modos, pool, debugging, reportes |
| [Guia k6](docs/manuales/GUIA_K6.md) | Rendimiento: local vs cloud, KPIs, thresholds |
| [Guia SonarQube](docs/manuales/GUIA_SONARQUBE.md) | Calidad de codigo: setup Docker, metricas, sync |
| [Guia Seguridad](docs/manuales/GUIA_SEGURIDAD_SAST_SCA_DAST.md) | 7 herramientas: DAST, SAST, SCA |
| [Guia Postman/Newman](docs/manuales/GUIA_POSTMAN_NEWMAN.md) | API testing: colecciones, ejecucion, reportes |
| [Guia Pipelines](docs/manuales/GUIA_PIPELINES.md) | CI/CD: GitHub Actions, Azure, Jenkins, AWS |

### Entregables TDR

| Documento | Descripcion |
| ----------- | ------------ |
| [Informe Mensual](docs/entregables/INFORME_MENSUAL_TEMPLATE.md) | Template informe mensual con metricas TDR |
| [Informe Final](docs/entregables/INFORME_FINAL_TEMPLATE.md) | Template informe final de consultoria |
| [Checklist ISO 25010](docs/entregables/CHECKLIST_ISO_25010.md) | Evaluacion por caracteristica ISO 25010 |
| [Matriz Herramientas](docs/entregables/MATRIZ_HERRAMIENTAS_VS_ISO25010.md) | 13 herramientas vs 8 caracteristicas ISO |

---

## Politica de reportes y logs

- No versionar reportes generados (JSON, XML, SARIF, HTML de ejecucion).
- Conservar carpetas con `.gitkeep` para estructura fija.
- SonarQube puede conservar salidas exportadas cuando sean evidencia formal.
- Metricas mensuales: `pwsh scripts/generar-metricas-mensuales.ps1`

---

## Documentacion adicional

- [Indice de documentacion](docs/README.md)
- [Documentacion personal](docs/personal/README.md)
- [Documentacion SUNEDU](docs/sunedu/README.md)
- [Operacion de packs](README_OPERACION_PACKS.md)
