# Guia Seguridad Completa — 7 herramientas gratuitas

Framework de seguridad REGINSA: SAST, SCA, DAST y Secret Detection.

---

## Por que 7 herramientas (sin redundancia real)

Cada herramienta cubre un angulo diferente que las demas no cubren:

| Herramienta | Tipo | Que escanea | Que encuentra | Cuando usar |
| ------------- | ------ | ------------- | --------------- | ------------- |
| OWASP ZAP | DAST generico | App web en ejecucion | XSS, CSRF, injection, headers inseguros | Cada sprint/mes |
| Nuclei | DAST por templates | URLs publicas | CVEs conocidos, misconfigs, paneles expuestos | Cada mes |
| Gitleaks | Secret Detection | Codigo fuente + historial git | Tokens, passwords, API keys en codigo | Cada commit/PR |
| Semgrep | SAST (patrones) | Codigo fuente | Patrones inseguros (eval, SQL concat, etc.) | Cada commit/PR |
| CodeQL | SAST (semantico) | Codigo fuente (compilado) | Flujo de datos: taint analysis, injection chains | Solo en GitHub Actions |
| Dependency-Check | SCA | package.json, .csproj | CVEs en dependencias (npm, NuGet) | Cada semana |
| Trivy | Container + SCA | Imagenes Docker + deps | Vulnerabilidades en containers + dependencias | Cada semana |

---

## 1. OWASP ZAP (DAST)

**Que hace**: Escaneo dinamico automatizado sobre la aplicacion web en ejecucion.

### Ejecucion local

```bash
npm run report:owasp:dated
```

Esto ejecuta Docker ZAP contra la URL configurada y genera reportes fechados.

### Alternativas

```bash
# Escaneo + reporte Word bilingue
npm run report:security:word:bilingual

# Escaneo strict (falla si hay warnings)
npm run report:owasp:dated:strict
```

### Salida

- `reportes/security/owasp/YYYY-MM-DD/` — Reportes HTML + Markdown + JSON
- `reportes/security/owasp/YYYY-MM-DD/es/` — Version en espanol

### Workflow

- `.github/workflows/reginsa-sec-dast-zap.yml`

---

## 2. Nuclei (DAST por templates)

**Que hace**: Escaneo con templates de CVEs conocidos, misconfigs y paneles expuestos.

### Ejecucion local — Nuclei (DAST por templates)

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/security/run-nuclei.ps1 -Target https://reginsaqa.sunedu.gob.pe
```

### Con Docker directamente

```bash
docker run --rm projectdiscovery/nuclei -u https://reginsaqa.sunedu.gob.pe -severity medium,high,critical
```

### Salida — Nuclei (DAST por templates)

- `reportes/security/nuclei/` — Resultados JSONL + texto

### Workflow — Nuclei (DAST por templates)

- `.github/workflows/reginsa-sec-dast-nuclei.yml`

### Diferencia con ZAP

ZAP hace crawling generico (descubre vulnerabilidades nuevas). Nuclei busca vulnerabilidades conocidas por template (CVE-2023-XXXX, etc.). Son complementarios.

---

## 3. Gitleaks (Secret Detection)

**Que hace**: Detecta secretos expuestos (tokens, passwords, API keys) en codigo fuente e historial git.

### Ejecucion local — Gitleaks (Secret Detection)

```bash
npm run test:security:gitleaks
```

### Con Docker directamente — Gitleaks (Secret Detection)

```bash
docker run --rm -v "${PWD}:/repo" zricethezav/gitleaks:latest detect --source /repo --verbose
```

### Configuracion

- `.gitleaks.toml` — Reglas y exclusiones personalizadas

### Workflow — Gitleaks (Secret Detection)

- `.github/workflows/reginsa-sec-sast-gitleaks.yml`

---

## 4. Semgrep (SAST patrones)

**Que hace**: Analisis estatico por patrones de codigo inseguro. Detecta inyecciones SQL por concatenacion, uso de `eval()`, crypto debil, etc.

### Ejecucion local — Semgrep (SAST patrones)

```bash
npm run test:security:semgrep
```

### Con Docker directamente — Semgrep (SAST patrones)

```bash
docker run --rm -v "${PWD}:/src" semgrep/semgrep semgrep scan /src --config p/default --config p/owasp-top-ten
```

### Configuracion — Semgrep (SAST patrones)

- `.semgrep.yml` — Reglas personalizadas y exclusiones

### Diferencia con SonarQube

SonarQube se enfoca en calidad de codigo (code smells, duplicacion, coverage). Semgrep se enfoca en vulnerabilidades de seguridad por patrones. Son complementarios.

### Workflow — Semgrep (SAST patrones)

- `.github/workflows/reginsa-sec-sast-semgrep.yml`

---

## 5. CodeQL (SAST semantico)

**Que hace**: Analisis semantico profundo — analiza flujo de datos (taint analysis) para encontrar inyecciones y vulnerabilidades complejas que patrones no detectan.

### Ejecucion

Solo disponible en GitHub Actions (gratis para repositorios publicos):

```yaml
# Se ejecuta automaticamente en push/PR
.github/workflows/reginsa-sec-sast-codeql.yml
```

### Por que NO se ejecuta local

CodeQL requiere compilar una base de datos del codigo, proceso que necesita la infraestructura de GitHub Actions.

### Diferencia con Semgrep

Semgrep usa patrones (grep avanzado). CodeQL compila el codigo y analiza flujos de datos completos (variable de usuario -> query SQL -> base datos). CodeQL es mas profundo pero mas lento.

### Workflow — Se ejecuta automaticamente en push/PR

- `.github/workflows/reginsa-sec-sast-codeql.yml`

---

## 6. OWASP Dependency-Check (SCA)

**Que hace**: Identifica vulnerabilidades conocidas (CVEs) en dependencias npm y NuGet.

### Ejecucion local — OWASP Dependency-Check (SCA)

```bash
npm run test:security:dependency-check
```

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/security/run-dependency-check.ps1
```

