#Requires -Version 7
<#
.SYNOPSIS
  Lee los hallazgos de seguridad del día y, si hay CRITICO/ALTO,
  dispara el webhook de n8n para notificación y seguimiento.

.PARAMETER N8nUrl
  URL base de n8n. Por defecto http://localhost:5678

.PARAMETER WebhookPath
  Path del webhook en n8n. Por defecto /webhook/seguridad-reginsa

.PARAMETER Date
  Fecha del escaneo YYYY-MM-DD. Por defecto hoy.

.PARAMETER MinSeveridad
  Severidad mínima para disparar alerta: CRITICO | ALTO | MEDIO
  Por defecto ALTO.

.PARAMETER Canal
  Canal de notificación configurado en el workflow n8n: teams|slack|email
  Por defecto teams.

.EXAMPLE
  pwsh -File scripts/security/notificar-criticos-n8n.ps1 -Date 2026-05-04 -MinSeveridad CRITICO
#>
param(
  [string]$N8nUrl       = 'http://localhost:5678',
  [string]$WebhookPath  = '/webhook/seguridad-reginsa',
  [string]$Date         = (Get-Date -Format 'yyyy-MM-dd'),
  [ValidateSet('CRITICO','ALTO','MEDIO')]
  [string]$MinSeveridad = 'ALTO',
  [string]$Canal        = 'teams'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

function Write-Step { param([string]$m) Write-Host "  >> $m" -ForegroundColor Cyan }
function Write-Ok   { param([string]$m) Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn { param([string]$m) Write-Host "  [WARN] $m" -ForegroundColor Yellow }

# ── Rutas ──────────────────────────────────────────────────────────────────
$workspace    = $PSScriptRoot | Split-Path | Split-Path
$secDir       = Join-Path $workspace "reportes\security\$Date"
$informesDir  = Join-Path $workspace "reportes\informes"

# ── Leer resumen de herramientas ───────────────────────────────────────────
$resumenFile = Join-Path $secDir "resumen-ejecutivo.json"
$resumen     = if (Test-Path $resumenFile) { Get-Content $resumenFile -Raw | ConvertFrom-Json } else { $null }

# ── Leer hallazgos consolidados del día ───────────────────────────────────
$consolidadoFile = Get-ChildItem -Path $informesDir -Filter "hallazgos-consolidados-$Date*.json" `
                   -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$hallazgos = @()
if ($consolidadoFile) {
  $data = Get-Content $consolidadoFile.FullName -Raw | ConvertFrom-Json
  $hallazgos = @($data)
}

# ── Leer engagement de DefectDojo si existe ───────────────────────────────
$dojoRef = $null
$dojoRefFile = Join-Path $secDir "defectdojo-engagement.json"
if (Test-Path $dojoRefFile) {
  $dojoRef = Get-Content $dojoRefFile -Raw | ConvertFrom-Json
}

# ── Clasificar por severidad ───────────────────────────────────────────────
$niveles = @{ CRITICO=0; ALTO=1; MEDIO=2; BAJA=3 }
$nivelMin = $niveles[$MinSeveridad]

$filtrados = @($hallazgos | Where-Object {
  $_ -ne $null -and $_.PSObject.Properties['severidad'] -and
  $niveles.ContainsKey($_.severidad.ToUpper()) -and
  $niveles[$_.severidad.ToUpper()] -le $nivelMin
})

$totalCritico = @($hallazgos | Where-Object { $_ -ne $null -and $_.PSObject.Properties['severidad'] -and $_.severidad -match 'CRITICA?' }).Count
$totalAlto    = @($hallazgos | Where-Object { $_ -ne $null -and $_.PSObject.Properties['severidad'] -and $_.severidad -match 'ALTA?' }).Count
$totalMedio   = @($hallazgos | Where-Object { $_ -ne $null -and $_.PSObject.Properties['severidad'] -and $_.severidad -match 'MEDIA?' }).Count

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  NOTIFICADOR n8n - REGINSA Security $Date" -ForegroundColor Cyan
Write-Host "  Alerta si: >= $MinSeveridad" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  Hallazgos filtrados (>= $MinSeveridad): $($filtrados.Count)"
Write-Host "  Critico=$totalCritico | Alto=$totalAlto | Medio=$totalMedio"

# ── Construir payload para n8n ─────────────────────────────────────────────
$topFindings = @($filtrados | Select-Object -First 10 | ForEach-Object {
  @{
    severidad   = if ($_.PSObject.Properties['severidad'])   { [string]$_.severidad }   else { 'INFO' }
    herramienta = if ($_.PSObject.Properties['herramienta']) { [string]$_.herramienta } else { 'N/A' }
    hallazgo    = if ($_.PSObject.Properties['hallazgo'])    { [string]$_.hallazgo }    else { [string]$_.Regla }
    componente  = if ($_.PSObject.Properties['componente_afectado']) { [string]$_.componente_afectado } else { '' }
  }
})

$herramientasResumen = @()
if ($resumen -and $resumen.PSObject.Properties['herramientas']) {
  $herramientasResumen = @($resumen.herramientas | ForEach-Object {
    @{ herramienta=$_.herramienta; estado=$_.estado; duracion=$_.duracion }
  })
}

$payload = @{
  fecha          = $Date
  timestamp      = (Get-Date -Format 'o')
  alerta_nivel   = $MinSeveridad
  disparar        = ($filtrados.Count -gt 0)
  resumen        = @{
    total   = @($hallazgos).Count
    critico = $totalCritico
    alto    = $totalAlto
    medio   = $totalMedio
  }
  top_hallazgos  = $topFindings
  herramientas   = $herramientasResumen
  defectdojo     = if ($dojoRef) { @{
    url        = $dojoRef.url_engagement
    engagement = $dojoRef.engagement_id
  }} else { $null }
  canal          = $Canal
  proyecto       = "SI091-REGINSA"
  entidad        = "SUNEDU"
  reporte_maestro = "$secDir\reporte-maestro-seguridad-$Date.html"
} | ConvertTo-Json -Depth 5

# ── Enviar a n8n ──────────────────────────────────────────────────────────
$webhookUrl = "$N8nUrl$WebhookPath"
Write-Step "Enviando a n8n: $webhookUrl"

try {
  $response = Invoke-RestMethod `
    -Uri $webhookUrl `
    -Method POST `
    -Body $payload `
    -ContentType 'application/json; charset=utf-8' `
    -TimeoutSec 15
  Write-Ok "n8n respondio: $($response | ConvertTo-Json -Compress)"
} catch {
  if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -in 200..299) {
    Write-Ok "n8n respondio OK"
  } else {
    Write-Warn "n8n no disponible o error: $($_.Exception.Message)"
    Write-Warn "  Payload guardado para reintento manual:"
    $payloadFile = Join-Path $secDir "n8n-payload-$Date.json"
    $payload | Out-File -FilePath $payloadFile -Encoding UTF8 -Force
    Write-Host "  $payloadFile" -ForegroundColor DarkGray
  }
}

