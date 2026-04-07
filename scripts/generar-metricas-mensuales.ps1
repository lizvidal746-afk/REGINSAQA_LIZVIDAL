<#
.SYNOPSIS
    Genera metricas mensuales consolidadas del framework QA REGINSA.
.DESCRIPTION
    Recopila datos de: Playwright (test-results), Newman (reportes newman),
    k6 (summaries), SonarQube (reportes sonar JSON), OWASP/Security (reportes owasp JSON).
    Genera un archivo JSON + Markdown resumen en reportes/metricas-mensuales-YYYY-MM.
.PARAMETER Mes
    Mes en formato YYYY-MM. Por defecto usa el mes actual.
.EXAMPLE
    pwsh scripts/generar-metricas-mensuales.ps1
    pwsh scripts/generar-metricas-mensuales.ps1 -Mes 2026-03
#>
param(
    [string]$Mes = (Get-Date -Format "yyyy-MM")
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path "$ProjectRoot/package.json")) {
    $ProjectRoot = $PSScriptRoot | Split-Path -Parent
}

# ── Helpers ──────────────────────────────────────────────────────────────────
function Write-Step  { param([string]$msg) Write-Host "▶ $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "  ✔ $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Info  { param([string]$msg) Write-Host "  ℹ $msg" -ForegroundColor Gray }

# ── Output directory ─────────────────────────────────────────────────────────
$OutDir = Join-Path $ProjectRoot "reportes"
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$OutJson = Join-Path $OutDir "metricas-mensuales-$Mes.json"
$OutMd   = Join-Path $OutDir "metricas-mensuales-$Mes.md"

Write-Step "Generando metricas mensuales para $Mes"
Write-Info "Proyecto: $ProjectRoot"

# ── 1. Playwright results ───────────────────────────────────────────────────
Write-Step "Recopilando resultados Playwright..."
$playwrightMetrics = @{ executed = 0; passed = 0; failed = 0; skipped = 0; passRate = 0 }

# Check allure-results for latest data
$allureDir = Join-Path $ProjectRoot "allure-results"
if (Test-Path $allureDir) {
    $allureFiles = Get-ChildItem -Path $allureDir -Filter "*.json" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match "result" }
    if ($allureFiles.Count -gt 0) {
        $passed = 0; $failed = 0; $broken = 0; $skipped = 0
        foreach ($f in $allureFiles) {
            try {
                $data = Get-Content $f.FullName -Raw | ConvertFrom-Json
                switch ($data.status) {
                    "passed"  { $passed++ }
                    "failed"  { $failed++ }
                    "broken"  { $broken++ }
                    "skipped" { $skipped++ }
                }
            } catch { }
        }
        $total = $passed + $failed + $broken + $skipped
        $playwrightMetrics = @{
            executed = $total
            passed   = $passed
            failed   = $failed + $broken
            skipped  = $skipped
            passRate = if ($total -gt 0) { [math]::Round(($passed / $total) * 100, 1) } else { 0 }
        }
        Write-Ok "Allure: $total tests ($passed passed, $($failed + $broken) failed, $skipped skipped)"
    } else {
        Write-Warn "No se encontraron resultados Allure"
    }
} else {
    Write-Warn "Carpeta allure-results no encontrada"
}

# ── 2. Newman / Postman API results ─────────────────────────────────────────
Write-Step "Recopilando resultados Newman..."
$newmanMetrics = @{ collections = 0; totalAssertions = 0; failedAssertions = 0; passRate = 0 }

