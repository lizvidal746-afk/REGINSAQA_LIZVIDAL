<#
.SYNOPSIS
    Enriquece hallazgos normalizados con analisis IA via Ollama local (gratuito).

.DESCRIPTION
    Lee findings-normalized-*.json y para cada hallazgo CRITICO/ALTO consulta a Ollama
    para agregar:
      - ai_risk_analysis: por que es peligroso para REGINSA especificamente
      - ai_business_impact: que componente del negocio afecta
      - ai_remediation_detail: pasos concretos Spring Boot / Angular
      - ai_priority_score: 0-100 para ordenamiento

    Si Ollama no esta disponible, usa heuristicas locales (-NoOllama).
    Si esta disponible, procesa CRITICOS uno-a-uno y ALTOS en lotes pequenos.

.PARAMETER OllamaUrl
    URL de Ollama. Por defecto http://localhost:11434

.PARAMETER Model
    Modelo a usar. Recomendados (free, locales):
      - llama3.1:8b           (rapido, 4.7GB)
      - qwen2.5-coder:7b      (especializado en codigo, 4.7GB)
      - deepseek-r1:8b        (razonamiento profundo, 5.2GB)

.EXAMPLE
    pwsh scripts/ai/analyze-findings.ps1 -Model llama3.1:8b
    pwsh scripts/ai/analyze-findings.ps1 -NoOllama  # Solo heuristicas
#>
[CmdletBinding()]
param(
    [string]$InputJson  = "",
    [string]$OutputJson = "",
    [string]$OllamaUrl  = "http://localhost:11434",
    [string]$Model      = "llama3.1:8b",
    [int]$MaxCritical   = 30,
    [int]$MaxHigh       = 20,
    [switch]$NoOllama
)

Set-StrictMode -Off
$ErrorActionPreference = 'Continue'

$Root        = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$InformesDir = Join-Path $Root 'reportes\informes'

if (-not $InputJson) {
    $latest = Get-ChildItem -Path $InformesDir -Filter 'findings-normalized-*.json' -File |
              Sort-Object Name -Descending | Select-Object -First 1
    if (-not $latest) { throw "No se encontro findings-normalized-*.json. Ejecuta primero normalize-findings.ps1" }
    $InputJson = $latest.FullName
}
if (-not $OutputJson) {
    $OutputJson = $InputJson -replace 'normalized', 'analyzed'
}

Write-Host "`n=== ANALISIS IA DE HALLAZGOS ===" -ForegroundColor Magenta
Write-Host "  Input : $InputJson"  -ForegroundColor Cyan
Write-Host "  Output: $OutputJson" -ForegroundColor Cyan

$report = Get-Content $InputJson -Raw -Encoding UTF8 | ConvertFrom-Json