# ── Estado final ───────────────────────────────────────────────────────────
if ($filtrados.Count -eq 0) {
  Write-Host ""
  Write-Ok "Sin hallazgos >= $MinSeveridad. No se disparo alerta."
} else {
  Write-Host ""
  Write-Host "  [!] ALERTA DISPARADA: $($filtrados.Count) hallazgos >= $MinSeveridad" -ForegroundColor Red
  Write-Host "  Revisar: $secDir\reporte-maestro-seguridad-$Date.html" -ForegroundColor Yellow
}

# ── Envio de alerta por correo electronico (Office 365) ───────────────────
# Lee EMAIL_TO y EMAIL_FROM del .env. Si no estan definidos, omite el envio.
$envFile = Join-Path $workspace '.env'
if (Test-Path $envFile) {
  Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -match '^\s*([^#\s][^=]*)=(.*)$' } | ForEach-Object {
    $p = $_ -split '=', 2
    $k = $p[0].Trim(); $v = $p[1].Trim().Trim('"').Trim("'")
    if (-not [string]::IsNullOrWhiteSpace($k)) { [System.Environment]::SetEnvironmentVariable($k, $v, 'Process') }
  }
}

$emailTo   = $env:EMAIL_TO
$emailFrom = $env:EMAIL_FROM
$emailPass = $env:EMAIL_PASSWORD
$smtpHost  = if ($env:SMTP_HOST)  { $env:SMTP_HOST }  else { 'smtp.office365.com' }
$smtpPort  = if ($env:SMTP_PORT)  { [int]$env:SMTP_PORT } else { 587 }

