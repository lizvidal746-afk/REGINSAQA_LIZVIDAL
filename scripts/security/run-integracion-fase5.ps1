#Requires -Version 7
<#
.SYNOPSIS
  Orquestador Phase 5 — n8n + DefectDojo.
  Arranca servicios, importa hallazgos a DefectDojo y dispara notificacion en n8n.

.PARAMETER Date
  Fecha del escaneo YYYY-MM-DD. Por defecto hoy.

.PARAMETER SkipStart
  Si se pasa, no intenta arrancar los contenedores Docker.

.PARAMETER MinSeveridad
  Nivel minimo de severidad para disparar alerta n8n. Por defecto ALTO.

.PARAMETER Canal
  Canal de notificacion: teams | slack | email. Por defecto teams.

.PARAMETER DojoPassword
  Contrasena de DefectDojo admin. Lee $env:DOJO_PASSWORD si no se especifica.

.EXAMPLE
  pwsh -File scripts/security/run-integracion-fase5.ps1 -Date 2026-05-04
  pwsh -File scripts/security/run-integracion-fase5.ps1 -SkipStart -MinSeveridad CRITICO
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute(
  'PSAvoidUsingPlainTextForPassword', 'DojoPassword',
  Justification = 'Valor proviene de variable de entorno controlada DOJO_PASSWORD; se convierte a SecureString antes de pasarlo al script invocado.')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute(
  'PSAvoidUsingConvertToSecureStringWithPlainText', '',
  Justification = 'Conversion necesaria para invocar enviar-a-defectdojo.ps1 que requiere SecureString. Origen del valor es env var local.')]
param(
  [string]$Date         = (Get-Date -Format 'yyyy-MM-dd'),
  [switch]$SkipStart,
  [ValidateSet('CRITICO','ALTO','MEDIO')]
  [string]$MinSeveridad = 'ALTO',
  [string]$Canal        = 'teams',
  [string]$DojoPassword = $env:DOJO_PASSWORD,
  [string]$N8nUrl       = 'http://localhost:5678',
  [string]$DojoUrl      = 'http://localhost:8080'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

if ([string]::IsNullOrWhiteSpace($DojoPassword)) {
  Write-Host "ERROR: Define DOJO_PASSWORD en el entorno o pasalo con -DojoPassword." -ForegroundColor Red
  exit 1
}

$composeFile = Join-Path $PSScriptRoot "..\..\docker\n8n-defectdojo\docker-compose.yml"
$composeFile = [System.IO.Path]::GetFullPath($composeFile)
$scriptsDir  = $PSScriptRoot

function Write-Title { param([string]$m) Write-Host "`n$m" -ForegroundColor Cyan }
function Write-Step  { param([string]$m) Write-Host "  >> $m" -ForegroundColor Cyan }
function Write-Ok    { param([string]$m) Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn  { param([string]$m) Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Write-Fail  { param([string]$m) Write-Host "  [FAIL] $m" -ForegroundColor Red }

function Wait-ForService {
  param([string]$Url, [string]$Nombre, [int]$MaxTries = 30, [int]$Delay = 10)
  $tries = 0
  do {
    $tries++
    try {
      $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
      if ($r.StatusCode -lt 500) { Write-Ok "$Nombre disponible ($Url)"; return $true }
    } catch { Write-Verbose "Intento $tries fallido para $Nombre`: $_" }
    Write-Host "  Esperando $Nombre... ($tries/$MaxTries)" -ForegroundColor DarkGray
    Start-Sleep -Seconds $Delay
  } while ($tries -lt $MaxTries)
  Write-Warn "$Nombre no respondio en tiempo ($($MaxTries * $Delay)s)"
  return $false
}

# ──────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "======================================================" -ForegroundColor Magenta
Write-Host "  REGINSA Phase 5 — n8n + DefectDojo Integration" -ForegroundColor Magenta
Write-Host "  Fecha: $Date  |  Alerta: >= $MinSeveridad  |  Canal: $Canal" -ForegroundColor Magenta
Write-Host "======================================================" -ForegroundColor Magenta

# ── PASO 1: Arrancar contenedores ─────────────────────────────────────────
if (-not $SkipStart) {
  Write-Title "PASO 1: Arrancar n8n + DefectDojo"
  if (-not (Test-Path $composeFile)) {
    Write-Fail "No se encontro docker-compose.yml en: $composeFile"
    exit 1
  }
  Write-Step "docker compose up -d"
  docker compose -f $composeFile up -d 2>&1 | ForEach-Object { Write-Host "    $_" }

  Write-Title "PASO 1b: Esperar servicios listos"
  $null   = Wait-ForService -Url "$N8nUrl/healthz"       -Nombre "n8n"       -MaxTries 20 -Delay 8
  $dojoOk = Wait-ForService -Url "$DojoUrl/api/v2/users/" -Nombre "DefectDojo" -MaxTries 40 -Delay 10

  if (-not $dojoOk) {
    Write-Warn "DefectDojo aun no esta listo. Continua con -SkipStart para omitir la espera."
  }
} else {
  Write-Title "PASO 1: Saltado (SkipStart)"
  Write-Warn "Se asume que n8n ($N8nUrl) y DefectDojo ($DojoUrl) ya estan corriendo."
}

# ── PASO 2: Importar scans a DefectDojo ───────────────────────────────────
Write-Title "PASO 2: Importar hallazgos a DefectDojo"
$dojoScript = Join-Path $scriptsDir "enviar-a-defectdojo.ps1"
if (Test-Path $dojoScript) {
  $secureDojoPwd = ConvertTo-SecureString $DojoPassword -AsPlainText -Force
  & pwsh -NoProfile -ExecutionPolicy Bypass -File $dojoScript `
    -DojoUrl $DojoUrl `
    -DojoUser "admin" `
    -DojoPassword $secureDojoPwd `
    -Date $Date
} else {
  Write-Warn "No se encontro enviar-a-defectdojo.ps1"
}

# ── PASO 3: Notificar a n8n ───────────────────────────────────────────────
Write-Title "PASO 3: Notificar a n8n"
$n8nScript = Join-Path $scriptsDir "notificar-criticos-n8n.ps1"
if (Test-Path $n8nScript) {
  & pwsh -NoProfile -ExecutionPolicy Bypass -File $n8nScript `
    -N8nUrl $N8nUrl `
    -Date $Date `
    -MinSeveridad $MinSeveridad `
    -Canal $Canal
} else {
  Write-Warn "No se encontro notificar-criticos-n8n.ps1"
}

# ── RESUMEN FINAL ────────────────────────────────────────────────────────
Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  Phase 5 completada" -ForegroundColor Green
Write-Host "  n8n       : $N8nUrl  (credenciales desde variables de entorno)" -ForegroundColor White
Write-Host "  DefectDojo: $DojoUrl  (credenciales desde variables de entorno)" -ForegroundColor White
Write-Host ""
Write-Host "  Proximos pasos:" -ForegroundColor Cyan
Write-Host "  1. Importar el workflow en n8n:" -ForegroundColor White
Write-Host "     $N8nUrl  -> Settings -> Import Workflow" -ForegroundColor DarkGray
Write-Host "     Archivo: docker\n8n-defectdojo\workflow-seguridad-reginsa.json" -ForegroundColor DarkGray
Write-Host "  2. Configurar webhook de notificacion (Teams/Slack) en n8n" -ForegroundColor White
Write-Host "  3. Para re-ejecutar solo la notificacion:" -ForegroundColor White
Write-Host "     npm run security:notificar -- -Date $Date" -ForegroundColor DarkGray
Write-Host "======================================================" -ForegroundColor Green