$newmanDirs = @(
    (Join-Path $ProjectRoot "reportes/newman"),
    (Join-Path $ProjectRoot "API_TEST/reportes")
)
$newmanJsons = @()
foreach ($nd in $newmanDirs) {
    if (Test-Path $nd) {
        $newmanJsons += Get-ChildItem -Path $nd -Filter "*.json" -Recurse -ErrorAction SilentlyContinue
    }
}
if ($newmanJsons.Count -gt 0) {
    $totalAssert = 0; $failedAssert = 0; $cols = 0
    foreach ($f in $newmanJsons) {
        try {
            $data = Get-Content $f.FullName -Raw | ConvertFrom-Json
            if ($data.run -and $data.run.stats) {
                $cols++
                $totalAssert  += [int]($data.run.stats.assertions.total)
                $failedAssert += [int]($data.run.stats.assertions.failed)
            }
        } catch { }
    }
    $newmanMetrics = @{
        collections      = $cols
        totalAssertions  = $totalAssert
        failedAssertions = $failedAssert
        passRate         = if ($totalAssert -gt 0) { [math]::Round((($totalAssert - $failedAssert) / $totalAssert) * 100, 1) } else { 0 }
    }
    Write-Ok "Newman: $cols colecciones, $totalAssert assertions ($failedAssert fallidas)"
} else {
    Write-Warn "No se encontraron reportes Newman"
}

# ── 3. k6 Performance summaries ─────────────────────────────────────────────
Write-Step "Recopilando metricas k6..."
$k6Metrics = @{ cases = @() }

$k6SummaryPattern = Join-Path $ProjectRoot "reportes/k6-*-summary.json"
$k6Files = Get-ChildItem -Path $k6SummaryPattern -ErrorAction SilentlyContinue
if ($k6Files.Count -gt 0) {
    foreach ($f in $k6Files) {
        try {
            $data = Get-Content $f.FullName -Raw | ConvertFrom-Json
            $httpDur = $data.metrics.http_req_duration
            $caseEntry = @{
                file       = $f.Name
                p95        = if ($httpDur.'p(95)') { [math]::Round($httpDur.'p(95)', 1) } else { "N/A" }
                avg        = if ($httpDur.avg) { [math]::Round($httpDur.avg, 1) } else { "N/A" }
                failRate   = if ($data.metrics.http_req_failed -and $data.metrics.http_req_failed.values) {
                    [math]::Round($data.metrics.http_req_failed.values.rate * 100, 2)
                } else { "N/A" }
                iterations = if ($data.metrics.iterations) { $data.metrics.iterations.values.count } else { "N/A" }
            }
            $k6Metrics.cases += $caseEntry
        } catch { }
    }
    Write-Ok "k6: $($k6Metrics.cases.Count) resumen(es) encontrado(s)"
} else {
    # Try k6-grafana output directory
    $k6GrafanaDir = Join-Path $ProjectRoot "tests/performance/k6-grafana"
    if (Test-Path $k6GrafanaDir) {
        $k6GrafanaFiles = Get-ChildItem -Path $k6GrafanaDir -Filter "*summary*.json" -Recurse -ErrorAction SilentlyContinue
        foreach ($f in $k6GrafanaFiles) {
            try {
                $data = Get-Content $f.FullName -Raw | ConvertFrom-Json
                $httpDur = $data.metrics.http_req_duration
                $caseEntry = @{
                    file       = $f.Name
                    p95        = if ($httpDur.'p(95)') { [math]::Round($httpDur.'p(95)', 1) } else { "N/A" }
                    avg        = if ($httpDur.avg) { [math]::Round($httpDur.avg, 1) } else { "N/A" }
                    failRate   = "N/A"
                    iterations = "N/A"
                }
                $k6Metrics.cases += $caseEntry
            } catch { }
        }
    }
    if ($k6Metrics.cases.Count -eq 0) { Write-Warn "No se encontraron resúmenes k6" }
    else { Write-Ok "k6: $($k6Metrics.cases.Count) resumen(es) encontrado(s)" }
}

# ── 4. SonarQube metrics ────────────────────────────────────────────────────
Write-Step "Recopilando metricas SonarQube..."
$sonarMetrics = @{ projects = @() }

