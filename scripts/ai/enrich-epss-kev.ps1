<#
.SYNOPSIS
    Enriquece hallazgos normalizados con CISA KEV + FIRST EPSS.

.DESCRIPTION
    Anade campos a cada hallazgo con CVE:
      - epss_score        (0..1)  probabilidad explotacion 30 dias
      - epss_percentile   (0..1)  percentil vs todas las CVEs
      - in_kev            (bool)  esta en CISA KEV catalog
      - kev_vendor / kev_product / kev_dateAdded / kev_dueDate
      - priority_override        ("KEV","EPSS_HIGH",null)
      - priority_override_reason

    Override de sprint:
      - in_kev = true                     -> ACTUAL  (cualquier severidad)
      - epss_score >= 0.7 (no en KEV)     -> sube 1 nivel (ALTA->ACTUAL, MEDIA->N+1)

    Cache local en reportes/.cache/ (KEV 24h, EPSS 24h) para no re-descargar.

.PARAMETER InputJson
    Path al findings-normalized-*.json. Si vacio, toma el mas reciente.

.PARAMETER OutputJson
    Path de salida. Si vacio, sobrescribe el input (in-place).

.EXAMPLE
    pwsh scripts/ai/enrich-epss-kev.ps1
    pwsh scripts/ai/enrich-epss-kev.ps1 -OfflineMode  # usa cache aunque expire
#>
[CmdletBinding()]
param(
    [string]$InputJson  = "",
    [string]$OutputJson = "",
    [switch]$OfflineMode,
    [int]$EPSSBatchSize = 100,
    [double]$EPSSHighThreshold = 0.7
)

Set-StrictMode -Off
$ErrorActionPreference = 'Continue'

$Root        = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$InformesDir = Join-Path $Root 'reportes\informes'
$CacheDir    = Join-Path $Root 'reportes\.cache'
New-Item -ItemType Directory -Path $CacheDir -Force | Out-Null

if (-not $InputJson) {
    $latest = Get-ChildItem -Path $InformesDir -Filter 'findings-normalized-*.json' -File |
              Sort-Object Name -Descending | Select-Object -First 1
    if (-not $latest) { throw "No se encontro findings-normalized-*.json. Ejecuta primero normalize-findings.ps1" }
    $InputJson = $latest.FullName
}
if (-not $OutputJson) { $OutputJson = $InputJson }

Write-Host "`n=== ENRIQUECIMIENTO KEV + EPSS ===" -ForegroundColor Magenta
Write-Host "  Input : $InputJson" -ForegroundColor Cyan

# ────────────────────────────────────────────────────────────
# 1. Descargar/cachear CISA KEV
# ────────────────────────────────────────────────────────────
$kevCachePath = Join-Path $CacheDir 'cisa-kev.json'
$kevUrl       = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'
$kevMaxAgeH   = 24

function Get-KevCatalog {
    $needsRefresh = $true
    if (Test-Path $kevCachePath) {
        $age = ((Get-Date) - (Get-Item $kevCachePath).LastWriteTime).TotalHours
        if ($age -lt $kevMaxAgeH -or $OfflineMode) {
            $needsRefresh = $false
            Write-Host "  KEV cache OK (edad: $([math]::Round($age,1))h)" -ForegroundColor DarkGray
        }
    }
    if ($needsRefresh) {
        try {
            Write-Host "  Descargando CISA KEV..." -ForegroundColor DarkGray
            Invoke-WebRequest -Uri $kevUrl -OutFile $kevCachePath -TimeoutSec 30 -UseBasicParsing
        } catch {
            Write-Host "  [WARN] No se pudo descargar KEV: $($_.Exception.Message)" -ForegroundColor Yellow
            if (-not (Test-Path $kevCachePath)) { return $null }
        }
    }
    try {
        return Get-Content $kevCachePath -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Write-Host "  [WARN] KEV JSON corrupto: $_" -ForegroundColor Yellow
        return $null
    }
}

$kev = Get-KevCatalog
$kevMap = @{}
if ($kev -and $kev.vulnerabilities) {
    foreach ($v in $kev.vulnerabilities) { $kevMap[$v.cveID] = $v }
    Write-Host "  KEV: $($kevMap.Count) CVEs en catalogo" -ForegroundColor Green
} else {
    Write-Host "  KEV: NO disponible - se omite override KEV" -ForegroundColor Yellow
}