if (-not [string]::IsNullOrWhiteSpace($emailTo) -and
    -not [string]::IsNullOrWhiteSpace($emailFrom) -and
    -not [string]::IsNullOrWhiteSpace($emailPass) -and
    $filtrados.Count -gt 0) {

  Write-Step "Enviando alerta por correo a: $emailTo"
  try {
    $emoji  = if ($totalCritico -gt 0) { '[CRITICO]' } elseif ($totalAlto -gt 0) { '[ALTO]' } else { '[MEDIO]' }
    $asunto = "$emoji Alerta Seguridad REGINSA - $Date | Critico=$totalCritico Alto=$totalAlto Medio=$totalMedio"

    # Tabla HTML de top hallazgos
    $filas = ($filtrados | Select-Object -First 10 | ForEach-Object {
      $sev = if ($_.PSObject.Properties['severidad']) { $_.severidad } else { 'INFO' }
      $her = if ($_.PSObject.Properties['herramienta']) { $_.herramienta } else { 'N/A' }
      $hal = if ($_.PSObject.Properties['hallazgo']) { $_.hallazgo } else { $_.Regla }
      $col = if ($sev -match 'CRITICA?') { '#FF0000' } elseif ($sev -match 'ALTA?') { '#FF8C00' } else { '#DAA520' }
      "<tr><td style='color:$col;font-weight:bold'>$sev</td><td>$her</td><td>$([System.Web.HttpUtility]::HtmlEncode($hal.ToString().Substring(0,[Math]::Min(120,$hal.ToString().Length))))</td></tr>"
    }) -join "`n"

    $herFilas = ($herramientasResumen | ForEach-Object {
      $ico = if ($_.estado -eq 'PASS') { '✅' } elseif ($_.estado -eq 'WARN') { '⚠️' } else { '⏭️' }
      "<tr><td>$ico $($_.herramienta)</td><td>$($_.estado)</td><td>$($_.duracion)</td></tr>"
    }) -join "`n"

    $cuerpo = @"
<html><body style='font-family:Segoe UI,sans-serif;color:#333'>
<h2 style='background:#c0392b;color:white;padding:12px;border-radius:4px'>
  $emoji Alerta de Seguridad — SI091 REGINSA (SUNEDU)
</h2>
<table style='border-collapse:collapse;width:100%'>
  <tr><td><b>Fecha:</b></td><td>$Date</td></tr>
  <tr><td><b>Total hallazgos:</b></td><td>$(@($hallazgos).Count)</td></tr>
  <tr style='color:#c0392b'><td><b>Critico:</b></td><td>$totalCritico</td></tr>
  <tr style='color:#e67e22'><td><b>Alto:</b></td><td>$totalAlto</td></tr>
  <tr style='color:#f1c40f'><td><b>Medio:</b></td><td>$totalMedio</td></tr>
</table>

<h3>Top Hallazgos</h3>
<table border='1' style='border-collapse:collapse;width:100%;font-size:12px'>
  <tr style='background:#2c3e50;color:white'><th>Severidad</th><th>Herramienta</th><th>Hallazgo</th></tr>
  $filas
</table>

<h3>Estado de Herramientas</h3>
<table border='1' style='border-collapse:collapse;width:100%;font-size:12px'>
  <tr style='background:#2c3e50;color:white'><th>Herramienta</th><th>Estado</th><th>Duracion</th></tr>
  $herFilas
</table>

<p style='color:#7f8c8d;font-size:11px;margin-top:20px'>
  Reporte completo: $secDir\reporte-maestro-seguridad-$Date.html<br>
  Generado automaticamente por REGINSA Security Suite
</p>
</body></html>
"@

    Add-Type -AssemblyName System.Web
    $cred = New-Object System.Management.Automation.PSCredential($emailFrom,
              (ConvertTo-SecureString $emailPass -AsPlainText -Force))
    Send-MailMessage `
      -To $emailTo `
      -From $emailFrom `
      -Subject $asunto `
      -Body $cuerpo `
      -BodyAsHtml `
      -SmtpServer $smtpHost `
      -Port $smtpPort `
      -UseSsl `
      -Credential $cred `
      -Encoding UTF8
    Write-Ok "Correo enviado a $emailTo"
  } catch {
    Write-Warn "Error al enviar correo: $($_.Exception.Message)"
    Write-Warn "  Verifica EMAIL_FROM, EMAIL_PASSWORD y SMTP_HOST en .env"
  }
} elseif ($filtrados.Count -gt 0 -and [string]::IsNullOrWhiteSpace($emailTo)) {
  Write-Warn "EMAIL_TO no configurado en .env — correo no enviado"
}

