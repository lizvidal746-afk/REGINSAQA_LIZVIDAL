# Setup REGINSA en Windows 11

Guia completa para configurar el framework QA REGINSA desde cero en Windows 11.

---

## 1. Pre-requisitos (todos gratuitos)

| Software | Version minima | Descarga |
| ---------- | --------------- | ---------- |
| **Windows 11** | 22H2+ | Actualizar desde Windows Update |
| **Git** | 2.40+ | <https://git-scm.com/download/win> |
| **Node.js** | 20 LTS | <https://nodejs.org/> (instalador MSI) |
| **Docker Desktop** | 4.25+ | <https://www.docker.com/products/docker-desktop/> (WSL2 backend) |
| **VS Code** | Ultima | <https://code.visualstudio.com/> |
| **PowerShell 7** | 7.4+ | <https://github.com/PowerShell/PowerShell/releases> |
| **k6** | 0.50+ | <https://grafana.com/docs/k6/latest/set-up/install-k6/> |
| **Allure CLI** | 2.34+ | `npm install -g allure-commandline` |

### Verificacion rapida

```powershell
node -v          # v20.x.x
npm -v           # 10.x.x
git --version    # 2.4x.x
docker --version # Docker version 2x.x.x
pwsh --version   # PowerShell 7.x.x
k6 version       # k6 v0.5x.x
allure --version # 2.3x.x
```

---

## 2. Clonar repositorio

```powershell
cd D:\SUNEDU\AUTOMATIZACION
git clone https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL.git REGINSA
cd REGINSA
```

### 2.1 Alternativa ZIP

1. Descargar ZIP desde GitHub > Code > Download ZIP.
2. Extraer en `D:\SUNEDU\AUTOMATIZACION\REGINSA`.
3. Abrir carpeta raiz en VS Code.
4. Continuar con paso 3.

---

## 3. Instalar dependencias

```powershell
npm ci
npx playwright install chromium
```

Esto instala:

- Playwright + browsers (~250 MB)
- Allure reporter
- TypeScript, ESLint, dotenv
- sonar-scanner

---

## 4. Variables de entorno

Copiar plantillas:

```powershell
Copy-Item .env.example .env
Copy-Item .env.k6.example .env.k6.local
```

Editar `.env` con credenciales reales de Punku SSO (slots 1..8).

Editar `.env.k6.local` con token API y URL base.

Referencia completa de variables: ver `.env.example` documentado.

Para k6 Grafana Cloud, ademas configurar:

```powershell
# En .env o como variable de entorno:
K6_CLOUD_TOKEN=tu-token-grafana-cloud
K6_CLOUD_PROJECT_ID=tu-project-id
```

---

## 5. Estructura de carpetas clave

```text
REGINSA/
  tests/
    casos-prueba/     <- Playwright specs (00..04)
    performance/
      k6-grafana/     <- k6 + Grafana Cloud (activo)
      k6/             <- k6 local (legacy)
  API_TEST/postman/   <- Colecciones Newman
  scripts/            <- Runners PowerShell
  .github/workflows/  <- CI/CD GitHub Actions
  pipelines/          <- Azure, Jenkins, AWS
  docs/manuales/      <- Documentacion canonica
  reportes/           <- Salidas generadas (no versionar)
```

---

## 6. Primera ejecucion por herramienta

### Playwright (funcional)

```powershell
npm run test:00            # Solo login
npm run test:01:fast       # Caso 01 rapido
npm run test:02:fast       # Caso 02 rapido
```

### k6 (rendimiento local)

```powershell
npm run k6:01:local -- --cantidad=2
npm run k6:02:local -- --cantidad=2
```

### k6 (rendimiento Grafana Cloud)

```powershell
npm run k6:01:cloud -- --cantidad=2
```

### Postman/Newman (API)

```powershell
npm run api:test:caso01
npm run api:test:all
```

### SonarQube (calidad de codigo)

```powershell
docker compose -f sonar/docker-compose.yml up -d
# Esperar 60s a que arranque
npm run test:sonar:repos
```

### OWASP ZAP (seguridad DAST)

```powershell
npm run report:owasp:dated
```

### Seguridad adicional

```powershell
npm run test:security:gitleaks
npm run test:security:semgrep
npm run test:security:trivy
npm run test:security:dependency-check
```

---

## 7. Reportes

| Herramienta | Comando reporte | Ubicacion salida |
| ------------- | ---------------- | ----------------- |
| Playwright HTML | `npm run report:html` | `playwright-report/` |
| Allure | `npm run report:allure:generate && npm run report:allure:open` | `allure-report/` |
| k6 JSON | Automatico en runner | `reportes/k6-*-summary.json` |
| Newman | Automatico | `reportes/newman/` |
| SonarQube | `npm run report:sonar:local` | `reportes/security/sonar/` |
| OWASP | `npm run report:owasp:dated` | `reportes/security/owasp/` |

---

## 8. Docker: servicios necesarios

SonarQube:

```powershell
docker compose -f sonar/docker-compose.yml up -d
```

OWASP ZAP:

```powershell
# Se ejecuta automaticamente via npm run report:owasp:dated
```

Verificar Docker:

```powershell
docker ps   # Debe mostrar contenedores activos
```

---

## 9. Extensiones recomendadas VS Code

- Playwright Test for VSCode
- ESLint
- PowerShell
- Docker
- YAML
- SonarLint
- GitLens

---

## 10. Troubleshooting comun

| Problema | Solucion |
| ---------- | --------- |
| `Cannot find module @playwright/test` | `npm ci` |
| PowerShell Restricted policy | Usar `pwsh` (PS 7) o `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Docker not running | Iniciar Docker Desktop, verificar WSL2 |
| k6 command not found | Instalar k6: `winget install grafana.k6` |
| SonarQube 401 | Regenerar token en <http://localhost:9000> > My Account > Security |
| Playwright timeout | Verificar `REGINSA_URL` en `.env` apunte a ambiente accesible |
| Nuclei no ejecuta | `powershell -ExecutionPolicy Bypass -File scripts/security/run-nuclei.ps1 -Target <https://reginsaqa.sunedu.gob.pe>` |

```text

## 7. Troubleshooting Windows

Node-gyp o permisos:

- Ejecutar terminal como usuario normal (no admin) y limpiar cache npm.

Docker no responde:

- Verificar Docker Desktop encendido y engine Linux activo.

Playwright falla por navegador:

- Reinstalar browser: npx playwright install chromium.

Errores TLS/API internos:

- Validar REGINSA_API_BASE y credenciales en .env.

k6 cloud no publica:

- Revisar K6_CLOUD_PROJECT_ID y K6_CLOUD_TOKEN.

## 8. Buenas practicas

- Probar local antes de pipeline.
- No versionar reportes/logs generados.
- Mantener solo estructura de carpetas de reportes con .gitkeep.