### Requisitos

- Docker
- (Opcional) `NVD_API_KEY` en `.env` para acelerar descarga de base CVE

### Salida — OWASP Dependency-Check (SCA)

- `reportes/security/dependency-check/` — HTML + JSON

### Workflow — OWASP Dependency-Check (SCA)

- `.github/workflows/reginsa-sec-sca-depcheck.yml`

---

## 7. Trivy (Container + SCA)

**Que hace**: Escanea imagenes Docker por vulnerabilidades + escanea dependencias del proyecto.

### Ejecucion local — Trivy (Container + SCA)

```bash
npm run test:security:trivy
```

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/security/run-trivy.ps1
```

### Escanear imagen Docker especifica

```bash
docker run --rm aquasec/trivy image sonarqube:community
docker run --rm aquasec/trivy image ghcr.io/zaproxy/zaproxy:stable
```

### Diferencia con Dependency-Check

Ambos escanean dependencias. Pero Trivy ademas escanea imagenes Docker completas (OS packages, binarios). Dependency-Check es mas profundo en NuGet/npm. Son complementarios.

### Salida — Trivy (Container + SCA)

- `reportes/security/trivy/` — JSON + texto

### Workflow — Trivy (Container + SCA)

- `.github/workflows/reginsa-sec-container-trivy.yml`

---

## 8. Ejecutar todas las herramientas

### Suite completa de seguridad

```bash
npm run test:security:full
```

### Con reporte Word bilingue

```bash
npm run report:security:word:bilingual
```

### Reportes fechados (snapshot mensual)

```bash
npm run report:security:dated
```

### Cleanup de reportes

```bash
npm run report:security:clean:current
npm run report:security:history:list
```

---

## 9. Tabla resumen de comandos

| Herramienta | Comando npm | Script PowerShell |
| ------------- | ------------ | ------------------ |
| OWASP ZAP | `npm run report:owasp:dated` | `scripts/security/generar-reportes-owasp-fechados.ps1` |
| Nuclei | - | `scripts/security/run-nuclei.ps1` |
| Gitleaks | `npm run test:security:gitleaks` | `scripts/security/run-gitleaks.ps1` |
| Semgrep | `npm run test:security:semgrep` | `scripts/security/run-semgrep.ps1` |
| CodeQL | Solo GitHub Actions | `.github/workflows/reginsa-sec-sast-codeql.yml` |
| Dep-Check | `npm run test:security:dependency-check` | `scripts/security/run-dependency-check.ps1` |
| Trivy | `npm run test:security:trivy` | `scripts/security/run-trivy.ps1` |
| Todas | `npm run test:security:full` | `scripts/security/run-all-security.ps1` |

---

## 10. Interpretar resultados

### Severidades estandar

| Severidad | Accion requerida | Plazo |
| ----------- | ----------------- | ------- |
| Critical | Corregir inmediatamente | 24-48h |
| High | Corregir en el sprint actual | 1 semana |
| Medium | Planificar correccion | 2-4 semanas |
| Low/Info | Evaluar si amerita accion | Proximo ciclo |

### Falsos positivos

Las herramientas DAST (ZAP, Nuclei) pueden reportar falsos positivos. Para cada hallazgo:

1. Verificar manualmente si la vulnerabilidad es explotable.
2. Si es falso positivo, documentar en el informe mensual.
3. Agregar exclusion en la configuracion de la herramienta si es recurrente.

### Flujo de triaje

```text
Hallazgo reportado
  -> Es falso positivo?
     SI -> Documentar + excluir
     NO -> Crear incidencia al proveedor
        -> Priorizar segun severidad
        -> Verificar correccion con re-escaneo
```

- Vulnerabilidades en filesystem, dependencias e imagenes.

Local:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/security/run-trivy.ps1
```

Workflow de contenedor:

- .github/workflows/reginsa-sec-container-trivy.yml

## Interpretacion de resultados

- CRITICAL/HIGH: resolver primero
- MEDIUM: priorizar por riesgo y exposicion
- LOW/INFO: backlog con criterio

## Politica de reportes

- No versionar logs/reportes generados.
- Versionar solo scripts, templates y estructura de carpetas.
