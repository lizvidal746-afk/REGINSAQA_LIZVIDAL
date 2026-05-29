#Requires -Version 7
<#
.SYNOPSIS
  Envía los hallazgos de seguridad a DefectDojo via API REST.
  Crea/reutiliza Product y Engagement por fecha, luego importa cada scan.

.PARAMETER DojoUrl
  URL base de DefectDojo. Por defecto http://localhost:8080

.PARAMETER DojoUser
  Usuario admin de DefectDojo. Por defecto "admin"

.PARAMETER DojoPassword
  Contraseña de DefectDojo.

.PARAMETER Date
  Fecha del escaneo en formato YYYY-MM-DD. Por defecto hoy.

.EXAMPLE
  pwsh -File scripts/security/enviar-a-defectdojo.ps1 -Date 2026-05-04
#>
param(
  [string]$DojoUrl      = 'http://localhost:8080',
  [string]$DojoUser     = 'admin',
  [SecureString]$DojoPassword,
  [string]$Date         = (Get-Date -Format 'yyyy-MM-dd')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Inicializar DojoPassword desde entorno si no se paso como parametro
if (-not $DojoPassword) {
  $rawPass = $env:DOJO_PASSWORD
  if ([string]::IsNullOrWhiteSpace($rawPass)) {
    throw "Define DOJO_PASSWORD en el entorno o pasa -DojoPassword."
  }
  $DojoPassword = [System.Security.SecureString]::new()
  foreach ($c in $rawPass.ToCharArray()) { $DojoPassword.AppendChar($c) }
  $DojoPassword.MakeReadOnly()
}

# ── Helpers ────────────────────────────────────────────────────────────────
function Write-Step  { param([string]$m) Write-Host "  >> $m" -ForegroundColor Cyan }
function Write-Ok    { param([string]$m) Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn  { param([string]$m) Write-Host "  [WARN] $m" -ForegroundColor Yellow }
function Write-Fail  { param([string]$m) Write-Host "  [FAIL] $m" -ForegroundColor Red }

# ── Obtener token de DefectDojo ────────────────────────────────────────────
function Get-DojoToken {
  try {
    $plainPass = [System.Net.NetworkCredential]::new('', $DojoPassword).Password
    $body = @{ username = $DojoUser; password = $plainPass } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$DojoUrl/api/v2/api-token-auth/" `
         -Method POST -Body $body -ContentType 'application/json' -TimeoutSec 15
    return $r.token
  } catch {
    throw "No se pudo obtener token de DefectDojo en $DojoUrl : $_"
  }
}

# ── Headers con token ─────────────────────────────────────────────────────
function Get-AuthHeader { param([string]$Token)
  return @{ Authorization = "Token $Token"; Accept = 'application/json' }
}

# ── Obtener o crear Product ───────────────────────────────────────────────
function Get-OrCreate-Product {
  param([string]$Token, [string]$ProductName)
  $headers = Get-AuthHeader $Token
  $existing = Invoke-RestMethod -Uri "$DojoUrl/api/v2/products/?name=$([uri]::EscapeDataString($ProductName))" `
              -Headers $headers -Method GET -TimeoutSec 15
  if ($existing.count -gt 0) {
    return $existing.results[0].id
  }
  $body = @{
    name        = $ProductName
    description = "Sistema REGINSA - SI091 SUNEDU - QA Automatizado"
    prod_type   = 1
  } | ConvertTo-Json
  $new = Invoke-RestMethod -Uri "$DojoUrl/api/v2/products/" `
         -Method POST -Body $body -ContentType 'application/json' -Headers $headers -TimeoutSec 15
  return $new.id
}

# ── Obtener o crear Engagement ─────────────────────────────────────────────
function Get-OrCreate-Engagement {
  param([string]$Token, [int]$ProductId, [string]$EngagementName, [string]$Date)
  $headers = Get-AuthHeader $Token
  $existing = Invoke-RestMethod `
    -Uri "$DojoUrl/api/v2/engagements/?product=$ProductId&name=$([uri]::EscapeDataString($EngagementName))" `
    -Headers $headers -Method GET -TimeoutSec 15
  if ($existing.count -gt 0) {
    return $existing.results[0].id
  }
  $body = @{
    name            = $EngagementName
    product         = $ProductId
    status          = "In Progress"
    target_start    = $Date
    target_end      = $Date
    engagement_type = "CI/CD"
    description     = "Escaneo automatizado REGINSA QA - $Date"
  } | ConvertTo-Json
  $new = Invoke-RestMethod -Uri "$DojoUrl/api/v2/engagements/" `
         -Method POST -Body $body -ContentType 'application/json' -Headers $headers -TimeoutSec 15
  return $new.id
}

# ── Importar un scan file ─────────────────────────────────────────────────
function Import-Scan {
  param(
    [string]$Token,
    [int]$EngagementId,
    [string]$ScanType,
    [string]$FilePath,
    [string]$ToolName
  )
  if (-not (Test-Path $FilePath)) {
    Write-Warn "  $ToolName`: archivo no encontrado - $FilePath"
    return $null
  }
  $fileSize = (Get-Item $FilePath).Length
  if ($fileSize -lt 10) {
    Write-Warn "  $ToolName`: archivo vacío ($fileSize bytes) - omitido"
    return $null
  }

  $headers = Get-AuthHeader $Token
  # Construir multipart form
  $boundary = [System.Guid]::NewGuid().ToString()
  $LF = "`r`n"
  $fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
  $fileName  = [System.IO.Path]::GetFileName($FilePath)

  $bodyParts = "--$boundary$LF"
  $bodyParts += "Content-Disposition: form-data; name=`"scan_type`"$LF$LF$ScanType$LF"
  $bodyParts += "--$boundary$LF"
  $bodyParts += "Content-Disposition: form-data; name=`"engagement`"$LF$LF$EngagementId$LF"
  $bodyParts += "--$boundary$LF"
  $bodyParts += "Content-Disposition: form-data; name=`"verified`"$LF$LFFalse$LF"
  $bodyParts += "--$boundary$LF"
  $bodyParts += "Content-Disposition: form-data; name=`"active`"$LF$LFTrue$LF"
  $bodyParts += "--$boundary$LF"
  $bodyParts += "Content-Disposition: form-data; name=`"close_old_findings`"$LF$LFFalse$LF"
  $bodyParts += "--$boundary$LF"
  $bodyParts += "Content-Disposition: form-data; name=`"minimum_severity`"$LF$LFInfo$LF"
  $bodyParts += "--$boundary$LF"
  $bodyParts += "Content-Disposition: form-data; name=`"file`"; filename=`"$fileName`"$LF"
  $bodyParts += "Content-Type: application/json$LF$LF"

  $enc      = [System.Text.Encoding]::UTF8
  $preamble = $enc.GetBytes($bodyParts)
  $epilogue  = $enc.GetBytes("$LF--$boundary--$LF")
  $fullBody = $preamble + $fileBytes + $epilogue

  try {
    $r = Invoke-RestMethod `
      -Uri "$DojoUrl/api/v2/import-scan/" `
      -Method POST `
      -Headers $headers `
      -Body $fullBody `
      -ContentType "multipart/form-data; boundary=$boundary" `
      -TimeoutSec 60
    return $r
  } catch {
    Write-Warn "  $ToolName`: import fallido - $($_.Exception.Message)"
    return $null
  }
}

# ══════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  ENVIO A DEFECTDOJO - REGINSA Security Findings" -ForegroundColor Cyan
Write-Host "  Fecha: $Date  |  URL: $DojoUrl" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

$workspace  = $PSScriptRoot | Split-Path | Split-Path
$secDir     = Join-Path $workspace "reportes\security\$Date"

if (-not (Test-Path $secDir)) {
  Write-Fail "No existe carpeta de reportes para $Date`: $secDir"
  Write-Host "  Ejecuta primero: npm run test:security:all:skip-dast"
  exit 1
}

# ── Token ─────────────────────────────────────────────────────────────────
Write-Step "Autenticando en DefectDojo..."
$token = Get-DojoToken
Write-Ok "Token obtenido"

# ── Product y Engagement ──────────────────────────────────────────────────
Write-Step "Obteniendo/creando Product..."
$productId = Get-OrCreate-Product -Token $token -ProductName "SI091-REGINSA"
Write-Ok "Product ID: $productId"

Write-Step "Obteniendo/creando Engagement para $Date..."
$engName     = "Escaneo QA $Date"
$engagementId = Get-OrCreate-Engagement -Token $token -ProductId $productId -EngagementName $engName -Date $Date
Write-Ok "Engagement ID: $engagementId"

# ── Scans a importar ──────────────────────────────────────────────────────
$scans = @(
  @{ Tool='Bearer';          ScanType='SARIF';                         File="sast/bearer/bearer-results.sarif" }
  @{ Tool='Checkov';         ScanType='SARIF';                         File="sast/checkov/results_sarif.sarif" }
  @{ Tool='Semgrep';         ScanType='Semgrep JSON Report';           File="sast/semgrep/semgrep-results.json" }
  @{ Tool='Gitleaks';        ScanType='Gitleaks Scan';                 File="sast/gitleaks/gitleaks-report.json" }
  @{ Tool='TruffleHog';      ScanType='Trufflehog Scan';               File="sast/trufflehog/trufflehog-results.json" }
  @{ Tool='Dependency-Check';ScanType='Dependency Check Scan';         File="sca/dependency-check/dependency-check-report.json" }
  @{ Tool='OSV-Scanner';     ScanType='OSV Scan';                      File="sca/osv/osv-results.json" }
  @{ Tool='RetireJS';        ScanType='Retire.js Scan';                File="sca/retirejs/retire-results.json" }
  @{ Tool='Grype';           ScanType='Anchore Grype';                 File="sca/syft-grype/grype-results.json" }
  @{ Tool='Trivy';           ScanType='Trivy Operator Scan';           File="container/trivy/trivy-report.json" }
  @{ Tool='ZAP';             ScanType='ZAP Scan';                      File="dast/zap/zap-baseline-report.json" }
  @{ Tool='Nuclei';          ScanType='Nuclei Scan';                   File="dast/nuclei/nuclei-results.json" }
)

Write-Host ""
Write-Step "Importando $($scans.Count) scans..."
$importados = 0
$omitidos   = 0

foreach ($scan in $scans) {
  $filePath = Join-Path $secDir $scan.File
  Write-Host "     $($scan.Tool)..." -NoNewline
  $r = Import-Scan -Token $token -EngagementId $engagementId `
       -ScanType $scan.ScanType -FilePath $filePath -ToolName $scan.Tool
  if ($r) {
    $newFindings = if ($r.PSObject.Properties['statistics']) { $r.statistics.after.total } else { '?' }
    Write-Host " OK ($newFindings findings)" -ForegroundColor Green
    $importados++
  } else {
    Write-Host " omitido" -ForegroundColor DarkGray
    $omitidos++
  }
}

# ── Resumen ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  DefectDojo import completado" -ForegroundColor Green
Write-Host "  Importados : $importados  |  Omitidos: $omitidos" -ForegroundColor White
Write-Host "  Producto   : SI091-REGINSA  (ID $productId)" -ForegroundColor White
Write-Host "  Engagement : $engName  (ID $engagementId)" -ForegroundColor White
Write-Host "  URL        : $DojoUrl/engagement/$engagementId" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Green

# Guardar referencia para el script de n8n
$refFile = Join-Path $secDir "defectdojo-engagement.json"
@{
  engagement_id = $engagementId
  product_id    = $productId
  date          = $Date
  dojo_url      = $DojoUrl
  url_engagement = "$DojoUrl/engagement/$engagementId"
} | ConvertTo-Json | Out-File -FilePath $refFile -Encoding UTF8 -Force
Write-Host "  Referencia : $refFile" -ForegroundColor DarkGray
