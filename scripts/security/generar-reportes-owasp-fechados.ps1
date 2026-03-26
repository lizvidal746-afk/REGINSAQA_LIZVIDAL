param(
  [string]$Target   = $env:REGINSA_URL,
  [string]$BaseDir  = 'reportes/security',
  [string]$RunId    = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [switch]$FailOnWarn,
  [switch]$KeepTechnicalMarkdown
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Target)) {
  throw 'Falta REGINSA_URL. Define la variable de entorno o pasa -Target.'
}

$owaspDir = Join-Path $BaseDir "owasp/$RunId"
New-Item -ItemType Directory -Path $owaspDir -Force | Out-Null

Write-Host "[INICIO] Run ID: $RunId"
Write-Host "[DIR]    $owaspDir"
Write-Host ""

# ---- Paso 1: baseline ZAP + traduccion ----
Write-Host "=========================================="
Write-Host "[PASO 1] Ejecutando escaneo OWASP baseline ..."
Write-Host "=========================================="

$zapArgs = @(
  '-NoProfile', '-ExecutionPolicy', 'Bypass',
  '-File', 'scripts/security/run-owasp-baseline-and-translate.ps1',
  '-Target', $Target,
  '-OutputDir', $owaspDir
)
if ($FailOnWarn) { $zapArgs += '-FailOnWarn' }

& powershell @zapArgs
if ($LASTEXITCODE -ne 0) { throw 'Fallo run-owasp-baseline-and-translate.ps1' }

Write-Host "[OK] Escaneo completado."
Write-Host ""

# ---- Paso 2: reportes por rol e idioma ----
Write-Host "=========================================="
Write-Host "[PASO 2] Generando reportes por rol e idioma ..."
Write-Host "=========================================="

& powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/security/generar-reporte-owasp-word.ps1 `
  -InputJson              (Join-Path $owaspDir 'zap-baseline-report.json') `
  -OutputDocxEs           (Join-Path $owaspDir 'owasp-reporte-provisional-es.docx') `
  -OutputHtmlEs           (Join-Path $owaspDir 'owasp-reporte-provisional-es.html') `
  -OutputDocxEn           (Join-Path $owaspDir 'owasp-reporte-provisional-en.docx') `
  -OutputHtmlEn           (Join-Path $owaspDir 'owasp-reporte-provisional-en.html') `
  -OutputDocxDevEs        (Join-Path $owaspDir 'owasp-reporte-desarrollador-es.docx') `
  -OutputHtmlDevEs        (Join-Path $owaspDir 'owasp-reporte-desarrollador-es.html') `
  -OutputDocxDevEn        (Join-Path $owaspDir 'owasp-reporte-desarrollador-en.docx') `
  -OutputHtmlDevEn        (Join-Path $owaspDir 'owasp-reporte-desarrollador-en.html') `
  -OutputDocxExecEs       (Join-Path $owaspDir 'owasp-reporte-ejecutivo-es.docx') `
  -OutputHtmlExecEs       (Join-Path $owaspDir 'owasp-reporte-ejecutivo-es.html') `
  -OutputDocxExecEn       (Join-Path $owaspDir 'owasp-reporte-ejecutivo-en.docx') `
  -OutputHtmlExecEn       (Join-Path $owaspDir 'owasp-reporte-ejecutivo-en.html') `
  -OutputResumenEstructuradoJson (Join-Path $owaspDir 'owasp-resumen-estructurado.json')
if ($LASTEXITCODE -ne 0) { throw 'Fallo generar-reporte-owasp-word.ps1' }

# ---- Paso 3: limpieza de markdown tecnico opcional ----
if (-not $KeepTechnicalMarkdown) {
  Write-Host "[PASO 3] Limpiando markdown tecnico (zap-baseline-report*.md) ..."
  $technicalMdFiles = @(
    (Join-Path $owaspDir 'zap-baseline-report.md'),
    (Join-Path $owaspDir 'zap-baseline-report.es.md')
  )

  foreach ($file in $technicalMdFiles) {
    if (Test-Path $file) {
      Remove-Item -Path $file -Force
      Write-Host "[DEL] $file"
    }
  }
  Write-Host "[OK] Limpieza de markdown tecnico completada."
  Write-Host ""
}

# ---- Paso 4: organizar salidas por idioma ----
Write-Host "[PASO 4] Organizando reportes por idioma (es/en) ..."
$esDir = Join-Path $owaspDir 'es'
$enDir = Join-Path $owaspDir 'en'
New-Item -ItemType Directory -Path $esDir -Force | Out-Null
New-Item -ItemType Directory -Path $enDir -Force | Out-Null

$esFiles = @(
  'owasp-reporte-provisional-es.docx',
  'owasp-reporte-provisional-es.html',
  'owasp-reporte-desarrollador-es.docx',
  'owasp-reporte-desarrollador-es.html',
  'owasp-reporte-ejecutivo-es.docx',
  'owasp-reporte-ejecutivo-es.html',
  'zap-baseline-report.es.html',
  'zap-baseline-report.es.md'
)

$enFiles = @(
  'owasp-reporte-provisional-en.docx',
  'owasp-reporte-provisional-en.html',
  'owasp-reporte-desarrollador-en.docx',
  'owasp-reporte-desarrollador-en.html',
  'owasp-reporte-ejecutivo-en.docx',
  'owasp-reporte-ejecutivo-en.html'
)

foreach ($name in $esFiles) {
  $source = Join-Path $owaspDir $name
  if (Test-Path $source) {
    Move-Item -Path $source -Destination (Join-Path $esDir $name) -Force
  }
}

foreach ($name in $enFiles) {
  $source = Join-Path $owaspDir $name
  if (Test-Path $source) {
    Move-Item -Path $source -Destination (Join-Path $enDir $name) -Force
  }
}

Write-Host "[OK] Organizacion por idioma completada."
Write-Host ""

Write-Host "[OK] Reportes generados."
Write-Host ""
Write-Host "=========================================="
Write-Host "[COMPLETADO] OWASP fechado:"
Write-Host "  $owaspDir"
Write-Host "  - ES: $esDir"
Write-Host "  - EN: $enDir"
Write-Host "=========================================="
