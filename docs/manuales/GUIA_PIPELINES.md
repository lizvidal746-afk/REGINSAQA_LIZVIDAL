# Guia Pipelines Multi-plataforma

Ejecucion CI/CD equivalente en 4 plataformas: GitHub Actions, Azure DevOps, Jenkins y AWS.

---

## 1. Inventario de workflows y pipelines

### GitHub Actions (`.github/workflows/`)

| Tipo | Workflows | Patron |
| ------ | ---------- | -------- |
| Funcional Pro (por caso) | `reginsa-funcional-pro-caso01..04-selfhosted.yml` | Workflow individual |
| Funcional Scale | `reginsa-funcional-selfhosted.yml` | Con selector de caso |
| Validaciones (por caso) | `reginsa-validaciones-caso01..04-selfhosted.yml` | Workflow individual |
| k6 (por caso) | `reginsa-k6-caso01..04-selfhosted.yml` | Workflow individual |
| Smoke k6 (por caso) | `reginsa-smoke-caso01..04-cloud-selfhosted.yml` | Wrapper -> reusable |
| Postman (por caso) | `reginsa-postman-caso01..04-selfhosted.yml` | Wrapper -> reusable |
| Enterprise | `reginsa-enterprise.yml` | Selector tipo/caso |
| SonarQube | `reginsa-sonarqube-selfhosted.yml` | Escaneo + quality gate |
| OWASP | `reginsa-owasp-selfhosted.yml` | ZAP baseline |
| Seguridad SAST/SCA | `reginsa-sec-*.yml` (7 archivos) | 1 por herramienta |
| Quality Gate | `reginsa-quality-gate-selfhosted.yml` | Gate consolidado |
| Sonar-AzDO Sync | `reginsa-sonar-azdo-sync.yml` | Sync bugs |
| **Reusables** | `reusable-playwright-selfhosted.yml` | Playwright generico |
| **Reusables** | `reusable-k6-selfhosted.yml` | k6 generico |
| **Reusables** | `reusable-k6-smoke-caso-selfhosted.yml` | k6 smoke |
| **Reusables** | `reusable-postman-caso-selfhosted.yml` | Newman generico |

### Azure DevOps (`pipelines/azure/`)

| Archivo | Proposito |
| --------- | ----------- |
| `azure-pipelines-enterprise.yml` | Pipeline enterprise (funcional + k6 + seguridad + sonar) |
| `azure-security-pipeline.yml` | Pipeline dedicado seguridad |
| `azure-sonarqube-sync.yml` | Sync bugs SonarQube -> Azure DevOps |

### Jenkins (`pipelines/jenkins/`)

| Archivo | Proposito |
| --------- | ----------- |
| `Jenkinsfile` | Pipeline enterprise principal |
| `Jenkinsfile-security` | Pipeline dedicado seguridad |

### AWS CodeBuild (`pipelines/aws/`)

| Archivo | Proposito |
| --------- | ----------- |
| `buildspec-functional.yml` | Tests funcionales Playwright |
| `buildspec-k6.yml` | Tests rendimiento k6 |
| `buildspec-security.yml` | Suite seguridad |
| `buildspec-sonar.yml` | Escaneo SonarQube |
| `buildspec-sonar-sync.yml` | Sync bugs SonarQube |
| `buildspec-validaciones.yml` | Validaciones de campos |
| `terraform/` | Infraestructura como codigo |

---

## 2. GitHub Actions — Ejecutar manualmente

1. Ir a repo > Actions > Seleccionar workflow.
2. Click "Run workflow".
3. Completar parametros (caso, workers, etc.).
4. Click "Run workflow" verde.

### Self-hosted runner

El runner esta en un servidor Windows con:

- Node.js 20 LTS
- PowerShell 7
- Docker Desktop
- k6
- Chromium (Playwright)

Configuracion: Labels `[self-hosted, windows]`.

### Reusable workflows

