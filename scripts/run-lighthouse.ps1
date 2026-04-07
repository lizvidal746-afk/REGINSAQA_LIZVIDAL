<#
.SYNOPSIS
    Ejecuta Lighthouse CI contra el entorno QA de REGINSA.
.DESCRIPTION
    Usa @lhci/cli (via npx) para auditar Performance, Accessibility,
    Best Practices y SEO. Genera carpeta fechada en reportes/security/lighthouse/.
    Los reportes HTML y JSON quedan accesibles sin instalar herramientas adicionales.
.PARAMETER Target
    URL base a auditar. Por defecto usa $env:REGINSA_URL o https://reginsaqa.sunedu.gob.pe.
.PARAMETER OutputDir
    Directorio raiz de salida. Por defecto: reportes/security/lighthouse.
.PARAMETER Runs
    Numero de ejecuciones por URL para promediar (1-3). Por defecto: 1.
.PARAMETER Preset
    Perfil de Lighthouse: desktop | mobile. Por defecto: desktop.
.PARAMETER ExtraUrls
    URLs adicionales a auditar (array). Ej: @("/login", "/administrado").
.PARAMETER FailOnError
    Si se activa, el script falla con exit 1 cuando algun assertion Lighthouse no pasa.
.EXAMPLE
    pwsh scripts/run-lighthouse.ps1
    pwsh scripts/run-lighthouse.ps1 -Target https://reginsaqa.sunedu.gob.pe -Runs 2
    pwsh scripts/run-lighthouse.ps1 -Preset mobile -FailOnError
#>
param(
    [string]  $Target      = "",
    [string]  $OutputDir   = "reportes/security/lighthouse",
    [int]     $Runs        = 1,
    [ValidateSet("desktop", "mobile")]
    [string]  $Preset      = "desktop",
    [string[]]$ExtraUrls   = @(),
    [switch]  $FailOnError
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Resolver rutas ─────────────────────────────────────────────────────────────
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot | Split-Path -Parent
}

function Write-Step { param([string]$m) Write-Host "`n▶ $m" -ForegroundColor Cyan }
function Write-Ok   { param([string]$m) Write-Host "  ✔ $m" -ForegroundColor Green }
function Write-Warn { param([string]$m) Write-Host "  ⚠ $m" -ForegroundColor Yellow }
function Write-Fail { param([string]$m) Write-Host "  ✖ $m" -ForegroundColor Red }
function Write-Info { param([string]$m) Write-Host "  ℹ $m" -ForegroundColor Gray }

# ── Resolver URL ───────────────────────────────────────────────────────────────
if ([string]::IsNullOrWhiteSpace($Target)) {
    $Target = if (-not [string]::IsNullOrWhiteSpace($env:REGINSA_URL)) {
        $env:REGINSA_URL
    } else {
        "https://reginsaqa.sunedu.gob.pe"
    }
}
$Target = $Target.TrimEnd("/")

# ── Construir lista de URLs ────────────────────────────────────────────────────
$allUrls = @($Target)
foreach ($extra in $ExtraUrls) {
    $path = if ($extra.StartsWith("http")) { $extra } else { "$Target$extra" }
    $allUrls += $path
}

Write-Step "Lighthouse CI — REGINSA QA"
Write-Info  "Target principal : $Target"
Write-Info  "URLs a auditar   : $($allUrls.Count)"
Write-Info  "Perfil           : $Preset"
Write-Info  "Ejecuciones/URL  : $Runs"

# ── Verificar node/npx ────────────────────────────────────────────────────────
Write-Step "Verificando dependencias..."
try {
    $nodeVer = & node --version 2>&1
    Write-Ok "Node.js: $nodeVer"
} catch {
    Write-Fail "Node.js no encontrado. Instala Node.js 18+ para usar Lighthouse."
    exit 1
}
try {
    $npxVer = & npx --version 2>&1
    Write-Ok "npx: $npxVer"
} catch {
    Write-Fail "npx no encontrado."
    exit 1
}

# ── Verificar/instalar @lhci/cli ──────────────────────────────────────────────
Write-Step "Verificando @lhci/cli..."
$lhciPath = Join-Path $ProjectRoot "node_modules/.bin/lhci"
$lhciAvailable = (Test-Path $lhciPath) -or (Get-Command lhci -ErrorAction SilentlyContinue)

