# AWS CodePipeline — Pipeline de Seguridad REGINSA-QA

Guía paso a paso para configurar el pipeline de seguridad en AWS CodePipeline + CodeBuild.

---

## Índice

1. [Prerrequisitos](#prerrequisitos)
2. [Configurar Parameter Store (URL de QA)](#1-configurar-parameter-store)
3. [Crear el proyecto CodeBuild](#2-crear-el-proyecto-codebuild)
4. [Crear el CodePipeline](#3-crear-el-codepipeline)
5. [Herramientas incluidas y excluidas](#herramientas-incluidas-y-excluidas)
6. [Notas sobre el Free Tier de AWS](#notas-sobre-el-free-tier)
7. [Estructura de reportes generados](#estructura-de-reportes)

---

## Prerrequisitos

- ✅ Cuenta de AWS con acceso a CodeBuild, CodePipeline y SSM Parameter Store
- ✅ Repositorio `lizvidal746-afk/REGINSAQA_LIZVIDAL` en GitHub (público)
- ✅ Conexión GitHub configurada en AWS (AWS CodeStar Connections)
- ✅ Permisos IAM con acceso a: `codebuild:*`, `codepipeline:*`, `ssm:GetParameter`

---

## 1. Configurar Parameter Store

La URL del entorno QA se guarda de forma segura en **AWS Systems Manager Parameter Store**.

### Opción A: usando la consola AWS

1. Ir a **AWS Console → Systems Manager → Parameter Store**
2. Hacer clic en **"Create parameter"**
3. Configurar:
   - **Name:** `/reginsa/qa/url`
   - **Type:** `String`
   - **Value:** `https://reginsaqa.sunedu.gob.pe/`
4. Hacer clic en **"Create parameter"**

### Opción B: usando AWS CLI

```bash
aws ssm put-parameter \
  --name "/reginsa/qa/url" \
  --value "https://reginsaqa.sunedu.gob.pe/" \
  --type String \
  --region us-east-1
```

---

## 2. Crear el proyecto CodeBuild

### Paso a paso en la consola AWS:

1. Ir a **AWS Console → CodeBuild → Build projects → Create build project**

2. **Project configuration:**
   - Project name: `reginsa-security-scan`
   - Description: `Pipeline de seguridad para REGINSA-QA (Gitleaks, Semgrep, npm audit, Trivy)`

3. **Source:**
   - Source provider: `GitHub`
   - Repository: `lizvidal746-afk/REGINSAQA_LIZVIDAL`
   - Branch: `main`

4. **Environment:**
   - Environment image: `Managed image`
   - Operating system: `Amazon Linux 2023` o `Ubuntu`
   - Runtime: `Standard`
   - Image: `aws/codebuild/standard:7.0` (incluye Node.js 20 y Python 3.11)
   - Service role: crear uno nuevo o usar uno existente con permisos SSM

5. **Buildspec:**
   - Seleccionar: `Use a buildspec file`
   - Buildspec name: `pipelines/aws/buildspec-security.yml`

6. **Artifacts:**
   - Type: `Amazon S3`
   - Bucket: seleccionar o crear un bucket S3 para los reportes
   - Name: `security-reports`
   - Packaging: `ZIP`

7. Hacer clic en **"Create build project"**

### Permisos IAM necesarios para el Service Role de CodeBuild:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ssm:GetParameter", "ssm:GetParameters"],
      "Resource": "arn:aws:ssm:*:*:parameter/reginsa/*"
    }
  ]
}
```

---

## 3. Crear el CodePipeline

### Paso a paso en la consola AWS: — Crear el CodePipeline

1. Ir a **AWS Console → CodePipeline → Create pipeline**

2. **Pipeline settings:**
   - Pipeline name: `reginsa-security-pipeline`
   - Service role: crear uno nuevo
   - Artifact store: S3 (mismo bucket que en CodeBuild)

3. **Stage 1 — Source (GitHub):**
   - Source provider: `GitHub (Version 2)`
   - Connection: seleccionar tu conexión de GitHub
   - Repository name: `lizvidal746-afk/REGINSAQA_LIZVIDAL`
   - Branch name: `main`
   - Output artifact format: `CodePipeline default`
   - Detection options: `Start the pipeline on source code change` (opcional)

4. **Stage 2 — Build (CodeBuild):**
   - Build provider: `AWS CodeBuild`
   - Region: tu región
   - Project name: `reginsa-security-scan` (el que creaste en el paso anterior)
   - Build type: `Single build`

5. Hacer clic en **"Create pipeline"**

---

## Herramientas incluidas y excluidas

### ✅ Herramientas incluidas en este pipeline:

| Herramienta | Categoría | Cómo se instala |
| --- | --- | --- |
| **Gitleaks** | Secret Detection | Binario descargado desde GitHub Releases |
| **Semgrep** | SAST | `pip3 install semgrep` |
| **npm audit** | SCA | Incluido en Node.js |
| **Trivy** | Container/Filesystem | Script oficial de instalación |

### ❌ Herramientas NO incluidas (y por qué):

| Herramienta | Razón |
| --- | --- |
| **CodeQL** | Exclusivo de GitHub Actions. No puede ejecutarse fuera de GitHub. Para SAST semántico, este pipeline usa Semgrep como alternativa. |
| **OWASP ZAP** | Requiere runtime Docker personalizado en CodeBuild, lo cual es complejo y costoso. Para DAST con ZAP, usar el workflow `reginsa-sec-dast-zap.yml` en GitHub Actions. |
| **Nuclei** | Requiere Docker. Para DAST con Nuclei, usar el workflow `reginsa-sec-dast-nuclei.yml` en GitHub Actions. |
| **OWASP Dependency-Check** | Se sustituye por `npm audit` (más liviano y suficiente para proyectos Node.js en el free tier). |

---

## Notas sobre el Free Tier

- AWS CodeBuild ofrece **100 minutos de build gratis por mes** (instancias `build.general1.small`)
- Este pipeline tarda aproximadamente **5–15 minutos** por ejecución
- Los reportes en S3 ocupan muy poco espacio (< 1 MB por ejecución)
- Para evitar costos inesperados: desactivar la detección automática de cambios y ejecutar manualmente

---

## Estructura de reportes

Todos los reportes se guardan en el directorio `reportes/security/` del artifact de CodeBuild:

```text
reportes/
└── security/
    ├── gitleaks/
    │   └── gitleaks-report.json      ← Secretos detectados en el código
    ├── sca/
    │   └── npm-audit.json            ← Vulnerabilidades en dependencias npm
    ├── semgrep/
    │   └── semgrep-report.json       ← Hallazgos SAST (OWASP Top 10, TypeScript)
    └── trivy/
        └── trivy-fs-report.json      ← Vulnerabilidades en filesystem y Dockerfiles
```

Para ver los reportes: **AWS Console → CodeBuild → tu build → Artifacts → descargar ZIP**
