<#
.SYNOPSIS
    Pipeline maestro REGINSA: pruebas + consolidacion + IA + comparativo.

.DESCRIPTION
    Orquesta el ciclo completo:
      FASE A: pruebas de seguridad (sin Nmap por defecto)
      FASE B: consolidacion + reportes crudos
      FASE C: capa IA (normalizar + analizar + resumir + Word + Excel)
      FASE D: comparativo IA si existe corrida previa

.PARAMETER IncludeNetwork
    Incluye Nmap. Solo usar con autorizacion expresa.

.PARAMETER SkipSecurity
    Salta la fase A (util si ya corriste las pruebas).

.PARAMETER NoOllama
    Usa solo heuristicas locales, sin IA. Rapido.

.PARAMETER SkipCompare
    Salta la fase D.

.EXAMPLE
    npm run qa:full
    npm run qa:full:network
    npm run qa:full:nogpu
#>
[CmdletBinding()]
param(
    [switch]$IncludeNetwork,
    [switch]$SkipSecurity,
    [switch]$NoOllama,
    [switch]$SkipCompare,
    [string]$Model = "llama3.1:8b"
)

Set-StrictMode -Off
$ErrorActionPreference = 'Continue'

$Root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $Root

function Step { param([string]$Title)
    Write-Host "`n=================================================" -ForegroundColor Magenta
    Write-Host "  $Title" -ForegroundColor Magenta
    Write-Host "=================================================" -ForegroundColor Magenta
}

$startAll = Get-Date
$stamp    = Get-Date -Format 'yyyy-MM-dd_HH-mm'

# ============== FASE A ==============
if (-not $SkipSecurity) {
    Step "FASE A | Ejecucion de pruebas de seguridad"
    # Activamos por defecto: SonarQube (token en .env) + CodeQL (auto-skip si imagen no existe).
    # Nmap permanece opt-in por requerir autorizacion expresa.
    $secArgs = @('-Date', $stamp, '-IncludeSonar', '-IncludeCodeQL')
    if ($IncludeNetwork) {
        Write-Host "  ATENCION: Incluyendo Nmap (requiere autorizacion)" -ForegroundColor Yellow
        $secArgs += '-IncludeNetwork'
    }
    & pwsh -NoProfile -ExecutionPolicy Bypass -File 'scripts/security/run-all-security.ps1' @secArgs
    if ($LASTEXITCODE -ne 0) { Write-Host "  [WARN] Algunas herramientas reportaron exit code $LASTEXITCODE - continuando" -ForegroundColor Yellow }
} else {
    Step "FASE A | OMITIDA (-SkipSecurity)"
}

# ============== FASE B ==============
Step "FASE B | Consolidacion de hallazgos + reportes crudos"
& pwsh -NoProfile -ExecutionPolicy Bypass -File 'scripts/extraer-hallazgos.ps1'
if ($LASTEXITCODE -ne 0) { Write-Host "  [WARN] extraer-hallazgos exit $LASTEXITCODE" -ForegroundColor Yellow }

# Reporte crudo Word/Excel (existente)
if (Test-Path 'scripts/security/generar-reportes-seguridad-todos.ps1') {
    & pwsh -NoProfile -ExecutionPolicy Bypass -File 'scripts/security/generar-reportes-seguridad-todos.ps1' -Date $stamp
}

# ============== FASE C ==============
Step "FASE C | Capa IA local (normalizar + analizar + reportes IA)"

Write-Host "`n[C.1] Normalizando hallazgos..." -ForegroundColor Cyan
& pwsh -NoProfile -ExecutionPolicy Bypass -File 'scripts/ai/normalize-findings.ps1'

Write-Host "`n[C.1b] Enriqueciendo con CISA KEV + FIRST EPSS..." -ForegroundColor Cyan
if (Test-Path 'scripts/ai/enrich-epss-kev.ps1') {
    & pwsh -NoProfile -ExecutionPolicy Bypass -File 'scripts/ai/enrich-epss-kev.ps1'
    if ($LASTEXITCODE -ne 0) { Write-Host "  [WARN] enrich-epss-kev exit $LASTEXITCODE - continuando sin enriquecimiento" -ForegroundColor Yellow }
} else {
    Write-Host "  [INFO] enrich-epss-kev.ps1 no encontrado - omitiendo" -ForegroundColor DarkGray
}

Write-Host "`n[C.2] Analizando con IA..." -ForegroundColor Cyan
if ($NoOllama) {
    & pwsh -NoProfile -ExecutionPolicy Bypass -File 'scripts/ai/analyze-findings.ps1' -NoOllama -MaxCritical 100 -MaxHigh 100
} else {
    & pwsh -NoProfile -ExecutionPolicy Bypass -File 'scripts/ai/analyze-findings.ps1' -Model $Model -MaxCritical 100 -MaxHigh 100
}

Write-Host "`n[C.3] Resumen ejecutivo Markdown..." -ForegroundColor Cyan
& pwsh -NoProfile -ExecutionPolicy Bypass -File 'scripts/ai/generate-executive-summary.ps1'

Write-Host "`n[C.4] Informe ejecutivo Word..." -ForegroundColor Cyan
& pwsh -NoProfile -ExecutionPolicy Bypass -File 'scripts/ai/generate-executive-word.ps1'