$sonarDatedDir = Join-Path $ProjectRoot "reportes/security/sonar"
if (Test-Path $sonarDatedDir) {
    # Get latest dated folder
    $latestSonar = Get-ChildItem -Path $sonarDatedDir -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($latestSonar) {
        $projectDirs = Get-ChildItem -Path $latestSonar.FullName -Directory -ErrorAction SilentlyContinue
        foreach ($pd in $projectDirs) {
            $resumenFile = Get-ChildItem -Path $pd.FullName -Filter "*resumen.json" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($resumenFile) {
                try {
                    $data = Get-Content $resumenFile.FullName -Raw | ConvertFrom-Json
                    $sonarMetrics.projects += @{
                        projectKey     = $data.projectKey
                        qualityGate    = $data.qualityGate
                        bugs           = [int]$data.metrics.bugs
                        vulnerabilities = [int]$data.metrics.vulnerabilities
                        codeSmells     = [int]$data.metrics.codeSmells
                        coverage       = $data.metrics.coverage
                        duplications   = $data.metrics.duplicatedLinesDensity
                    }
                } catch { }
            }
        }
        Write-Ok "SonarQube: $($sonarMetrics.projects.Count) proyectos desde $($latestSonar.Name)"
    }
} else {
    Write-Warn "Carpeta reportes/security/sonar no encontrada"
}

# ── 5. OWASP / Security metrics ─────────────────────────────────────────────
Write-Step "Recopilando metricas de seguridad..."
$securityMetrics = @{ high = 0; medium = 0; low = 0; info = 0; scanDate = "N/A" }

$owaspDatedDir = Join-Path $ProjectRoot "reportes/security/owasp"
if (Test-Path $owaspDatedDir) {
    $latestOwasp = Get-ChildItem -Path $owaspDatedDir -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($latestOwasp) {
        $resumenFile = Join-Path $latestOwasp.FullName "owasp-resumen-estructurado.json"
        if (Test-Path $resumenFile) {
            try {
                $data = Get-Content $resumenFile -Raw | ConvertFrom-Json
                $securityMetrics = @{
                    high     = [int]$data.totals.alerts.high
                    medium   = [int]$data.totals.alerts.medium
                    low      = [int]$data.totals.alerts.low
                    info     = [int]$data.totals.alerts.info
                    scanDate = $data.generatedAt
                }
            } catch { }
        }
        Write-Ok "OWASP: scan desde $($latestOwasp.Name)"
    }
} else {
    Write-Warn "Carpeta reportes/security/owasp no encontrada"
}

# ── 6. Lighthouse metrics ─────────────────────────────────────────────────────
Write-Step "Recopilando metricas Lighthouse..."
$lighthouseMetrics = @{ urls = @(); target = "N/A"; preset = "N/A"; assertStatus = "N/A"; generatedAt = "N/A" }

$lighthouseDatedDir = Join-Path $ProjectRoot "reportes/security/lighthouse"
if (Test-Path $lighthouseDatedDir) {
    $latestLh = Get-ChildItem -Path $lighthouseDatedDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match "^\d{4}-\d{2}-\d{2}" } |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($latestLh) {
        $lhResumen = Join-Path $latestLh.FullName "lighthouse-resumen.json"
        if (Test-Path $lhResumen) {
            try {
                $lhData = Get-Content $lhResumen -Raw | ConvertFrom-Json
                $lighthouseMetrics = @{
                    target       = $lhData.target
                    preset       = $lhData.preset
                    assertStatus = $lhData.assertStatus
                    generatedAt  = $lhData.generatedAt
                    urls         = @()
                }
                foreach ($u in $lhData.urls) {
                    $lighthouseMetrics.urls += @{
                        url           = $u.url
                        performance   = [int]$u.performance
                        accessibility = [int]$u.accessibility
                        bestPractices = [int]$u.bestPractices
                        seo           = [int]$u.seo
                        fcp_ms        = $u.fcp_ms
                        lcp_ms        = $u.lcp_ms
                        tbt_ms        = $u.tbt_ms
                        cls           = $u.cls
                    }
                }
                Write-Ok "Lighthouse: $($lighthouseMetrics.urls.Count) URL(s) desde $($latestLh.Name)"
            } catch {
                Write-Warn "Error leyendo lighthouse-resumen.json: $_"
            }
        } else {
            Write-Warn "lighthouse-resumen.json no encontrado en $($latestLh.Name)"
        }
    } else {
        Write-Warn "No hay carpetas fechadas en reportes/security/lighthouse"
    }
} else {
    Write-Warn "Carpeta reportes/security/lighthouse no encontrada. Ejecuta: npm run lighthouse:run"
}

