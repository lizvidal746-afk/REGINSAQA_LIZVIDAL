# ─────────────────────────────────────────────────────────────
# Modulo compartido REGINSA QA — scripts/common/functions.psm1
# Uso: Import-Module "$PSScriptRoot/../common/functions.psm1" -Force
# ─────────────────────────────────────────────────────────────
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Logging ──────────────────────────────────────────────────

function Write-Step {
  param([string]$Message)
  Write-Host "`n===== $Message =====" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
  param([string]$Message)
  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Fail {
  param([string]$Message)
  Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Write-Info {
  param([string]$Message)
  Write-Host "[INFO] $Message" -ForegroundColor Gray
}

# ── Filesystem ───────────────────────────────────────────────

function Assert-PathExists {
  param(
    [Parameter(Mandatory)][string]$Path,
    [string]$Message
  )
  if (-not (Test-Path -Path $Path)) {
    $msg = if ($Message) { $Message } else { "Ruta no encontrada: $Path" }
    throw $msg
  }
}

function New-DirectoryIfMissing {
  param([Parameter(Mandatory)][string]$Path)
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Get-ProjectRoot {
  $candidate = $PSScriptRoot
  while ($candidate -and -not (Test-Path (Join-Path $candidate 'package.json'))) {
    $candidate = Split-Path $candidate -Parent
  }
  if (-not $candidate) { throw "No se encontro package.json en la jerarquia." }
  return $candidate
}

# ── Prereqs ──────────────────────────────────────────────────

function Assert-CommandExists {
  param([Parameter(Mandatory)][string]$Command, [string]$InstallHint)
  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    $hint = if ($InstallHint) { " Instalar: $InstallHint" } else { '' }
    throw "Comando no disponible: $Command.$hint"
  }
}

function Assert-DockerRunning {
  Assert-CommandExists 'docker' 'https://docs.docker.com/get-docker/'
  try {
    docker info 2>&1 | Out-Null
  } catch {
    throw "Docker no esta respondiendo. Asegurate de que Docker Desktop este iniciado."
  }
}

function Assert-NodeVersion {
  param([int]$MinMajor = 20)
  Assert-CommandExists 'node'
  $ver = (node --version) -replace '^v', ''
  $major = [int]($ver.Split('.')[0])
  if ($major -lt $MinMajor) {
    throw "Se requiere Node.js >= $MinMajor. Version actual: $ver"
  }
  Write-Info "Node.js $ver detectado."
}

function Assert-K6Available {
  Assert-CommandExists 'k6' 'https://grafana.com/docs/k6/latest/set-up/install-k6/'
  $ver = (k6 version 2>&1) -replace '^k6\s+', ''
  Write-Info "k6 $ver detectado."
}

# ── Docker helpers ───────────────────────────────────────────

function Invoke-DockerRun {
  param(
    [Parameter(Mandatory)][string]$Image,
    [string[]]$Args,
    [string]$WorkDir = '/work',
    [string]$HostDir,
    [switch]$RemoveAfter
  )
  Assert-DockerRunning
  if (-not $HostDir) { $HostDir = Get-ProjectRoot }

  $dockerArgs = @('run')
  if ($RemoveAfter) { $dockerArgs += '--rm' }
  $dockerArgs += @('-v', "${HostDir}:${WorkDir}", '-w', $WorkDir)
  $dockerArgs += $Args
  $dockerArgs += $Image

  Write-Info "docker $($dockerArgs -join ' ')"
  & docker @dockerArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Docker run fallo con codigo $LASTEXITCODE (imagen: $Image)"
  }
}

# ── Environment ──────────────────────────────────────────────

function Import-EnvFile {
  param([string]$Path)
  if (-not $Path) { $Path = Join-Path (Get-ProjectRoot) '.env' }
  if (-not (Test-Path $Path)) {
    Write-Warn ".env no encontrado en $Path, continuando sin el."
    return
  }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line -match '^([^=]+)=(.*)$') {
      $key = $Matches[1].Trim()
      $val = $Matches[2].Trim()
      if (-not [Environment]::GetEnvironmentVariable($key)) {
        [Environment]::SetEnvironmentVariable($key, $val, 'Process')
      }
    }
  }
  Write-Info "Variables cargadas desde $Path"
}

function Get-EnvOrDefault {
  param(
    [Parameter(Mandatory)][string]$Name,
    [string]$Default = ''
  )
  $val = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($val)) { return $Default }
  return $val
}

# ── Reporting ────────────────────────────────────────────────

function Get-TimestampSuffix {
  return (Get-Date -Format 'yyyy-MM-dd_HH-mm-ss')
}

function Get-DateSuffix {
  return (Get-Date -Format 'yyyy-MM-dd')
}

function New-ReportDirectory {
  param([Parameter(Mandatory)][string]$SubFolder)
  $root = Get-ProjectRoot
  $dir = Join-Path $root "reportes" $SubFolder
  New-DirectoryIfMissing $dir
  return $dir
}

# ── Exports ──────────────────────────────────────────────────

Export-ModuleMember -Function @(
  'Write-Step', 'Write-Ok', 'Write-Warn', 'Write-Fail', 'Write-Info',
  'Assert-PathExists', 'New-DirectoryIfMissing', 'Get-ProjectRoot',
  'Assert-CommandExists', 'Assert-DockerRunning', 'Assert-NodeVersion', 'Assert-K6Available',
  'Invoke-DockerRun',
  'Import-EnvFile', 'Get-EnvOrDefault',
  'Get-TimestampSuffix', 'Get-DateSuffix', 'New-ReportDirectory'
)
