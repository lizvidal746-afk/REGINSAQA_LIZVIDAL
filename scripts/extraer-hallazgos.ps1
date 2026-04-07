<#
.SYNOPSIS
    Extractor universal de hallazgos QA — REGINSA
    Autora: Liz Vidal | Sistema: REGINSA | Estandar: ISTQB · ISO/IEC 25010

.DESCRIPTION
    Lee TODOS los reportes fuente generados por las herramientas de QA y produce
    un archivo consolidado JSON con todos los hallazgos normalizados.

    Salida: reportes/informes/hallazgos-consolidados-YYYY-MM-DD.json

.PARAMETER TipoPrueba
    Filtrar por tipo: Todos | Funcional | API | Performance | Seguridad | Accesibilidad
    Default: Todos

.PARAMETER FechaDesde
    Solo leer reportes desde esta fecha (formato YYYY-MM-DD). Default: ultimos 30 dias.

.PARAMETER Verbose
    Mostrar detalle de extraccion por herramienta.

.EXAMPLE
    pwsh scripts/extraer-hallazgos.ps1
    pwsh scripts/extraer-hallazgos.ps1 -TipoPrueba Seguridad
    pwsh scripts/extraer-hallazgos.ps1 -TipoPrueba Performance
    pwsh scripts/extraer-hallazgos.ps1 -TipoPrueba Seguridad,Performance
#>

