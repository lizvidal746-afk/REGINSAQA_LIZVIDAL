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

# ── Explicacion simple para no-tecnicos (coordinador, jefatura) ────────────
function Get-ExplicacionSimple {
    param(
        [string]$Herramienta,
        [string]$Severidad
    )
    $base = switch -Wildcard ($Herramienta) {
        '*Trivy*'      { "Una libreria del proyecto tiene una vulnerabilidad publica conocida (CVE). Si un atacante la encuentra puede aprovecharla para ingresar al sistema. Debe actualizarse a la version corregida." }
        '*Semgrep*'    { "El analizador de codigo encontro una linea sospechosa que sigue un patron historicamente inseguro (por ejemplo manejo de datos sin validar). El desarrollador debe revisar y aplicar la correccion sugerida." }
        '*Bearer*'     { "Se detecto que datos sensibles (informacion personal o credenciales) podrian estar viajando o almacenandose sin proteccion. Debe revisarse el flujo y agregar cifrado o validacion." }
        '*Gitleaks*'   { "Se encontro un posible secreto (clave, contrasena o token) escrito directamente en el codigo. Si esto llega a produccion, cualquiera con acceso al repositorio podria usarlo. Debe revocarse y mover a variables de entorno." }
        '*TruffleHog*' { "Igual que Gitleaks: se detecto algo que parece una credencial dentro del historial git. Debe verificarse y, si es real, revocarse y rotarse." }
        '*OSV*'        { "Una libreria del proyecto figura en la base oficial de vulnerabilidades de Google (OSV). Hay que actualizarla a una version segura." }
        '*OWASP DepCheck*' { "El proyecto usa una libreria con CVE registrado en la base nacional de vulnerabilidades (NVD). Debe actualizarse." }
        '*Retire*'     { "Una libreria JavaScript del frontend esta desactualizada y tiene problemas conocidos. Debe reemplazarse por la version mas reciente." }
        '*Grype*'      { "El escaner de dependencias detecto CVE en componentes del proyecto. Igual que Trivy: actualizar al fix disponible." }
        '*OWASP ZAP*'  { "El escaneo dinamico contra el sistema en linea encontro una respuesta o configuracion del servidor que puede aprovecharse (ej: cabeceras inseguras, cookies sin proteccion). El equipo de infraestructura/desarrollo debe corregir la configuracion." }
        '*Nikto*'      { "El servidor web tiene archivos o configuraciones por defecto expuestas que un atacante podria descubrir y usar. Debe quitarse o protegerse." }
        '*Wapiti*'     { "Wapiti probo enviar valores maliciosos (SQL injection, XSS, etc) y el sistema respondio de forma anomala. Debe revisarse el endpoint y reforzar la validacion." }
        '*Nuclei*'     { "Nuclei detecto que el servidor coincide con un patron de vulnerabilidad publica. Confirmar con el equipo de seguridad y aplicar el parche o configuracion correctiva." }
        '*Restler*'    { "El fuzzer de API envio peticiones malformadas y la API devolvio respuestas inesperadas. Debe validarse mejor las entradas en el backend." }
        '*Lynis*'      { "El analisis de hardening del sistema operativo encontro configuraciones que se pueden endurecer (ej: SSH abierto, kernel sin parches). Tarea para Infraestructura." }
        '*CodeQL*'     { "El analizador semantico de GitHub encontro un patron de codigo riesgoso. Recomendable revisar la sugerencia y refactorizar." }
        '*Checkov*'    { "Una pieza de infraestructura como codigo (Dockerfile, GitHub Actions) tiene una mala practica de seguridad. Debe corregirse antes del despliegue." }
        '*Sonar*'      { "SonarQube detecto un problema de calidad o seguridad de codigo. Para CRITICA/BUG debe corregirse pronto; para Hotspot debe revisarse manualmente y marcarse como seguro o vulnerable." }
        '*Nmap*'       { "Escaneo de red Nmap. Si dice NO_EJECUTADO, esta categoria no se midio (requiere autorizacion previa). Si dice CVE, hay un servicio expuesto que puede explotarse." }
        '*Newman*'     { "Una validacion automatica de API (colecciones Postman) fallo. Significa que un endpoint no devolvio lo esperado. Es bug funcional o de contrato." }
        '*k6*'         { "Las pruebas de carga detectaron que la API responde lento o falla bajo carga. Debe optimizarse el endpoint o ampliar recursos del servidor." }
        '*Playwright*' { "Una prueba funcional automatica fallo: una pantalla, formulario o flujo de usuario no se comporto como deberia." }
        '*Lighthouse*' { "Lighthouse detecto problemas de rendimiento, accesibilidad o SEO en el frontend. Afecta la experiencia de usuario." }
        '*bypass*'     { "Inconsistencia Frontend-Backend: el formulario valida en pantalla pero la API acepta valores invalidos cuando se llama directamente. Riesgo: cualquier cliente con token puede saltarse las reglas del UI." }
        default        { "Hallazgo de aseguramiento de calidad. Revisar la recomendacion y asignar al responsable indicado." }
    }
    # Anexar urgencia segun severidad
    $urgencia = switch ($Severidad) {
        'CRITICA' { ' URGENCIA: Resolver ANTES del proximo release.' }
        'ALTA'    { ' URGENCIA: Resolver en el sprint en curso.' }
        'MEDIA'   { ' URGENCIA: Programar correccion en proximo sprint.' }
        'BAJA'    { ' URGENCIA: Mejora deseable, sin bloqueante.' }
        default   { '' }
    }
    return ($base + $urgencia)
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
    # Busca cualquier JSON con 'zap' en el nombre dentro de reportes/security/
    # Cubre: zap-baseline-report.json, zap-full-report.json, zap_scan_*.json, etc.
    # Para reportes manuales: guarda el JSON en reportes/security/<cualquier-subcarpeta>/
    $ZapJsons = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter '*zap*.json' -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.Length -gt 10 } |
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
    # IMPORTANTE: Este bloque LEE datos de SonarQube — NO ejecuta el scanner.
    # Para tener datos frescos primero hay que correr: npm run sonar:scan
    # Fuente 1: API en vivo (si SONAR_HOST_URL esta disponible)
    # Fuente 2: JSON local en reportes/security/sonar/*.json (fallback)
    $SonarCount = 0
    $sonarUrl   = $env:SONAR_HOST_URL
    $sonarToken = $env:SONAR_TOKEN
    $sonarProjects = @('si091reginsabackend', 'si091reginsaenlinea', 'si091reginsafrontend')

    # Fuente 1: API en vivo
    if (-not [string]::IsNullOrWhiteSpace($sonarUrl) -and -not [string]::IsNullOrWhiteSpace($sonarToken)) {
        $headers = @{ Authorization = "Basic $([Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${sonarToken}:")))" }
        foreach ($proj in $sonarProjects) {
            try {
                # SonarQube 9.x: types + statuses + severities (sin &issueStatuses que es SQ10+)
                $uri  = "$sonarUrl/api/issues/search?componentKeys=$proj&types=VULNERABILITY,BUG&severities=CRITICAL,BLOCKER,MAJOR&statuses=OPEN,CONFIRMED,REOPENED&ps=500"
                $resp = Invoke-RestMethod -Uri $uri -Headers $headers -TimeoutSec 10 -ErrorAction Stop
                foreach ($issue in ($resp.issues ?? @())) {
                    $snrSev  = Map-Severity ($issue.severity ?? 'INFO')
                    $snrChar = if ($issue.type -in @('VULNERABILITY','SECURITY_HOTSPOT')) { 'Seguridad' } elseif ($issue.type -eq 'BUG') { 'Fiabilidad' } else { 'Mantenibilidad' }
                    $snrComp = $issue.component ?? 'Desconocido'
                    $snrLine = if ($null -ne $issue.line) { [string]$issue.line } else { '0' }
                    $Hallazgos.Add(@{
                        id                      = New-ID
                        fecha_deteccion         = $FechaHoraTS
                        herramienta             = 'SonarQube'
                        tipo_prueba             = 'Seguridad'
                        caracteristica_iso25010 = $snrChar
                        hallazgo                = "$($issue.type): $($issue.message)"
                        significado             = "SonarQube detecto '$($issue.type)' en '$snrComp' linea ${snrLine}: $($issue.message)"
                        impacto_tecnico         = "Proyecto: $proj — Archivo: $snrComp — Regla: $($issue.rule)"
                        impacto_negocio         = if ($issue.type -eq 'VULNERABILITY') { 'Vulnerabilidad que puede exponer el sistema a ataques.' } else { 'Deuda tecnica que dificulta el mantenimiento.' }
                        severidad               = $snrSev
                        componente_afectado     = $snrComp
                        responsable_sugerido    = 'Equipo de Desarrollo'
                        recomendacion           = "Revisar regla $($issue.rule) en SonarQube: $sonarUrl/project/issues?id=$proj"
                        evidencia               = "$sonarUrl/project/issues?id=$proj"
                        estado                  = 'ABIERTO'
                        sprint_objetivo         = ''
                        fecha_cierre            = ''
                    })
                    $SonarCount++
                }
            } catch { if ($Verbose) { Write-Warn "  SonarQube API error ($proj): $($_.Exception.Message)" } }
        }
        if ($SonarCount -gt 0) { Write-Ok "  SonarQube (API): $SonarCount hallazgos" }
    }

    # Fuente 2: JSON local (fallback cuando SonarQube no esta corriendo)
    if ($SonarCount -eq 0) {
        $SonarJsons = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter '*sonar*.json' -Recurse -ErrorAction SilentlyContinue |
                      Where-Object { $_.Length -gt 10 } |
                      Sort-Object LastWriteTime -Descending | Select-Object -First 3
        foreach ($f in $SonarJsons) {
            try {
                $data = Get-Content $f.FullName -Raw | ConvertFrom-Json
                $issues = $data.issues ?? @()
                foreach ($issue in $issues) {
                    if ($issue.status -in @('CLOSED','RESOLVED','WONTFIX')) { continue }
                    $snrSev  = Map-Severity ($issue.severity ?? 'INFO')
                    $snrChar = if ($issue.type -in @('VULNERABILITY','SECURITY_HOTSPOT')) { 'Seguridad' } elseif ($issue.type -eq 'BUG') { 'Fiabilidad' } else { 'Mantenibilidad' }
                    $Hallazgos.Add(@{
                        id                      = New-ID
                        fecha_deteccion         = $FechaHoraTS
                        herramienta             = 'SonarQube'
                        tipo_prueba             = 'Seguridad'
                        caracteristica_iso25010 = $snrChar
                        hallazgo                = "$($issue.type): $($issue.message)"
                        significado             = "SonarQube (local) detecto '$($issue.type)' en '$($issue.component ?? '')' linea $($issue.line ?? 0)"
                        impacto_tecnico         = "Archivo: $($issue.component ?? '') — Regla: $($issue.rule ?? '')"
                        impacto_negocio         = if ($issue.type -eq 'VULNERABILITY') { 'Vulnerabilidad que puede exponer el sistema a ataques.' } else { 'Deuda tecnica que dificulta el mantenimiento.' }
                        severidad               = $snrSev
                        componente_afectado     = $issue.component ?? 'Desconocido'
                        responsable_sugerido    = 'Equipo de Desarrollo'
                        recomendacion           = "Aplicar la solucion recomendada por la regla $($issue.rule ?? '') en SonarQube."
                        evidencia               = $f.FullName.Replace($Root.Path, '.')
                        estado                  = 'ABIERTO'
                        sprint_objetivo         = ''
                        fecha_cierre            = ''
                    })
                    $SonarCount++
                }
            } catch { if ($Verbose) { Write-Warn "  No se pudo parsear: $($f.Name)" } }
        }
        if ($SonarCount -gt 0) { Write-Ok "  SonarQube (JSON local): $SonarCount hallazgos" }
        else { Write-Skip "  SonarQube: sin issues (sonar no corriendo y sin JSON local)" }
    }

    # ── Trivy ──────────────────────────────────────────────────────────────
    Write-Step "Extrayendo: Trivy"
    # Preferir archivos en carpetas fechadas (yyyyMMdd / yyyy-MM-dd*) sobre carpetas sin fecha
    $TrivyJson = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter '*trivy*.json' -Recurse -ErrorAction SilentlyContinue |
                 Where-Object { $_.DirectoryName -match '\d{4}-\d{2}-\d{2}' } |
                 Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $TrivyJson) {
        $TrivyJson = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter '*trivy*.json' -Recurse -ErrorAction SilentlyContinue |
                     Sort-Object LastWriteTime -Descending | Select-Object -First 1
    }

    $TrivyCount = 0
    if ($TrivyJson) {
        try {
            # ReadAllText es mas fiable que Get-Content -Raw para JSON grandes (>5MB)
            $rawTrivy = [System.IO.File]::ReadAllText($TrivyJson.FullName, [System.Text.Encoding]::UTF8)
            $data = $rawTrivy | ConvertFrom-Json -Depth 30
            $results = if ($data.PSObject.Properties['Results']) { @($data.Results) } else { @() }
            foreach ($result in $results) {
                # En modo strict, acceder a una propiedad que no existe lanza error.
                # Trivy puede traer entries 'lang-pkgs' que solo tienen Packages (sin Vulnerabilities).
                $vulns = if ($result.PSObject.Properties['Vulnerabilities']) { @($result.Vulnerabilities) } else { @() }
                foreach ($vuln in $vulns) {
                    try {
                    $sev = Map-Severity ($vuln.Severity ?? 'UNKNOWN')
                    if ($sev -notin @('CRITICA','ALTA')) { continue }  # Solo critica/alta
                    $trivTitle = if ($vuln.PSObject.Properties['Title'] -and $vuln.Title) { $vuln.Title } else { $vuln.VulnerabilityID }

                    # Severidad en español para el significado
                    $sevLabel = switch ($sev) {
                        'CRITICA' { 'critica' }
                        'ALTA'    { 'alta'    }
                        'MEDIA'   { 'media'   }
                        default   { 'baja'    }
                    }
                    # CVSSScore si existe (proteccion contra estructura ausente)
                    $cvssInfo = ''
                    $scoreVal = $null
                    if ($vuln.PSObject.Properties['CVSS'] -and $vuln.CVSS) {
                        $cvssObj = $vuln.CVSS
                        if ($cvssObj.PSObject.Properties['nvd'] -and $cvssObj.nvd) {
                            if ($cvssObj.nvd.PSObject.Properties['V3Score']) { $scoreVal = $cvssObj.nvd.V3Score }
                            elseif ($cvssObj.nvd.PSObject.Properties['V2Score']) { $scoreVal = $cvssObj.nvd.V2Score }
                        }
                        if (-not $scoreVal -and $cvssObj.PSObject.Properties['ghsa'] -and $cvssObj.ghsa -and $cvssObj.ghsa.PSObject.Properties['V3Score']) {
                            $scoreVal = $cvssObj.ghsa.V3Score
                        }
                        if ($scoreVal) { $cvssInfo = " (CVSS $scoreVal)" }
                    }
                    # CWEs si existen
                    $cweInfo = ''
                    $cweList = @()
                    if ($vuln.PSObject.Properties['CweIDs'] -and $vuln.CweIDs) {
                        $cweList = @($vuln.CweIDs)
                        if ($cweList.Count -gt 0) { $cweInfo = " — CWE: $($cweList -join ', ')" }
                    }
                    $pkgName  = if ($vuln.PSObject.Properties['PkgName']) { $vuln.PkgName } else { '' }
                    $instVer  = if ($vuln.PSObject.Properties['InstalledVersion']) { $vuln.InstalledVersion } else { '' }
                    $fixedVer = if ($vuln.PSObject.Properties['FixedVersion']) { $vuln.FixedVersion } else { '' }
                    $vulnID   = if ($vuln.PSObject.Properties['VulnerabilityID']) { $vuln.VulnerabilityID } else { 'CVE-?' }

                    $trivSig = "Vulnerabilidad de severidad $sevLabel$cvssInfo en el paquete '$pkgName' " +
                               "(version instalada: $instVer)$cweInfo. " +
                               "Identificada como ${vulnID}: $trivTitle."

                    # Construir impacto tecnico en español basado en datos estructurados del CVE
                    $fixInfo = if ($fixedVer) {
                        "Version corregida disponible: $fixedVer."
                    } else {
                        "Sin version corregida disponible aun — mantener monitoreado."
                    }

                    # Clasificar el tipo de vulnerabilidad segun CWE o palabras clave del titulo
                    $tipoVuln = if ($cweList.Count -gt 0) {
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
                        $matched = $cweList | ForEach-Object { if ($cweMap.ContainsKey($_)) { $cweMap[$_] } else { $_ } }
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
                                   "Paquete '$pkgName' v$instVer contiene ${vulnID}${cvssInfo}${cweInfo}. " +
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
                        default         { "La dependencia '$pkgName' con severidad $sevLabel puede ser explotada para comprometer la confidencialidad, integridad o disponibilidad critica del sistema REGINSA." }
                    }

                    $trivRec = if ($fixedVer) {
                        "Actualizar '$pkgName' de v$instVer a v$fixedVer para corregir $vulnID. Ejecutar: npm update $pkgName (o equivalente segun gestor de paquetes)."
                    } else {
                        "No existe version corregida para $vulnID. Evaluar reemplazo del paquete '$pkgName' o aplicar mitigacion en capa de aplicacion. Monitorear NVD/GitHub Advisory."
                    }
                    $trivEvid  = $TrivyJson.FullName.Replace($Root.Path, '.')
                    $trivTarget = if ($result.PSObject.Properties['Target']) { $result.Target } else { '' }
                    $Hallazgos.Add(@{
                        id                    = New-ID
                        fecha_deteccion       = $FechaHoraTS
                        herramienta           = 'Trivy'
                        tipo_prueba           = 'Seguridad'
                        caracteristica_iso25010 = 'Seguridad'
                        hallazgo              = "${vulnID}: ${pkgName}@${instVer}"
                        significado           = $trivSig
                        impacto_tecnico       = $trivImpacto
                        impacto_negocio       = $trivNegocio
                        severidad             = $sev
                        componente_afectado   = "$pkgName — $trivTarget"
                        responsable_sugerido  = 'DevOps'
                        recomendacion         = $trivRec
                        evidencia             = $trivEvid
                        estado                = 'ABIERTO'
                        sprint_objetivo       = ''
                        fecha_cierre          = ''
                    })
                    $TrivyCount++
                    } catch { if ($Verbose) { Write-Warn "    Trivy vuln skip: $($_.Exception.Message)" } }
                }
            }
        } catch { if ($Verbose) { Write-Warn "  No se pudo parsear Trivy JSON: $($_.Exception.Message)" } else { Write-Warn "  Trivy parse error (usar -Verbose para detalle)" } }
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

    # ── Bearer (SAST - SARIF) ──────────────────────────────────────────────
    Write-Step "Extrayendo: Bearer"
    $BearerSarif = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter 'bearer-results.sarif' -Recurse -ErrorAction SilentlyContinue |
                   Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $BearerCount = 0
    if ($BearerSarif) {
        try {
            $data = Get-Content $BearerSarif.FullName -Raw | ConvertFrom-Json
            foreach ($run in ($data.runs ?? @())) {
                foreach ($result in ($run.results ?? @())) {
                    $bearerLevel = $result.level ?? 'warning'
                    $bearerSev   = switch ($bearerLevel) { 'error' { 'CRITICA' } 'warning' { 'ALTA' } default { 'MEDIA' } }
                    $bearerRule  = $result.ruleId ?? ''
                    $bearerMsg   = $result.message.text ?? ''
                    $bearerUri   = ($result.locations | Select-Object -First 1).physicalLocation.artifactLocation.uri ?? ''
                    $bearerLine  = ($result.locations | Select-Object -First 1).physicalLocation.region.startLine ?? 0
                    $Hallazgos.Add(@{
                        id                      = New-ID
                        fecha_deteccion         = $FechaHoraTS
                        herramienta             = 'Bearer'
                        tipo_prueba             = 'Seguridad'
                        caracteristica_iso25010 = 'Seguridad'
                        hallazgo                = "[$bearerRule] $bearerMsg"
                        significado             = "Bearer SAST detecto: $bearerMsg"
                        impacto_tecnico         = "Archivo: $bearerUri -- Linea: $bearerLine"
                        impacto_negocio         = 'Flujo de datos inseguro o exposicion de PII detectada en el codigo fuente.'
                        severidad               = $bearerSev
                        componente_afectado     = $bearerUri
                        responsable_sugerido    = 'Equipo de Desarrollo'
                        recomendacion           = "Aplicar el fix recomendado por la regla $bearerRule en Bearer."
                        evidencia               = $BearerSarif.FullName.Replace($Root.Path, '.')
                        estado                  = 'ABIERTO'
                        sprint_objetivo         = ''
                        fecha_cierre            = ''
                    })
                    $BearerCount++
                }
            }
        } catch { if ($Verbose) { Write-Warn '  No se pudo parsear Bearer SARIF' } }
    }
    if ($BearerCount -gt 0) { Write-Ok "  Bearer: $BearerCount hallazgos" }
    else { Write-Skip '  Bearer: sin hallazgos (o sin reportes)' }

    # ── TruffleHog (secretos en git) ───────────────────────────────────────
    Write-Step "Extrayendo: TruffleHog"
    $TruffleJson = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter 'trufflehog-results.json' -Recurse -ErrorAction SilentlyContinue |
                   Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $TruffleCount = 0
    if ($TruffleJson -and $TruffleJson.Length -gt 2) {
        try {
            # TruffleHog escribe JSONL (1 objeto JSON por linea) — NO un array JSON.
            # Las lineas de tipo info/stats no tienen DetectorName y se omiten.
            $lines = Get-Content $TruffleJson.FullName -Encoding UTF8
            $items = foreach ($ln in $lines) {
                $ln = $ln.Trim()
                if (-not $ln) { continue }
                try { $obj = $ln | ConvertFrom-Json; if ($obj.PSObject.Properties['DetectorName'] -or $obj.PSObject.Properties['detector_name']) { $obj } } catch { Write-Verbose "TruffleHog: linea JSONL invalida (omitida)" }
            }
            foreach ($item in @($items)) {
                $thDetector = $item.DetectorName ?? $item.detector_name ?? 'Unknown'
                $thVerified  = $item.Verified ?? $item.verified ?? $false
                $thSev       = if ($thVerified) { 'CRITICA' } else { 'ALTA' }
                $thFile      = $item.SourceMetadata.Data.Git.file ?? $item.SourceMetadata.Data.Filesystem.file ?? 'Desconocido'
                $thLine      = $item.SourceMetadata.Data.Git.line ?? 0
                $thCommit    = $item.SourceMetadata.Data.Git.commit ?? 'N/A'
                $Hallazgos.Add(@{
                    id                      = New-ID
                    fecha_deteccion         = $FechaHoraTS
                    herramienta             = 'TruffleHog'
                    tipo_prueba             = 'Seguridad'
                    caracteristica_iso25010 = 'Seguridad'
                    hallazgo                = "Secreto verificado=${thVerified}: Tipo=$thDetector"
                    significado             = "TruffleHog detecto un posible secreto de tipo '$thDetector'. Verificado: $thVerified. IMPORTANTE: El valor no se muestra por seguridad."
                    impacto_tecnico         = "Archivo: $thFile -- Linea: $thLine -- Commit: $thCommit"
                    impacto_negocio         = 'La exposicion de credenciales puede comprometer la seguridad del sistema y datos sensibles de REGINSA.'
                    severidad               = $thSev
                    componente_afectado     = $thFile
                    responsable_sugerido    = 'DevOps/Seguridad'
                    recomendacion           = '1) Revocar inmediatamente el secreto expuesto. 2) Usar variables de entorno o Azure Key Vault. 3) Limpiar historial git con git-filter-repo.'
                    evidencia               = $TruffleJson.FullName.Replace($Root.Path, '.')
                    estado                  = 'ABIERTO'
                    sprint_objetivo         = ''
                    fecha_cierre            = ''
                })
                $TruffleCount++
            }
        } catch { if ($Verbose) { Write-Warn '  No se pudo parsear TruffleHog JSON' } }
    }
    if ($TruffleCount -gt 0) { Write-Ok "  TruffleHog: $TruffleCount hallazgos" }
    else { Write-Skip '  TruffleHog: sin secretos detectados (o sin reportes)' }

    # ── Dependency-Check (SCA) ─────────────────────────────────────────────
    Write-Step "Extrayendo: Dependency-Check"
    $DepCheckJson = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter 'dependency-check-report.json' -Recurse -ErrorAction SilentlyContinue |
                    Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $DepCheckCount = 0
    if ($DepCheckJson) {
        try {
            $data = Get-Content $DepCheckJson.FullName -Raw | ConvertFrom-Json
            foreach ($dep in ($data.dependencies ?? @())) {
                foreach ($vuln in ($dep.vulnerabilities ?? @())) {
                    $dcSev = Map-Severity ($vuln.severity ?? 'MEDIUM')
                    if ($dcSev -notin @('CRITICA','ALTA')) { continue }
                    $dcPkg   = $dep.fileName ?? ($dep.packages | Select-Object -First 1).id ?? 'Desconocido'
                    $dcCvss  = $vuln.cvssv3.baseScore ?? $vuln.cvssv2.score ?? ''
                    $dcCvssInfo = if ($dcCvss) { " (CVSS $dcCvss)" } else { '' }
                    $Hallazgos.Add(@{
                        id                      = New-ID
                        fecha_deteccion         = $FechaHoraTS
                        herramienta             = 'Dependency-Check'
                        tipo_prueba             = 'Seguridad'
                        caracteristica_iso25010 = 'Seguridad'
                        hallazgo                = "$($vuln.name): $dcPkg"
                        significado             = "Dependency-Check detecto $($vuln.name)$dcCvssInfo en '$dcPkg'. $($vuln.description)"
                        impacto_tecnico         = "Dependencia vulnerable: $dcPkg -- CVE: $($vuln.name)"
                        impacto_negocio         = "La dependencia '$dcPkg' con vulnerabilidad critica/alta puede ser explotada para comprometer el sistema REGINSA."
                        severidad               = $dcSev
                        componente_afectado     = $dcPkg
                        responsable_sugerido    = 'DevOps/Desarrollo'
                        recomendacion           = "Actualizar la dependencia '$dcPkg' a una version que corrija $($vuln.name). Revisar referencias: $($vuln.references | Select-Object -First 1 | ForEach-Object { $_.url })."
                        evidencia               = $DepCheckJson.FullName.Replace($Root.Path, '.')
                        estado                  = 'ABIERTO'
                        sprint_objetivo         = ''
                        fecha_cierre            = ''
                    })
                    $DepCheckCount++
                }
            }
        } catch { if ($Verbose) { Write-Warn '  No se pudo parsear Dependency-Check JSON' } }
    }
    if ($DepCheckCount -gt 0) { Write-Ok "  Dependency-Check: $DepCheckCount hallazgos CRITICA/ALTA" }
    else { Write-Skip '  Dependency-Check: sin CVEs criticos/altos (o sin reportes)' }

    # ── OSV (Open Source Vulnerabilities) ─────────────────────────────────
    Write-Step "Extrayendo: OSV"
    $OsvJson = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter 'osv-results.json' -Recurse -ErrorAction SilentlyContinue |
               Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $OsvCount = 0
    if ($OsvJson) {
        try {
            $data = Get-Content $OsvJson.FullName -Raw | ConvertFrom-Json
            foreach ($result in ($data.results ?? @())) {
                foreach ($pkg in ($result.packages ?? @())) {
                    foreach ($vuln in ($pkg.vulnerabilities ?? @())) {
                        $osvSevRaw = $vuln.database_specific.severity ?? $vuln.affected[0].database_specific.severity ?? 'MEDIUM'
                        $osvSev    = Map-Severity $osvSevRaw
                        $osvPkg    = $pkg.package.name ?? 'Desconocido'
                        $osvVer    = $pkg.package.version ?? ''
                        $Hallazgos.Add(@{
                            id                      = New-ID
                            fecha_deteccion         = $FechaHoraTS
                            herramienta             = 'OSV'
                            tipo_prueba             = 'Seguridad'
                            caracteristica_iso25010 = 'Seguridad'
                            hallazgo                = "$($vuln.id): $osvPkg@$osvVer"
                            significado             = "OSV detecto $($vuln.id) en '$osvPkg@$osvVer'. $($vuln.summary)"
                            impacto_tecnico         = "Paquete: $osvPkg v$osvVer -- ID: $($vuln.id)"
                            impacto_negocio         = "La vulnerabilidad $($vuln.id) en '$osvPkg' puede afectar la seguridad del sistema REGINSA."
                            severidad               = $osvSev
                            componente_afectado     = "$osvPkg@$osvVer"
                            responsable_sugerido    = 'DevOps/Desarrollo'
                            recomendacion           = "Actualizar '$osvPkg' a una version que corrija $($vuln.id). Consultar: https://osv.dev/vulnerability/$($vuln.id)"
                            evidencia               = $OsvJson.FullName.Replace($Root.Path, '.')
                            estado                  = 'ABIERTO'
                            sprint_objetivo         = ''
                            fecha_cierre            = ''
                        })
                        $OsvCount++
                    }
                }
            }
        } catch { if ($Verbose) { Write-Warn '  No se pudo parsear OSV JSON' } }
    }
    if ($OsvCount -gt 0) { Write-Ok "  OSV: $OsvCount hallazgos" }
    else { Write-Skip '  OSV: sin vulnerabilidades detectadas (o sin reportes)' }

    # ── RetireJS (SCA frontend) ────────────────────────────────────────────
    Write-Step "Extrayendo: RetireJS"
    $RetireJson = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter 'retire-results.json' -Recurse -ErrorAction SilentlyContinue |
                  Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $RetireCount = 0
    if ($RetireJson) {
        try {
            $data = Get-Content $RetireJson.FullName -Raw | ConvertFrom-Json
            $retireItems = if ($data -is [array]) { $data } elseif ($data.data) { $data.data } else { @() }
            foreach ($item in $retireItems) {
                $retireFile = $item.file ?? 'Desconocido'
                foreach ($result in ($item.results ?? @())) {
                    $retirePkg = $result.component ?? 'Desconocido'
                    $retireVer = $result.version ?? ''
                    foreach ($vuln in ($result.vulnerabilities ?? @())) {
                        $retireSev = Map-Severity ($vuln.severity ?? 'medium')
                        $retireCve = ($vuln.identifiers.CVE | Select-Object -First 1) ?? $vuln.identifiers.bug ?? ''
                        $retireSum = $vuln.identifiers.summary ?? ''
                        $Hallazgos.Add(@{
                            id                      = New-ID
                            fecha_deteccion         = $FechaHoraTS
                            herramienta             = 'RetireJS'
                            tipo_prueba             = 'Seguridad'
                            caracteristica_iso25010 = 'Seguridad'
                            hallazgo                = "$retirePkg@$retireVer -- $retireCve"
                            significado             = "RetireJS detecto libreria frontend obsoleta con vulnerabilidad conocida. $retireSum"
                            impacto_tecnico         = "Archivo: $retireFile -- Paquete: $retirePkg v$retireVer -- CVE: $retireCve"
                            impacto_negocio         = "Libreria frontend vulnerable en '$retirePkg' puede ser explotada por atacantes en el navegador del usuario."
                            severidad               = $retireSev
                            componente_afectado     = "$retirePkg@$retireVer"
                            responsable_sugerido    = 'Frontend'
                            recomendacion           = "Actualizar '$retirePkg' de v$retireVer a una version que corrija $retireCve."
                            evidencia               = $RetireJson.FullName.Replace($Root.Path, '.')
                            estado                  = 'ABIERTO'
                            sprint_objetivo         = ''
                            fecha_cierre            = ''
                        })
                        $RetireCount++
                    }
                }
            }
        } catch { if ($Verbose) { Write-Warn '  No se pudo parsear RetireJS JSON' } }
    }
    if ($RetireCount -gt 0) { Write-Ok "  RetireJS: $RetireCount hallazgos" }
    else { Write-Skip '  RetireJS: sin vulnerabilidades frontend (o sin reportes)' }

    # ── Grype (SCA container/deps) ─────────────────────────────────────────
    Write-Step "Extrayendo: Grype"
    $GrypeJson = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter 'grype-results.json' -Recurse -ErrorAction SilentlyContinue |
                 Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $GrypeCount = 0
    if ($GrypeJson -and $GrypeJson.Length -gt 10) {
        try {
            $data = Get-Content $GrypeJson.FullName -Raw | ConvertFrom-Json
            foreach ($match in ($data.matches ?? @())) {
                $grypeSev = Map-Severity ($match.vulnerability.severity ?? 'Unknown')
                if ($grypeSev -notin @('CRITICA','ALTA')) { continue }
                $grypeCve   = $match.vulnerability.id ?? ''
                $grypePkg   = $match.artifact.name ?? 'Desconocido'
                $grypeVer   = $match.artifact.version ?? ''
                $grypeDesc  = $match.vulnerability.description ?? ''
                $grypeFix   = ($match.vulnerability.fix.versions | Select-Object -First 1) ?? ''
                $grypeFixInfo = if ($grypeFix) { "Version corregida: $grypeFix." } else { 'Sin version corregida disponible.' }
                $Hallazgos.Add(@{
                    id                      = New-ID
                    fecha_deteccion         = $FechaHoraTS
                    herramienta             = 'Grype'
                    tipo_prueba             = 'Seguridad'
                    caracteristica_iso25010 = 'Seguridad'
                    hallazgo                = "${grypeCve}: $grypePkg@$grypeVer"
                    significado             = "Grype detecto $grypeCve en '$grypePkg@$grypeVer'. $grypeDesc"
                    impacto_tecnico         = "Paquete: $grypePkg v$grypeVer -- CVE: $grypeCve. $grypeFixInfo"
                    impacto_negocio         = "La vulnerabilidad critica/alta $grypeCve en '$grypePkg' puede comprometer la seguridad del contenedor o dependencias del sistema REGINSA."
                    severidad               = $grypeSev
                    componente_afectado     = "$grypePkg@$grypeVer"
                    responsable_sugerido    = 'DevOps'
                    recomendacion           = if ($grypeFix) { "Actualizar '$grypePkg' de v$grypeVer a v$grypeFix para corregir $grypeCve." } else { "Monitorear $grypeCve en '$grypePkg'. Evaluar mitigacion alternativa." }
                    evidencia               = $GrypeJson.FullName.Replace($Root.Path, '.')
                    estado                  = 'ABIERTO'
                    sprint_objetivo         = ''
                    fecha_cierre            = ''
                })
                $GrypeCount++
            }
        } catch { if ($Verbose) { Write-Warn '  No se pudo parsear Grype JSON' } }
    }
    if ($GrypeCount -gt 0) { Write-Ok "  Grype: $GrypeCount hallazgos CRITICA/ALTA" }
    else { Write-Skip '  Grype: sin CVEs criticos/altos (o sin reportes)' }

    # ── Nuclei (DAST - JSONL) ──────────────────────────────────────────────
    Write-Step "Extrayendo: Nuclei"
    $NucleiJsonl = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter 'nuclei-report.jsonl' -Recurse -ErrorAction SilentlyContinue |
                   Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $NucleiCount = 0
    if ($NucleiJsonl) {
        try {
            Get-Content $NucleiJsonl.FullName | ForEach-Object {
                $line = $_.Trim()
                if (-not $line) { return }
                $item = $line | ConvertFrom-Json
                $nucleiSevRaw = $item.info.severity ?? $item.'info'.severity ?? 'info'
                if ($nucleiSevRaw -eq 'info') { return }
                $nucleiSev   = Map-Severity $nucleiSevRaw
                $nucleiName  = $item.info.name ?? $item.'template-id' ?? ''
                $nucleiTmpl  = $item.'template-id' ?? ''
                $nucleiHost  = $item.host ?? ''
                $nucleiMatch = $item.'matched-at' ?? $nucleiHost
                $nucleiType  = $item.type ?? ''
                $Hallazgos.Add(@{
                    id                      = New-ID
                    fecha_deteccion         = $FechaHoraTS
                    herramienta             = 'Nuclei'
                    tipo_prueba             = 'Seguridad'
                    caracteristica_iso25010 = 'Seguridad'
                    hallazgo                = "[$nucleiTmpl] $nucleiName"
                    significado             = "Nuclei DAST detecto '$nucleiName' (tipo: $nucleiType) en el host '$nucleiHost'."
                    impacto_tecnico         = "Host: $nucleiHost -- URL afectada: $nucleiMatch -- Template: $nucleiTmpl"
                    impacto_negocio         = "La vulnerabilidad detectada por Nuclei puede ser explotada remotamente en el sistema REGINSA."
                    severidad               = $nucleiSev
                    componente_afectado     = $nucleiHost
                    responsable_sugerido    = 'DevOps/Backend'
                    recomendacion           = "Revisar y corregir la vulnerabilidad '$nucleiName' identificada por el template $nucleiTmpl de Nuclei."
                    evidencia               = $NucleiJsonl.FullName.Replace($Root.Path, '.')
                    estado                  = 'ABIERTO'
                    sprint_objetivo         = ''
                    fecha_cierre            = ''
                })
                $NucleiCount++
            }
        } catch { if ($Verbose) { Write-Warn '  No se pudo parsear Nuclei JSONL' } }
    }
    if ($NucleiCount -gt 0) { Write-Ok "  Nuclei: $NucleiCount hallazgos" }
    else { Write-Skip '  Nuclei: sin hallazgos (o sin reportes)' }
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
# HELPERS para parsers SARIF (Bearer / Checkov / CodeQL / Nuclei v2)
# ══════════════════════════════════════════════════════════════════════════════
function ConvertFrom-SarifLevel {
    param([string]$Level, [string]$SecuritySev = '')
    if ($SecuritySev) {
        try {
            $score = [double]$SecuritySev
            if ($score -ge 9.0) { return 'CRITICA' }
            if ($score -ge 7.0) { return 'ALTA'    }
            if ($score -ge 4.0) { return 'MEDIA'   }
            return 'BAJA'
        } catch { Write-Verbose "ConvertFrom-SarifLevel: $($_.Exception.Message)" }
    }
    switch -Regex (($Level ?? '').ToLower()) {
        'error|critical|blocker|high' { 'ALTA'   ; break }
        'warning|major|medium'        { 'MEDIA'  ; break }
        'note|info|minor|low'         { 'BAJA'   ; break }
        default                       { 'MEDIA'  }
    }
}

function Read-SarifResults {
    <#
      Devuelve hallazgos normalizados (PSCustomObject) desde un archivo SARIF.
      Los detalles tool/herramienta los rellena el bloque consumidor.
    #>
    param([string]$Path)
    $out = @()
    if (-not (Test-Path $Path)) { return $out }
    try {
        $j = Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 50
    } catch { return $out }
    if (-not $j -or -not $j.PSObject.Properties['runs']) { return $out }
    foreach ($run in @($j.runs)) {
        $rules = @{}
        if ($run.PSObject.Properties['tool'] -and $run.tool.PSObject.Properties['driver']) {
            $drv = $run.tool.driver
            if ($drv.PSObject.Properties['rules'] -and $drv.rules) {
                foreach ($r in @($drv.rules)) {
                    $rid = if ($r.PSObject.Properties['id']) { $r.id } else { '' }
                    if ($rid) { $rules[$rid] = $r }
                }
            }
        }
        if (-not $run.PSObject.Properties['results']) { continue }
        foreach ($res in @($run.results)) {
            try {
                $ruleId = if ($res.PSObject.Properties['ruleId']) { $res.ruleId } else { '' }
                $level  = if ($res.PSObject.Properties['level'])  { $res.level }  else { '' }
                $msg    = ''
                if ($res.PSObject.Properties['message'] -and $res.message) {
                    if ($res.message.PSObject.Properties['text']) { $msg = $res.message.text }
                }
                $loc = ''
                if ($res.PSObject.Properties['locations'] -and $res.locations) {
                    $first = @($res.locations)[0]
                    if ($first -and $first.PSObject.Properties['physicalLocation']) {
                        $pl = $first.physicalLocation
                        if ($pl.PSObject.Properties['artifactLocation'] -and $pl.artifactLocation.PSObject.Properties['uri']) {
                            $loc = $pl.artifactLocation.uri
                        }
                        if ($pl.PSObject.Properties['region'] -and $pl.region.PSObject.Properties['startLine']) {
                            $loc = "$loc`:$($pl.region.startLine)"
                        }
                    }
                }
                $secSev = ''
                $shortDesc = ''
                if ($rules.ContainsKey($ruleId)) {
                    $r = $rules[$ruleId]
                    if ($r.PSObject.Properties['properties'] -and $r.properties) {
                        $p = $r.properties
                        if ($p.PSObject.Properties['security-severity']) { $secSev = [string]$p.'security-severity' }
                    }
                    if ($r.PSObject.Properties['shortDescription'] -and $r.shortDescription.PSObject.Properties['text']) {
                        $shortDesc = $r.shortDescription.text
                    }
                }
                if ($res.PSObject.Properties['properties'] -and $res.properties -and $res.properties.PSObject.Properties['security-severity']) {
                    $secSev = [string]$res.properties.'security-severity'
                }
                $out += [PSCustomObject]@{
                    ruleId      = $ruleId
                    level       = $level
                    message     = $msg
                    location    = $loc
                    securitySev = $secSev
                    shortDesc   = $shortDesc
                }
            } catch { continue }
        }
    }
    return $out
}

# ══════════════════════════════════════════════════════════════════════════════
# BLOQUE 7 — BEARER (SAST · privacidad / datos sensibles · SARIF)
# ══════════════════════════════════════════════════════════════════════════════
if ($TodosTipos -or $TipoPrueba -contains 'Seguridad') {
    Write-Step "Extrayendo: Bearer (SAST privacidad)"
    $files = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter 'bearer-results.sarif' -Recurse -ErrorAction SilentlyContinue |
             Sort-Object LastWriteTime -Descending
    $bCount = 0
    foreach ($f in $files) {
        $proj = Split-Path (Split-Path $f.FullName -Parent) -Leaf
        foreach ($r in Read-SarifResults -Path $f.FullName) {
            try {
                $sev = ConvertFrom-SarifLevel -Level $r.level -SecuritySev $r.securitySev
                $hallazgo = if ($r.shortDesc) { $r.shortDesc } else { "[$($r.ruleId)] $($r.message)" }
                $Hallazgos.Add(@{
                    id                      = New-ID
                    fecha_deteccion         = $FechaHoraTS
                    herramienta             = 'Bearer'
                    tipo_prueba             = 'Seguridad'
                    caracteristica_iso25010 = 'Seguridad'
                    hallazgo                = ($hallazgo | Out-String).Trim()
                    significado             = $r.message
                    impacto_tecnico         = "Regla $($r.ruleId) en $($r.location)"
                    impacto_negocio         = 'Posible exposicion de datos personales o credenciales sin proteccion adecuada.'
                    severidad               = $sev
                    componente_afectado     = if ($proj -and $proj -ne 'bearer') { $proj } else { $r.location }
                    responsable_sugerido    = 'Backend/Frontend'
                    recomendacion           = 'Revisar el flujo de datos sensibles y aplicar cifrado/validacion segun guia Bearer.'
                    evidencia               = $f.FullName.Replace($Root.Path, '.')
                    estado                  = 'ABIERTO'
                    sprint_objetivo         = ''
                    fecha_cierre            = ''
                })
                $bCount++
            } catch { if ($Verbose) { Write-Warn "  Bearer item: $($_.Exception.Message)" } }
        }
    }
    if ($bCount -gt 0) { Write-Ok "  Bearer: $bCount hallazgos" } else { Write-Skip "  Bearer: sin hallazgos o sin SARIF" }
}

# ══════════════════════════════════════════════════════════════════════════════
# BLOQUE 8 — CHECKOV (IaC · Dockerfile / GitHub Actions / Terraform · SARIF)
# ══════════════════════════════════════════════════════════════════════════════
if ($TodosTipos -or $TipoPrueba -contains 'Seguridad') {
    Write-Step "Extrayendo: Checkov (IaC)"
    $files = Get-ChildItem -Path (Join-Path $Reportes 'security') -Recurse -Include 'results_sarif.sarif','checkov-results.sarif' -ErrorAction SilentlyContinue |
             Sort-Object LastWriteTime -Descending
    $cCount = 0
    foreach ($f in $files) {
        # asegurar que es de checkov (no de bearer)
        if ($f.FullName -notmatch '[\\/]checkov[\\/]') { continue }
        foreach ($r in Read-SarifResults -Path $f.FullName) {
            try {
                $sev = ConvertFrom-SarifLevel -Level $r.level -SecuritySev $r.securitySev
                $Hallazgos.Add(@{
                    id                      = New-ID
                    fecha_deteccion         = $FechaHoraTS
                    herramienta             = 'Checkov'
                    tipo_prueba             = 'Seguridad'
                    caracteristica_iso25010 = 'Seguridad / Mantenibilidad'
                    hallazgo                = if ($r.shortDesc) { "[$($r.ruleId)] $($r.shortDesc)" } else { "[$($r.ruleId)] $($r.message)" }
                    significado             = $r.message
                    impacto_tecnico         = "Archivo: $($r.location)"
                    impacto_negocio         = 'Mala practica de seguridad en infraestructura como codigo (IaC). Puede exponer secretos o crear despliegues inseguros.'
                    severidad               = $sev
                    componente_afectado     = $r.location
                    responsable_sugerido    = 'DevOps'
                    recomendacion           = 'Aplicar la guia oficial de Checkov para la regla y reescanear.'
                    evidencia               = $f.FullName.Replace($Root.Path, '.')
                    estado                  = 'ABIERTO'
                    sprint_objetivo         = ''
                    fecha_cierre            = ''
                })
                $cCount++
            } catch { if ($Verbose) { Write-Warn "  Checkov item: $($_.Exception.Message)" } }
        }
    }
    if ($cCount -gt 0) { Write-Ok "  Checkov: $cCount hallazgos" } else { Write-Skip "  Checkov: sin hallazgos o sin SARIF" }
}

# ══════════════════════════════════════════════════════════════════════════════
# BLOQUE 9 — CODEQL (SAST semantico · SARIF)
# ══════════════════════════════════════════════════════════════════════════════
if ($TodosTipos -or $TipoPrueba -contains 'Seguridad') {
    Write-Step "Extrayendo: CodeQL (SAST semantico)"
    $files = Get-ChildItem -Path (Join-Path $Reportes 'security') -Recurse -Include 'codeql-*.sarif','*.codeql.sarif' -ErrorAction SilentlyContinue |
             Sort-Object LastWriteTime -Descending
    if (-not $files) {
        $files = Get-ChildItem -Path (Join-Path $Reportes 'security') -Recurse -Filter '*.sarif' -ErrorAction SilentlyContinue |
                 Where-Object { $_.FullName -match '[\\/]codeql[\\/]' }
    }
    $qCount = 0
    foreach ($f in $files) {
        foreach ($r in Read-SarifResults -Path $f.FullName) {
            try {
                $sev = ConvertFrom-SarifLevel -Level $r.level -SecuritySev $r.securitySev
                $Hallazgos.Add(@{
                    id                      = New-ID
                    fecha_deteccion         = $FechaHoraTS
                    herramienta             = 'CodeQL'
                    tipo_prueba             = 'Seguridad'
                    caracteristica_iso25010 = 'Seguridad'
                    hallazgo                = if ($r.shortDesc) { "[$($r.ruleId)] $($r.shortDesc)" } else { "[$($r.ruleId)] $($r.message)" }
                    significado             = $r.message
                    impacto_tecnico         = "Ubicacion: $($r.location) | Regla: $($r.ruleId)"
                    impacto_negocio         = 'Patron de codigo riesgoso detectado por analisis semantico. Posible vulnerabilidad explotable.'
                    severidad               = $sev
                    componente_afectado     = $r.location
                    responsable_sugerido    = 'Desarrollador'
                    recomendacion           = 'Revisar la sugerencia de CodeQL y refactorizar el codigo afectado.'
                    evidencia               = $f.FullName.Replace($Root.Path, '.')
                    estado                  = 'ABIERTO'
                    sprint_objetivo         = ''
                    fecha_cierre            = ''
                })
                $qCount++
            } catch { if ($Verbose) { Write-Warn "  CodeQL item: $($_.Exception.Message)" } }
        }
    }
    if ($qCount -gt 0) { Write-Ok "  CodeQL: $qCount hallazgos" } else { Write-Skip "  CodeQL: sin SARIF (no ejecutado todavia)" }
}

# ══════════════════════════════════════════════════════════════════════════════
# BLOQUE 10 — NIKTO (DAST · servidor web · XML / JSON / TXT)
# ══════════════════════════════════════════════════════════════════════════════
if ($TodosTipos -or $TipoPrueba -contains 'Seguridad') {
    Write-Step "Extrayendo: Nikto (DAST servidor web)"
    $nDir = Get-ChildItem -Path (Join-Path $Reportes 'security') -Directory -Recurse -Filter 'nikto' -ErrorAction SilentlyContinue
    $nCount = 0
    $nSeen  = $false
    foreach ($d in $nDir) {
        # XML
        $xmlFiles = Get-ChildItem -Path $d.FullName -Filter '*.xml' -ErrorAction SilentlyContinue
        foreach ($xf in $xmlFiles) {
            $nSeen = $true
            try {
                [xml]$x = Get-Content $xf.FullName -Raw
                foreach ($it in @($x.niktoscan.scandetails.item)) {
                    $desc = ($it.description ?? '').ToString().Trim()
                    if (-not $desc) { continue }
                    $sev = if ($desc -match 'CVE-|admin|injection|xss|sql|directory traversal') { 'ALTA' }
                           elseif ($desc -match 'header|cookie|disclosure') { 'MEDIA' }
                           else { 'BAJA' }
                    $Hallazgos.Add(@{
                        id = New-ID; fecha_deteccion = $FechaHoraTS
                        herramienta = 'Nikto'; tipo_prueba = 'Seguridad'
                        caracteristica_iso25010 = 'Seguridad'
                        hallazgo = "[$($it.id ?? 'NIK')] $desc"
                        significado = $desc
                        impacto_tecnico = "URL: $($it.uri ?? '/') | Metodo: $($it.method ?? 'GET')"
                        impacto_negocio = 'Servidor web expone configuracion o archivo que un atacante puede aprovechar.'
                        severidad = $sev
                        componente_afectado = ($x.niktoscan.scandetails.targethostname ?? 'web')
                        responsable_sugerido = 'DevOps'
                        recomendacion = 'Eliminar archivo expuesto o reforzar configuracion del servidor web.'
                        evidencia = $xf.FullName.Replace($Root.Path, '.')
                        estado = 'ABIERTO'; sprint_objetivo = ''; fecha_cierre = ''
                    })
                    $nCount++
                }
            } catch { if ($Verbose) { Write-Warn "  Nikto XML: $($_.Exception.Message)" } }
        }
        # JSON (formato -Format json)
        $jsonFiles = Get-ChildItem -Path $d.FullName -Filter '*.json' -ErrorAction SilentlyContinue
        foreach ($jf in $jsonFiles) {
            $nSeen = $true
            try {
                $jr = Get-Content $jf.FullName -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 30
                $vulns = if ($jr.PSObject.Properties['vulnerabilities']) { $jr.vulnerabilities } else { @() }
                foreach ($v in @($vulns)) {
                    $msg = if ($v.PSObject.Properties['msg']) { $v.msg } elseif ($v.PSObject.Properties['message']) { $v.message } else { ($v | Out-String).Trim() }
                    $sev = if ($msg -match 'CVE|admin|injection|xss|sql') { 'ALTA' } elseif ($msg -match 'header|cookie|disclosure') { 'MEDIA' } else { 'BAJA' }
                    $Hallazgos.Add(@{
                        id = New-ID; fecha_deteccion = $FechaHoraTS
                        herramienta = 'Nikto'; tipo_prueba = 'Seguridad'
                        caracteristica_iso25010 = 'Seguridad'
                        hallazgo = "[$($v.id ?? 'NIK')] $msg"
                        significado = $msg
                        impacto_tecnico = "URL: $($v.url ?? '/')"
                        impacto_negocio = 'Servidor web expone configuracion o archivo que un atacante puede aprovechar.'
                        severidad = $sev
                        componente_afectado = ($jr.host ?? 'web')
                        responsable_sugerido = 'DevOps'
                        recomendacion = 'Eliminar archivo expuesto o reforzar configuracion del servidor web.'
                        evidencia = $jf.FullName.Replace($Root.Path, '.')
                        estado = 'ABIERTO'; sprint_objetivo = ''; fecha_cierre = ''
                    })
                    $nCount++
                }
            } catch { if ($Verbose) { Write-Warn "  Nikto JSON: $($_.Exception.Message)" } }
        }
    }
    if ($nCount -gt 0) { Write-Ok "  Nikto: $nCount hallazgos" }
    elseif ($nSeen)    { Write-Skip "  Nikto: ejecutado sin hallazgos" }
    else               { Write-Skip "  Nikto: no ejecutado" }
}

# ══════════════════════════════════════════════════════════════════════════════
# BLOQUE 11 — WAPITI (DAST · web · JSON)
# ══════════════════════════════════════════════════════════════════════════════
if ($TodosTipos -or $TipoPrueba -contains 'Seguridad') {
    Write-Step "Extrayendo: Wapiti (DAST web)"
    $wDir = Get-ChildItem -Path (Join-Path $Reportes 'security') -Directory -Recurse -Filter 'wapiti' -ErrorAction SilentlyContinue
    $wCount = 0; $wSeen = $false
    foreach ($d in $wDir) {
        $jsonFiles = Get-ChildItem -Path $d.FullName -Filter '*.json' -Recurse -ErrorAction SilentlyContinue
        foreach ($jf in $jsonFiles) {
            $wSeen = $true
            try {
                $jr = Get-Content $jf.FullName -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 50
                if (-not $jr.PSObject.Properties['vulnerabilities']) { continue }
                $vulns = $jr.vulnerabilities
                foreach ($cat in @($vulns.PSObject.Properties)) {
                    foreach ($it in @($cat.Value)) {
                        $level = if ($it.PSObject.Properties['level']) { [int]$it.level } else { 1 }
                        $sev = switch ($level) { 4 {'CRITICA'} 3 {'ALTA'} 2 {'MEDIA'} default {'BAJA'} }
                        $info = if ($it.PSObject.Properties['info']) { $it.info } else { '' }
                        $Hallazgos.Add(@{
                            id = New-ID; fecha_deteccion = $FechaHoraTS
                            herramienta = 'Wapiti'; tipo_prueba = 'Seguridad'
                            caracteristica_iso25010 = 'Seguridad'
                            hallazgo = "[$($cat.Name)] $info"
                            significado = $info
                            impacto_tecnico = "URL: $($it.path ?? '/') | Parametro: $($it.parameter ?? '-') | Metodo: $($it.method ?? 'GET')"
                            impacto_negocio = 'Wapiti probo payloads maliciosos y la app respondio de forma vulnerable.'
                            severidad = $sev
                            componente_afectado = $it.path
                            responsable_sugerido = 'Desarrollador / DevOps'
                            recomendacion = 'Reforzar validacion de entrada y aplicar parche del framework correspondiente.'
                            evidencia = $jf.FullName.Replace($Root.Path, '.')
                            estado = 'ABIERTO'; sprint_objetivo = ''; fecha_cierre = ''
                        })
                        $wCount++
                    }
                }
            } catch { if ($Verbose) { Write-Warn "  Wapiti JSON: $($_.Exception.Message)" } }
        }
    }
    if ($wCount -gt 0) { Write-Ok "  Wapiti: $wCount hallazgos" }
    elseif ($wSeen)    { Write-Skip "  Wapiti: ejecutado sin hallazgos" }
    else               { Write-Skip "  Wapiti: no ejecutado" }
}

# ══════════════════════════════════════════════════════════════════════════════
# BLOQUE 12 — RESTLER (Fuzzer de API REST)
# ══════════════════════════════════════════════════════════════════════════════
if ($TodosTipos -or $TipoPrueba -contains 'Seguridad') {
    Write-Step "Extrayendo: Restler (Fuzzer API)"
    $rDir = Get-ChildItem -Path (Join-Path $Reportes 'security') -Directory -Recurse -Filter 'restler' -ErrorAction SilentlyContinue
    $rCount = 0; $rSeen = $false
    foreach ($d in $rDir) {
        # Restler escribe bug_buckets/*.txt y testing_summary.json
        $summary = Get-ChildItem -Path $d.FullName -Filter 'testing_summary.json' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($summary) {
            $rSeen = $true
            try {
                $j = Get-Content $summary.FullName -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 30
                if ($j.PSObject.Properties['bug_buckets']) {
                    foreach ($b in @($j.bug_buckets.PSObject.Properties)) {
                        $count = [int]$b.Value
                        if ($count -le 0) { continue }
                        $sev = switch -Regex ($b.Name) {
                            '500|InternalServerError|UseAfterFree|crash' { 'ALTA' }
                            '400|payload'                                 { 'MEDIA' }
                            default                                       { 'BAJA' }
                        }
                        $Hallazgos.Add(@{
                            id = New-ID; fecha_deteccion = $FechaHoraTS
                            herramienta = 'Restler'; tipo_prueba = 'Seguridad'
                            caracteristica_iso25010 = 'Seguridad / Fiabilidad'
                            hallazgo = "[$($b.Name)] $count incidentes"
                            significado = "Restler genero $count peticiones malformadas que dispararon la condicion '$($b.Name)' en la API."
                            impacto_tecnico = "Categoria: $($b.Name) | Total: $count"
                            impacto_negocio = 'API responde de forma inestable a entradas inesperadas. Riesgo de DoS o exposicion de stack-traces.'
                            severidad = $sev
                            componente_afectado = 'API REST'
                            responsable_sugerido = 'Backend'
                            recomendacion = 'Reforzar validacion de payload y manejo de errores en el endpoint afectado.'
                            evidencia = $summary.FullName.Replace($Root.Path, '.')
                            estado = 'ABIERTO'; sprint_objetivo = ''; fecha_cierre = ''
                        })
                        $rCount++
                    }
                }
            } catch { if ($Verbose) { Write-Warn "  Restler summary: $($_.Exception.Message)" } }
        } else {
            $bugTxts = Get-ChildItem -Path $d.FullName -Filter 'bug_buckets*.txt' -Recurse -ErrorAction SilentlyContinue
            if ($bugTxts) { $rSeen = $true }
            foreach ($bt in $bugTxts) {
                $hits = (Select-String -Path $bt.FullName -Pattern '^Bug Hash' -ErrorAction SilentlyContinue).Count
                if ($hits -le 0) { continue }
                $Hallazgos.Add(@{
                    id = New-ID; fecha_deteccion = $FechaHoraTS
                    herramienta = 'Restler'; tipo_prueba = 'Seguridad'
                    caracteristica_iso25010 = 'Seguridad / Fiabilidad'
                    hallazgo = "[$($bt.BaseName)] $hits buckets de bug"
                    significado = "Restler detecto $hits patrones distintos de respuestas inesperadas durante el fuzzing de API."
                    impacto_tecnico = "Archivo: $($bt.Name)"
                    impacto_negocio = 'API respondio de forma anomala bajo entradas malformadas. Riesgo de fallas en produccion.'
                    severidad = 'MEDIA'
                    componente_afectado = 'API REST'
                    responsable_sugerido = 'Backend'
                    recomendacion = 'Revisar bug_buckets y reforzar contratos de los endpoints involucrados.'
                    evidencia = $bt.FullName.Replace($Root.Path, '.')
                    estado = 'ABIERTO'; sprint_objetivo = ''; fecha_cierre = ''
                })
                $rCount++
            }
        }
    }
    if ($rCount -gt 0) { Write-Ok "  Restler: $rCount hallazgos" }
    elseif ($rSeen)    { Write-Skip "  Restler: ejecutado sin hallazgos" }
    else               { Write-Skip "  Restler: no ejecutado (solo swagger.json)" }
}

# ══════════════════════════════════════════════════════════════════════════════
# BLOQUE 13 — LYNIS (Hardening del SO)
# ══════════════════════════════════════════════════════════════════════════════
if ($TodosTipos -or $TipoPrueba -contains 'Seguridad') {
    Write-Step "Extrayendo: Lynis (hardening SO)"
    $lDir = Get-ChildItem -Path (Join-Path $Reportes 'security') -Directory -Recurse -Filter 'lynis' -ErrorAction SilentlyContinue
    $lCount = 0; $lSeen = $false
    foreach ($d in $lDir) {
        $datFiles = Get-ChildItem -Path $d.FullName -Include 'lynis-report.dat','*.dat','lynis*.log' -Recurse -ErrorAction SilentlyContinue
        foreach ($f in $datFiles) {
            $lSeen = $true
            try {
                $lines = Get-Content $f.FullName -Encoding UTF8
                # Warnings / Suggestions: formato `warning[]=ID|texto|...` o `suggestion[]=ID|texto|...`
                foreach ($ln in $lines) {
                    if ($ln -match '^(warning|suggestion)\[\]=(.+)$') {
                        $kind = $matches[1]
                        $parts = $matches[2] -split '\|'
                        $rid   = $parts[0]
                        $txt   = if ($parts.Length -ge 2) { $parts[1] } else { $matches[2] }
                        $sev   = if ($kind -eq 'warning') { 'ALTA' } else { 'MEDIA' }
                        $Hallazgos.Add(@{
                            id = New-ID; fecha_deteccion = $FechaHoraTS
                            herramienta = 'Lynis'; tipo_prueba = 'Seguridad'
                            caracteristica_iso25010 = 'Seguridad / Mantenibilidad'
                            hallazgo = "[$rid] $txt"
                            significado = $txt
                            impacto_tecnico = "Tipo: $kind | Test: $rid"
                            impacto_negocio = 'Configuracion de hardening del sistema operativo no cumple buenas practicas (CIS).'
                            severidad = $sev
                            componente_afectado = 'Sistema Operativo / Servidor'
                            responsable_sugerido = 'Infraestructura'
                            recomendacion = 'Aplicar la sugerencia oficial de Lynis para la regla indicada.'
                            evidencia = $f.FullName.Replace($Root.Path, '.')
                            estado = 'ABIERTO'; sprint_objetivo = ''; fecha_cierre = ''
                        })
                        $lCount++
                    }
                }
            } catch { if ($Verbose) { Write-Warn "  Lynis: $($_.Exception.Message)" } }
        }
    }
    if ($lCount -gt 0) { Write-Ok "  Lynis: $lCount hallazgos" }
    elseif ($lSeen)    { Write-Skip "  Lynis: ejecutado sin findings" }
    else               { Write-Skip "  Lynis: no ejecutado" }
}

# ══════════════════════════════════════════════════════════════════════════════
# BLOQUE FINAL — NMAP + VULNERS (registro informativo si no se ejecuto)
# ══════════════════════════════════════════════════════════════════════════════
if ($TodosTipos -or $TipoPrueba -contains 'Seguridad') {
    Write-Step "Extrayendo: Nmap + Vulners NSE"
    $NmapXml = Get-ChildItem -Path (Join-Path $Reportes 'security') -Filter 'nmap-report.xml' -Recurse -ErrorAction SilentlyContinue |
               Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $NmapCount = 0
    if ($NmapXml) {
        try {
            [xml]$xml = Get-Content $NmapXml.FullName -Raw
            foreach ($host_ in @($xml.nmaprun.host)) {
                $hostAddr = ($host_.address | Where-Object { $_.addrtype -eq 'ipv4' } | Select-Object -First 1).addr
                foreach ($port in @($host_.ports.port)) {
                    foreach ($scr in @($port.script)) {
                        if ($scr.id -eq 'vulners' -and $scr.output) {
                            $lines = $scr.output -split "`n" | Where-Object { $_ -match 'CVE-' }
                            foreach ($ln in $lines) {
                                $cveMatch = [regex]::Match($ln, 'CVE-\d{4}-\d+')
                                $scoreMatch = [regex]::Match($ln, '(\d+\.\d+)')
                                $cve = if ($cveMatch.Success) { $cveMatch.Value } else { '' }
                                $score = if ($scoreMatch.Success) { [double]$scoreMatch.Groups[1].Value } else { 0.0 }
                                $sev = if ($score -ge 9.0) { 'CRITICA' }
                                       elseif ($score -ge 7.0) { 'ALTA' }
                                       elseif ($score -ge 4.0) { 'MEDIA' }
                                       else { 'BAJA' }
                                $Hallazgos.Add(@{
                                    id                      = New-ID
                                    fecha_deteccion         = $FechaHoraTS
                                    herramienta             = 'Nmap + Vulners'
                                    tipo_prueba             = 'Seguridad'
                                    caracteristica_iso25010 = 'Seguridad'
                                    hallazgo                = "$cve (CVSS $score) en $hostAddr puerto $($port.portid)/$($port.protocol)"
                                    significado             = "Servicio $($port.service.name ?? '?') v$($port.service.version ?? '?') con CVE conocido segun base Vulners NSE."
                                    impacto_tecnico         = "Host $hostAddr | Puerto $($port.portid)/$($port.protocol) | Servicio $($port.service.name ?? '?')"
                                    impacto_negocio         = 'Servicio expuesto con CVE puede facilitar explotacion remota.'
                                    severidad               = $sev
                                    componente_afectado     = "$hostAddr`:$($port.portid)"
                                    responsable_sugerido    = 'DevOps/Infraestructura'
                                    recomendacion           = "Aplicar parche o actualizar version del servicio. Consultar https://nvd.nist.gov/vuln/detail/$cve"
                                    evidencia               = $NmapXml.FullName.Replace($Root.Path, '.')
                                    estado                  = 'ABIERTO'
                                    sprint_objetivo         = ''
                                    fecha_cierre            = ''
                                })
                                $NmapCount++
                            }
                        }
                    }
                }
            }
        } catch { if ($Verbose) { Write-Warn "  No se pudo parsear nmap-report.xml: $($_.Exception.Message)" } }
    }
    if ($NmapCount -gt 0) {
        Write-Ok "  Nmap + Vulners: $NmapCount hallazgos"
    } else {
        # Registro informativo: la herramienta no se ejecuto o no encontro CVEs
        $estadoNmap = if ($NmapXml) { 'EJECUTADO_SIN_HALLAZGOS' } else { 'NO_EJECUTADO' }
        $msgNmap    = if ($NmapXml) {
            'Nmap se ejecuto y no se detectaron CVEs conocidos en los servicios escaneados.'
        } else {
            'Escaneo Nmap + Vulners NSE OMITIDO en esta corrida (requiere flag -IncludeNetwork y autorizacion formal). Sin reporte nmap-report.xml.'
        }
        $Hallazgos.Add(@{
            id                      = New-ID
            fecha_deteccion         = $FechaHoraTS
            herramienta             = 'Nmap + Vulners'
            tipo_prueba             = 'Seguridad'
            caracteristica_iso25010 = 'Seguridad'
            hallazgo                = "Nmap + Vulners NSE: $estadoNmap"
            significado             = $msgNmap
            impacto_tecnico         = 'Sin datos de discovery de red ni correlacion CVE de servicios.'
            impacto_negocio         = if ($NmapXml) { 'Sin hallazgos abiertos en esta categoria.' } else { 'No se valido la superficie de red. Riesgo residual no medido en esta categoria.' }
            severidad               = 'INFORMATIVA'
            componente_afectado     = $env:REGINSA_URL ?? 'reginsaqa.sunedu.gob.pe'
            responsable_sugerido    = 'DevOps/Seguridad'
            recomendacion           = if ($NmapXml) { 'Mantener escaneo periodico mensual.' } else { 'Coordinar autorizacion formal y ejecutar: npm run test:security:all:network' }
            evidencia               = if ($NmapXml) { $NmapXml.FullName.Replace($Root.Path, '.') } else { 'N/A' }
            estado                  = if ($NmapXml) { 'CERRADO' } else { 'NO_APLICA' }
            sprint_objetivo         = ''
            fecha_cierre            = ''
        })
        Write-Skip "  Nmap + Vulners: $estadoNmap (registro informativo agregado)"
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# GUARDAR JSON CONSOLIDADO
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "── Guardando consolidado ────────────────────────────────────────" -ForegroundColor Cyan

# Enriquecer todos los hallazgos: el campo `significado` se vuelve mas explicito
# para que el coordinador (no tecnico) entienda sin ver el codigo. Si ya existe
# un significado tecnico, se conserva como prefijo y se anexa la explicacion simple.
foreach ($h in $Hallazgos) {
    $simple = Get-ExplicacionSimple -Herramienta $h.herramienta -Severidad $h.severidad
    $sigOrig = ($h.significado ?? '').ToString().Trim()
    if ([string]::IsNullOrWhiteSpace($sigOrig)) {
        $h['significado'] = $simple
    } elseif ($sigOrig -notmatch [regex]::Escape($simple.Substring(0, [Math]::Min(40, $simple.Length)))) {
        $h['significado'] = "$sigOrig — $simple"
    }
    # Eliminar campo auxiliar si quedo de corridas previas
    if ($h.ContainsKey('explicacion_simple')) { $h.Remove('explicacion_simple') | Out-Null }
}

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
        breakdown_por_herramienta = @(
            $Hallazgos | Group-Object herramienta | ForEach-Object {
                $items = $_.Group
                [PSCustomObject]@{
                    herramienta = $_.Name
                    total       = $items.Count
                    CRITICA     = @($items | Where-Object { $_.severidad -eq 'CRITICA' }).Count
                    ALTA        = @($items | Where-Object { $_.severidad -eq 'ALTA' }).Count
                    MEDIA       = @($items | Where-Object { $_.severidad -eq 'MEDIA' }).Count
                    BAJA        = @($items | Where-Object { $_.severidad -eq 'BAJA' }).Count
                }
            } | Sort-Object { -([int]$_.CRITICA) }, { -([int]$_.ALTA) }
        )
    }
    hallazgos = @($Hallazgos) | Sort-Object {
        switch ($_.severidad) { 'CRITICA' {0} 'ALTA' {1} 'MEDIA' {2} 'BAJA' {3} default {4} }
    } | ForEach-Object { [PSCustomObject]$_ }
}

# Renumerar IDs SECUENCIALMENTE despues del sort por severidad para evitar
# que los IDs aparezcan desordenados (HAL-0067 antes de HAL-0030, etc).
$idx = 1
foreach ($h in $output.hallazgos) {
    $h.id = "HAL-{0:D4}" -f $idx
    $idx++
}

$output | ConvertTo-Json -Depth 10 | Set-Content -Path $Salida -Encoding UTF8
Write-Ok "Guardado: $Salida"

# Copiar también a la carpeta fechada para que JSON + Word + Excel queden juntos
$DatedDir = Join-Path $InformesDir $FechaHoy
$null     = New-Item -ItemType Directory -Force -Path $DatedDir
$SalidaDated = Join-Path $DatedDir (Split-Path $Salida -Leaf)
Copy-Item -Path $Salida -Destination $SalidaDated -Force
Write-Ok "Copia fechada: $SalidaDated"

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
