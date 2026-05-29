<#
.SYNOPSIS
    Orquestador final — REGINSA.
    Genera el informe consolidado de QA con TODOS los resultados (funcional, API, performance,
    seguridad SAST/SCA/DAST/container/infra/network) en formato Word + Excel + JSON.

.DESCRIPTION
    Pipeline:
      1) Llama extraer-hallazgos.ps1 -> hallazgos-consolidados-YYYY-MM-DD_HH-mm.json
      2) Llama generar-informe-word.js -> INFORME_QA_REGINSA_*.docx (Word)
      3) Llama generar-excel-metricas.js -> METRICAS_QA_REGINSA_*.xlsx (Excel + KPIs)
      4) Si hay >=2 corridas con fecha distinta, llama comparar-corridas.ps1
         -> INFORME_COMPARATIVO_QA_REGINSA_*.docx
.PARAMETER TipoPrueba
    Filtrar (Todos | Funcional | API | Performance | Seguridad). Default: Todos.

.EXAMPLE
    pwsh scripts/generar-informe-final.ps1
    pwsh scripts/generar-informe-final.ps1 -TipoPrueba Seguridad
#>
param(
    [string[]]$TipoPrueba = @('Todos'),
    [switch]$SkipComparativo
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$Root        = Resolve-Path (Join-Path $PSScriptRoot '..')
$ScriptsDir  = $PSScriptRoot
$InformesDir = Join-Path $Root 'reportes\informes'

function Write-Title { param($m) Write-Host "`n$m" -ForegroundColor Magenta }
function Write-Step  { param($m) Write-Host "  >> $m" -ForegroundColor Cyan }
function Write-Ok    { param($m) Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn  { param($m) Write-Host "  [!!] $m" -ForegroundColor Yellow }
function Write-Fail  { param($m) Write-Host "  [FAIL] $m" -ForegroundColor Red }

Write-Host ""
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host "  GENERADOR DE INFORME FINAL — REGINSA" -ForegroundColor Magenta
Write-Host "  Autora: Liz Vidal | Estandar: ISTQB / ISO 25010 / NTP 12207" -ForegroundColor Magenta
Write-Host "================================================================" -ForegroundColor Magenta

# ── PASO 1: Extraer hallazgos consolidados (incluye Nmap como informativo) ──
Write-Title "PASO 1: Extraer hallazgos consolidados"
$extractor = Join-Path $ScriptsDir 'extraer-hallazgos.ps1'
if (-not (Test-Path $extractor)) { Write-Fail "No se encontro: $extractor"; exit 1 }
& pwsh -NoProfile -ExecutionPolicy Bypass -File $extractor -TipoPrueba $TipoPrueba
if ($LASTEXITCODE -ne 0) { Write-Warn "extraer-hallazgos.ps1 termino con codigo $LASTEXITCODE" }

# ── PASO 2: Generar Word ────────────────────────────────────────────────────
Write-Title "PASO 2: Generar Word (INFORME_QA_REGINSA_*.docx)"
$wordScript = Join-Path $ScriptsDir 'generar-informe-word.js'
if (Test-Path $wordScript) {
    Push-Location $Root
    try { & node $wordScript } finally { Pop-Location }
    if ($LASTEXITCODE -eq 0) { Write-Ok "Word generado" } else { Write-Warn "node generar-informe-word.js exit $LASTEXITCODE" }
} else { Write-Warn "No se encontro generar-informe-word.js" }

# ── PASO 3: Generar Excel + KPIs ────────────────────────────────────────────
Write-Title "PASO 3: Generar Excel (METRICAS_QA_REGINSA_*.xlsx)"
$excelScript = Join-Path $ScriptsDir 'generar-excel-metricas.js'
if (Test-Path $excelScript) {
    Push-Location $Root
    try { & node $excelScript } finally { Pop-Location }
    if ($LASTEXITCODE -eq 0) { Write-Ok "Excel generado" } else { Write-Warn "node generar-excel-metricas.js exit $LASTEXITCODE" }
} else { Write-Warn "No se encontro generar-excel-metricas.js" }

# ── PASO 4: Reporte comparativo (solo si hay >=2 corridas con FECHAS distintas) ──
if (-not $SkipComparativo) {
    Write-Title "PASO 4: Reporte comparativo (corrida actual vs anterior)"
    $compScript = Join-Path $ScriptsDir 'comparar-corridas.ps1'
    if (Test-Path $compScript) {
        & pwsh -NoProfile -ExecutionPolicy Bypass -File $compScript
    } else {
        Write-Warn "No se encontro comparar-corridas.ps1"
    }
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  INFORME FINAL COMPLETO" -ForegroundColor Green
Write-Host "  Archivos en: $InformesDir" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
