# Jenkins — Pipeline de Seguridad REGINSA-QA

Guía paso a paso para configurar el pipeline de seguridad en Jenkins.

---

## Índice

1. [Prerrequisitos](#prerrequisitos)
2. [Configurar la credencial reginsa-url](#1-configurar-la-credencial-reginsa-url)
3. [Instalar plugins de Jenkins](#2-instalar-plugins-de-jenkins)
4. [Crear el Pipeline Job](#3-crear-el-pipeline-job)
5. [Ejecutar el pipeline](#4-ejecutar-el-pipeline)
6. [Herramientas incluidas y excluidas](#herramientas-incluidas-y-excluidas)
7. [Estructura de reportes generados](#estructura-de-reportes)

---

## Prerrequisitos

En el **agente Jenkins** (el servidor donde corren los builds) deben estar instalados:

| Requisito | Versión mínima | Cómo verificar |
|---|---|---|
| Jenkins | 2.400+ | `jenkins --version` |
| Docker | 20+ | `docker --version` |
| Node.js | 20 | `node --version` |
| Python 3 / pip | 3.8+ | `python3 --version && pip3 --version` |
| curl | cualquier | `curl --version` |

> ⚠️ **Importante:** El usuario que ejecuta Jenkins necesita permisos para usar Docker.
> En Linux: `sudo usermod -aG docker jenkins` y luego reiniciar Jenkins.

---

## 1. Configurar la credencial reginsa-url

La URL del entorno QA se guarda como credencial de tipo **Secret text** en Jenkins.

### Paso a paso:

1. Ir a **Jenkins → Manage Jenkins → Credentials**
2. Hacer clic en **(global)** → **Add Credentials**
3. Configurar:
   - **Kind:** `Secret text`
   - **Secret:** `https://reginsaqa.sunedu.gob.pe/`
   - **ID:** `reginsa-url`
   - **Description:** `URL del entorno QA de REGINSA (SUNEDU)`
4. Hacer clic en **"Create"**

---

## 2. Instalar plugins de Jenkins

### Plugin obligatorio:

| Plugin | Para qué sirve | Cómo instalar |
|---|---|---|
| **Pipeline** | Ejecutar archivos Jenkinsfile | Suele venir preinstalado |

### Plugin opcional (pero recomendado):

| Plugin | Para qué sirve | Cómo instalar |
|---|---|---|
| **HTML Publisher** | Ver reportes HTML directamente en Jenkins | Jenkins → Manage Plugins → buscar "HTML Publisher" |

### Para instalar plugins:
1. Ir a **Jenkins → Manage Jenkins → Manage Plugins**
2. Pestaña **"Available plugins"**
3. Buscar el nombre del plugin
4. Seleccionar y hacer clic en **"Install without restart"**

---

## 3. Crear el Pipeline Job

1. En Jenkins, hacer clic en **"New Item"**
2. Nombre: `reginsa-security-pipeline`
3. Tipo: seleccionar **"Pipeline"**
4. Hacer clic en **"OK"**

### Configuración del job:

5. En la sección **"General"**:
   - ✅ Marcar **"This project is parameterized"** (se configura solo desde el Jenkinsfile)

6. En la sección **"Pipeline"**:
   - **Definition:** `Pipeline script from SCM`
   - **SCM:** `Git`
   - **Repository URL:** `https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL.git`
   - **Branch Specifier:** `*/main`
   - **Script Path:** `pipelines/jenkins/Jenkinsfile-security`

7. Hacer clic en **"Save"**

---

## 4. Ejecutar el pipeline

### Primera ejecución (para cargar los parámetros):

1. Hacer clic en **"Build Now"** (la primera vez carga los parámetros del Jenkinsfile)
2. Si el build falla, hacer clic en **"Build with Parameters"** que ahora aparecerá

### Ejecuciones normales:

Hacer clic en **"Build with Parameters"** y configurar:

| Parámetro | Por defecto | Descripción |
|---|---|---|
| `RUN_ZAP` | `false` | Activa el scan DAST con OWASP ZAP (~10 min extra) |
| `RUN_NUCLEI` | `false` | Activa el scan DAST con Nuclei (~5 min extra) |
| `RUN_TRIVY` | `true` | Activa el scan de contenedor con Trivy |

> 💡 **Recomendación:** Para ejecuciones rápidas de rutina, dejar ZAP y Nuclei en `false`.
> Activarlos solo para revisiones de seguridad periódicas (semanal/mensual).

---

## Herramientas incluidas y excluidas

### ✅ Herramientas incluidas en este pipeline:

| Herramienta | Categoría | Parámetro |
|---|---|---|
| **Gitleaks** | Secret Detection | Siempre activo |
| **Semgrep** | SAST | Siempre activo |
| **npm audit** | SCA | Siempre activo |
| **OWASP Dependency-Check** | SCA (profundo) | Siempre activo |
| **Trivy** | Container Security | `RUN_TRIVY=true` |
| **OWASP ZAP** | DAST | `RUN_ZAP=true` |
| **Nuclei** | DAST | `RUN_NUCLEI=true` |

### ❌ Herramientas NO incluidas (y por qué):

| Herramienta | Razón |
|---|---|
| **CodeQL** | Exclusivo de GitHub Actions. GitHub no permite ejecutar CodeQL en sistemas externos como Jenkins. Para análisis SAST en Jenkins, este pipeline usa **Semgrep** como alternativa completa y gratuita. |

---

## Estructura de reportes

Los reportes se archivan como artifacts de Jenkins y también se publican como HTML (si el plugin está instalado):

```
reportes/
└── security/
    ├── dependency-check/
    │   ├── dependency-check-report.html    ← Reporte HTML navegable
    │   └── dependency-check-report.json   ← Reporte JSON para integración
    ├── trivy/
    │   └── trivy-report.json              ← Vulnerabilidades en la imagen Docker
    ├── zap/                               ← Solo si RUN_ZAP=true
    │   ├── zap-baseline-report.html
    │   ├── zap-baseline-report.json
    │   └── zap-baseline-report.md
    └── nuclei/                            ← Solo si RUN_NUCLEI=true
        ├── nuclei-report.jsonl
        └── nuclei-report.sarif

# En la raíz del workspace:
gitleaks-report.json    ← Secretos detectados
npm-audit-report.json   ← Vulnerabilidades npm
semgrep-report.json     ← Hallazgos SAST
```

Para ver los reportes en Jenkins:
- **Artifacts:** hacer clic en el build → "Build Artifacts"
- **HTML Reports:** hacer clic en el build → "Security Reports" (requiere plugin HTML Publisher)