param(
    [string[]]$TipoPrueba = @('Todos'),
    [string]$FechaDesde   = '',
    [switch]$Verbose
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# ── Paths ─────────────────────────────────────────────────────────────────────
$Root        = Resolve-Path (Join-Path $PSScriptRoot '..')
$Reportes    = Join-Path $Root 'reportes'
$InformesDir = Join-Path $Reportes 'informes'
$null        = New-Item -ItemType Directory -Force -Path $InformesDir

$FechaHoy    = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$FechaHoraTS = Get-Date -Format 'yyyy-MM-dd HH:mm'
$Salida      = Join-Path $InformesDir "hallazgos-consolidados-$FechaHoy.json"

$TodosTipos  = $TipoPrueba -contains 'Todos'

# ── Colores ───────────────────────────────────────────────────────────────────
function Write-Step  { param($Msg) Write-Host "  >> $Msg" -ForegroundColor Cyan }
function Write-Ok    { param($Msg) Write-Host "  [OK] $Msg" -ForegroundColor Green }
function Write-Skip  { param($Msg) Write-Host "  [--] $Msg" -ForegroundColor DarkGray }
function Write-Warn  { param($Msg) Write-Host "  [!!] $Msg" -ForegroundColor Yellow }

Write-Host ""
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host "  EXTRACTOR UNIVERSAL DE HALLAZGOS — REGINSA" -ForegroundColor Magenta
Write-Host "  Autora: Liz Vidal  |  Fecha: $FechaHoraTS" -ForegroundColor Magenta
Write-Host "  Tipos: $($TipoPrueba -join ', ')" -ForegroundColor Magenta
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host ""

$Hallazgos = [System.Collections.Generic.List[hashtable]]::new()
$Counter   = 0

function New-ID {
    $script:Counter++
    return "HAL-{0:D4}" -f $script:Counter
}

# ── Mapeo de severidad ────────────────────────────────────────────────────────
function Map-Severity {
    param([string]$Raw)
    switch -Regex ($Raw.ToUpper()) {
        'CRITICAL|BLOCKER|HIGH|ERROR|CRITICA'   { return 'CRITICA' }
        'MAJOR|MEDIUM|WARNING|ALTA'              { return 'ALTA'    }
        'MINOR|LOW|INFO|MEDIA'                   { return 'MEDIA'   }
        default                                  { return 'BAJA'    }
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# BLOQUE 1 — PLAYWRIGHT / ALLURE (Funcional)
# ══════════════════════════════════════════════════════════════════════════════
if ($TodosTipos -or $TipoPrueba -contains 'Funcional') {
    Write-Step "Extrayendo: Playwright / Allure (Funcional)"

    # Allure results
    $AllureDir = Join-Path $Root 'allure-results'
    $AllureJson = Get-ChildItem -Path $AllureDir -Filter '*.json' -Recurse -ErrorAction SilentlyContinue |
                  Where-Object { $_.Name -notlike 'categories*' -and $_.Name -notlike 'environment*' }

    $PwCount = 0
    foreach ($f in $AllureJson) {
        try {
            $data = Get-Content $f.FullName -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
            $status = $data.status
            if ($status -notin @('failed','broken','skipped')) { continue }
            $sev = switch ($status) {
                'broken'  { 'ALTA'  }
                'failed'  { 'ALTA'  }
                'skipped' { 'BAJA'  }
                default   { 'MEDIA' }
            }
            $suiteName = if ($data.labels) {
                ($data.labels | Where-Object { $_.name -eq 'suite' } | Select-Object -First 1).value
            } else { 'Sin Suite' }
            $testName = $data.name ?? $f.BaseName
            $errMsg   = if ($data.statusDetails) { $data.statusDetails.message ?? '' } else { '' }

            $Hallazgos.Add(@{
                id                    = New-ID
                fecha_deteccion       = $FechaHoraTS
                herramienta           = 'Playwright/Allure'
                tipo_prueba           = 'Funcional'
                caracteristica_iso25010 = 'Funcionalidad'
                hallazgo              = "Test '$testName' — estado: $status"
                significado           = "El caso de prueba '$testName' en la suite '$suiteName' ${status}, indicando que el flujo funcional correspondiente no se comporta como se espera en REGINSA."
                impacto_tecnico       = if ($errMsg) { $errMsg } else { "El test no paso la asercion esperada." }
                impacto_negocio       = "El flujo de negocio cubierto por esta prueba puede estar fallando para los usuarios finales."
                severidad             = $sev
                componente_afectado   = $suiteName
                responsable_sugerido  = 'Frontend'
                recomendacion         = "Revisar el componente/flujo '$suiteName' en el entorno QA y verificar los logs de ejecucion de Playwright."
                evidencia             = $f.FullName.Replace($Root.Path, '.')
                estado                = 'ABIERTO'
                sprint_objetivo       = ''
                fecha_cierre          = ''
            })
            $PwCount++
        } catch { if ($Verbose) { Write-Warn "  No se pudo parsear: $($f.Name)" } }
    }

    # Playwright JSON results
    $PwJson = Join-Path $Root 'test-results\results.json'
    if (Test-Path $PwJson) {
        try {
            $pw = Get-Content $PwJson -Raw | ConvertFrom-Json
            foreach ($suite in $pw.suites) {
                foreach ($spec in $suite.specs) {
                    foreach ($test in $spec.tests) {
                        $r = $test.results | Select-Object -Last 1
                        if ($r.status -in @('passed','expected')) { continue }
                        $Hallazgos.Add(@{
                            id                    = New-ID
                            fecha_deteccion       = $FechaHoraTS
                            herramienta           = 'Playwright'
                            tipo_prueba           = 'Funcional'
                            caracteristica_iso25010 = 'Funcionalidad'
                            hallazgo              = "Test '${spec.title}' — estado: $($r.status)"
                            significado           = "El caso '${spec.title}' en la suite '${suite.title}' resulto en estado '$($r.status)'."
                            impacto_tecnico       = if ($r.error) { $r.error.message ?? '' } else { 'Sin detalle de error' }
                            impacto_negocio       = 'El flujo funcional cubierto puede estar afectando la experiencia del usuario.'
                            severidad             = if ($r.status -eq 'failed') { 'ALTA' } else { 'MEDIA' }
                            componente_afectado   = $suite.title
                            responsable_sugerido  = 'Frontend'
                            recomendacion         = "Ejecutar npm run test:04:fast en modo headed para depurar el fallo."
                            evidencia             = '.\test-results\results.json'
                            estado                = 'ABIERTO'
                            sprint_objetivo       = ''
                            fecha_cierre          = ''
                        })
                        $PwCount++
                    }
                }
            }
        } catch { if ($Verbose) { Write-Warn "  No se pudo parsear test-results/results.json" } }
    }

    if ($PwCount -gt 0) { Write-Ok "  Playwright/Allure: $PwCount hallazgos" }
    else { Write-Skip "  Playwright/Allure: sin fallos (o sin reportes)" }
}

# ══════════════════════════════════════════════════════════════════════════════
# BLOQUE 2 — NEWMAN / API
# ══════════════════════════════════════════════════════════════════════════════
if ($TodosTipos -or $TipoPrueba -contains 'API') {
    Write-Step "Extrayendo: Newman (API)"
    $NewmanDir = Join-Path $Reportes 'newman'
    $NewmanFiles = Get-ChildItem -Path $NewmanDir -Filter '*-api-test.json' -Recurse -ErrorAction SilentlyContinue

    $NwCount = 0
    foreach ($f in $NewmanFiles) {
        try {
            $data = Get-Content $f.FullName -Raw | ConvertFrom-Json
            foreach ($exec in $data.run.executions) {
                $assertions = $exec.assertions
                if (!$assertions) { continue }
                foreach ($assert in $assertions) {
                    if (!$assert.error) { continue }
                    $Hallazgos.Add(@{
                        id                    = New-ID
                        fecha_deteccion       = $FechaHoraTS
                        herramienta           = 'Newman/Postman'
                        tipo_prueba           = 'API'
                        caracteristica_iso25010 = 'Interoperabilidad'
                        hallazgo              = "Asercion fallida: '$($assert.assertion)' en $($exec.item.name)"
                        significado           = "El endpoint '$($exec.request.url.raw)' no retorno la respuesta esperada. La asercion '$($assert.assertion)' fallo con el error: $($assert.error.message)"
                        impacto_tecnico       = "Metodo: $($exec.request.method) — URL: $($exec.request.url.raw)"
                        impacto_negocio       = "Las operaciones del sistema que dependen de este endpoint pueden fallar para los usuarios."
                        severidad             = 'ALTA'
                        componente_afectado   = $exec.item.name
                        responsable_sugerido  = 'Backend'
                        recomendacion         = "Verificar el contrato del endpoint y los datos de prueba en el entorno QA."
                        evidencia             = $f.FullName.Replace($Root.Path, '.')
                        estado                = 'ABIERTO'
                        sprint_objetivo       = ''
                        fecha_cierre          = ''
                    })
                    $NwCount++
                }
            }
        } catch { if ($Verbose) { Write-Warn "  No se pudo parsear: $($f.Name)" } }
    }
    if ($NwCount -gt 0) { Write-Ok "  Newman: $NwCount hallazgos" }
    else { Write-Skip "  Newman: sin fallos (o sin reportes)" }
}

# ══════════════════════════════════════════════════════════════════════════════
# BLOQUE 3 — k6 PERFORMANCE
# ══════════════════════════════════════════════════════════════════════════════
if ($TodosTipos -or $TipoPrueba -contains 'Performance') {
    Write-Step "Extrayendo: k6 (Performance)"
    $K6Summaries = Get-ChildItem -Path $Reportes -Filter '*k6*summary*.json' -Recurse -ErrorAction SilentlyContinue
    $K6Count = 0
    foreach ($f in $K6Summaries) {
        try {
            $data = Get-Content $f.FullName -Raw | ConvertFrom-Json
            $metrics = $data.metrics
            if (!$metrics) { continue }

            # p95 > 2000ms
            if ($metrics.'http_req_duration') {
                $p95 = $metrics.'http_req_duration'.'p(95)'
                if ($p95 -and $p95 -gt 2000) {
                    $Hallazgos.Add(@{
                        id                    = New-ID
                        fecha_deteccion       = $FechaHoraTS
                        herramienta           = 'k6'
                        tipo_prueba           = 'Performance'
                        caracteristica_iso25010 = 'Eficiencia de Rendimiento'
                        hallazgo              = "Tiempo de respuesta p95 = ${p95}ms supera el umbral de 2000ms"
                        significado           = "El 95% de las solicitudes tardaron mas de ${p95}ms, superando el umbral aceptable de 2 segundos."
                        impacto_tecnico       = "Degradacion de rendimiento detectada en la ejecucion: $($f.BaseName)"
                        impacto_negocio       = "Los usuarios experimentan lentitud en las operaciones del sistema, lo que puede afectar la productividad."
                        severidad             = if ($p95 -gt 5000) { 'CRITICA' } elseif ($p95 -gt 3000) { 'ALTA' } else { 'MEDIA' }
                        componente_afectado   = 'API/Backend'
                        responsable_sugerido  = 'Backend'
                        recomendacion         = "Analizar los endpoints mas lentos con k6 en modo debug y optimizar consultas o agregar cache."
                        evidencia             = $f.FullName.Replace($Root.Path, '.')
                        estado                = 'ABIERTO'
                        sprint_objetivo       = ''
                        fecha_cierre          = ''
                    })
                    $K6Count++
                }
            }

            # Error rate > 1%
            if ($metrics.'http_req_failed') {
                $errRate = $metrics.'http_req_failed'.rate
                if ($errRate -and $errRate -gt 0.01) {
                    $pct = [math]::Round($errRate * 100, 2)
                    $Hallazgos.Add(@{
                        id                    = New-ID
                        fecha_deteccion       = $FechaHoraTS
                        herramienta           = 'k6'
                        tipo_prueba           = 'Performance'
                        caracteristica_iso25010 = 'Fiabilidad'
                        hallazgo              = "Tasa de error HTTP = $pct% supera el umbral de 1%"
                        significado           = "Un $pct% de las solicitudes HTTP fallaron durante la prueba de carga, indicando inestabilidad bajo presion."
                        impacto_tecnico       = "El servidor retorno errores 4xx/5xx en una proporcion significativa de requests."
                        impacto_negocio       = "Los usuarios pueden encontrar errores al operar el sistema durante horarios de alta demanda."
                        severidad             = if ($pct -gt 5) { 'CRITICA' } elseif ($pct -gt 2) { 'ALTA' } else { 'MEDIA' }
                        componente_afectado   = 'API/Backend'
                        responsable_sugerido  = 'Backend'
                        recomendacion         = "Revisar logs del servidor durante la prueba y aumentar la capacidad de manejo concurrente."
                        evidencia             = $f.FullName.Replace($Root.Path, '.')
                        estado                = 'ABIERTO'
                        sprint_objetivo       = ''
                        fecha_cierre          = ''
                    })
                    $K6Count++
                }
            }
        } catch { if ($Verbose) { Write-Warn "  No se pudo parsear: $($f.Name)" } }
    }
    if ($K6Count -gt 0) { Write-Ok "  k6: $K6Count hallazgos" }
    else { Write-Skip "  k6: sin alertas de performance (o sin reportes)" }
}

# ══════════════════════════════════════════════════════════════════════════════
# BLOQUE 4 — OWASP ZAP
# ══════════════════════════════════════════════════════════════════════════════
if ($TodosTipos -or $TipoPrueba -contains 'Seguridad') {
    Write-Step "Extrayendo: OWASP ZAP"
    $ZapJsons = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter 'zap-baseline-report.json' -Recurse -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1

    $ZapCount  = 0
    $zapSevMap = @{ '3' = 'CRITICA'; '2' = 'ALTA'; '1' = 'MEDIA'; '0' = 'BAJA' }
    foreach ($f in $ZapJsons) {
        try {
            $data = Get-Content $f.FullName -Raw | ConvertFrom-Json
            $site = $data.site | Select-Object -First 1
            foreach ($alert in $site.alerts) {
                $zapRisk  = $alert.riskcode.ToString()
                $zapSev   = if ($zapSevMap.ContainsKey($zapRisk)) { $zapSevMap[$zapRisk] } else { 'BAJA' }
                $zapUrls  = ($alert.instances | Select-Object -First 3 | ForEach-Object { $_.uri }) -join '; '
                $zapDesc  = "$($alert.desc)"
                $zapSol   = "$($alert.solution)"
                $zapResp  = if ($alert.riskcode -in @('3', '2')) { 'DevOps/Backend' } else { 'Frontend' }
                $zapEvid  = $f.FullName.Replace($Root.Path, '.')
                $Hallazgos.Add(@{
                    id                    = New-ID
                    fecha_deteccion       = $FechaHoraTS
                    herramienta           = 'OWASP ZAP'
                    tipo_prueba           = 'Seguridad'
                    caracteristica_iso25010 = 'Seguridad'
                    hallazgo              = "$($alert.alert) [Risk: $($alert.riskdesc)]"
                    significado           = $zapDesc
                    impacto_tecnico       = "URLs afectadas: $zapUrls"
                    impacto_negocio       = 'Esta vulnerabilidad puede comprometer la confidencialidad, integridad o disponibilidad del sistema REGINSA.'
                    severidad             = $zapSev
                    componente_afectado   = 'Aplicacion Web'
                    responsable_sugerido  = $zapResp
                    recomendacion         = $zapSol
                    evidencia             = $zapEvid
                    estado                = 'ABIERTO'
                    sprint_objetivo       = ''
                    fecha_cierre          = ''
                })
                $ZapCount++
            }
        } catch { if ($Verbose) { Write-Warn '  No se pudo parsear ZAP JSON' } }
    }
    if ($ZapCount -gt 0) { Write-Ok "  OWASP ZAP: $ZapCount hallazgos" }
    else { Write-Skip '  OWASP ZAP: sin alertas (o sin reportes)' }

    # ── SonarQube ──────────────────────────────────────────────────────────
    Write-Step "Extrayendo: SonarQube"
    $SonarJsons = Get-ChildItem -Path (Join-Path $Reportes 'security\sonar') -Filter '*.json' -Recurse -ErrorAction SilentlyContinue |
                  Sort-Object LastWriteTime -Descending | Select-Object -First 3

    $SonarCount = 0
    foreach ($f in $SonarJsons) {
        try {
            $data = Get-Content $f.FullName -Raw | ConvertFrom-Json
            $issues = if ($data.issues) { $data.issues } elseif ($data.components) { $null } else { $null }
            if (!$issues) { continue }
            foreach ($issue in $issues) {
                if ($issue.status -in @('CLOSED','RESOLVED','WONTFIX')) { continue }
                $snrSev  = Map-Severity (if ($issue.severity) { $issue.severity } else { 'INFO' })
                $snrChar = if ($issue.type -in @('VULNERABILITY','SECURITY_HOTSPOT')) { 'Seguridad' } elseif ($issue.type -eq 'BUG') { 'Fiabilidad' } else { 'Mantenibilidad' }
                $snrComp = if ($issue.component) { $issue.component } else { 'Desconocido' }
                $snrLine = if ($null -ne $issue.line) { [string]$issue.line } else { '0' }
                $snrBiz  = if ($issue.type -eq 'VULNERABILITY') { 'Esta vulnerabilidad puede exponer el sistema a ataques si no se corrige.' } else { 'Aumenta la deuda tecnica y dificulta el mantenimiento del codigo.' }
                $snrEvid = $f.FullName.Replace($Root.Path, '.')
                $Hallazgos.Add(@{
                    id                    = New-ID
                    fecha_deteccion       = $FechaHoraTS
                    herramienta           = 'SonarQube'
                    tipo_prueba           = 'Seguridad'
                    caracteristica_iso25010 = $snrChar
                    hallazgo              = "$($issue.type): $($issue.message)"
                    significado           = "SonarQube detecto tipo '$($issue.type)' en '$snrComp' linea ${snrLine}: $($issue.message)"
                    impacto_tecnico       = "Archivo: $snrComp — Regla: $($issue.rule)"
                    impacto_negocio       = $snrBiz
                    severidad             = $snrSev
                    componente_afectado   = $snrComp
                    responsable_sugerido  = 'Equipo de Desarrollo'
                    recomendacion         = "Aplicar la solucion recomendada por la regla $($issue.rule) en SonarQube."
                    evidencia             = $snrEvid
                    estado                = 'ABIERTO'
                    sprint_objetivo       = ''
                    fecha_cierre          = ''
                })
                $SonarCount++
            }
        } catch { if ($Verbose) { Write-Warn "  No se pudo parsear: $($f.Name)" } }
    }
    if ($SonarCount -gt 0) { Write-Ok "  SonarQube: $SonarCount hallazgos" }
    else { Write-Skip "  SonarQube: sin issues (o sin reportes)" }

    # ── Trivy ──────────────────────────────────────────────────────────────
    Write-Step "Extrayendo: Trivy"
    $TrivyJson = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter '*trivy*.json' -Recurse -ErrorAction SilentlyContinue |
                 Sort-Object LastWriteTime -Descending | Select-Object -First 1

    $TrivyCount = 0
    if ($TrivyJson) {
        try {
            $data = Get-Content $TrivyJson.FullName -Raw | ConvertFrom-Json
            $results = $data.Results ?? @()
            foreach ($result in $results) {
                foreach ($vuln in ($result.Vulnerabilities ?? @())) {
                    $sev = Map-Severity ($vuln.Severity ?? 'UNKNOWN')
                    if ($sev -notin @('CRITICA','ALTA')) { continue }  # Solo critica/alta
                    $trivTitle = if ($vuln.Title) { $vuln.Title } else { $vuln.VulnerabilityID }

                    # Severidad en español para el significado
                    $sevLabel = switch ($sev) {
                        'CRITICA' { 'critica' }
                        'ALTA'    { 'alta'    }
                        'MEDIA'   { 'media'   }
                        default   { 'baja'    }
                    }
                    # CVSSScore si existe
                    $cvssInfo = ''
                    if ($vuln.CVSS) {
                        $nvdScore = $vuln.CVSS.nvd.V3Score ?? $vuln.CVSS.nvd.V2Score ?? $null
                        $ghsaScore = $vuln.CVSS.ghsa.V3Score ?? $null
                        $scoreVal = $nvdScore ?? $ghsaScore
                        if ($scoreVal) { $cvssInfo = " (CVSS $scoreVal)" }
                    }
                    # CWEs si existen
                    $cweInfo = ''
                    if ($vuln.CweIDs -and $vuln.CweIDs.Count -gt 0) {
                        $cweInfo = " — CWE: $($vuln.CweIDs -join ', ')"
                    }

                    $trivSig = "Vulnerabilidad de severidad $sevLabel$cvssInfo en el paquete '$($vuln.PkgName)' " +
                               "(version instalada: $($vuln.InstalledVersion))$cweInfo. " +
                               "Identificada como $($vuln.VulnerabilityID): $trivTitle."

                    # Construir impacto tecnico en español basado en datos estructurados del CVE
                    $fixInfo = if ($vuln.FixedVersion) {
                        "Version corregida disponible: $($vuln.FixedVersion)."
                    } else {
                        "Sin version corregida disponible aun — mantener monitoreado."
                    }

                    # Clasificar el tipo de vulnerabilidad segun CWE o palabras clave del titulo
                    $tipoVuln = if ($vuln.CweIDs -and $vuln.CweIDs.Count -gt 0) {
                        $cweMap = @{
                            'CWE-79'  = 'Cross-Site Scripting (XSS)'
                            'CWE-89'  = 'Inyeccion SQL'
                            'CWE-94'  = 'Inyeccion de codigo'
                            'CWE-400' = 'Consumo no controlado de recursos (DoS)'
                            'CWE-20'  = 'Validacion incorrecta de entradas'
                            'CWE-22'  = 'Recorrido de rutas (Path Traversal)'
                            'CWE-200' = 'Exposicion de informacion sensible'
                            'CWE-352' = 'Cross-Site Request Forgery (CSRF)'
                            'CWE-611' = 'Procesamiento inseguro de XML (XXE)'
                            'CWE-601' = 'Redireccionamiento abierto'
                        }
                        $matched = $vuln.CweIDs | ForEach-Object { if ($cweMap.ContainsKey($_)) { $cweMap[$_] } else { $_ } }
                        $matched -join ', '
                    } elseif ($trivTitle -match 'XSS|scripting') { 'Cross-Site Scripting (XSS)' }
                      elseif ($trivTitle -match 'inject') { 'Inyeccion de codigo' }
                      elseif ($trivTitle -match 'denial|DoS|resource') { 'Denegacion de servicio (DoS)' }
                      elseif ($trivTitle -match 'prototype') { 'Contaminacion de prototipo (Prototype Pollution)' }
                      elseif ($trivTitle -match 'path.*trav|trav.*path') { 'Recorrido de rutas (Path Traversal)' }
                      elseif ($trivTitle -match 'CSRF|forgery') { 'Cross-Site Request Forgery (CSRF)' }
                      elseif ($trivTitle -match 'secret|token|credential') { 'Exposicion de credenciales' }
                      else { 'Vulnerabilidad de seguridad' }

                    $trivImpacto = "Tipo: $tipoVuln. " +
                                   "Paquete '$($vuln.PkgName)' v$($vuln.InstalledVersion) contiene $($vuln.VulnerabilityID)$cvssInfo$cweInfo. " +
                                   $fixInfo

                    # Impacto de negocio segun tipo de vulnerabilidad
                    $trivNegocio = switch -Wildcard ($tipoVuln) {
                        '*XSS*'         { "Un atacante puede inyectar scripts en el navegador del usuario, robar sesiones o redirigir a paginas maliciosas en REGINSA." }
                        '*Inyeccion*'   { "Un atacante puede ejecutar codigo arbitrario en el servidor o acceder a datos no autorizados del sistema." }
                        '*DoS*'         { "El servicio puede quedar inaccesible ante un ataque de denegacion de servicio, afectando la disponibilidad de REGINSA." }
                        '*Prototype*'   { "Un atacante puede modificar el comportamiento de objetos JavaScript en el servidor, causando ejecucion arbitraria de codigo." }
                        '*Path*'        { "Un atacante puede acceder a archivos del sistema de archivos fuera del directorio permitido." }
                        '*CSRF*'        { "Un atacante puede engañar al usuario autenticado para ejecutar acciones no autorizadas en su nombre." }
                        '*credencial*'  { "Credenciales o tokens pueden quedar expuestos, permitiendo acceso no autorizado al sistema." }
                        default         { "La dependencia '$($vuln.PkgName)' con severidad $sevLabel puede ser explotada para comprometer la confidencialidad, integridad o disponibilidad critica del sistema REGINSA." }
                    }

                    $trivRec = if ($vuln.FixedVersion) {
                        "Actualizar '$($vuln.PkgName)' de v$($vuln.InstalledVersion) a v$($vuln.FixedVersion) para corregir $($vuln.VulnerabilityID). Ejecutar: npm update $($vuln.PkgName) (o equivalente segun gestor de paquetes)."
                    } else {
                        "No existe version corregida para $($vuln.VulnerabilityID). Evaluar reemplazo del paquete '$($vuln.PkgName)' o aplicar mitigacion en capa de aplicacion. Monitorear NVD/GitHub Advisory."
                    }
                    $trivEvid  = $TrivyJson.FullName.Replace($Root.Path, '.')
                    $Hallazgos.Add(@{
                        id                    = New-ID
                        fecha_deteccion       = $FechaHoraTS
                        herramienta           = 'Trivy'
                        tipo_prueba           = 'Seguridad'
                        caracteristica_iso25010 = 'Seguridad'
                        hallazgo              = "$($vuln.VulnerabilityID): $($vuln.PkgName)@$($vuln.InstalledVersion)"
                        significado           = $trivSig
                        impacto_tecnico       = $trivImpacto
                        impacto_negocio       = $trivNegocio
                        severidad             = $sev
                        componente_afectado   = "$($vuln.PkgName) — $($result.Target)"
                        responsable_sugerido  = 'DevOps'
                        recomendacion         = $trivRec
                        evidencia             = $trivEvid
                        estado                = 'ABIERTO'
                        sprint_objetivo       = ''
                        fecha_cierre          = ''
                    })
                    $TrivyCount++
                }
            }
        } catch { if ($Verbose) { Write-Warn "  No se pudo parsear Trivy JSON" } }
    }
    if ($TrivyCount -gt 0) { Write-Ok "  Trivy: $TrivyCount hallazgos CRITICA/ALTA" }
    else { Write-Skip "  Trivy: sin CVEs criticos/altos (o sin reportes)" }

    # ── Gitleaks ───────────────────────────────────────────────────────────
    Write-Step "Extrayendo: Gitleaks"
    $GitleaksJson = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter '*gitleaks*.json' -Recurse -ErrorAction SilentlyContinue |
                    Sort-Object LastWriteTime -Descending | Select-Object -First 1

    $GitleaksCount = 0
    if ($GitleaksJson) {
        try {
            $data = Get-Content $GitleaksJson.FullName -Raw | ConvertFrom-Json
            foreach ($leak in $data) {
                $leakFile  = if ($leak.File) { $leak.File } else { 'Desconocido' }
                $leakRule  = if ($leak.RuleID) { $leak.RuleID } else { $leak.Description }
                $leakLine  = if ($null -ne $leak.StartLine) { [string]$leak.StartLine } else { '0' }
                $leakComm  = if ($leak.Commit) { $leak.Commit } else { 'N/A' }
                $leakEvid  = $GitleaksJson.FullName.Replace($Root.Path, '.')
                $Hallazgos.Add(@{
                    id                    = New-ID
                    fecha_deteccion       = $FechaHoraTS
                    herramienta           = 'Gitleaks'
                    tipo_prueba           = 'Seguridad'
                    caracteristica_iso25010 = 'Seguridad'
                    hallazgo              = "Secreto detectado: Tipo=$leakRule"
                    significado           = "Se encontro un posible secreto (credencial, token o clave API) en el codigo fuente. Tipo: $leakRule. IMPORTANTE: El valor no se muestra por seguridad."
                    impacto_tecnico       = "Archivo: $leakFile — Linea: $leakLine — Commit: $leakComm"
                    impacto_negocio       = 'La exposicion de credenciales puede comprometer la seguridad del sistema y datos sensibles.'
                    severidad             = 'CRITICA'
                    componente_afectado   = $leakFile
                    responsable_sugerido  = 'DevOps/Seguridad'
                    recomendacion         = '1) Revocar inmediatamente el secreto expuesto. 2) Usar variables de entorno o Azure Key Vault. 3) Agregar el patron a .gitignore.'
                    evidencia             = $leakEvid
                    estado                = 'ABIERTO'
                    sprint_objetivo       = ''
                    fecha_cierre          = ''
                })
                $GitleaksCount++
            }
        } catch { if ($Verbose) { Write-Warn "  No se pudo parsear Gitleaks JSON" } }
    }
    if ($GitleaksCount -gt 0) { Write-Ok "  Gitleaks: $GitleaksCount hallazgos" }
    else { Write-Skip "  Gitleaks: sin secretos detectados (o sin reportes)" }

    # ── Semgrep ────────────────────────────────────────────────────────────
    Write-Step "Extrayendo: Semgrep"
    $SemgrepJson = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter '*semgrep*.json' -Recurse -ErrorAction SilentlyContinue |
                   Sort-Object LastWriteTime -Descending | Select-Object -First 1

    $SemgrepCount = 0
    if ($SemgrepJson) {
        try {
            $data = Get-Content $SemgrepJson.FullName -Raw | ConvertFrom-Json
            $findings = $data.results ?? $data.findings ?? @()
            foreach ($finding in $findings) {
                $sev = Map-Severity ($finding.extra.severity ?? $finding.severity ?? 'WARNING')
                $Hallazgos.Add(@{
                    id                    = New-ID
                    fecha_deteccion       = $FechaHoraTS
                    herramienta           = 'Semgrep'
                    tipo_prueba           = 'Seguridad'
                    caracteristica_iso25010 = 'Seguridad'
                    hallazgo              = "[$($finding.check_id)] $($finding.extra.message ?? $finding.message ?? '')"
                    significado           = "Analisis estatico de seguridad detecto: $($finding.extra.message ?? $finding.message ?? '')"
                    impacto_tecnico       = "Archivo: $($finding.path) — Linea: $($finding.start.line ?? 0)"
                    impacto_negocio       = 'Patron de codigo inseguro que puede conducir a vulnerabilidades en produccion.'
                    severidad             = $sev
                    componente_afectado   = $finding.path
                    responsable_sugerido  = 'Equipo de Desarrollo'
                    recomendacion         = "Aplicar el fix sugerido por la regla $($finding.check_id)."
                    evidencia             = $SemgrepJson.FullName.Replace($Root.Path, '.')
                    estado                = 'ABIERTO'
                    sprint_objetivo       = ''
                    fecha_cierre          = ''
                })
                $SemgrepCount++
            }
        } catch { if ($Verbose) { Write-Warn "  No se pudo parsear Semgrep JSON" } }
    }
    if ($SemgrepCount -gt 0) { Write-Ok "  Semgrep: $SemgrepCount hallazgos" }
    else { Write-Skip "  Semgrep: sin hallazgos (o sin reportes)" }
}

# ══════════════════════════════════════════════════════════════════════════════
# BLOQUE 5 — LIGHTHOUSE (Accesibilidad / Performance Web)
# ══════════════════════════════════════════════════════════════════════════════
if ($TodosTipos -or $TipoPrueba -contains 'Accesibilidad' -or $TipoPrueba -contains 'Performance') {
    Write-Step "Extrayendo: Lighthouse"
    $LhDir    = Join-Path $Reportes 'security\lighthouse'
    $LhJson   = Get-ChildItem -Path $LhDir -Filter 'lighthouse-resumen.json' -Recurse -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1

    $LhCount = 0
    if ($LhJson) {
        try {
            $lh = Get-Content $LhJson.FullName -Raw | ConvertFrom-Json
            $umbrales = @{
                performance   = @{ min = 70; etiqueta = 'Performance' }
                accessibility = @{ min = 80; etiqueta = 'Accesibilidad' }
                'best-practices' = @{ min = 80; etiqueta = 'Mejores Practicas' }
                seo           = @{ min = 80; etiqueta = 'SEO' }
            }
            $scores = $lh.scores ?? $lh.promedio ?? $lh
            foreach ($cat in $umbrales.Keys) {
                $score = $null
                if ($scores -is [hashtable] -and $scores.ContainsKey($cat)) {
                    $score = $scores[$cat]
                } elseif ($scores.PSObject.Properties[$cat]) {
                    $score = $scores.$cat
                }
                if ($null -eq $score) { continue }
                $umbral = $umbrales[$cat].min
                if ($score -lt $umbral) {
                    $sev = if ($score -lt ($umbral - 20)) { 'ALTA' } else { 'MEDIA' }
                    $Hallazgos.Add(@{
                        id                    = New-ID
                        fecha_deteccion       = $FechaHoraTS
                        herramienta           = 'Lighthouse'
                        tipo_prueba           = 'Accesibilidad'
                        caracteristica_iso25010 = if ($umbrales[$cat].etiqueta -eq 'Accesibilidad') { 'Usabilidad' } else { 'Eficiencia de Rendimiento' }
                        hallazgo              = "Score $($umbrales[$cat].etiqueta) = $score (umbral: $umbral)"
                        significado           = "La pagina obtuvo un puntaje de $score en $($umbrales[$cat].etiqueta), por debajo del umbral aceptable de $umbral."
                        impacto_tecnico       = "Lighthouse reporta oportunidades de mejora en la categoria $($umbrales[$cat].etiqueta)."
                        impacto_negocio       = if ($cat -eq 'accessibility') {
                            'Usuarios con discapacidad o necesidades especiales pueden tener dificultades para usar el sistema.'
                        } elseif ($cat -eq 'performance') {
                            'La lentitud de carga afecta la experiencia del usuario y puede aumentar la tasa de abandono.'
                        } else { "El sistema no cumple los estandares de $($umbrales[$cat].etiqueta)." }
                        severidad             = $sev
                        componente_afectado   = 'Aplicacion Web — Frontend'
                        responsable_sugerido  = 'Frontend'
                        recomendacion         = "Revisar el reporte HTML de Lighthouse en $($LhJson.DirectoryName) para ver las oportunidades de mejora especificas."
                        evidencia             = $LhJson.FullName.Replace($Root.Path, '.')
                        estado                = 'ABIERTO'
                        sprint_objetivo       = ''
                        fecha_cierre          = ''
                    })
                    $LhCount++
                }
            }
        } catch { if ($Verbose) { Write-Warn "  No se pudo parsear Lighthouse JSON" } }
    }
    if ($LhCount -gt 0) { Write-Ok "  Lighthouse: $LhCount hallazgos" }
    else { Write-Skip "  Lighthouse: scores dentro de umbral (o sin reportes)" }
}

# ══════════════════════════════════════════════════════════════════════════════
# BLOQUE 6 — INCONSISTENCIAS FRONTEND vs BACKEND (entrada manual del QA)
# Archivo: reportes/inconsistencias-fvb.json
# Propósito: documentar validaciones presentes solo en Angular y ausentes en API
# ══════════════════════════════════════════════════════════════════════════════
{
    Write-Step "Extrayendo: Inconsistencias Frontend vs Backend"
    $FvBPath = Join-Path $Reportes 'inconsistencias-fvb.json'
    $FvBCount = 0
    if (Test-Path $FvBPath) {
        try {
            $fvbData = Get-Content $FvBPath -Raw -Encoding UTF8 | ConvertFrom-Json
            # Filtrar entradas válidas (tienen subtipo, endpoint y campo)
            $entradas = $fvbData | Where-Object {
                $_ -is [PSCustomObject] -and
                $_.subtipo -and $_.endpoint -and $_.campo
            }
            foreach ($e in $entradas) {
                $sev = switch (($e.severidad_sugerida ?? 'MEDIA').ToUpper()) {
                    'CRITICA' { 'CRITICA' }
                    'ALTA'    { 'ALTA'    }
                    'MEDIA'   { 'MEDIA'   }
                    default   { 'BAJA'    }
                }
                $Hallazgos.Add(@{
                    id                      = New-ID
                    fecha_deteccion         = if ($e.fecha_deteccion) { $e.fecha_deteccion } else { $FechaHoraTS }
                    herramienta             = 'k6/Newman (bypass)'
                    tipo_prueba             = 'Inconsistencia-FvB'
                    caracteristica_iso25010 = 'Seguridad / Mantenibilidad'
                    hallazgo                = "[$($e.subtipo)] $($e.flujo) — campo '$($e.campo)' sin validar en backend"
                    significado             = "El campo '$($e.campo)' del endpoint $($e.metodo ?? 'POST') $($e.endpoint) tiene validacion solo en el frontend Angular. La API acepta el valor sin restriccion cuando se llama directamente. Validacion Angular: $($e.validacion_frontend)"
                    impacto_tecnico         = "Endpoint: $($e.metodo ?? '') $($e.endpoint) | Payload de ejemplo: $($e.payload_ejemplo ?? '-')"
                    impacto_negocio         = "Cualquier cliente con token JWT puede bypassear las validaciones del formulario y enviar datos inválidos o incompletos a la base de datos, comprometiendo la integridad de la informacion del sistema."
                    severidad               = $sev
                    componente_afectado     = "$($e.flujo) — $($e.endpoint)"
                    responsable_sugerido    = $e.responsable ?? 'Backend'
                    recomendacion           = $e.recomendacion ?? "Implementar validacion equivalente en la capa Application.Validator del backend (.NET FluentValidation)."
                    evidencia               = $e.evidencia ?? 'reportes/inconsistencias-fvb.json'
                    estado                  = $e.estado ?? 'ABIERTO'
                    sprint_objetivo         = ''
                    fecha_cierre            = ''
                    capa_afectada           = 'Frontend-Only'
                    subtipo_fvb             = $e.subtipo
                    comportamiento_api      = $e.comportamiento_api_sin_front ?? ''
                })
                $FvBCount++
            }
        } catch { if ($Verbose) { Write-Warn "  No se pudo parsear inconsistencias-fvb.json: $($_.Exception.Message)" } }
    }
    if ($FvBCount -gt 0) { Write-Ok "  Inconsistencias F/B: $FvBCount hallazgos" }
    else { Write-Skip "  Inconsistencias F/B: archivo no encontrado o sin entradas (reportes/inconsistencias-fvb.json)" }
}

# ══════════════════════════════════════════════════════════════════════════════
# GUARDAR JSON CONSOLIDADO
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "── Guardando consolidado ────────────────────────────────────────" -ForegroundColor Cyan

$output = @{
    meta = @{
        sistema          = 'REGINSA'
        autora           = 'Liz Vidal'
        area             = 'Aseguramiento de Calidad de Software'
        estandares       = @('ISTQB', 'ISO/IEC 25010', 'NTP ISO/IEC 12207')
        fecha_generacion = $FechaHoraTS
        tipos_extraidos  = $TipoPrueba
        total_hallazgos  = @($Hallazgos).Count
        resumen          = @{
            CRITICA = @($Hallazgos | Where-Object { $_.severidad -eq 'CRITICA' }).Count
            ALTA    = @($Hallazgos | Where-Object { $_.severidad -eq 'ALTA'    }).Count
            MEDIA   = @($Hallazgos | Where-Object { $_.severidad -eq 'MEDIA'   }).Count
            BAJA    = @($Hallazgos | Where-Object { $_.severidad -eq 'BAJA'    }).Count
        }
    }
    hallazgos = @($Hallazgos) | Sort-Object {
        switch ($_.severidad) { 'CRITICA' {0} 'ALTA' {1} 'MEDIA' {2} 'BAJA' {3} default {4} }
    } | ForEach-Object { [PSCustomObject]$_ }
}

$output | ConvertTo-Json -Depth 10 | Set-Content -Path $Salida -Encoding UTF8
Write-Ok "Guardado: $Salida"

# ══════════════════════════════════════════════════════════════════════════════
# RESUMEN FINAL
# ══════════════════════════════════════════════════════════════════════════════
$r = $output.meta.resumen
Write-Host ""
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host "  RESUMEN DE HALLAZGOS" -ForegroundColor Magenta
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host ("  Total hallazgos : {0}" -f @($Hallazgos).Count) -ForegroundColor White
Write-Host ("  CRITICA         : {0}" -f $r.CRITICA) -ForegroundColor Red
Write-Host ("  ALTA            : {0}" -f $r.ALTA)    -ForegroundColor DarkYellow
Write-Host ("  MEDIA           : {0}" -f $r.MEDIA)   -ForegroundColor Yellow
Write-Host ("  BAJA            : {0}" -f $r.BAJA)    -ForegroundColor Green
Write-Host ""

$semaforo = if ($r.CRITICA -gt 0) { '🔴 ESTADO CRITICO' } `
            elseif ($r.ALTA -gt 0) { '🟡 ESTADO ADVERTENCIA' } `
            else { '🟢 ESTADO ACEPTABLE' }
Write-Host "  Estado general  : $semaforo" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Siguiente paso: npm run report:word   (Informe Word)"
Write-Host "                  npm run report:excel  (Libro Excel)"
Write-Host "                  npm run report:completo (ambos)"
Write-Host ""