# ────────────────────────────────────────────────────────────
# 2. Cargar findings y extraer CVE-IDs
# ────────────────────────────────────────────────────────────
$report   = Get-Content $InputJson -Raw -Encoding UTF8 | ConvertFrom-Json
$findings = @($report.findings)

# Extraer CVE-IDs de cada finding (varios campos posibles)
function Get-CveIds {
    param($f)
    $ids = New-Object System.Collections.Generic.HashSet[string]
    foreach ($field in @('cve_id','cve','title','group_key','recomendacion_base')) {
        $val = $f.$field
        if ($val) {
            $cveMatches = [regex]::Matches([string]$val, 'CVE-\d{4}-\d{4,7}', 'IgnoreCase')
            foreach ($m in $cveMatches) { [void]$ids.Add($m.Value.ToUpper()) }
        }
    }
    return $ids
}

$allCves = New-Object System.Collections.Generic.HashSet[string]
$findingCves = @{}
foreach ($f in $findings) {
    $ids = Get-CveIds -f $f
    if ($ids.Count -gt 0) {
        $findingCves[$f.group_key] = $ids
        foreach ($c in $ids) { [void]$allCves.Add($c) }
    }
}

Write-Host "  CVEs detectados: $($allCves.Count) unicos en $($findingCves.Count) hallazgos" -ForegroundColor Cyan

# ────────────────────────────────────────────────────────────
# 3. Consultar FIRST EPSS API (batch hasta 100 por request)
# ────────────────────────────────────────────────────────────
$epssCachePath = Join-Path $CacheDir 'epss-scores.json'
$epssMaxAgeH   = 24
$epssMap = @{}

# Cargar cache previo
if (Test-Path $epssCachePath) {
    $age = ((Get-Date) - (Get-Item $epssCachePath).LastWriteTime).TotalHours
    if ($age -lt $epssMaxAgeH -or $OfflineMode) {
        try {
            $cached = Get-Content $epssCachePath -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach ($p in $cached.PSObject.Properties) {
                $epssMap[$p.Name] = @{ score = [double]$p.Value.score; percentile = [double]$p.Value.percentile }
            }
            Write-Host "  EPSS cache: $($epssMap.Count) entradas (edad: $([math]::Round($age,1))h)" -ForegroundColor DarkGray
        } catch { Write-Host "  [WARN] EPSS cache corrupto, se ignora" -ForegroundColor Yellow }
    }
}

# CVEs no cacheadas
$cvesToFetch = @($allCves | Where-Object { -not $epssMap.ContainsKey($_) })