if (-not $lhciAvailable) {
    Write-Info "@lhci/cli no instalado. Instalando como devDependency..."
    Push-Location $ProjectRoot
    & npm install --save-dev @lhci/cli 2>&1 | Out-Null
    Pop-Location
    $lhciAvailable = Test-Path $lhciPath
    if ($lhciAvailable) {
        Write-Ok "@lhci/cli instalado correctamente"
    } else {
        Write-Fail "No se pudo instalar @lhci/cli. Ejecuta: npm install --save-dev @lhci/cli"
        exit 1
    }
} else {
    Write-Ok "@lhci/cli disponible"
}

# ── Directorio de salida con fecha ────────────────────────────────────────────
$DateStamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$OutBase   = if ([System.IO.Path]::IsPathRooted($OutputDir)) {
    $OutputDir
} else {
    Join-Path $ProjectRoot $OutputDir
}
$OutDated  = Join-Path $OutBase $DateStamp
New-Item -ItemType Directory -Force -Path $OutDated | Out-Null

# Ruta LHCI output dentro del dated
$LhciOutDir = Join-Path $OutDated "lhci-raw"
New-Item -ItemType Directory -Force -Path $LhciOutDir | Out-Null

Write-Ok "Carpeta de salida: $OutDated"

# ── Construir config temporal para esta ejecucion ─────────────────────────────
Write-Step "Construyendo configuracion Lighthouse..."

