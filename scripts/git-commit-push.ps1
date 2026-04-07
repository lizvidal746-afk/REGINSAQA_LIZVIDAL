<#
.SYNOPSIS
  Commit y push de todos los cambios del proyecto REGINSA QA al repositorio GitHub.
  Excluye archivos sensibles (credenciales, .env, storageState temporal).

.USAGE
  pwsh scripts/git-commit-push.ps1
  pwsh scripts/git-commit-push.ps1 -Remote "https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL.git"
#>

param(
  [string]$Remote  = "https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL.git",
  [string]$Branch  = "main",
  [string]$Mensaje = "feat: Postman audit fixes, Newman pool sharing, IP prefix k6 labels, analisis herramientas ISTQB [$(Get-Date -Format 'yyyy-MM-dd')]"
)

$Repo = "D:\SUNEDU\AUTOMATIZACION\REGINSA"
Set-Location $Repo

Write-Host "`n=== REGINSA QA — Commit & Push ===" -ForegroundColor Cyan

# ─── 1. Escribir .gitignore limpio en UTF-8 ───────────────────────────────
Write-Host "`n[1/6] Actualizando .gitignore..." -ForegroundColor Yellow
$gitignoreContent = @"
node_modules/
playwright-report/
test-results/
allure-results/
allure-report/

# Archivos con credenciales reales — NUNCA subir al repositorio
credentials-temp.txt
test-env.txt
pasos-limpieza-git.txt
.env
.env.k6.local
reportes/.grafana-secrets.json

# Archivos temporales de ejecucion
.tmp-*.log
.tmp-*.exit
.scannerwork/

# Build outputs
dist/
build/
**/*.js.map
"@
[System.IO.File]::WriteAllText("$Repo\.gitignore", $gitignoreContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "  [OK] .gitignore actualizado (UTF-8, sin BOM)" -ForegroundColor Green

# ─── 2. Configurar identidad git si no está ────────────────────────────────
Write-Host "`n[2/6] Verificando identidad git..." -ForegroundColor Yellow
$gitUser  = git config user.name  2>$null
$gitEmail = git config user.email 2>$null
if (-not $gitUser)  { git config user.name  "REGINSA QA" }
if (-not $gitEmail) { git config user.email "qa@reginsa.sunedu.gob.pe" }
Write-Host "  [OK] user.name=$($gitUser  -or 'REGINSA QA') / user.email=$($gitEmail -or 'qa@reginsa.sunedu.gob.pe')" -ForegroundColor Green

# ─── 3. Configurar remote ──────────────────────────────────────────────────
Write-Host "`n[3/6] Configurando remote '$Remote'..." -ForegroundColor Yellow
$currentRemote = git remote get-url origin 2>$null
if ($currentRemote -ne $Remote) {
  if ($currentRemote) {
    git remote set-url origin $Remote
    Write-Host "  [OK] Remote origin actualizado: $Remote" -ForegroundColor Green
  } else {
    git remote add origin $Remote
    Write-Host "  [OK] Remote origin agregado: $Remote" -ForegroundColor Green
  }
} else {
  Write-Host "  [OK] Remote origin ya correcto: $Remote" -ForegroundColor Green
}

# ─── 4. Quitar del índice archivos sensibles si estaban trackeados ─────────
Write-Host "`n[4/6] Removiendo archivos sensibles del índice (si estaban trackeados)..." -ForegroundColor Yellow
$sensibles = @("credentials-temp.txt","test-env.txt","pasos-limpieza-git.txt",".env",".env.k6.local","reportes/.grafana-secrets.json")
foreach ($f in $sensibles) {
  $tracked = git ls-files --error-unmatch $f 2>$null
  if ($LASTEXITCODE -eq 0) {
    git rm --cached $f 2>$null | Out-Null
    Write-Host "  [REMOVIDO] $f del índice git" -ForegroundColor DarkYellow
  }
}
Write-Host "  [OK] Archivos sensibles excluidos" -ForegroundColor Green

# ─── 5. Stage y commit ─────────────────────────────────────────────────────
Write-Host "`n[5/6] Staged y commit..." -ForegroundColor Yellow
git add .
$staged = git diff --cached --stat
if (-not $staged) {
  Write-Host "  [INFO] No hay cambios staged para commitear. El repositorio ya está al día." -ForegroundColor Cyan
} else {
  Write-Host $staged
  git commit -m $Mensaje
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Commit realizado" -ForegroundColor Green
  } else {
    Write-Host "  [ERROR] Fallo el commit" -ForegroundColor Red
    exit 1
  }
}

# ─── 6. Push ───────────────────────────────────────────────────────────────
Write-Host "`n[6/6] Push a $Remote ($Branch)..." -ForegroundColor Yellow
git push origin $Branch --set-upstream 2>&1
if ($LASTEXITCODE -eq 0) {
  Write-Host "  [OK] Push exitoso" -ForegroundColor Green
} else {
  Write-Host "  [WARN] Push normal falló. Intentando con --force-with-lease como fallback..." -ForegroundColor DarkYellow
  git push origin $Branch --force-with-lease 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Push con force-with-lease exitoso" -ForegroundColor Green
  } else {
    Write-Host "  [ERROR] Push fallido. Verifica tus credenciales GitHub (token PAT)." -ForegroundColor Red
    Write-Host "  TIP: Ejecuta 'git credential-manager store' o configura un Personal Access Token." -ForegroundColor DarkGray
    exit 1
  }
}

Write-Host "`n=== Commit y Push completados ===" -ForegroundColor Cyan
Write-Host "Repositorio: $Remote" -ForegroundColor Gray
git log --oneline -3