# ── Build consolidated output ────────────────────────────────────────────────
Write-Step "Generando archivos de salida..."

$consolidated = @{
    periodo    = $Mes
    generatedAt = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    playwright = $playwrightMetrics
    newman     = $newmanMetrics
    k6         = $k6Metrics
    sonarqube  = $sonarMetrics
    security   = $securityMetrics
    lighthouse = $lighthouseMetrics
}

# JSON output
$consolidated | ConvertTo-Json -Depth 5 | Set-Content -Path $OutJson -Encoding UTF8
Write-Ok "JSON: $OutJson"

# Markdown output
$md = @"
# Metricas Mensuales QA REGINSA — $Mes

> Generado automaticamente el $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

## Pruebas Funcionales (Playwright)

| Metrica | Valor |
|---------|-------|
| Tests ejecutados | $($playwrightMetrics.executed) |
| Exitosos | $($playwrightMetrics.passed) |
| Fallidos | $($playwrightMetrics.failed) |
| Omitidos | $($playwrightMetrics.skipped) |
| Tasa de exito | $($playwrightMetrics.passRate)% |

## Pruebas API (Newman)

| Metrica | Valor |
|---------|-------|
| Colecciones | $($newmanMetrics.collections) |
| Assertions totales | $($newmanMetrics.totalAssertions) |
| Assertions fallidas | $($newmanMetrics.failedAssertions) |
| Tasa de exito | $($newmanMetrics.passRate)% |

## Rendimiento (k6)

| Archivo | p95 (ms) | Avg (ms) | Fail Rate | Iteraciones |
|---------|----------|----------|-----------|-------------|
"@

foreach ($c in $k6Metrics.cases) {
    $md += "| $($c.file) | $($c.p95) | $($c.avg) | $($c.failRate)% | $($c.iterations) |`n"
}

$md += @"

## Calidad de Codigo (SonarQube)

| Proyecto | Quality Gate | Bugs | Vulnerabilities | Code Smells | Coverage | Duplications |
|----------|-------------|------|----------------|-------------|----------|-------------|
"@

foreach ($p in $sonarMetrics.projects) {
    $md += "| $($p.projectKey) | $($p.qualityGate) | $($p.bugs) | $($p.vulnerabilities) | $($p.codeSmells) | $($p.coverage)% | $($p.duplications)% |`n"
}

$md += @"

## Seguridad (OWASP ZAP)

| Severidad | Alertas |
|-----------|---------|
| High | $($securityMetrics.high) |
| Medium | $($securityMetrics.medium) |
| Low | $($securityMetrics.low) |
| Info | $($securityMetrics.info) |

> Ultimo escaneo: $($securityMetrics.scanDate)
"@

# ── Lighthouse section ────────────────────────────────────────────────────────
if ($lighthouseMetrics.urls.Count -gt 0) {
    $md += @"

## Web Performance (Lighthouse)

> Perfil: $($lighthouseMetrics.preset) | Assert: $($lighthouseMetrics.assertStatus) | Fecha: $($lighthouseMetrics.generatedAt)

| URL | Performance | Accessibility | Best Practices | SEO | FCP (ms) | LCP (ms) | TBT (ms) | CLS |
|-----|------------|---------------|---------------|-----|----------|----------|----------|-----|
"@
    foreach ($u in $lighthouseMetrics.urls) {
        $md += "| $($u.url) | $($u.performance) | $($u.accessibility) | $($u.bestPractices) | $($u.seo) | $($u.fcp_ms) | $($u.lcp_ms) | $($u.tbt_ms) | $($u.cls) |`n"
    }
} else {
    $md += @"

## Web Performance (Lighthouse)

> Sin datos. Ejecutar: `npm run lighthouse:run`
"@
}

$md | Set-Content -Path $OutMd -Encoding UTF8
Write-Ok "Markdown: $OutMd"

Write-Host ""
Write-Host "✅ Metricas mensuales $Mes generadas exitosamente" -ForegroundColor Green
Write-Host "   JSON: $OutJson"
Write-Host "   MD:   $OutMd"