$urlsJson = ($allUrls | ForEach-Object { "`"$_`"" }) -join ", "
$lighthouseConfig = @"
{
  "ci": {
    "collect": {
      "url": [$urlsJson],
      "numberOfRuns": $Runs,
      "settings": {
        "preset": "$Preset",
        "skipAudits": ["uses-http2", "redirects-http", "hsts"],
        "maxWaitForLoad": 45000,
        "onlyCategories": ["performance", "accessibility", "best-practices", "seo"]
      }
    },
    "assert": {
      "preset": "lighthouse:no-pwa",
      "assertions": {
        "categories:performance":    ["warn",  { "minScore": 0.6 }],
        "categories:accessibility":  ["error", { "minScore": 0.75 }],
        "categories:best-practices": ["warn",  { "minScore": 0.8 }],
        "categories:seo":            ["warn",  { "minScore": 0.7 }],
        "first-contentful-paint":    ["warn",  { "maxNumericValue": 4000 }],
        "largest-contentful-paint":  ["warn",  { "maxNumericValue": 8000 }],
        "total-blocking-time":       ["warn",  { "maxNumericValue": 500 }],
        "cumulative-layout-shift":   ["warn",  { "maxNumericValue": 0.25 }]
      }
    },
    "upload": {
      "target": "filesystem",
      "outputDir": "$($LhciOutDir -replace '\\', '\\\\')"
    }
  }
}
"@

$TempConfig = Join-Path $OutDated "lhci-config-temp.json"
$lighthouseConfig | Set-Content -Path $TempConfig -Encoding UTF8
Write-Ok "Config temporal: $TempConfig"

# ── Ejecutar LHCI collect ─────────────────────────────────────────────────────
Write-Step "Ejecutando Lighthouse collect ($($allUrls.Count) URL(s), $Runs run(s) c/u)..."
Push-Location $ProjectRoot

$collectExitCode = 0
try {
    & npx lhci collect "--config=$TempConfig" 2>&1 | ForEach-Object {
        if ($_ -match "error|Error|FAIL") {
            Write-Warn $_
        } elseif ($_ -match "LHR|Running|Lighthouse") {
            Write-Info $_
        }
    }
    $collectExitCode = $LASTEXITCODE
} catch {
    $collectExitCode = 1
    Write-Warn "Error durante collect: $_"
}
Pop-Location

if ($collectExitCode -ne 0) {
    Write-Warn "lhci collect termino con codigo $collectExitCode — el target puede no estar accesible"
    Write-Info "Continuando con assert sobre resultados previos si existen..."
}

# ── Ejecutar LHCI assert ──────────────────────────────────────────────────────
Write-Step "Ejecutando Lighthouse assert..."
Push-Location $ProjectRoot
$assertExitCode = 0
try {
    & npx lhci assert "--config=$TempConfig" 2>&1 | ForEach-Object {
        if ($_ -match "✖|FAIL|error") {
            Write-Warn "  $_"
        } elseif ($_ -match "✔|PASS|pass") {
            Write-Info "  $_"
        } elseif ($_ -notmatch "^\s*$") {
            Write-Host "  $_" -ForegroundColor Gray
        }
    }
    $assertExitCode = $LASTEXITCODE
} catch {
    $assertExitCode = 99
    Write-Warn "Error al ejecutar assert: $_"
}
Pop-Location

# ── Procesar resultados JSON ──────────────────────────────────────────────────
Write-Step "Procesando resultados..."

$lhciManifest = Get-ChildItem -Path $LhciOutDir -Filter "manifest.json" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$lhciJsonFiles = Get-ChildItem -Path $LhciOutDir -Filter "*.json" -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne "manifest.json" -and $_.Name -match "lhr" }

$summaryData = @{
    target      = $Target
    preset      = $Preset
    runs        = $Runs
    generatedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    urls        = @()
    assertStatus = if ($assertExitCode -eq 0) { "PASS" } else { "WARN" }
}

foreach ($jsonFile in $lhciJsonFiles) {
    try {
        $lhr = Get-Content $jsonFile.FullName -Raw | ConvertFrom-Json
        $cats = $lhr.categories
        $audits = $lhr.audits

        $urlEntry = @{
            url              = $lhr.finalUrl
            fetchTime        = $lhr.fetchTime
            performance      = [math]::Round($cats.performance.score * 100)
            accessibility    = [math]::Round($cats.accessibility.score * 100)
            bestPractices    = [math]::Round($cats.'best-practices'.score * 100)
            seo              = [math]::Round($cats.seo.score * 100)
            fcp_ms           = if ($audits.'first-contentful-paint') { [math]::Round($audits.'first-contentful-paint'.numericValue) } else { "N/A" }
            lcp_ms           = if ($audits.'largest-contentful-paint') { [math]::Round($audits.'largest-contentful-paint'.numericValue) } else { "N/A" }
            tbt_ms           = if ($audits.'total-blocking-time') { [math]::Round($audits.'total-blocking-time'.numericValue) } else { "N/A" }
            cls              = if ($audits.'cumulative-layout-shift') { [math]::Round($audits.'cumulative-layout-shift'.numericValue, 3) } else { "N/A" }
            reportFile       = $jsonFile.Name
        }
        $summaryData.urls += $urlEntry

        # Feedback de consola
        $perfColor  = if ($urlEntry.performance -ge 90) { "Green" } elseif ($urlEntry.performance -ge 60) { "Yellow" } else { "Red" }
        $a11yColor  = if ($urlEntry.accessibility -ge 90) { "Green" } elseif ($urlEntry.accessibility -ge 75) { "Yellow" } else { "Red" }
        Write-Host "`n  URL: $($urlEntry.url)" -ForegroundColor White
        Write-Host ("  Performance  : {0,3}  FCP: {1}ms  LCP: {2}ms  TBT: {3}ms  CLS: {4}" -f `
            $urlEntry.performance, $urlEntry.fcp_ms, $urlEntry.lcp_ms, $urlEntry.tbt_ms, $urlEntry.cls) -ForegroundColor $perfColor
        Write-Host ("  Accessibility: {0,3}  BestPractices: {1}  SEO: {2}" -f `
            $urlEntry.accessibility, $urlEntry.bestPractices, $urlEntry.seo) -ForegroundColor $a11yColor

    } catch {
        Write-Warn "No se pudo leer $($jsonFile.Name): $_"
    }
}

# ── Generar JSON resumen ──────────────────────────────────────────────────────
$SummaryJson = Join-Path $OutDated "lighthouse-resumen.json"
$summaryData | ConvertTo-Json -Depth 5 | Set-Content -Path $SummaryJson -Encoding UTF8
Write-Ok "JSON resumen: $SummaryJson"

# ── Generar HTML resumen simple ───────────────────────────────────────────────
$htmlRows = ""
foreach ($u in $summaryData.urls) {
    $perfClass = if ($u.performance -ge 90) { "good" } elseif ($u.performance -ge 60) { "warn" } else { "fail" }
    $a11yClass = if ($u.accessibility -ge 90) { "good" } elseif ($u.accessibility -ge 75) { "warn" } else { "fail" }
    $htmlRows += @"
      <tr>
        <td title="$($u.url)">$(if ($u.url.Length -gt 60) { $u.url.Substring(0,57) + '...' } else { $u.url })</td>
        <td class="$perfClass">$($u.performance)</td>
        <td class="$a11yClass">$($u.accessibility)</td>
        <td>$($u.bestPractices)</td>
        <td>$($u.seo)</td>
        <td>$($u.fcp_ms)</td>
        <td>$($u.lcp_ms)</td>
        <td>$($u.tbt_ms)</td>
        <td>$($u.cls)</td>
      </tr>
"@
}