# ── Notificacion directa a Slack (fallback si nodo HTTP de n8n tiene URL vacia) ──
# Configura SLACK_WEBHOOK_URL en .env con el Incoming Webhook de tu canal Slack.
# Teams esta DESHABILITADO por politica institucional SUNEDU.
$slackUrl = $env:SLACK_WEBHOOK_URL
if (-not [string]::IsNullOrWhiteSpace($slackUrl) -and $filtrados.Count -gt 0) {
  Write-Step "Enviando alerta directa a Slack..."
  try {
    $emoji    = if ($totalCritico -gt 0) { ':red_circle:' } elseif ($totalAlto -gt 0) { ':large_orange_circle:' } else { ':large_yellow_circle:' }
    $topText  = ($filtrados | Select-Object -First 5 | ForEach-Object {
      $sev = if ($_.PSObject.Properties['severidad'])   { $_.severidad }   else { 'INFO' }
      $her = if ($_.PSObject.Properties['herramienta']) { $_.herramienta } else { 'N/A' }
      $hal = if ($_.PSObject.Properties['hallazgo'])    { [string]$_.hallazgo }    else { [string]$_.Regla }
      $halTrunc = if ($hal.Length -gt 100) { $hal.Substring(0,97) + '...' } else { $hal }
      "> *[$sev]* $her — $halTrunc"
    }) -join "`n"

    $slackBody = @{
      text = "$emoji *Alerta Seguridad REGINSA — $Date*`nCRITICO=$totalCritico | ALTO=$totalAlto | MEDIO=$totalMedio"
      blocks = @(
        @{
          type = 'header'
          text = @{ type = 'plain_text'; text = "$emoji Alerta Seguridad SI091-REGINSA ($Date)" }
        },
        @{
          type = 'section'
          fields = @(
            @{ type = 'mrkdwn'; text = "*CRITICO:* $totalCritico" },
            @{ type = 'mrkdwn'; text = "*ALTO:* $totalAlto" },
            @{ type = 'mrkdwn'; text = "*MEDIO:* $totalMedio" },
            @{ type = 'mrkdwn'; text = "*Total:* $(@($hallazgos).Count)" }
          )
        },
        @{
          type = 'section'
          text = @{ type = 'mrkdwn'; text = "*Top hallazgos:*`n$topText" }
        }
      )
    } | ConvertTo-Json -Depth 5

    Invoke-RestMethod -Uri $slackUrl -Method POST -Body $slackBody -ContentType 'application/json' -TimeoutSec 10 | Out-Null
    Write-Ok "Alerta enviada a Slack"
  } catch {
    Write-Warn "Error al enviar a Slack: $($_.Exception.Message)"
    Write-Warn "  Verifica SLACK_WEBHOOK_URL en .env"
  }
} elseif ($filtrados.Count -gt 0 -and [string]::IsNullOrWhiteSpace($slackUrl)) {
  Write-Warn "SLACK_WEBHOOK_URL no configurado en .env — Slack omitido"
  Write-Warn "  En n8n: actualiza el nodo 'Notificar Slack' con tu Incoming Webhook URL"
  Write-Warn "  Teams: DESHABILITADO (politica institucional SUNEDU)"
}