# ── Verificar Ollama ──
$ollamaAvailable = $false
if (-not $NoOllama) {
    try {
        $tags = Invoke-RestMethod -Uri "$OllamaUrl/api/tags" -Method Get -TimeoutSec 5
        $models = @($tags.models | ForEach-Object { $_.name })
        if ($Model -in $models) {
            $ollamaAvailable = $true
            Write-Host "  Ollama: DISPONIBLE | modelo $Model OK" -ForegroundColor Green
        } else {
            Write-Host "  Ollama: corre pero falta modelo '$Model'. Disponibles: $($models -join ', ')" -ForegroundColor Yellow
            Write-Host "  Sugerencia: ollama pull $Model" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  Ollama: NO disponible en $OllamaUrl - usando heuristicas locales" -ForegroundColor Yellow
    }
}

# ── Heuristicas de fallback (sin IA) ──
function Get-HeuristicAnalysis {
    param($f)
    $title = [string]$f.title
    $tool  = [string]$f.tool
    $area  = [string]$f.business_area

    $risk = switch -Wildcard ($title) {
        '*CVE-*'                  { "Vulnerabilidad publicada con CVE. Si la libreria afectada esta expuesta en $area, hay riesgo de explotacion remota." }
        '*GHSA-*'                 { "Aviso de seguridad GitHub. Verificar si el modulo afectado esta en path de ejecucion productiva." }
        '*Private Key*'           { "Credencial criptografica detectada. Si esta en codigo productivo: rotar inmediatamente. Si esta en templates/tests: anadir a exclusion." }
        '*JWT*token*'             { "Token JWT en repositorio. Validar si es de produccion - en ese caso revocar y rotar." }
        '*sql*injection*'         { "Inyeccion SQL: permite leer/modificar BD de REGINSA. CRITICO si afecta endpoints de Sanciones o Administrados." }
        '*XSS*'                   { "Cross-Site Scripting: ejecucion de codigo en navegador del usuario SUNEDU. Riesgo de robo de sesion." }
        '*CKV*'                   { "Configuracion IaC insegura. Aplicar control de hardening sugerido por Checkov." }
        '*missing*header*'        { "Falta cabecera HTTP de seguridad. Anadir en SecurityConfig (Spring) o nginx." }
        '*shell*injection*'       { "Inyeccion en shell de pipeline. Si es en GitHub Actions, evaluar uso de inputs no validados." }
        default                   { "Hallazgo de $tool clasificado como $($f.severity). Requiere revision manual." }
    }

    $impact = switch ($area) {
        'Autenticacion'  { "Compromete inicio de sesion en REGINSA. Toda operacion subsiguiente se ve afectada." }
        'Sanciones'      { "Afecta el registro/consulta de sanciones - flujo critico institucional." }
        'Administrados'  { "Afecta gestion de administrados - datos PII de docentes." }
        'Backend'        { "Componente backend Spring Boot - revision en arquitectura de servicios." }
        'Frontend'       { "Componente Angular - puede afectar experiencia de usuario o exponer datos en cliente." }
        'Pipeline'       { "Pipeline CI/CD - afecta cadena de despliegue, no produccion directa." }
        'Infraestructura' { "Configuracion de infra - afecta seguridad de despliegues y contenedores." }
        default          { "Componente general - evaluar exposicion en arquitectura." }
    }

    $remediation = if ($f.recomendacion_base) { [string]$f.recomendacion_base } else { "Revisar reporte de $tool y aplicar fix sugerido por la regla." }

    $score = 0
    switch ($f.severity)         { 'CRITICA' { $score += 40 } 'ALTA' { $score += 25 } 'MEDIA' { $score += 12 } 'BAJA' { $score += 5 } }
    switch ($f.exploitability)   { 'ALTA'    { $score += 30 } 'MEDIA' { $score += 15 } 'BAJA' { $score += 5 } }
    if ($f.is_production_path)   { $score += 15 }
    if ($area -in @('Autenticacion','Sanciones','Administrados')) { $score += 15 }
    if ($score -gt 100) { $score = 100 }

    return @{
        risk        = $risk
        impact      = $impact
        remediation = $remediation
        score       = $score
    }
}

# ── Analisis Ollama ──
function Invoke-OllamaAnalysis {
    param($f)
    # Contexto KEV/EPSS si fue enriquecido por enrich-epss-kev.ps1
    $kevLine  = ''
    $epssLine = ''
    if ($f.PSObject.Properties.Name -contains 'in_kev' -and $f.in_kev) {
        $kevLine = "`nALERTA KEV: CVE en catalogo CISA Known Exploited Vulnerabilities. Explotacion CONFIRMADA en wild. Remediacion INMEDIATA."
    }
    if ($f.PSObject.Properties.Name -contains 'epss_score' -and $f.epss_score) {
        $pct = [math]::Round([double]$f.epss_score * 100, 1)
        $epssLine = "`nEPSS: ${pct}% probabilidad de explotacion en 30 dias (FIRST.org)."
    }
    $userPrompt = @"
Analiza este hallazgo de seguridad del sistema REGINSA (Registro de Sanciones a Docentes - SUNEDU Peru).

Stack: backend .NET (C#, 15 .csproj) + frontend Angular 17 + PostgreSQL/SQL Server + Azure DevOps.
Tipo: $($f.tool) | Severidad: $($f.severity) | Area: $($f.business_area)
Path productivo: $($f.is_production_path) | Ocurrencias: $($f.occurrence_count)$kevLine$epssLine

Hallazgo: $($f.title)
ISO 25010: $($f.iso25010)
Recomendacion base: $($f.recomendacion_base)

Devuelve SOLO JSON valido (sin explicaciones, sin texto antes/despues):
{
  "risk_analysis": "2-3 lineas explicando por que es peligroso para REGINSA",
  "business_impact": "Que funcionalidad afecta (Login/Sanciones/Administrados/etc)",
  "remediation_detail": "Pasos concretos para .NET o Angular en 2 lineas",
  "priority_score": 70
}
"@
    $body = @{
        model    = $Model
        prompt   = $userPrompt
        stream   = $false
        format   = 'json'
        options  = @{ temperature = 0.1; num_predict = 600 }
    } | ConvertTo-Json -Depth 4 -Compress

    try {
        $resp = Invoke-RestMethod -Uri "$OllamaUrl/api/generate" -Method Post -Body $body -ContentType 'application/json; charset=utf-8' -TimeoutSec 60
        $parsed = $resp.response | ConvertFrom-Json -ErrorAction Stop
        return @{
            risk        = [string]$parsed.risk_analysis
            impact      = [string]$parsed.business_impact
            remediation = [string]$parsed.remediation_detail
            score       = [int]$parsed.priority_score
        }
    } catch {
        Write-Verbose "Ollama fallo para '$($f.group_key)': $($_.Exception.Message)"
        return $null
    }
}

# ── Procesar ──
$findings = @($report.findings)
$crit = @($findings | Where-Object { $_.severity -eq 'CRITICA' } | Select-Object -First $MaxCritical)
$high = @($findings | Where-Object { $_.severity -eq 'ALTA' }    | Select-Object -First $MaxHigh)
$rest = @($findings | Where-Object { $_.severity -in @('MEDIA','BAJA') })

Write-Host "  Procesando: $($crit.Count) CRITICOS + $($high.Count) ALTOS via IA, $($rest.Count) restantes via heuristica" -ForegroundColor Cyan

$processed = New-Object System.Collections.Generic.List[object]
$counter = 0
$total = $crit.Count + $high.Count
$kevSkipped = 0

foreach ($batch in @(@{ list = $crit; tag = 'CRIT' }, @{ list = $high; tag = 'HIGH' })) {
    foreach ($f in $batch.list) {
        $counter++
        $analysis = $null

        # Override KEV: no gastar tokens del LLM, score maximo, sprint ACTUAL
        $isKev = ($f.PSObject.Properties.Name -contains 'in_kev' -and $f.in_kev)
        if ($isKev) {
            $kevReason = if ($f.PSObject.Properties.Name -contains 'priority_override_reason') { [string]$f.priority_override_reason } else { 'CVE en CISA KEV - explotacion confirmada' }
            $analysis = @{
                risk        = "[KEV] $kevReason. Vulnerabilidad con explotacion confirmada en el mundo real - remediacion INMEDIATA (SLA <24h) sin importar severidad CVSS base."
                impact      = "Componente afectado: $($f.business_area). Riesgo critico de compromiso por exploit publico activo."
                remediation = if ($f.recomendacion_base) { [string]$f.recomendacion_base } else { 'Aplicar parche/upgrade upstream segun aviso del proveedor; no postergar a sprint posterior.' }
                score       = 100
            }
            $kevSkipped++
            Write-Host ("    [{0,3}/{1,3}] {2} {3}  [KEV-OVERRIDE]" -f $counter, $total, $batch.tag, $f.group_key) -ForegroundColor Red
        } elseif ($ollamaAvailable) {
            Write-Host ("    [{0,3}/{1,3}] {2} {3}" -f $counter, $total, $batch.tag, $f.group_key) -ForegroundColor DarkGray
            $analysis = Invoke-OllamaAnalysis -f $f
        }
        if (-not $analysis) { $analysis = Get-HeuristicAnalysis -f $f }

        $f.ai_risk_analysis      = $analysis.risk
        $f.ai_business_impact    = $analysis.impact
        $f.ai_remediation_detail = $analysis.remediation
        $f.ai_priority_score     = $analysis.score
        $processed.Add($f) | Out-Null
    }
}

# Restantes con heuristica
foreach ($f in $rest) {
    $a = Get-HeuristicAnalysis -f $f
    $f.ai_risk_analysis      = $a.risk
    $f.ai_business_impact    = $a.impact
    $f.ai_remediation_detail = $a.remediation
    $f.ai_priority_score     = $a.score
    $processed.Add($f) | Out-Null
}

# Actualizar findings ordenado por priority_score desc
$report.findings = $processed | Sort-Object -Property ai_priority_score -Descending

# Agregar metadata IA
$report.meta | Add-Member -NotePropertyName 'ai_engine'    -NotePropertyValue $(if ($ollamaAvailable) { "ollama:$Model" } else { 'heuristic-only' }) -Force
$report.meta | Add-Member -NotePropertyName 'analyzed_at'  -NotePropertyValue (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') -Force
$report.meta | Add-Member -NotePropertyName 'ai_processed' -NotePropertyValue $total -Force
$report.meta | Add-Member -NotePropertyName 'kev_skipped_llm' -NotePropertyValue $kevSkipped -Force

$report | ConvertTo-Json -Depth 8 | Out-File -FilePath $OutputJson -Encoding UTF8

Write-Host "`n  [OK] Analisis completado: $($processed.Count) hallazgos enriquecidos" -ForegroundColor Green
Write-Host "  Generado: $OutputJson" -ForegroundColor Green
