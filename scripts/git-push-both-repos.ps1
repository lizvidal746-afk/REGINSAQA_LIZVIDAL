param(
  [string]$Branch = 'main',
  [string]$CommitMessage = 'chore: sync cambios REGINSA QA',
  [switch]$PushPersonalOnly,
  [switch]$PushSuneduOnly
)

$ErrorActionPreference = 'Stop'

$personalUrl = 'https://github.com/lizvidal746-afk/REGINSAQA_LIZVIDAL.git'
$suneduUrl = 'https://github.com/lizvidal746-afk/SUNEDU_REGINSA_QA.git'

function Set-RemoteUrl {
  param(
    [string]$Name,
    [string]$Url
  )

  $exists = git remote | Where-Object { $_ -eq $Name }
  if ($exists) {
    git remote set-url $Name $Url | Out-Null
  } else {
    git remote add $Name $Url | Out-Null
  }
}

Write-Host 'Validando repositorio git...' -ForegroundColor Cyan
$repoRoot = git rev-parse --show-toplevel
if (-not $repoRoot) {
  throw 'No se detectó repositorio git en la carpeta actual.'
}

Set-RemoteUrl -Name 'personal' -Url $personalUrl
Set-RemoteUrl -Name 'sunedu' -Url $suneduUrl

Write-Host 'Estado actual:' -ForegroundColor Cyan
git status --short

Write-Host 'Agregando cambios...' -ForegroundColor Cyan
git add -A

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host 'No hay cambios para commit. Solo se intentará push.' -ForegroundColor Yellow
} else {
  Write-Host "Creando commit: $CommitMessage" -ForegroundColor Cyan
  git commit -m "$CommitMessage"
}

if (-not $PushSuneduOnly) {
  Write-Host "Push a remoto personal (branch: $Branch)..." -ForegroundColor Green
  git push personal HEAD:$Branch
}

if (-not $PushPersonalOnly) {
  Write-Host "Push a remoto SUNEDU (branch: $Branch)..." -ForegroundColor Green
  git push sunedu HEAD:$Branch
}

Write-Host 'Proceso completado.' -ForegroundColor Green