Los workflows individuales por caso invocan a los reutilizables:

```yaml
# reginsa-smoke-caso01-cloud-selfhosted.yml
jobs:
  smoke:
    uses: ./.github/workflows/reusable-k6-smoke-caso-selfhosted.yml
    with:
      case_id: "01"
      script_path: "scripts/run-caso01-local.ps1"
      mode: "k6"
    secrets: inherit
```

---

## 3. Azure DevOps — Importar pipeline

1. Azure DevOps > Pipelines > New Pipeline.
2. Where is your code? > Azure Repos Git (o GitHub).
3. Configure: Existing Azure Pipelines YAML file.
4. Seleccionar `pipelines/azure/azure-pipelines-enterprise.yml`.
5. Variables requeridas:

| Variable | Tipo | Descripcion |
| ---------- | ------ | ------------ |
| `REGINSA_URL` | Secret | URL aplicacion web |
| `REGINSA_USER_1` | Secret | Usuario Punku slot 1 |
| `REGINSA_PASS_1` | Secret | Password slot 1 |
| `SONAR_HOST_URL` | Variable | URL SonarQube |
| `SONAR_TOKEN` | Secret | Token SonarQube |
| `K6_CLOUD_TOKEN` | Secret | Token Grafana Cloud |

---

## 4. Jenkins — Configurar job

1. New Item > Pipeline.
2. Pipeline: Pipeline script from SCM.
3. Script Path: `pipelines/jenkins/Jenkinsfile`.
4. Credentials requeridas:

| Credencial | ID Jenkins | Descripcion |
| ----------- | ----------- | ------------ |
| URL REGINSA | `reginsa-url` | URL aplicacion |
| User/Pass Punku | `reginsa-creds` | Credenciales SSO |
| Token Sonar | `sonar-token` | Autenticacion SonarQube |
| Token k6 Cloud | `k6-cloud-token` | Grafana Cloud |

---

## 5. AWS CodeBuild — Crear proyecto

1. CodeBuild > Create project.
2. Source: GitHub (conectar repo).
3. Buildspec: Override > `pipelines/aws/buildspec-functional.yml`.
4. Environment:
   - Runtime: Ubuntu Standard 7.0
   - Privileged: Si (para Docker)
   - Node.js 20+, PowerShell disponible
5. Variables de entorno:

| Variable | Tipo | Descripcion |
| ---------- | ------ | ------------ |
| `REGINSA_URL` | `SECRETS_MANAGER` | URL aplicacion |
| `REGINSA_USER_1` | `SECRETS_MANAGER` | Usuario Punku |
| `REGINSA_PASS_1` | `SECRETS_MANAGER` | Password |

---

## 6. Matriz de coherencia

Todas las plataformas ejecutan los mismos scripts subyacentes:

| Tipo | Script ejecutado | GitHub | Azure | Jenkins | AWS |
| ------ | ----------------- | -------- | ------- | --------- | ----- |
| Funcional | `scripts/run-test0X-scale.ps1` | Si | Si | Si | Si |
| k6 | `scripts/run-caso0X-local.ps1` | Si | Si | Si | Si |
| SonarQube | `scripts/security/escanear-repos-sonar.ps1` | Si | Si | Si | Si |
| OWASP ZAP | `scripts/security/generar-reportes-owasp-fechados.ps1` | Si | Si | Si | Si |
| Newman | `npm run api:test:casoXX` | Si | Si | Si | Si |

---

## 7. Regla de implementacion

1. Probar local con `npm run ...`
2. Activar workflow en GitHub Actions (validar en self-hosted runner)
3. Propagar a Azure/Jenkins/AWS solo si se requiere

---

## 8. Artefactos y logs

- Publicar artefactos en CI (test-results, reportes, screenshots).
- No versionar reportes/logs generados en git.
- Mantener solo templates, scripts y estructura en repositorio.
- Artefactos de CI expiran segun politica de la plataforma (30 dias tipico).
