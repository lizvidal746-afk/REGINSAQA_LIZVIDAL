<#
.SYNOPSIS
    Compara la corrida actual vs la anterior y genera INFORME_COMPARATIVO_QA_REGINSA_*.docx.

.DESCRIPTION
    Lee los dos archivos hallazgos-consolidados-*.json mas recientes (con FECHAS distintas)
    y genera un Word con:
      - Resumen ejecutivo: total hallazgos antes/ahora, delta por severidad
      - KPIs ISO/IEC 25010: cumplimiento, bugs cerrados, bugs nuevos
      - Tabla de hallazgos cerrados (estaban en la anterior y ya no estan)
      - Tabla de hallazgos nuevos (no estaban en la anterior)
      - Tabla de hallazgos persistentes (siguen en ambas)
      - Indicador de mejora porcentual

    Si no hay 2 corridas con FECHAS distintas, no genera nada (skip).

.EXAMPLE
    pwsh scripts/comparar-corridas.ps1
    pwsh scripts/comparar-corridas.ps1 -Verbose
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$Root        = Resolve-Path (Join-Path $PSScriptRoot '..')
$InformesDir = Join-Path $Root 'reportes\informes'

function Write-Title { param($m) Write-Host "`n$m" -ForegroundColor Magenta }
function Write-Step  { param($m) Write-Host "  >> $m" -ForegroundColor Cyan }
function Write-Ok    { param($m) Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn  { param($m) Write-Host "  [!!] $m" -ForegroundColor Yellow }
function Write-Skip  { param($m) Write-Host "  [--] $m" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "================================================================" -ForegroundColor Magenta
Write-Host "  COMPARATIVO DE CORRIDAS QA — REGINSA" -ForegroundColor Magenta
Write-Host "================================================================" -ForegroundColor Magenta

if (-not (Test-Path $InformesDir)) {
    Write-Skip "No existe reportes/informes. Ejecuta primero el extractor."
    return
}

# ── Buscar las 2 corridas con FECHAS DISTINTAS mas recientes ──
$archivos = Get-ChildItem -Path $InformesDir -Filter 'hallazgos-consolidados-*.json' -File |
            Sort-Object Name -Descending

if ($archivos.Count -lt 2) {
    Write-Skip "Solo hay $($archivos.Count) corrida(s). Se requieren 2 con fechas distintas."
    return
}

# Extraer la fecha (yyyy-MM-dd) de cada nombre
function Get-FechaCorta {
    param([string]$Name)
    if ($Name -match '(\d{4}-\d{2}-\d{2})') { return $matches[1] }
    return $null
}

$actual = $archivos[0]
$fechaActual = Get-FechaCorta $actual.Name

$anterior = $null
foreach ($f in $archivos | Select-Object -Skip 1) {
    $fcorta = Get-FechaCorta $f.Name
    if ($fcorta -and $fcorta -ne $fechaActual) { $anterior = $f; break }
}

if (-not $anterior) {
    Write-Skip "Solo hay corridas del mismo dia ($fechaActual). Comparativo requiere fechas distintas."
    return
}

Write-Step "Actual:   $($actual.Name)"
Write-Step "Anterior: $($anterior.Name)"

# ── Cargar JSONs ──
$jsonActual   = Get-Content $actual.FullName   -Raw | ConvertFrom-Json
$jsonAnterior = Get-Content $anterior.FullName -Raw | ConvertFrom-Json

$hActual   = @($jsonActual.hallazgos)
$hAnterior = @($jsonAnterior.hallazgos)

# ── Clave para identificar el "mismo" hallazgo entre corridas ──
function Get-Clave {
    param($h)
    $herr = ($h.herramienta ?? '').Trim()
    $comp = ($h.componente_afectado ?? '').Trim()
    $hall = ($h.hallazgo ?? '').Trim()
    # Recortar para que ruido (lineas, ids) no rompa el match
    $hashSrc = "$herr|$comp|$($hall.Substring(0,[Math]::Min($hall.Length,120)))"
    return $hashSrc.ToLower()
}

$mapActual   = @{}
$mapAnterior = @{}
foreach ($h in $hActual)   { $mapActual[(Get-Clave $h)] = $h }
foreach ($h in $hAnterior) { $mapAnterior[(Get-Clave $h)] = $h }

# Cerrados: estaban antes, ya no estan
$cerrados = @()
foreach ($k in $mapAnterior.Keys) {
    if (-not $mapActual.ContainsKey($k)) { $cerrados += $mapAnterior[$k] }
}

# Nuevos: no estaban antes, ahora si
$nuevos = @()
foreach ($k in $mapActual.Keys) {
    if (-not $mapAnterior.ContainsKey($k)) { $nuevos += $mapActual[$k] }
}

# Persistentes
$persistentes = @()
foreach ($k in $mapActual.Keys) {
    if ($mapAnterior.ContainsKey($k)) { $persistentes += $mapActual[$k] }
}

# ── Resumen por severidad ──
function Resumir {
    param($lista)
    return @{
        CRITICA = @($lista | Where-Object { $_.severidad -eq 'CRITICA' }).Count
        ALTA    = @($lista | Where-Object { $_.severidad -eq 'ALTA' }).Count
        MEDIA   = @($lista | Where-Object { $_.severidad -eq 'MEDIA' }).Count
        BAJA    = @($lista | Where-Object { $_.severidad -eq 'BAJA' }).Count
        Total   = @($lista).Count
    }
}

# ── Helpers Word ──────────────────────────────────────────────────────────
# Colores COM Word = BGR hex (no RGB)
$COLOR_HEADER_DARK  = 0x3A1F00   # marron oscuro institucional
$COLOR_HEADER_VERDE = 0x005000   # verde oscuro
$COLOR_HEADER_ROJO  = 0x00004B   # rojo oscuro
$COLOR_HEADER_AMBER = 0x004080   # naranja oscuro
$COLOR_HEADER_AZUL  = 0x5A2800   # azul oscuro
$COLOR_WHITE        = 0xFFFFFF
$COLOR_ROW_CRITICA  = 0xC8D4FF   # rojo suave BGR
$COLOR_ROW_ALTA     = 0xC8E0FF   # naranja suave BGR
$COLOR_ROW_MEDIA    = 0xC8F5FF   # amarillo suave BGR
$COLOR_ROW_VERDE    = 0xD4FFD4   # verde suave BGR
$COLOR_ROW_ALT      = 0xF5F5F5   # gris muy suave

function Set-HeaderRow {
    param($tabla, [int]$fila, [string[]]$titulos, [int]$bgColor)
    for ($ci = 0; $ci -lt $titulos.Count; $ci++) {
        $cell = $tabla.Cell($fila, $ci + 1)
        $cell.Range.Text = $titulos[$ci]
        $cell.Range.Font.Bold  = $true
        $cell.Range.Font.Size  = 9
        $cell.Range.Font.Color = [int]$COLOR_WHITE
        $cell.Shading.BackgroundPatternColor = [int]$bgColor
    }
}

function Get-SevColor {
    param([string]$sev)
    switch ($sev) {
        'CRITICA' { return $COLOR_ROW_CRITICA }
        'ALTA'    { return $COLOR_ROW_ALTA }
        'MEDIA'   { return $COLOR_ROW_MEDIA }
        default   { return $COLOR_ROW_ALT }
    }
}

function Get-Significado {
    param([string]$herramienta, [string]$hallazgo)
    $h = $hallazgo.ToLower()
    if ($h -match 'sql.inject')           { return 'Inyeccion SQL: permite manipular consultas a la BD' }
    if ($h -match 'xss|cross.site')       { return 'Cross-Site Scripting: ejecucion de codigo en el navegador del usuario' }
    if ($h -match 'csrf')                 { return 'Falsificacion de solicitudes entre sitios: acciones no autorizadas' }
    if ($h -match 'secret|password|token|key|credential') { return 'Credencial o secreto expuesto en codigo o repositorio' }
    if ($h -match 'cve-')                 { return 'Vulnerabilidad CVE publicada con exploit potencial conocido' }
    if ($h -match 'misconfigur|insecure.header|missing.header') { return 'Configuracion insegura: cabeceras HTTP faltantes o incorrectas' }
    if ($h -match 'tls|ssl|cert')         { return 'Problema de cifrado en comunicacion de red' }
    if ($h -match 'auth|autenticacion|privilege') { return 'Falla de autenticacion o control de acceso' }
    if ($h -match 'path.traversal|directory') { return 'Recorrido de rutas: acceso no autorizado a archivos del servidor' }
    if ($h -match 'open.redirect')        { return 'Redireccion abierta: posible phishing o robo de sesion' }
    if ($h -match 'dependency|librer|package|npm|maven') { return 'Dependencia vulnerable con CVE publicado' }
    if ($h -match 'docker|container|image') { return 'Imagen o contenedor Docker con vulnerabilidades conocidas' }
    if ($h -match 'hardcod')              { return 'Valor sensible escrito directamente en el codigo fuente' }
    if ($h -match 'log|logging')          { return 'Registro inseguro: datos sensibles pueden quedar en logs' }
    if ($h -match 'iac|terraform|yaml|checkov') { return 'Configuracion de infraestructura como codigo insegura' }
    # Por herramienta como fallback
    switch ($herramienta) {
        'semgrep'           { return 'Patron de codigo vulnerable detectado por analisis estatico' }
        'gitleaks'          { return 'Secreto detectado en historial o rama del repositorio Git' }
        'trufflehog'        { return 'Credencial o token detectado en commits del repositorio' }
        'bearer'            { return 'Vulnerabilidad OWASP detectada por analisis estatico de flujo de datos' }
        'checkov'           { return 'Incumplimiento de politica de seguridad en IaC (Dockerfile/YAML)' }
        'dependency-check'  { return 'Dependencia con CVE critico en base NIST/NVD' }
        'osv'               { return 'Vulnerabilidad en base OSV de Google Open Source Security' }
        'retirejs'          { return 'Libreria JavaScript con vulnerabilidades publicadas' }
        'trivy'             { return 'Vulnerabilidad en imagen Docker, filesystem o dependencias' }
        'syft'              { return 'Componente del SBOM con vulnerabilidad conocida' }
        'grype'             { return 'Vulnerabilidad encontrada en el inventario de paquetes del sistema' }
        'zap'               { return 'Vulnerabilidad web detectada por escaneo dinamico OWASP ZAP' }
        'nikto'             { return 'Mala configuracion o vulnerabilidad en el servidor web' }
        'wapiti'            { return 'Vulnerabilidad de inyeccion detectada por fuzzing dinamico' }
        'nuclei'            { return 'Template CVE/misconfiguration confirmado por Nuclei' }
        'restler'           { return 'Vulnerabilidad en API REST detectada por fuzzing automatizado' }
        'lynis'             { return 'Incumplimiento de baseline de hardening del sistema operativo' }
        'sonarqube'         { return 'Bug de seguridad o hotspot detectado por analisis de calidad de codigo' }
        'codeql'            { return 'Vulnerabilidad semantica profunda detectada por CodeQL' }
        default             { return 'Hallazgo de seguridad — revisar detalle tecnico en reporte fuente' }
    }
}

function Get-Recomendacion {
    param([string]$herramienta, [string]$hallazgo, [string]$componente)
    $h = $hallazgo.ToLower()
    $isBackend  = $componente -match 'backend|spring|java|api'
    $isFrontend = $componente -match 'frontend|angular|enlinea|js|ts'
    if ($h -match 'sql.inject') {
        if ($isBackend) { return 'Usar PreparedStatement o JPA parametrizado. Nunca concatenar SQL con input del usuario.' }
        return 'Validar y escapar todos los inputs antes de enviarlos al backend.'
    }
    if ($h -match 'xss|cross.site') {
        if ($isFrontend) { return 'Usar Angular DomSanitizer. Evitar innerHTML y [innerHtml] con datos no confiables.' }
        return 'Aplicar Content-Security-Policy y escapar output HTML en el servidor.'
    }
    if ($h -match 'secret|password|token|key|credential|hardcod') {
        return 'Mover a variables de entorno (.env) o vault. Revocar y rotar el secreto inmediatamente. Limpiar historial Git con git-filter-repo.'
    }
    if ($h -match 'cve-') {
        return 'Actualizar la dependencia a la version parcheada indicada en el CVE. Verificar en NVD: nvd.nist.gov'
    }
    if ($h -match 'missing.header|x-frame|x-content|csp|hsts') {
        if ($isBackend) { return 'Agregar cabeceras en SecurityConfig de Spring Boot: X-Content-Type-Options, X-Frame-Options, HSTS, CSP.' }
        return 'Configurar cabeceras HTTP de seguridad en el servidor web o proxy reverso (nginx/Apache).'
    }
    if ($h -match 'csrf') {
        if ($isBackend) { return 'Habilitar proteccion CSRF en Spring Security. Validar origin/referer en endpoints criticos.' }
        return 'Incluir token CSRF en todas las peticiones POST/PUT/DELETE desde Angular.'
    }
    if ($h -match 'tls|ssl') {
        return 'Forzar TLS 1.2+. Deshabilitar SSLv3, TLS 1.0 y 1.1. Renovar certificado si esta proximo a vencer.'
    }
    if ($h -match 'auth|privilege|access.control') {
        if ($isBackend) { return 'Revisar anotaciones @PreAuthorize y roles en Spring Security. Implementar principio de minimo privilegio.' }
        return 'Verificar guards de ruta en Angular. Validar permisos siempre en el backend, nunca solo en frontend.'
    }
    if ($h -match 'docker|container|image') {
        return 'Actualizar imagen base a version sin CVEs criticos. Usar imagen distroless o alpine minimal. Ejecutar como non-root.'
    }
    if ($h -match 'iac|terraform|dockerfile|checkov') {
        return 'Corregir la politica indicada por Checkov. Revisar guia: docs.bridgecrew.io/docs/checkov'
    }
    # Fallback por herramienta
    switch ($herramienta) {
        'gitleaks'   { return 'Revocar el secreto detectado. Limpiar historial con git-filter-repo. Agregar regla en .gitleaks.toml para prevencion futura.' }
        'trufflehog' { return 'Revocar credencial inmediatamente. Revisar todos los commits del repo afectado. Implementar pre-commit hook.' }
        'lynis'      { return 'Aplicar el control de hardening recomendado por Lynis. Consultar: cisofy.com/lynis' }
        'sonarqube'  { return 'Resolver el hotspot marcado como BLOCKER o CRITICAL en SonarQube. Ver evidencia en localhost:9000.' }
        'nikto'      { return 'Revisar configuracion del servidor web. Deshabilitar metodos HTTP innecesarios (TRACE, OPTIONS).' }
        'wapiti'     { return 'Validar y sanitizar todos los parametros de entrada. Usar lista blanca de valores permitidos.' }
        'nuclei'     { return 'Aplicar el parche o mitigacion indicado en el template Nuclei. Ver referencia CVE del hallazgo.' }
        default      { return 'Revisar el reporte detallado de la herramienta en reportes/security/ y aplicar remediacion segun OWASP Top 10.' }
    }
}

$rAnterior = Resumir $hAnterior
$rActual   = Resumir $hActual
$rCerrados = Resumir $cerrados
$rNuevos   = Resumir $nuevos

# ── Calcular KPIs de gestión ──────────────────────────────────────────────
$totalAnt  = [int]$rAnterior.Total
$totalAct  = [int]$rActual.Total
$delta     = $totalAct - $totalAnt
$mejoraPct = if ($totalAnt -gt 0) { [math]::Round((($totalAnt - $totalAct) / [double]$totalAnt) * 100, 1) } else { 0 }

# Tasa de resolucion = cerrados / anterior total
$tasaResolucion = if ($totalAnt -gt 0) { [math]::Round(($cerrados.Count / [double]$totalAnt) * 100, 1) } else { 0 }

# Tasa de reincidencia = persistentes criticos+altos / total criticos+altos anterior
$critAltAnt = [int]$rAnterior.CRITICA + [int]$rAnterior.ALTA
$critAltPers = @($persistentes | Where-Object { $_.severidad -in @('CRITICA','ALTA') }).Count
$tasaReincidencia = if ($critAltAnt -gt 0) { [math]::Round(($critAltPers / [double]$critAltAnt) * 100, 1) } else { 0 }

# Indice de calidad = 100 - pct criticos activos
$pctCriticos = if ($totalAct -gt 0) { [math]::Round(([int]$rActual.CRITICA / [double]$totalAct) * 100, 1) } else { 0 }
$indiceCalidad = [math]::Max(0, 100 - ($pctCriticos * 3) - ($tasaReincidencia * 0.5))
$indiceCalidad = [math]::Round($indiceCalidad, 1)

# Herramientas por tipo en corrida actual
$herrsActual = @($hActual | Select-Object -ExpandProperty herramienta -ErrorAction SilentlyContinue | Sort-Object -Unique)

Write-Host ""
Write-Host "  Resumen:" -ForegroundColor White
Write-Host "    Anterior : $totalAnt  (CRIT $($rAnterior.CRITICA) | ALTA $($rAnterior.ALTA) | MED $($rAnterior.MEDIA) | BAJA $($rAnterior.BAJA))" -ForegroundColor DarkGray
Write-Host "    Actual   : $totalAct  (CRIT $($rActual.CRITICA) | ALTA $($rActual.ALTA) | MED $($rActual.MEDIA) | BAJA $($rActual.BAJA))" -ForegroundColor DarkGray
Write-Host "    Cerrados : $($cerrados.Count) | Nuevos: $($nuevos.Count) | Persistentes: $($persistentes.Count)" -ForegroundColor DarkGray
Write-Host "    Mejora   : $mejoraPct%  | Resolucion: $tasaResolucion%  | Indice calidad: $indiceCalidad/100" -ForegroundColor $(if ($mejoraPct -ge 0) { 'Green' } else { 'Red' })

# ═══════════════════════════════════════════════════════════════════════════
#  GENERAR WORD
# ═══════════════════════════════════════════════════════════════════════════
Write-Title "Generando INFORME_COMPARATIVO_QA_REGINSA_*.docx"

$fechaSalida = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$stampActual = if ($actual.BaseName -match '(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})') { $Matches[1] } else { $fechaSalida }
$dirActual   = Join-Path $InformesDir $stampActual
if (-not (Test-Path $dirActual)) { New-Item -ItemType Directory -Path $dirActual | Out-Null }
$outFile     = Join-Path $dirActual "INFORME_COMPARATIVO_QA_REGINSA_$fechaSalida.docx"

# Helper: insertar tabla de hallazgos con 5 columnas estructuradas
function Add-TablaHallazgos {
    param(
        $doc,
        $sel,
        [array]$lista,
        [long]$headerColor,
        [string]$textoVacio,
        [switch]$mostrarCorridas  # para persistentes: muestra columna extra
    )
    if ($lista.Count -eq 0) {
        $sel.Font.Size  = 10
        $sel.Font.Bold  = $false
        $sel.Font.Color = 0
        $sel.TypeText($textoVacio)
        $sel.TypeParagraph()
        return
    }

    $cols    = 5
    $filas   = $lista.Count + 1   # +1 header
    $tbl     = $doc.Tables.Add($sel.Range, $filas, $cols)
    $tbl.Borders.Enable          = $true
    $tbl.Range.Font.Size         = 9
    $tbl.Range.Font.Name         = 'Calibri'

    # Tabla al 100% del ancho de pagina con columnas proporcionales (porcentajes)
    $tbl.PreferredWidthType = 2   # wdPreferredWidthPercent
    $tbl.PreferredWidth     = [float]100
    $pcts = @([float]9, [float]16, [float]27, [float]24, [float]24)  # suma=100
    for ($ci = 1; $ci -le $cols; $ci++) {
        $tbl.Columns($ci).PreferredWidthType = 2
        $tbl.Columns($ci).PreferredWidth     = $pcts[$ci - 1]
    }

    # Fila de encabezado
    Set-HeaderRow -tabla $tbl -fila 1 `
        -titulos @('Clasificacion','Herramienta','Hallazgo','Significado','Recomendacion') `
        -bgColor $headerColor

    # Filas de datos
    $sorted = $lista | Sort-Object {
        switch ($_.severidad) { 'CRITICA'{0} 'ALTA'{1} 'MEDIA'{2} 'BAJA'{3} default{4} }
    }
    $row = 2
    foreach ($h in $sorted) {
        $sev   = if ($h.PSObject.Properties['severidad'])          { [string]$h.severidad }          else { 'INFO' }
        $herr  = if ($h.PSObject.Properties['herramienta'])        { [string]$h.herramienta }        else { '-' }
        $hall  = if ($h.PSObject.Properties['hallazgo'])           { [string]$h.hallazgo }           else { '-' }
        $comp  = if ($h.PSObject.Properties['componente_afectado']){ [string]$h.componente_afectado } else { '' }
        $sig   = Get-Significado -herramienta $herr -hallazgo $hall
        $rec   = Get-Recomendacion -herramienta $herr -hallazgo $hall -componente $comp

        # Truncar hallazgo para que no desborde la celda
        $hallTrunc = if ($hall.Length -gt 200) { $hall.Substring(0, 197) + '...' } else { $hall }

        $tbl.Cell($row, 1).Range.Text = $sev
        $tbl.Cell($row, 2).Range.Text = $herr
        $tbl.Cell($row, 3).Range.Text = $hallTrunc
        $tbl.Cell($row, 4).Range.Text = $sig
        $tbl.Cell($row, 5).Range.Text = $rec

        # Color de fila por severidad
        $rowColor = [int](Get-SevColor -sev $sev)
        for ($ci = 1; $ci -le $cols; $ci++) {
            $tbl.Cell($row, $ci).Shading.BackgroundPatternColor = $rowColor
        }
        # Columna clasificacion negrita
        $tbl.Cell($row, 1).Range.Font.Bold = $true

        $row++
    }

    # Mover cursor al final de la tabla
    $sel.EndKey(6) | Out-Null
    $sel.TypeParagraph()
}

$step  = "inicio"
$word  = $null
$doc   = $null
try {
    $step = "crear Word.Application"
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $step = "crear documento"
    $doc = $word.Documents.Add()
    $sel = $word.Selection
    $step = "portada"

    # ── Portada ────────────────────────────────────────────────────────────
    $sel.Font.Name = 'Calibri'
    $sel.Font.Size = 20
    $sel.Font.Bold = $true
    $sel.ParagraphFormat.Alignment = 1   # centrado
    $sel.TypeText("INFORME COMPARATIVO DE SEGUIMIENTO QA")
    $sel.TypeParagraph()
    $sel.Font.Size = 16
    $sel.TypeText("SISTEMA SI-091 REGINSA — SUNEDU")
    $sel.TypeParagraph()
    $sel.Font.Size = 11
    $sel.Font.Bold = $false
    $sel.TypeText("Autora: Liz Vidal  |  Estandares: ISTQB, ISO/IEC 25010, NTP ISO/IEC 12207")
    $sel.TypeParagraph()
    $sel.TypeText("Generado: $(Get-Date -Format 'dd/MM/yyyy HH:mm')  |  Corrida: $stampActual")
    $sel.TypeParagraph()
    $sel.ParagraphFormat.Alignment = 0
    $sel.TypeParagraph()

    # ── Sección 1: Corridas comparadas ────────────────────────────────────
    $sel.Font.Size  = 14; $sel.Font.Bold = $true; $sel.Font.Color = [int]$COLOR_HEADER_DARK
    $sel.TypeText("1. Corridas comparadas")
    $sel.Font.Color = 0; $sel.TypeParagraph()
    $sel.Font.Size  = 10; $sel.Font.Bold = $false
    $sel.TypeText("Corrida anterior : $($anterior.Name)  (fecha: $(Get-FechaCorta $anterior.Name))")
    $sel.TypeParagraph()
    $sel.TypeText("Corrida actual   : $($actual.Name)  (fecha: $(Get-FechaCorta $actual.Name))")
    $sel.TypeParagraph()
    $sel.TypeText("Herramientas ejecutadas: $($herrsActual -join ', ')")
    $sel.TypeParagraph(); $sel.TypeParagraph()

    # ── Sección 2: Resumen ejecutivo (tabla severidades) ──────────────────
    $sel.Font.Size = 14; $sel.Font.Bold = $true; $sel.Font.Color = [int]$COLOR_HEADER_DARK
    $sel.TypeText("2. Resumen ejecutivo de hallazgos")
    $sel.Font.Color = 0; $sel.TypeParagraph()
    $sel.Font.Size  = 10; $sel.Font.Bold = $false

    $step = "tabla resumen ejecutivo"
    $tblRes = $doc.Tables.Add($sel.Range, 7, 5)
    $tblRes.Borders.Enable = $true
    $tblRes.Range.Font.Size = 9
    $tblRes.PreferredWidthType = 2   # wdPreferredWidthPercent
    $tblRes.PreferredWidth     = [float]100
    $wRes_pct = @([float]16, [float]21, [float]21, [float]21, [float]21)  # suma=100
    for ($ci = 1; $ci -le 5; $ci++) {
        $tblRes.Columns($ci).PreferredWidthType = 2
        $tblRes.Columns($ci).PreferredWidth     = $wRes_pct[$ci - 1]
    }

    Set-HeaderRow -tabla $tblRes -fila 1 `
        -titulos @('Severidad','Corrida anterior','Corrida actual','Resueltos','Nuevos detectados') `
        -bgColor $COLOR_HEADER_DARK

    $resRows = @(
        @('CRITICA', $rAnterior.CRITICA, $rActual.CRITICA, $rCerrados.CRITICA, $rNuevos.CRITICA, $COLOR_ROW_CRITICA),
        @('ALTA',    $rAnterior.ALTA,    $rActual.ALTA,    $rCerrados.ALTA,    $rNuevos.ALTA,    $COLOR_ROW_ALTA),
        @('MEDIA',   $rAnterior.MEDIA,   $rActual.MEDIA,   $rCerrados.MEDIA,   $rNuevos.MEDIA,   $COLOR_ROW_MEDIA),
        @('BAJA',    $rAnterior.BAJA,    $rActual.BAJA,    $rCerrados.BAJA,    $rNuevos.BAJA,    $COLOR_ROW_ALT),
        @('INFO',    0,                  0,                0,                  0,                 $COLOR_ROW_ALT),
        @('TOTAL',   $totalAnt,          $totalAct,        $cerrados.Count,    $nuevos.Count,     $COLOR_ROW_VERDE)
    )
    # INFO: contar
    $infoAnt = @($hAnterior | Where-Object { $_.severidad -notin @('CRITICA','ALTA','MEDIA','BAJA') }).Count
    $infoAct = @($hActual   | Where-Object { $_.severidad -notin @('CRITICA','ALTA','MEDIA','BAJA') }).Count
    $resRows[4] = @('INFO', $infoAnt, $infoAct, 0, 0, $COLOR_ROW_ALT)

    for ($r = 0; $r -lt $resRows.Count; $r++) {
        $bgc = [int]$resRows[$r][5]
        for ($ci = 0; $ci -lt 5; $ci++) {
            $tblRes.Cell($r+2, $ci+1).Range.Text = [string]$resRows[$r][$ci]
            $tblRes.Cell($r+2, $ci+1).Shading.BackgroundPatternColor = $bgc
        }
        $tblRes.Cell($r+2, 1).Range.Font.Bold = $true
    }

    $sel.EndKey(6) | Out-Null
    $sel.TypeParagraph()

    # Indicador de mejora
    $sel.Font.Size = 11; $sel.Font.Bold = $true
    $msgColor = if ($mejoraPct -gt 0) { [int]0x006000 } elseif ($mejoraPct -lt 0) { [int]0x0000C0 } else { [int]0x808000 }
    $sel.Font.Color = $msgColor
    $msgMejora = if ($mejoraPct -gt 0) {
        "Mejora del $mejoraPct% respecto al ciclo anterior (reduccion de $([Math]::Abs($delta)) hallazgos)"
    } elseif ($mejoraPct -lt 0) {
        "Regresion del $([Math]::Abs($mejoraPct))% — se incrementaron $([Math]::Abs($delta)) hallazgos"
    } else { "Sin variacion en el total de hallazgos" }
    $sel.TypeText($msgMejora)
    $sel.Font.Color = 0; $sel.TypeParagraph(); $sel.TypeParagraph()

    # ── Sección 3: Hallazgos RESUELTOS ────────────────────────────────────
    $step = "seccion 3 hallazgos resueltos"
    $sel.Font.Size = 14; $sel.Font.Bold = $true; $sel.Font.Color = [int]$COLOR_HEADER_VERDE
    $sel.TypeText("3. Hallazgos RESUELTOS desde la corrida anterior ($($cerrados.Count))")
    $sel.Font.Color = 0; $sel.TypeParagraph()
    $sel.Font.Size  = 9; $sel.Font.Bold = $false
    $sel.TypeText("Estos hallazgos estaban presentes en la corrida anterior y ya no aparecen en la corrida actual.")
    $sel.TypeParagraph()

    Add-TablaHallazgos -doc $doc -sel $sel -lista $cerrados `
        -headerColor $COLOR_HEADER_VERDE `
        -textoVacio "Sin hallazgos resueltos en este ciclo."

    $sel.TypeParagraph()

    # ── Sección 4: Hallazgos NUEVOS ───────────────────────────────────────
    $step = "seccion 4 hallazgos nuevos"
    $sel.Font.Size = 14; $sel.Font.Bold = $true; $sel.Font.Color = [int]$COLOR_HEADER_ROJO
    $sel.TypeText("4. Hallazgos NUEVOS detectados en esta corrida ($($nuevos.Count))")
    $sel.Font.Color = 0; $sel.TypeParagraph()
    $sel.Font.Size  = 9; $sel.Font.Bold = $false
    $sel.TypeText("Estos hallazgos no existian en la corrida anterior. Requieren atencion prioritaria si son CRITICA o ALTA.")
    $sel.TypeParagraph()

    Add-TablaHallazgos -doc $doc -sel $sel -lista $nuevos `
        -headerColor $COLOR_HEADER_ROJO `
        -textoVacio "Sin hallazgos nuevos en este ciclo. Excelente resultado."

    $sel.TypeParagraph()

    # ── Sección 5: Hallazgos PERSISTENTES ────────────────────────────────
    $persistCritAlta = @($persistentes | Where-Object { $_.severidad -in @('CRITICA','ALTA') })
    $persistResto    = @($persistentes | Where-Object { $_.severidad -notin @('CRITICA','ALTA') })

    $step = "seccion 5 persistentes"
    $sel.Font.Size = 14; $sel.Font.Bold = $true; $sel.Font.Color = [int]$COLOR_HEADER_AMBER
    $sel.TypeText("5. Hallazgos PERSISTENTES sin resolver ($($persistentes.Count))")
    $sel.Font.Color = 0; $sel.TypeParagraph()
    $sel.Font.Size  = 9; $sel.Font.Bold = $false
    $sel.TypeText("Presentes en ambas corridas. CRITICA+ALTA urgentes: $($persistCritAlta.Count). MEDIA+BAJA: $($persistResto.Count).")
    $sel.TypeParagraph()

    # 5a: urgentes primero
    if ($persistCritAlta.Count -gt 0) {
        $sel.Font.Bold = $true; $sel.Font.Size = 10
        $sel.TypeText("5a. Prioritarios (CRITICA y ALTA) — accion requerida este sprint")
        $sel.Font.Bold = $false; $sel.TypeParagraph()
        Add-TablaHallazgos -doc $doc -sel $sel -lista $persistCritAlta `
            -headerColor $COLOR_HEADER_AMBER `
            -textoVacio ""
        $sel.TypeParagraph()
    }

    if ($persistResto.Count -gt 0) {
        $sel.Font.Bold = $true; $sel.Font.Size = 10
        $sel.TypeText("5b. Deuda acumulada (MEDIA y BAJA) — programar en backlog")
        $sel.Font.Bold = $false; $sel.TypeParagraph()
        Add-TablaHallazgos -doc $doc -sel $sel -lista $persistResto `
            -headerColor $COLOR_HEADER_AMBER `
            -textoVacio ""
        $sel.TypeParagraph()
    }

    if ($persistentes.Count -eq 0) {
        $sel.Font.Size = 10; $sel.Font.Bold = $false
        $sel.TypeText("Sin hallazgos persistentes. Todos los hallazgos anteriores fueron resueltos o son nuevos.")
        $sel.TypeParagraph()
    }
    $sel.TypeParagraph()

    # ── Sección 6: Matriz comparativa de indicadores de gestión ──────────
    $sel.Font.Size = 14; $sel.Font.Bold = $true; $sel.Font.Color = [int]$COLOR_HEADER_AZUL
    $sel.TypeText("6. Matriz comparativa de indicadores de gestion")
    $sel.Font.Color = 0; $sel.TypeParagraph()
    $sel.Font.Size  = 9; $sel.Font.Bold = $false
    $sel.TypeText("Base para seguimiento mensual. Ejecutar nuevamente en ~30 dias para medir evolucion.")
    $sel.TypeParagraph()

    # Semaforo textual
    function Get-Semaforo {
        param([double]$valor, [double]$umbralVerde, [double]$umbralAmbar, [switch]$invertir)
        if ($invertir) {
            if ($valor -le $umbralVerde) { return 'VERDE  [OK]' }
            if ($valor -le $umbralAmbar) { return 'AMBAR  [!!]' }
            return 'ROJO   [X]'
        } else {
            if ($valor -ge $umbralVerde) { return 'VERDE  [OK]' }
            if ($valor -ge $umbralAmbar) { return 'AMBAR  [!!]' }
            return 'ROJO   [X]'
        }
    }
    function Get-SemaforoColor { param([string]$sem)
        if ($sem -match 'VERDE') { return [int]$COLOR_ROW_VERDE }
        if ($sem -match 'AMBAR') { return [int]$COLOR_ROW_MEDIA }
        return [int]$COLOR_ROW_CRITICA
    }

    # Datos de la matriz
    $matrizKPI = @(
        # Indicador | Corrida anterior | Corrida actual | Meta | Semaforo
        @{
            Indicador  = 'Total hallazgos activos'
            Anterior   = "$totalAnt"
            Actual     = "$totalAct"
            Meta       = 'Reduccion continua'
            Semaforo   = if ($totalAct -le $totalAnt) { 'VERDE  [OK]' } else { 'ROJO   [X]' }
        },
        @{
            Indicador  = 'Hallazgos CRITICOS activos'
            Anterior   = "$($rAnterior.CRITICA)"
            Actual     = "$($rActual.CRITICA)"
            Meta       = '0 en produccion'
            Semaforo   = if ([int]$rActual.CRITICA -eq 0) { 'VERDE  [OK]' } elseif ([int]$rActual.CRITICA -le [int]$rAnterior.CRITICA) { 'AMBAR  [!!]' } else { 'ROJO   [X]' }
        },
        @{
            Indicador  = 'Hallazgos ALTOS activos'
            Anterior   = "$($rAnterior.ALTA)"
            Actual     = "$($rActual.ALTA)"
            Meta       = 'Reduccion >50% por sprint'
            Semaforo   = if ([int]$rActual.ALTA -lt [int]$rAnterior.ALTA) { 'VERDE  [OK]' } elseif ([int]$rActual.ALTA -eq [int]$rAnterior.ALTA) { 'AMBAR  [!!]' } else { 'ROJO   [X]' }
        },
        @{
            Indicador  = 'Hallazgos resueltos en el ciclo'
            Anterior   = '-'
            Actual     = "$($cerrados.Count)"
            Meta       = '>= 20% del total anterior'
            Semaforo   = Get-Semaforo -valor $tasaResolucion -umbralVerde 20 -umbralAmbar 10
        },
        @{
            Indicador  = 'Tasa de resolucion (%)'
            Anterior   = '-'
            Actual     = "$tasaResolucion%"
            Meta       = '>= 20% por ciclo'
            Semaforo   = Get-Semaforo -valor $tasaResolucion -umbralVerde 20 -umbralAmbar 10
        },
        @{
            Indicador  = 'Hallazgos nuevos detectados'
            Anterior   = '-'
            Actual     = "$($nuevos.Count)"
            Meta       = '< total cerrados (neto positivo)'
            Semaforo   = if ($nuevos.Count -lt $cerrados.Count) { 'VERDE  [OK]' } elseif ($nuevos.Count -eq $cerrados.Count) { 'AMBAR  [!!]' } else { 'ROJO   [X]' }
        },
        @{
            Indicador  = 'Persistentes CRITICA+ALTA sin resolver'
            Anterior   = "$critAltAnt"
            Actual     = "$critAltPers"
            Meta       = '0 al cierre del sprint'
            Semaforo   = if ($critAltPers -eq 0) { 'VERDE  [OK]' } elseif ($critAltPers -lt $critAltAnt) { 'AMBAR  [!!]' } else { 'ROJO   [X]' }
        },
        @{
            Indicador  = 'Tasa de reincidencia CRITICA+ALTA (%)'
            Anterior   = '-'
            Actual     = "$tasaReincidencia%"
            Meta       = '< 20%'
            Semaforo   = Get-Semaforo -valor $tasaReincidencia -umbralVerde 20 -umbralAmbar 40 -invertir
        },
        @{
            Indicador  = 'Mejora neta del ciclo (%)'
            Anterior   = '-'
            Actual     = "$mejoraPct%"
            Meta       = '>= 0% (no regresion)'
            Semaforo   = if ($mejoraPct -gt 0) { 'VERDE  [OK]' } elseif ($mejoraPct -eq 0) { 'AMBAR  [!!]' } else { 'ROJO   [X]' }
        },
        @{
            Indicador  = 'Indice de calidad QA (0-100)'
            Anterior   = '-'
            Actual     = "$indiceCalidad / 100"
            Meta       = '>= 70 aceptable / >= 85 objetivo'
            Semaforo   = if ($indiceCalidad -ge 85) { 'VERDE  [OK]' } elseif ($indiceCalidad -ge 70) { 'AMBAR  [!!]' } else { 'ROJO   [X]' }
        },
        @{
            Indicador  = 'Herramientas de seguridad activas'
            Anterior   = '-'
            Actual     = "$($herrsActual.Count)"
            Meta       = '>= 10 herramientas por corrida'
            Semaforo   = if ($herrsActual.Count -ge 10) { 'VERDE  [OK]' } elseif ($herrsActual.Count -ge 5) { 'AMBAR  [!!]' } else { 'ROJO   [X]' }
        }
    )

    $step = "tabla KPI"
    $tblKPI = $doc.Tables.Add($sel.Range, $matrizKPI.Count + 1, 5)
    $tblKPI.Borders.Enable = $true
    $tblKPI.Range.Font.Size = 9
    $tblKPI.PreferredWidthType = 2   # wdPreferredWidthPercent
    $tblKPI.PreferredWidth     = [float]100
    $wKPI_pct = @([float]33, [float]13, [float]13, [float]25, [float]16)  # suma=100
    for ($ci = 1; $ci -le 5; $ci++) {
        $tblKPI.Columns($ci).PreferredWidthType = 2
        $tblKPI.Columns($ci).PreferredWidth     = $wKPI_pct[$ci - 1]
    }

    Set-HeaderRow -tabla $tblKPI -fila 1 `
        -titulos @('Indicador de gestion','Corrida anterior','Corrida actual','Meta / Referencia','Estado') `
        -bgColor $COLOR_HEADER_AZUL

    for ($r = 0; $r -lt $matrizKPI.Count; $r++) {
        $kpi   = $matrizKPI[$r]
        $rowBg = Get-SemaforoColor -sem $kpi.Semaforo
        $tblKPI.Cell($r+2, 1).Range.Text = $kpi.Indicador
        $tblKPI.Cell($r+2, 2).Range.Text = $kpi.Anterior
        $tblKPI.Cell($r+2, 3).Range.Text = $kpi.Actual
        $tblKPI.Cell($r+2, 4).Range.Text = $kpi.Meta
        $tblKPI.Cell($r+2, 5).Range.Text = $kpi.Semaforo
        $tblKPI.Cell($r+2, 1).Range.Font.Bold = $true
        # Color solo en la celda de estado
        $tblKPI.Cell($r+2, 5).Shading.BackgroundPatternColor = [int]$rowBg
        # Filas alternas suaves en el resto
        $altBg = if ($r % 2 -eq 0) { [int]$COLOR_ROW_ALT } else { [int]0xFFFFFF }
        for ($ci = 1; $ci -le 4; $ci++) {
            $tblKPI.Cell($r+2, $ci).Shading.BackgroundPatternColor = $altBg
        }
    }

    $sel.EndKey(6) | Out-Null
    $sel.TypeParagraph(); $sel.TypeParagraph()

    # ── Sección 7: Conclusión y próximos pasos ────────────────────────────
    $sel.Font.Size = 14; $sel.Font.Bold = $true; $sel.Font.Color = [int]$COLOR_HEADER_DARK
    $sel.TypeText("7. Conclusion y proximos pasos")
    $sel.Font.Color = 0; $sel.TypeParagraph()
    $sel.Font.Size  = 10; $sel.Font.Bold = $false

    $criticosCerrados = [int]$rCerrados.CRITICA
    $altosCerrados    = [int]$rCerrados.ALTA
    $criticosNuevos   = [int]$rNuevos.CRITICA
    $altosNuevos      = [int]$rNuevos.ALTA

    $conclusion = "En el ciclo analizado se resolvieron $($cerrados.Count) hallazgos " +
        "($criticosCerrados criticos, $altosCerrados altos) e ingresaron $($nuevos.Count) nuevos " +
        "($criticosNuevos criticos, $altosNuevos altos). " +
        "Quedan $($persistentes.Count) hallazgos activos sin resolver desde ciclos anteriores " +
        "($critAltPers de ellos son CRITICA o ALTA). " +
        "La mejora neta del ciclo es de $mejoraPct% con un Indice de Calidad QA de $indiceCalidad/100."
    $sel.TypeText($conclusion)
    $sel.TypeParagraph(); $sel.TypeParagraph()

    # Proximos pasos segun resultado
    $sel.Font.Bold = $true
    $sel.TypeText("Proximos pasos recomendados:")
    $sel.Font.Bold = $false; $sel.TypeParagraph()

    if ($critAltPers -gt 0) {
        $sel.TypeText("  1. Resolver los $critAltPers hallazgos CRITICA/ALTA persistentes antes del proximo release.")
        $sel.TypeParagraph()
    }
    if ($criticosNuevos -gt 0) {
        $sel.TypeText("  2. Atender los $criticosNuevos hallazgos CRITICOS nuevos de forma inmediata (SLA: 24-72h).")
        $sel.TypeParagraph()
    }
    $sel.TypeText("  3. Volver a ejecutar la suite completa en aproximadamente 30 dias para medir evolucion en la matriz de KPIs.")
    $sel.TypeParagraph()
    $sel.TypeText("  4. Compartir este informe con jefatura y el equipo de desarrollo para asignar responsables de remediacion.")
    $sel.TypeParagraph()
    if ($tasaResolucion -lt 20) {
        $sel.TypeText("  5. La tasa de resolucion ($tasaResolucion%) esta por debajo del objetivo (20%). Revisar capacidad del equipo o repriorizar backlog.")
        $sel.TypeParagraph()
    }
    $sel.TypeParagraph()

    $step = "guardar docx"
    # ── Guardar ───────────────────────────────────────────────────────────
    $outFileStr = [string]$outFile
    try   { $doc.SaveAs2($outFileStr, 12) }   # 12 = wdFormatXMLDocument (.docx)
    catch { $doc.SaveAs([ref]$outFileStr, 12) }
    Write-Ok "Generado: $outFileStr"
}
catch {
    Write-Warn "Error generando Word en paso [$step]: $($_.Exception.Message)"
    Write-Warn "  Detalle: $($_.Exception.GetType().Name)"
}
finally {
    if ($null -ne $doc)  { try { $doc.Close()  } catch { Write-Verbose "Cerrando doc: $_" } }
    if ($null -ne $word) {
        try { $word.Quit() } catch { Write-Verbose "Quit Word: $_" }
        try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) } catch { Write-Verbose "Release: $_" }
    }
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  COMPARATIVO COMPLETADO" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
