<#
.SYNOPSIS
    Mantiene Ollama y sus modelos siempre actualizados.

.DESCRIPTION
    1. Actualiza el binario de Ollama via winget.
    2. Lee scripts/ai/models-catalog.json.
    3. Hace 'ollama pull' a cada modelo recomendado (descarga solo deltas).
    4. Reporta modelos candidatos no instalados como sugerencia.

.EXAMPLE
    npm run ai:update
    pwsh scripts/ai/update-ollama.ps1 -InstallCandidates
#>
[CmdletBinding()]
param(
    [switch]$SkipBinary,
    [switch]$InstallCandidates
)

Set-StrictMode -Off
$ErrorActionPreference = 'Continue'

$Catalog = Join-Path $PSScriptRoot 'models-catalog.json'

Write-Host "`n=== MANTENIMIENTO OLLAMA ===" -ForegroundColor Magenta

# 1. Actualizar binario
if (-not $SkipBinary) {
    Write-Host "`n[1/3] Actualizando binario Ollama via winget..." -ForegroundColor Cyan
    try {
        winget upgrade --id Ollama.Ollama --silent --accept-package-agreements --accept-source-agreements
        Write-Host "  [OK] Binario al dia" -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] No se pudo actualizar via winget: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "  Sugerencia: descargar manualmente https://ollama.com/download" -ForegroundColor Yellow
    }
}

# 2. Verificar que ollama responde
Write-Host "`n[2/3] Verificando servicio Ollama..." -ForegroundColor Cyan
try {
    $null = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5
    Write-Host "  [OK] Ollama responde en localhost:11434" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Ollama no responde. Inicia el servicio con: ollama serve" -ForegroundColor Red
    exit 1
}

# 3. Leer catalogo
if (-not (Test-Path $Catalog)) { Write-Host "  [ERROR] No existe $Catalog" -ForegroundColor Red; exit 1 }
$cat = Get-Content $Catalog -Raw -Encoding UTF8 | ConvertFrom-Json

# Obtener modelos instalados
$installedRaw = & ollama list 2>$null
$installed = @()
foreach ($line in ($installedRaw | Select-Object -Skip 1)) {
    $name = ($line -split '\s+')[0]
    if ($name) { $installed += $name }
}

Write-Host "`n[3/3] Sincronizando modelos recomendados..." -ForegroundColor Cyan
Write-Host "  Catalogo revisado: $($cat.ultima_revision)" -ForegroundColor DarkGray
Write-Host "  Politica: $($cat.politica)" -ForegroundColor DarkGray

foreach ($m in $cat.recomendados) {
    if (-not $m.instalar) { continue }
    $tag = if ($installed -contains $m.name) { '[ACTUALIZAR]' } else { '[INSTALAR]  ' }
    Write-Host "`n  $tag $($m.name) - $($m.uso) ($($m.tamano_gb) GB)" -ForegroundColor Yellow
    & ollama pull $m.name
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] $($m.name) listo" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Fallo al descargar $($m.name)" -ForegroundColor Yellow
    }
}

# 4. Avisar candidatos
$noInstalados = @($cat.candidatos_futuros | Where-Object { $installed -notcontains $_.name })
if ($noInstalados.Count -gt 0) {
    Write-Host "`n=== MODELOS CANDIDATOS DISPONIBLES (no instalados) ===" -ForegroundColor Magenta
    foreach ($m in $noInstalados) {
        Write-Host "  - $($m.name) ($($m.tamano_gb) GB) - $($m.uso)" -ForegroundColor DarkGray
    }
    Write-Host "`n  Para instalarlos: pwsh scripts/ai/update-ollama.ps1 -InstallCandidates" -ForegroundColor Yellow

    if ($InstallCandidates) {
        foreach ($m in $noInstalados) {
            Write-Host "`n  [INSTALAR CANDIDATO] $($m.name)" -ForegroundColor Yellow
            & ollama pull $m.name
        }
    }
}

# 5. Resumen final
Write-Host "`n=== ESTADO FINAL ===" -ForegroundColor Magenta
& ollama list
Write-Host "`n  [OK] Mantenimiento completado" -ForegroundColor Green