if ($cvesToFetch.Count -gt 0 -and -not $OfflineMode) {
    Write-Host "  Consultando FIRST EPSS API ($($cvesToFetch.Count) CVEs)..." -ForegroundColor DarkGray
    $totalBatches = [math]::Ceiling($cvesToFetch.Count / $EPSSBatchSize)
    for ($i = 0; $i -lt $cvesToFetch.Count; $i += $EPSSBatchSize) {
        $batch = $cvesToFetch[$i..([math]::Min($i + $EPSSBatchSize - 1, $cvesToFetch.Count - 1))]
        $url = "https://api.first.org/data/v1/epss?cve=$($batch -join ',')"
        try {
            $resp = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30
            if ($resp.data) {
                foreach ($d in $resp.data) {
                    $epssMap[$d.cve.ToUpper()] = @{
                        score      = [double]$d.epss
                        percentile = [double]$d.percentile
                    }
                }
            }
        } catch {
            Write-Host "  [WARN] EPSS batch $([math]::Floor($i/$EPSSBatchSize)+1)/$totalBatches fallo: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    # Persistir cache
    try {
        $epssMap | ConvertTo-Json -Depth 4 | Out-File -FilePath $epssCachePath -Encoding UTF8
    } catch { Write-Host "  [WARN] No se pudo persistir EPSS cache" -ForegroundColor Yellow }
}

Write-Host "  EPSS: $($epssMap.Count) CVEs con score conocido" -ForegroundColor Green

# ────────────────────────────────────────────────────────────
# 4. Enriquecer cada finding
# ────────────────────────────────────────────────────────────
function Add-OrSet {
    param($obj, [string]$name, $value)
    if ($obj.PSObject.Properties.Name -contains $name) { $obj.$name = $value }
    else { $obj | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force }
}

$kevCount        = 0
$epssHighCount   = 0
$enrichedCount   = 0

foreach ($f in $findings) {
    $cves = $findingCves[$f.group_key]
    if (-not $cves -or $cves.Count -eq 0) {
        Add-OrSet $f 'in_kev' $false
        Add-OrSet $f 'epss_score' $null
        Add-OrSet $f 'epss_percentile' $null
        Add-OrSet $f 'priority_override' $null
        Add-OrSet $f 'priority_override_reason' $null
        continue
    }

    # Tomar el peor CVE (mayor EPSS o KEV)
    $bestEpss = 0.0
    $bestPct  = 0.0
    $kevHit   = $null
    $bestCve  = $null
    foreach ($c in $cves) {
        if ($kevMap.ContainsKey($c)) {
            $kevHit = $kevMap[$c]
            $bestCve = $c
            break
        }
        if ($epssMap.ContainsKey($c)) {
            $s = $epssMap[$c].score
            if ($s -gt $bestEpss) {
                $bestEpss = $s
                $bestPct  = $epssMap[$c].percentile
                $bestCve  = $c
            }
        }
    }

    Add-OrSet $f 'cve_primary'     $bestCve
    Add-OrSet $f 'in_kev'          ([bool]$kevHit)
    Add-OrSet $f 'epss_score'      $(if ($bestEpss -gt 0) { [math]::Round($bestEpss, 4) } else { $null })
    Add-OrSet $f 'epss_percentile' $(if ($bestPct -gt 0)  { [math]::Round($bestPct, 4) }  else { $null })

    if ($kevHit) {
        Add-OrSet $f 'kev_vendor'    $kevHit.vendorProject
        Add-OrSet $f 'kev_product'   $kevHit.product
        Add-OrSet $f 'kev_dateAdded' $kevHit.dateAdded
        Add-OrSet $f 'kev_dueDate'   $kevHit.dueDate
        Add-OrSet $f 'priority_override'        'KEV'
        Add-OrSet $f 'priority_override_reason' "CVE en CISA KEV (explotacion confirmada en wild) - $($kevHit.vendorProject)/$($kevHit.product)"
        Add-OrSet $f 'sprint_recommended'       'ACTUAL'
        $kevCount++
    } elseif ($bestEpss -ge $EPSSHighThreshold) {
        Add-OrSet $f 'priority_override'        'EPSS_HIGH'
        Add-OrSet $f 'priority_override_reason' "EPSS=$([math]::Round($bestEpss*100,1))% (probabilidad explotacion >= ${EPSSHighThreshold} en 30 dias)"
        # Sube 1 nivel de sprint
        $current = if ($f.PSObject.Properties.Name -contains 'sprint_recommended') { [string]$f.sprint_recommended } else { '' }
        $upgraded = switch ($current) {
            'BACKLOG' { 'N+2' }
            'N+2'     { 'N+1' }
            'N+1'     { 'ACTUAL' }
            'ACTUAL'  { 'ACTUAL' }
            default   { 'ACTUAL' }
        }
        Add-OrSet $f 'sprint_recommended' $upgraded
        $epssHighCount++
    } else {
        Add-OrSet $f 'priority_override'        $null
        Add-OrSet $f 'priority_override_reason' $null
    }
    $enrichedCount++
}

# ────────────────────────────────────────────────────────────
# 5. Metadata + guardar
# ────────────────────────────────────────────────────────────
Add-OrSet $report.meta 'kev_enriched_at'     (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Add-OrSet $report.meta 'kev_catalog_size'    $kevMap.Count
Add-OrSet $report.meta 'epss_lookup_size'    $epssMap.Count
Add-OrSet $report.meta 'findings_with_cve'   $findingCves.Count
Add-OrSet $report.meta 'kev_overrides'       $kevCount
Add-OrSet $report.meta 'epss_high_overrides' $epssHighCount
Add-OrSet $report.meta 'epss_threshold'      $EPSSHighThreshold

$report | ConvertTo-Json -Depth 12 | Out-File -FilePath $OutputJson -Encoding UTF8

Write-Host "`n  [OK] Enriquecimiento completado" -ForegroundColor Green
Write-Host "    KEV overrides       : $kevCount" -ForegroundColor $(if ($kevCount -gt 0) { 'Red' } else { 'Green' })
Write-Host "    EPSS high (>=$EPSSHighThreshold)  : $epssHighCount" -ForegroundColor $(if ($epssHighCount -gt 0) { 'Yellow' } else { 'Green' })
Write-Host "    Hallazgos enriquecidos: $enrichedCount / $($findings.Count)" -ForegroundColor Cyan
Write-Host "  Output: $OutputJson" -ForegroundColor Green
