# Guía operativa: subir a 2 repos y ejecutar GitHub Actions

## 1) Objetivo

Con el mismo código local, publicar en:

- Repo personal (completo).
- Repo profesional SUNEDU (mínimo profesional).

Y ejecutar manualmente el workflow funcional cambiando cantidades por corrida.

---

## 2) Workflow que debes usar para funcionales

Workflow principal:

- `.github/workflows/reginsa-funcional.yml`

Los parámetros de cantidad se cambian aquí (workflow_dispatch):

- `workers`
- `repeat_each`
- `pool_target`

Guía visual paso a paso:

- `docs/GUIA_EJECUCION_PIPELINES_PASO_A_PASO.md`

---

## 3) Subida a 2 repos (mismo código)

Importante:

- No incluir cambios de `playwrigth/` (carpeta en retiro).

### 3.1 Verifica remotos actuales

```bash
git remote -v
```

### 3.2 Configura remotos (una sola vez)

Si hoy tienes solo `origin` apuntando al repo personal:

```bash
git remote rename origin personal
git remote add sunedu https://github.com/lizvidal746-afk/SUNEDU_REGINSA_QA.git
```

Referencia de URLs:

- Personal: `https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL.git`
- SUNEDU: `https://github.com/lizvidal746-afk/SUNEDU_REGINSA_QA.git`

Si partes desde cero y aún no tienes remotos configurados:

```bash
git remote add personal https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL.git
git remote add sunedu https://github.com/lizvidal746-afk/SUNEDU_REGINSA_QA.git
```

Si ya existen ambos remotos, omite este paso.

### 3.3 Commit local (excluyendo `playwrigth/`)

```bash
git add -A -- ':!playwrigth/**'
git commit -m "qa: pipeline funcional listo + guia operativa"
```

Si por error agregaste archivos de `playwrigth/`, limpia staging así:

```bash
git restore --staged playwrigth/
```

### 3.4 Push al repo personal

```bash
git push personal HEAD:main
```

### 3.5 Push al repo SUNEDU

```bash
git push sunedu HEAD:main
```

### 3.6 Para tus próximos cambios (flujo recomendado)

```bash
git add -A -- ':!playwrigth/**'
git status
git commit -m "feat|fix|docs: descripcion corta"
git push personal HEAD:main
git push sunedu HEAD:main
```

Tip: usa `git status` antes de cada commit para validar que no aparezca nada bajo `playwrigth/`.

---

## 4) Cómo ejecutar en GitHub Actions (cada repo)

Repite estos pasos en ambos repos GitHub.

1. Entra al repositorio en GitHub.
2. Abre pestaña **Actions**.
3. Selecciona **REGINSA Functional Scale**.
4. Clic en **Run workflow**.
5. Elige rama (`main`).
6. Completa inputs:
    - `workers`
    - `repeat_each`
    - `pool_target`

7. Ejecuta con **Run workflow**.
8. Revisa el run y descarga artifacts al finalizar.

Artifacts esperados:

- `playwright-report`
- `allure-report`
- `allure-results`
- `test-results`
- `reportes`

---

## 5) Dónde cambiar la cantidad que quieres ejecutar

Tienes 2 formas válidas:

### Opción A: cambiar en cada ejecución (recomendada)

En **Run workflow** llenas:

- `workers`
- `repeat_each`
- `pool_target`

### Opción B: cambiar valores por defecto del YAML

Edita en `.github/workflows/reginsa-funcional.yml` los `default` de:

- `workers`
- `repeat_each`
- `pool_target`

Esto cambia el valor inicial que aparece en la UI de GitHub Actions.

---

## 6) Valores sugeridos por volumen

Regla recomendada:

`POOL_TARGET = workers * repeat_each * 6`

Ejemplos prácticos:

- 10: `workers=6`, `repeat_each=10`, `pool_target=360`
- 30: `workers=6`, `repeat_each=30`, `pool_target=1080`
- 50: `workers=6`, `repeat_each=50`, `pool_target=1800`
- 100: `workers=6`, `repeat_each=100`, `pool_target=3600`
- 200: `workers=6`, `repeat_each=200`, `pool_target=7200`

---

## 7) Secrets obligatorios en cada repo GitHub

En **Settings > Secrets and variables > Actions**, configura en ambos repos:

- `REGINSA_URL`
- `REGINSA_USER_1` ... `REGINSA_USER_6`
- `REGINSA_PASS_1` ... `REGINSA_PASS_6`

Si falta alguno, el workflow fallará al ejecutar pruebas.

---

## 8) Lectura de resultado en CI

El pipeline aplica esta política:

- `failed > 0`: run en rojo (falla).
- `flaky > 0` y `failed = 0`: warning (no bloquea).

Evaluación automática con:

```bash
node scripts/evaluate-playwright-results.js
```

---

## 9) Azure DevOps (cuando corresponda)

Archivo usado:

- `azure-pipelines.yml`

Variables mínimas:

- `REGINSA_URL`
- `REGINSA_USER_1..6`
- `REGINSA_PASS_1..6`
- `POOL_TARGET`
- `PW_WORKERS`
- `PW_REPEAT_EACH`

Pasos:

1. Azure DevOps > Pipelines > New pipeline.
2. Conectar repositorio.
3. Seleccionar YAML existente: `azure-pipelines.yml`.
4. Ejecutar run.

---

## 10) Reinicio de base/pool antes de campañas

Reinicio completo recomendado:

```bash
npm run base:reiniciar-completo
```

Reconstruir pool base manualmente cuando lo decidas:

```bash
npm run pool:reset-base
```

---

## 11) Bitácora de publicación (qué se hace antes de subir)

Objetivo de esta bitácora:

- Dejar trazabilidad de cada publicación a `personal` y `sunedu`.

Plantilla para cada subida:

1. Fecha y hora.
2. Alcance del cambio (ejemplo: migración Caso 02).
3. Validación local ejecutada.
4. Commit enviado.
5. Resultado push en `personal`.
6. Resultado push en `sunedu`.
7. Estado de ejecución en GitHub Actions.

Ejemplo:

- Fecha: 2026-02-20 18:30
- Alcance: ajuste pipeline funcional + documentación de subida
- Validación local: `npm run test:01:fast -- --workers=5 --repeat-each=5 --project=chromium --list`
- Commit: `docs: actualizar guia operativa de subida`
- Push personal: ok
- Push sunedu: ok
- Actions: workflow ejecutado manualmente con `workers=6`, `repeat_each=10`, `pool_target=1200`

Registro real ejecutado:

- Fecha: 2026-02-20
- Alcance: bootstrap inicial de repositorios vacíos (`REGINSAQA_LIZVIDAL` y `SUNEDU_REGINSA_QA`)
- Validación local: `npm run test:01:fast -- --workers=5 --repeat-each=5 --project=chromium --list`
- Commit: `3aade54` — `chore: bootstrap pipeline reginsa`
- Push personal: ok (`main -> main`)
- Push sunedu: ok (`main -> main`)
- Nota: `playwrigth/` quedó fuera del commit (untracked)

---

## 12) Checklist previo al push (rápido)

```bash
git status
git add -A -- ':!playwrigth/**'
git status
git commit -m "feat|fix|docs: descripcion corta"
git push personal HEAD:main
git push sunedu HEAD:main
```

Regla:

- Si `git status` muestra cambios bajo `playwrigth/`, no publicar hasta excluirlos del staging.

---

## 13) Scripts paso a paso (PowerShell) — repos vacíos

Ejecutar en la raíz de `REGINSA`.

### 13.1 Primer push (bootstrap inicial)

```powershell
Set-Location "D:\SUNEDU\AUTOMATIZACION\REGINSA"

if (-not (Test-Path ".git")) {
git init
}

git branch -M main

git remote remove personal 2>$null
git remote remove sunedu 2>$null

git remote add personal https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL.git
git remote add sunedu https://github.com/lizvidal746-afk/SUNEDU_REGINSA_QA.git

git add -A -- ':!playwrigth/**'
git status
git commit -m "chore: bootstrap pipeline reginsa"

git push -u personal main
git push -u sunedu main
```

### 13.2 Publicaciones siguientes

```powershell
Set-Location "D:\SUNEDU\AUTOMATIZACION\REGINSA"

git add -A -- ':!playwrigth/**'
git status
git commit -m "feat|fix|docs: descripcion corta"

git push personal HEAD:main
git push sunedu HEAD:main
```

---

## 14) Scripts paso a paso (CMD) — repos vacíos

### 14.1 Primer push (bootstrap inicial)

```cmd
cd /d D:\SUNEDU\AUTOMATIZACION\REGINSA

if not exist .git git init
git branch -M main

git remote remove personal
git remote remove sunedu

git remote add personal https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL.git
git remote add sunedu https://github.com/lizvidal746-afk/SUNEDU_REGINSA_QA.git

git add -A -- ':!playwrigth/**'
git status
git commit -m "chore: bootstrap pipeline reginsa"

git push -u personal main
git push -u sunedu main
```

### 14.2 Publicaciones siguientes

```cmd
cd /d D:\SUNEDU\AUTOMATIZACION\REGINSA
git add -A -- ':!playwrigth/**'
git status
git commit -m "feat|fix|docs: descripcion corta"
git push personal HEAD:main
git push sunedu HEAD:main
```

---

## 15) Después del push: dónde poner cantidades en el pipeline

En GitHub Actions (UI):

1. Repositorio > **Actions**.
2. Workflow **REGINSA Functional Scale**.
3. **Run workflow**.
4. Completar inputs:
    - `workers`
    - `repeat_each`
    - `pool_target`

5. Ejecutar.

Ejemplos por corrida:

- 10 registros: `workers=6`, `repeat_each=10`, `pool_target=360`
- 30 registros: `workers=6`, `repeat_each=30`, `pool_target=1080`
- 50 registros: `workers=6`, `repeat_each=50`, `pool_target=1800`