Write-Host "`n[C.5] Metricas Excel..." -ForegroundColor Cyan
& pwsh -NoProfile -ExecutionPolicy Bypass -File 'scripts/ai/generate-excel-metrics.ps1'

# ============== FASE D ==============
if (-not $SkipCompare) {
    Step "FASE D | Comparativo IA con corrida anterior"
    $informes = Join-Path $Root 'reportes\informes'
    $candidates = Get-ChildItem -Path $informes -Filter 'findings-analyzed-*.json' -File | Where-Object { $_.Name -notmatch '_heuristic' } | Sort-Object Name -Descending
    if ($candidates.Count -lt 2) {
        Write-Host "  [INFO] Solo hay $($candidates.Count) corrida(s). Se requieren 2 para comparar - omitiendo." -ForegroundColor Yellow
    } else {
        & pwsh -NoProfile -ExecutionPolicy Bypass -File 'scripts/ai/comparativo-ia.ps1'
        & pwsh -NoProfile -ExecutionPolicy Bypass -File 'scripts/ai/generate-comparativo-word.ps1'
    }
} else {
    Step "FASE D | OMITIDA (-SkipCompare)"
}

# ============== FASE E: EMPAQUETADO POR RUN-ID ==============
# Consolida todos los artefactos de ESTA corrida en reportes/<stamp>/
# (no destructivo: copia, no mueve - los scripts hijos siguen escribiendo en sus rutas tradicionales)
Step "FASE E | Empaquetado en carpeta unica reportes/$stamp/"
$runRoot     = Join-Path $Root "reportes\$stamp"
$runSecurity = Join-Path $runRoot 'security'
$runInformes = Join-Path $runRoot 'informes'
$runLogs     = Join-Path $runRoot 'logs'
foreach ($d in @($runRoot, $runSecurity, $runInformes, $runLogs)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

# 1) Copiar carpeta security/<stamp>/ si existe (run-all-security.ps1 ya la crea con -Date $stamp)
$secStamped = Join-Path $Root "reportes\security\$stamp"
if (Test-Path $secStamped) {
    Copy-Item -Path (Join-Path $secStamped '*') -Destination $runSecurity -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] security/$stamp/ -> reportes/$stamp/security/" -ForegroundColor Green
} else {
    # Fallback: copiar archivos top-level de reportes/security/ creados durante esta corrida
    $secFiles = Get-ChildItem 'reportes/security' -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $startAll }
    if ($secFiles) {
        $secFiles | Copy-Item -Destination $runSecurity -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] $($secFiles.Count) archivos de reportes/security/ -> reportes/$stamp/security/" -ForegroundColor Green
    }
}

# 2) Copiar artefactos nuevos de reportes/informes/
$informesFiles = Get-ChildItem 'reportes/informes' -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $startAll }
if ($informesFiles) {
    $informesFiles | Copy-Item -Destination $runInformes -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] $($informesFiles.Count) archivos de reportes/informes/ -> reportes/$stamp/informes/" -ForegroundColor Green
}

# 3) Copiar log de Tee-Object si existe
$logCandidate = Join-Path $Root "reportes\logs\qa-full-$stamp.log"
if (Test-Path $logCandidate) {
    Copy-Item -Path $logCandidate -Destination $runLogs -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] log -> reportes/$stamp/logs/" -ForegroundColor Green
}

# 4) Manifest de la corrida (para auditoria y comparativos futuros)
$manifest = [ordered]@{
    run_id       = $stamp
    started_at   = $startAll.ToString('yyyy-MM-dd HH:mm:ss')
    finished_at  = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    duration_min = [Math]::Round(((Get-Date) - $startAll).TotalMinutes, 1)
    skip_security = [bool]$SkipSecurity
    no_ollama     = [bool]$NoOllama
    include_network = [bool]$IncludeNetwork
    skip_compare  = [bool]$SkipCompare
    model         = $Model
    artifacts = @{
        security_dir = (Resolve-Path $runSecurity -ErrorAction SilentlyContinue).Path
        informes_dir = (Resolve-Path $runInformes -ErrorAction SilentlyContinue).Path
        logs_dir     = (Resolve-Path $runLogs -ErrorAction SilentlyContinue).Path
    }
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $runRoot 'manifest.json') -Encoding UTF8

# ============== RESUMEN ==============
$dur = (Get-Date) - $startAll
Step "PIPELINE COMPLETADO"
Write-Host "  Duracion total: $([Math]::Round($dur.TotalMinutes, 1)) minutos" -ForegroundColor Green
Write-Host "  Carpeta unica:  reportes\$stamp\" -ForegroundColor Green
Write-Host "  Manifest:       reportes\$stamp\manifest.json" -ForegroundColor Green
Write-Host ""
Write-Host "  Artefactos generados en reportes\informes\ (esta corrida):" -ForegroundColor Cyan
Get-ChildItem 'reportes/informes' -File |
    Where-Object { $_.LastWriteTime -gt $startAll } |
    Sort-Object LastWriteTime |
    ForEach-Object { Write-Host "    - $($_.Name)" -ForegroundColor DarkGray }
