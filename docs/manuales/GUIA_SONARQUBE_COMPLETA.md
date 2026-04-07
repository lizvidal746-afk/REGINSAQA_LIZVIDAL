# Guía Completa SonarQube — REGINSA

## Índice

1. [¿Qué es SonarQube?](#1-qué-es-sonarqube)
2. [Arquitectura del proyecto REGINSA](#2-arquitectura-del-proyecto-reginsa)
3. [Inventario de archivos SonarQube](#3-inventario-de-archivos-sonarqube)
4. [Prerrequisitos](#4-prerrequisitos)
5. [Ejecución local paso a paso](#5-ejecución-local-paso-a-paso)
6. [Ejecución en GitHub Actions](#6-ejecución-en-github-actions)
7. [Ejecución en Azure DevOps](#7-ejecución-en-azure-devops)
8. [Ejecución en AWS CodeBuild](#8-ejecución-en-aws-codebuild)
9. [Sincronizar bugs SonarQube → Azure DevOps](#9-sincronizar-bugs-sonarqube--azure-devops)
10. [Reportes y artefactos](#10-reportes-y-artefactos)
11. [Quality Gate](#11-quality-gate)
12. [Preguntas frecuentes](#12-preguntas-frecuentes)

---

## 1. ¿Qué es SonarQube?

SonarQube es una plataforma de **análisis estático de código** (SAST) que detecta:

| Categoría | ¿Qué detecta? | Ejemplo |
| ----------- | --------------- | --------- |

| **Bugs** | Errores lógicos que causan fallos en runtime | Null pointer, condición siempre falsa |
| **Vulnerabilities** | Fallos de seguridad explotables | SQL Injection, XSS, credenciales hardcodeadas |
| **Code Smells** | Código difícil de mantener | Funciones >200 líneas, duplicación |
| **Security Hotspots** | Código que necesita revisión manual de seguridad | Uso de crypto, regex en input de usuario |
| **Coverage** | % del código cubierto por tests unitarios | Funciones sin test |
| **Duplications** | Bloques de código copiados | Copy-paste entre archivos |

### Flujo conceptual

```text
Código fuente → sonar-scanner analiza → Envía resultado a SonarQube Server → Dashboard web
```

> **Importante**: SonarQube guarda **solo la última ejecución por rama (branch)**. Si escaneas `main` hoy, el dashboard muestra los resultados de hoy. El escaneo anterior de `main` se sobreescribe.

---

## 2. Arquitectura del proyecto REGINSA

REGINSA tiene **4 repositorios** que se escanean como proyectos separados en SonarQube:

| Proyecto SonarQube | Carpeta local | Lenguaje | Qué contiene |
| -------------------- | --------------- | ---------- | -------------- |

| `si091reginsafrontend` | `SI091_REGINSA_FRONTEND-1/` | TypeScript/Angular | Aplicación web interna (backoffice) |
| `si091reginsabackend` | `SI091_REGINSA_BACKEND/` | C#/.NET | API REST del sistema |
| `si091reginsaenlinea` | `SI091_REGINSA_ENLINEA/` | TypeScript/Angular | Aplicación web pública |
| `si091reginsaconfig` | `SI091_REGINSA_CONFIG/` | JSON/Config | Archivos de configuración |

Adicionalmente existe `reginsa-qa-framework` (`sonar-project.properties`) para el framework de pruebas QA, pero los escaneos principales son los 3 repos de código fuente.

### ¿En qué lenguaje están los scripts de SonarQube?

| Archivo | Lenguaje | Propósito |
| --------- | ---------- | ----------- |

| `scripts/security/escanear-repos-sonar.ps1` | **PowerShell** | Ejecuta sonar-scanner en cada repo |
| `scripts/security/exportar-sonar-issues.ps1` | **PowerShell** | Exporta issues a HTML |
| `scripts/security/generar-reporte-sonar-local.ps1` | **PowerShell** | Genera reportes ejecutivo/desarrollador (DOCX+HTML) |
| `scripts/security/generar-reportes-sonar-fechados.ps1` | **PowerShell** | Genera reportes con fecha (snapshot) |
| `scripts/security/generar-resumen-sonar-accionable.ps1` | **PowerShell** | Plan de remediación con prioridades |
| `scripts/security/limpiar-reportes-sonar.ps1` | **PowerShell** | Limpia reportes anteriores |
| `.github/workflows/reginsa-sonarqube-selfhosted.yml` | **YAML** (GitHub Actions) | Pipeline CI/CD |
| `pipelines/aws/buildspec-sonar.yml` | **YAML** (AWS CodeBuild) | Pipeline CI/CD |
| `pipelines/azure/azure-pipelines-enterprise.yml` | **YAML** (Azure DevOps) | Pipeline CI/CD (multi-tipo) |
| `sonar-project.properties` | **Properties** (Java) | Configuración del scanner |

**Conclusión**: Todos los scripts de ejecución están en **PowerShell**. Los pipelines están en YAML específico de cada plataforma. El scanner interno (`sonar-scanner`) es un binario de **Node.js** instalado como devDependency.

---

## 3. Inventario de archivos SonarQube

### Comandos npm disponibles

```powershell
# Escanear el framework QA (tests, core, scripts)
npm run test:sonar

# Escanear con Quality Gate (espera resultado, para CI)
npm run test:sonar:ci

# Escanear los 3 repos fuente (frontend, backend, enlinea)
npm run test:sonar:repos

# Escanear repo individual
npm run test:sonar:repos:frontend
npm run test:sonar:repos:backend
npm run test:sonar:repos:enlinea

# Generar reportes desde resultados existentes
npm run report:sonar:local      # Reporte ejecutivo DOCX+HTML
npm run report:sonar:issues     # Detalle de issues HTML
npm run report:sonar:dated      # Snapshot fechado completo

# Limpiar reportes anteriores
npm run report:sonar:clean
```

---

## 4. Prerrequisitos

### 4.1 Servidor SonarQube

Opción A — **Docker local** (recomendado para desarrollo):

```powershell
# Levantar SonarQube Community Edition
docker run -d --name sonarqube -p 9000:9000 sonarqube:community

# Esperar ~2 minutos a que arranque, luego acceder:
# http://localhost:9000
# Usuario: admin  /  Password: admin (cambiar en primer login)
```

Opción B — **Servidor de la organización** (para CI/CD):

```text
URL: http://192.168.x.x:9000 (o https://sonar.tudominio.gob.pe)
```

### 4.2 Token de SonarQube

1. Ir a **SonarQube → My Account → Security → Generate Tokens**
2. Crear token tipo "User Token" o "Project Analysis Token"
3. Copiar el token (solo se muestra una vez)

### 4.3 Variables de entorno

```powershell
# En Windows (PowerShell)
$env:SONAR_HOST_URL = "http://localhost:9000"
$env:SONAR_TOKEN = "squ_xxxxxxxxxxxxxxxxxxxxxxxx"
```

```bash
# En Linux/macOS
export SONAR_HOST_URL="http://localhost:9000"
export SONAR_TOKEN="squ_xxxxxxxxxxxxxxxxxxxxxxxx"
```

### 4.4 Dependencias de Node.js

```powershell
npm ci    # Instala sonar-scanner como devDependency
```

---

## 5. Ejecución local paso a paso

### Paso 1: Asegurar que SonarQube está corriendo

```powershell
# Verificar que el servidor responde
Invoke-RestMethod -Uri "$env:SONAR_HOST_URL/api/system/status"
# Debe devolver: { "status": "UP" }
```

### Paso 2: Escanear los 3 repos

```powershell
# Opción A: Todos juntos
npm run test:sonar:repos

# Opción B: Uno por uno
npm run test:sonar:repos:frontend
npm run test:sonar:repos:backend
npm run test:sonar:repos:enlinea
```

**¿Qué hace internamente?**

1. El script `escanear-repos-sonar.ps1` ejecuta `sonar-scanner` para cada repo
2. `sonar-scanner` lee el código fuente de la carpeta correspondiente
3. Analiza y envía los resultados al servidor SonarQube
4. El servidor procesa y muestra en el dashboard

### Paso 3: Ver resultados en el dashboard

#### Abrir en el navegador:()

```text
http://localhost:9000/dashboard?id=si091reginsafrontend
http://localhost:9000/dashboard?id=si091reginsabackend
http://localhost:9000/dashboard?id=si091reginsaenlinea
```

### Paso 4: Generar reportes offline

```powershell
# Reporte fechado completo (carpeta por fecha + idioma)
npm run report:sonar:dated

# Solo el detalle de issues
npm run report:sonar:issues
```

Los reportes se guardan en `reportes/security/sonar/`.

---

## 6. Ejecución en GitHub Actions

### Archivo: `.github/workflows/reginsa-sonarqube-selfhosted.yml`

#### ¿Cómo funciona?

GitHub Actions → Runner self-hosted Windows → Ejecuta escanear-repos-sonar.ps1 → SonarQube local
                                             → Genera Quality Gate summary
                                             → Sube artefactos

#### Secretos necesarios en GitHub

| Secreto | Valor | Dónde configurar |
| --------- | ------- | ------------------ |

| `SONAR_HOST_URL` | `<http://localhost:9000`> | Repo → Settings → Secrets → Actions |
| `SONAR_TOKEN` | `squ_xxxxx` | Repo → Settings → Secrets → Actions |

#### Cómo ejecutar

1. Ir a **Actions** → **REGINSA SonarQube (Self-hosted)**
2. Click **Run workflow**
3. Parámetros opcionales:
   - `sonar_host_url`: dejar vacío (usa el secret)
   - `project_keys`: dejar default (los 4 proyectos)
   - `upload_artifacts`: `true`
4. Click **Run workflow**

#### Pasos que ejecuta internamente

1. `checkout` — descarga el código
2. `setup-node` — Node.js 20
3. `verify environment` — muestra versiones
4. `install dependencies` — `npm ci` (solo si no existe node_modules)
5. **`Run Sonar scan`** — ejecuta `escanear-repos-sonar.ps1` (PowerShell)
6. **`Build Sonar quality gate summary`** — llama API SonarQube para obtener métricas
7. Upload artifacts — sube reportes como artefactos descargables

#### ¿Es automático?

Sí. Se ejecuta en:

- Push a `main`, `develop`, `qa`
- Pull requests a esas ramas
- Manualmente con `workflow_dispatch`

---

## 7. Ejecución en Azure DevOps

### Archivo: `pipelines/azure/azure-pipelines-enterprise.yml`

¿Cómo funciona?

Azure DevOps Pipeline → Agente Ubuntu → Ejecuta escanear-repos-sonar.ps1 (con pwsh) → SonarQube

#### Variables necesarias en Azure DevOps

| Variable | Valor | Dónde |
| ---------- | ------- | ------- |

| `SONAR_HOST_URL` | URL de tu SonarQube | Pipeline → Variables (marcar como secreto) |
| `SONAR_TOKEN` | Token de autenticación | Pipeline → Variables (marcar como secreto) |

#### Cómo configurar

1. Ir a **Azure DevOps → Pipelines → New Pipeline**
2. Seleccionar tu repositorio
3. Elegir **Existing YAML file**
4. Seleccionar `pipelines/azure/azure-pipelines-enterprise.yml`
5. Agregar variables `SONAR_HOST_URL` y `SONAR_TOKEN`
6. Ejecutar con parámetro `testType: sonar`

#### Pasos que ejecuta (cuando testType=sonar)

El pipeline enterprise es multi-propósito. Para SonarQube:

1. Instala Node.js 20
2. `npm ci`
3. Ejecuta `escanear-repos-sonar.ps1` vía PowerShell

> **Nota sobre bugs en Azure DevOps**: La creación automática de Work Items (bugs) desde SonarQube **se ejecuta como paso adicional DESPUÉS del escaneo**, usando la API REST de Azure DevOps. Esto puede correr en cualquier plataforma (GitHub Actions, Azure Pipelines, local) porque solo necesita las APIs REST. Ver sección 9.

---

## 8. Ejecución en AWS CodeBuild

### Archivo: `pipelines/aws/buildspec-sonar.yml`

¿Cómo funciona?

AWS CodeBuild → Contenedor Ubuntu → Instala pwsh + npm → Ejecuta escanear-repos-sonar.ps1 → SonarQube

### Variables necesarias

| Variable | Almacenamiento | Valor |
| ---------- | ---------------- | ------- |

| `SONAR_TOKEN` | AWS Secrets Manager (`reginsa/sonar:token`) | Token SonarQube |
| `SONAR_HOST_URL` | Variable de entorno o Parameter Store | URL SonarQube |

#### Cómo configurar en AWS

1. Ir a **AWS Console → CodeBuild → Create project**
2. Source: GitHub (tu repositorio)
3. Environment: Amazon Linux 2 / Ubuntu (Standard)
4. Buildspec: `pipelines/aws/buildspec-sonar.yml`
5. **Crear secreto** en AWS Secrets Manager:

   Nombre: reginsa/sonar
   Clave: token
   Valor: squ_xxxxx

6. Asignar rol IAM con permiso `secretsmanager:GetSecretValue`

#### Pasos que ejecuta

1. Instala Node.js 20 + npm
2. Instala PowerShell Core (pwsh) si no está
3. `npm ci`
4. Ejecuta `escanear-repos-sonar.ps1`
5. Sube artefactos a S3

---

## 9. Sincronizar bugs SonarQube → Azure DevOps

### ¿Dónde se ejecuta?

La sincronización se puede ejecutar **desde cualquier plataforma** (GitHub Actions, Azure Pipelines, local, AWS). No necesita estar en Azure DevOps porque usa las **APIs REST**:

Cualquier máquina → API SonarQube (leer bugs) → API Azure DevOps (crear Work Items)

### Escenario recomendado

| Opción | Ventaja | Cuándo usar |
| -------- | --------- | ------------- |

| **GitHub Actions** (tu runner) | Ya tienes la infra, se ejecuta después del escaneo | Si tu CI principal es GitHub |
| **Azure Pipelines** | La empresa ya tiene la cuenta | Si migras todo el CI a Azure DevOps |
| **Local** | Para pruebas, debug | Durante desarrollo del script |

**Recomendación**: Ejecutar en **GitHub Actions** (ya que ahí ya corres el escaneo SonarQube) y crear los bugs en **Azure DevOps** vía API REST.

### Archivo: `scripts/sonar-to-azdo-sync.js`

Este script (Node.js):

1. Lee issues abiertos de SonarQube (`/api/issues/search`)
2. Filtra solo BUG y VULNERABILITY (no code smells)
3. Verifica si ya existe un Work Item en Azure DevOps (evita duplicados)
4. Crea nuevos Work Items tipo "Bug" para issues nuevos
5. Cierra Work Items cuando el issue se resuelve en SonarQube

### Variables necesaria

| Variable | Valor | Ejemplo |
| ---------- | ------- | --------- |

| `SONAR_HOST_URL` | URL SonarQube | `<http://localhost:9000`> |
| `SONAR_TOKEN` | Token SonarQube | `squ_xxxxx` |
| `AZDO_ORG` | Organización Azure DevOps | `mi-empresa` |
| `AZDO_PROJECT` | Proyecto Azure DevOps | `REGINSA` |
| `AZDO_TOKEN` | PAT de Azure DevOps | `xxxxx` (ver cómo crear abajo) |

### Cómo crear el PAT de Azure DevOps

1. Ir a **Azure DevOps → User Settings (icono persona) → Personal Access Tokens**
2. Click **New Token**
3. Configurar:
   - Name: `sonar-sync`
   - Scopes: **Work Items → Read & Write**
4. Copiar el token

### Ejecución en GitHub Actions

Se integra como paso adicional después del escaneo SonarQube existente.

### Ejecución local

```powershell
$env:SONAR_HOST_URL = "http://localhost:9000"
$env:SONAR_TOKEN = "squ_xxxxx"
$env:AZDO_ORG = "mi-empresa"
$env:AZDO_PROJECT = "REGINSA"
$env:AZDO_TOKEN = "xxxxx"

node scripts/sonar-to-azdo-sync.js
```

---

## 10. Reportes y artefactos

### Estructura de salida

reportes/security/sonar/
  20260403-143000/           ← Fecha del snapshot
    si091reginsafrontend/
      es/                    ← Reportes en español
        sonar-...-ejecutivo-es.docx
        sonar-...-ejecutivo-es.html
        sonar-...-desarrollador-es.docx
        sonar-...-desarrollador-es.html
      en/                    ← Reportes en inglés
        sonar-...-executive-en.docx
        sonar-...-executive-en.html
        sonar-...-developer-en.docx
        sonar-...-developer-en.html
      sonar-...-issues.html  ← Detalle de issues
    si091reginsabackend/
      ...
    si091reginsaenlinea/
      ...

### Tipos de reporte

| Reporte | Audiencia | Contenido |
| --------- | ----------- | ----------- |

| Ejecutivo (`ejecutivo-es.docx`) | Gerencia/Jefatura | Resumen: bugs, vulnerabilidades, cobertura, quality gate |
| Desarrollador (`desarrollador-es.docx`) | Equipo técnico | Detalle por issue con archivo, línea, regla, esfuerzo |
| Issues HTML | Equipo técnico | Tabla completa exportable |
| Quality Gate Summary | Todos | Tabla resumen de todos los proyectos |

---

## 11. Quality Gate

### ¿Qué es?

Un Quality Gate es un conjunto de **condiciones mínimas** que el código debe cumplir. Si alguna condición falla, el gate es "FAILED".

### Condiciones típicas

| Métrica | Condición | Valor sugerido |
| --------- | ----------- | ---------------- |

| Bugs nuevos | No puede haber | 0 |
| Vulnerabilidades nuevas | No puede haber | 0 |
| Security Hotspots revisados | Mínimo | 100% |
| Cobertura código nuevo | Mínimo | 80% |
| Duplicación código nuevo | Máximo | 3% |

### Verificar Quality Gate en pipeline

El workflow de GitHub Actions ya incluye el paso "Build Sonar quality gate summary" que llama a la API `/api/qualitygates/project_status` y genera una tabla markdown.

---

## 12. Preguntas frecuentes

### ¿El escaneo anterior se pierde?

Sí. SonarQube guarda **solo el último análisis por rama**. Para conservar snapshots históricos, usa `npm run report:sonar:dated` que genera reportes con marca de tiempo.

### ¿Puedo ejecutar desde GitHub Actions y crear bugs en Azure DevOps?

**Sí**. La creación de bugs usa API REST, no requiere estar dentro de Azure DevOps. Puedes ejecutar el escaneo SonarQube en GitHub Actions y luego el script `sonar-to-azdo-sync.js` crea los Work Items en Azure DevOps.

### ¿Necesito SonarQube instalado en cada plataforma?

**No**. Solo necesitas:

1. El servidor SonarQube corriendo (Docker local o servidor)
2. Acceso de red desde donde ejecutas al servidor
3. Un token válido

### ¿Puedo usar SonarCloud gratis?

 Sí, para repositorios públicos. Para privados necesitas plan de pago o SonarQube Community (gratis, self-hosted).

### ¿Power Shell o Node.js?

Los scripts de escaneo están en PowerShell (reutilizados por todas las plataformas). El script de sync a Azure DevOps está en Node.js para consistencia con el stack del proyecto (Playwright, k6).