$assertBadge = if ($summaryData.assertStatus -eq "PASS") {
    '<span class="badge good">PASS</span>'
} else {
    '<span class="badge warn">WARN</span>'
}

$htmlContent = @"
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Lighthouse Report — REGINSA $DateStamp</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background:#f5f5f5; color:#333; padding:20px; }
    h1   { color:#1976D2; border-bottom:2px solid #1976D2; padding-bottom:8px; }
    h2   { color:#555; margin-top:24px; }
    .meta { background:#fff; border-radius:6px; padding:12px 18px; display:inline-block; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,.15); }
    table { border-collapse:collapse; width:100%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.15); border-radius:6px; overflow:hidden; }
    th    { background:#1976D2; color:#fff; padding:10px 12px; text-align:left; font-size:0.85em; }
    td    { padding:9px 12px; border-bottom:1px solid #eee; font-size:0.9em; }
    tr:last-child td { border-bottom:none; }
    .good { color:#2e7d32; font-weight:600; }
    .warn { color:#f57c00; font-weight:600; }
    .fail { color:#c62828; font-weight:600; }
    .badge { display:inline-block; padding:3px 10px; border-radius:12px; font-size:0.8em; font-weight:600; }
    .badge.good { background:#e8f5e9; color:#2e7d32; }
    .badge.warn { background:#fff3e0; color:#e65100; }
    .tip { font-size:0.82em; color:#777; margin-top:6px; }
    footer { margin-top:30px; color:#aaa; font-size:0.8em; }
  </style>
</head>
<body>
  <h1>Lighthouse CI — REGINSA QA</h1>
  <div class="meta">
    <strong>Target:</strong> $Target &nbsp;|&nbsp;
    <strong>Perfil:</strong> $Preset &nbsp;|&nbsp;
    <strong>Runs:</strong> $Runs &nbsp;|&nbsp;
    <strong>Assert:</strong> $assertBadge &nbsp;|&nbsp;
    <strong>Fecha:</strong> $($summaryData.generatedAt)
  </div>

  <h2>Resultados por URL</h2>
  <table>
    <thead>
      <tr>
        <th>URL</th><th>Performance</th><th>Accessibility</th>
        <th>Best Practices</th><th>SEO</th>
        <th>FCP (ms)</th><th>LCP (ms)</th><th>TBT (ms)</th><th>CLS</th>
      </tr>
    </thead>
    <tbody>
      $htmlRows
    </tbody>
  </table>
  <p class="tip">
    Umbrales: Performance &ge;60 (warn &lt;60), Accessibility &ge;75 (error &lt;75).
    Los LHR JSON individuales estan en: lhci-raw/
  </p>
  <footer>Generado por scripts/run-lighthouse.ps1 · REGINSA QA Framework</footer>
</body>
</html>
"@

$HtmlReport = Join-Path $OutDated "lighthouse-report.html"
$htmlContent | Set-Content -Path $HtmlReport -Encoding UTF8
Write-Ok "HTML report: $HtmlReport"

# ── Limpiar config temporal ────────────────────────────────────────────────────
Remove-Item $TempConfig -ErrorAction SilentlyContinue

# ── Resumen final ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Blue
if ($summaryData.urls.Count -eq 0) {
    Write-Host "⚠ Sin resultados — verifica que $Target sea accesible" -ForegroundColor Yellow
} else {
    Write-Host "✅ Lighthouse completado ($($summaryData.urls.Count) URL(s))" -ForegroundColor Green
    Write-Host "   Assert: $($summaryData.assertStatus)" -ForegroundColor $(if ($summaryData.assertStatus -eq "PASS") { "Green" } else { "Yellow" })
    Write-Host "   Carpeta: $OutDated" -ForegroundColor Cyan
    Write-Host "   HTML:    $HtmlReport" -ForegroundColor Cyan
    Write-Host "   JSON:    $SummaryJson" -ForegroundColor Cyan
}

# Abrir reporte si hay resultados y estamos en modo interactivo
if ($summaryData.urls.Count -gt 0 -and [Environment]::UserInteractive) {
    try { Start-Process $HtmlReport } catch { }
}

if ($FailOnError -and $assertExitCode -ne 0) {
    Write-Fail "Lighthouse assert fallo (assertions no cumplidas)"
    exit 1
}

exit 0
