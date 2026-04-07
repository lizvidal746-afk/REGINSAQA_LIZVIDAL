# Setup REGINSA en macOS

Guia completa para configurar el framework QA REGINSA en macOS (Intel o Apple Silicon).

---

## 1. Pre-requisitos (todos gratuitos)

| Software | Version minima | Instalacion |
| ---------- | --------------- | ------------- |
| macOS | 13 Ventura+ | - |
| Homebrew | Ultima | `/bin/bash -c "$(curl -fsSL <https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh>)"` |
| Node.js | 20 LTS | `brew install node@20` |
| Git | 2.40+ | `brew install git` |
| Docker Desktop | 4.25+ | `brew install --cask docker` |
| PowerShell 7 | 7.4+ | `brew install powershell/tap/powershell` |
| k6 | 0.50+ | `brew install k6` |
| VS Code | Ultima | `brew install --cask visual-studio-code` |

### Verificacion rapida

```bash
node -v          # v20.x.x
npm -v           # 10.x.x
git --version    # 2.4x.x
docker --version # Docker version 2x.x.x
pwsh --version   # PowerShell 7.x.x
k6 version       # k6 v0.5x.x
```

---

## 2. Clonar proyecto

```bash
cd ~/workspace
git clone https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL.git REGINSA
cd REGINSA
npm ci
npx playwright install chromium
```

---

## 3. Variables de entorno

```bash
cp .env.example .env
cp .env.k6.example .env.k6.local
```

Editar `.env` con credenciales reales. Ver `.env.example` para referencia completa.

---

## 4. Diferencias clave con Windows

| Aspecto | Windows | macOS |
| --------- | --------- | ------- |
| Rutas | `D:\SUNEDU\...` | `~/workspace/...` |
| Shell principal | `cmd` / PowerShell 5.1 | `zsh` / `bash` |
| Scripts .ps1 | `powershell -File ...` | `pwsh -File ...` |
| Docker paths | `${PWD}` | `$(pwd)` |
| Separador PATH | `;` | `:` |

---

## 5. Primera ejecucion por herramienta

### Playwright (funcional)

```bash
npm run test:01:fast
npm run test:02:fast
```

### k6 (rendimiento local)

```bash
npm run k6:01:local -- --cantidad=2
npm run k6:02:local -- --cantidad=2
```

### k6 (Grafana Cloud)

```bash
npm run k6:01:cloud -- --cantidad=2
```

### Postman/Newman (API)

```bash
npm run api:test:caso01
npm run api:test:all
```

### SonarQube (calidad de codigo)

```bash
docker compose -f sonar/docker-compose.yml up -d
npm run test:sonar:repos
```

### Seguridad

```bash
npm run report:owasp:dated
npm run test:security:gitleaks
npm run test:security:trivy
```

---

## 6. Ejecutar scripts PowerShell en macOS

Los runners (.ps1) funcionan con `pwsh`:

```bash
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/run-caso01-local.ps1 -Mode k6 -K6Output local -K6Cantidad 2
```

Scripts de seguridad:

```bash
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/security/run-nuclei.ps1
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/security/run-trivy.ps1
```

---

## 7. Tips de compatibilidad

- En CI Linux/macOS usar `pwsh` para scripts PowerShell, nunca `powershell`.
- Rutas: usar `/` como separador. Los scripts .ps1 del proyecto usan `Join-Path` que es cross-platform.
- Docker Desktop: asegurar que el daemon este corriendo antes de ejecutar tests de seguridad.
- Para pools de credenciales: las variables de entorno funcionan igual con `export VAR=value`.
