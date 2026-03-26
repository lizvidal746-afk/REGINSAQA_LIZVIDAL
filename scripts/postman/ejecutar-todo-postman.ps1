<#
.SYNOPSIS
  Wrapper para ejecutar casos Postman REGINSA (01..07) y consolidar resumen.

.PARAMETER Modo
  secuencial: ejecuta 01..07 uno por uno y muestra tabla consolidada (defecto)
  all       : delega a run-newman-completo.ps1 -Caso all
  master    : delega a run-newman-completo.ps1 -Caso master

.PARAMETER Env
  Ambiente: qa | prod | local

.PARAMETER Usuario
  Usuario QA para obtener token via Playwright bridge.

.PARAMETER Contrasena
  Contrasena QA para obtener token via Playwright bridge.

.PARAMETER TokenJwt
  Token JWT directo (evita login por usuario/contrasena).

.PARAMETER OutDir
  Directorio base de reportes.

.PARAMETER SinHtml
  Omite reporter HTML extra.

.EXAMPLE
  .\ejecutar-todo-postman.ps1 -Modo secuencial -Usuario lizvidal -Contrasena QA1234510qa

.EXAMPLE
  .\ejecutar-todo-postman.ps1 -Modo all -TokenJwt <jwt>
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidAssignmentToAutomaticVariable', 'args', Scope='Script', Justification='Falso positivo del analizador con construccion de arreglos y splatting')]
param(
  [ValidateSet('secuencial','all','master')]
  [string]$Modo = 'secuencial',

  [ValidateSet('qa','prod','local')]
  [string]$Env = 'qa',

  [string]$Usuario,
  [string]$Contrasena,
  [string]$TokenJwt,

  [string]$PunkuCode,
  [string]$PunkuCodeChallenge,
  [string]$PunkuBase,

  [string]$OutDir = 'reportes/newman',
  [switch]$SinHtml
)

$ErrorActionPreference = 'Stop'
$RunnerPath = Join-Path $PSScriptRoot 'run-newman-completo.ps1'

if (-not (Test-Path $RunnerPath)) {
  throw "No se encontro runner base en: $RunnerPath"
}

function Quote-Arg {
  param([string]$Value)
  if ($null -eq $Value) { return '""' }
  return '"' + ($Value -replace '"', '`"') + '"'
}

function Invoke-RunnerCase {
  param(
    [string]$CaseId,
    [string]$CaseOutDir
  )

  $argLine = "-ExecutionPolicy Bypass -File $(Quote-Arg $RunnerPath) -Caso $CaseId -Env $Env -OutDir $(Quote-Arg $CaseOutDir)"

  if ($SinHtml) { $argLine += ' -SinHtml' }
  if (-not [string]::IsNullOrWhiteSpace($Usuario)) { $argLine += " -Usuario $(Quote-Arg $Usuario)" }
  if (-not [string]::IsNullOrWhiteSpace($Contrasena)) { $argLine += " -Contrasena $(Quote-Arg $Contrasena)" }
  if (-not [string]::IsNullOrWhiteSpace($TokenJwt)) { $argLine += " -TokenJwt $(Quote-Arg $TokenJwt)" }
  if (-not [string]::IsNullOrWhiteSpace($PunkuCode)) { $argLine += " -PunkuCode $(Quote-Arg $PunkuCode)" }
  if (-not [string]::IsNullOrWhiteSpace($PunkuCodeChallenge)) { $argLine += " -PunkuCodeChallenge $(Quote-Arg $PunkuCodeChallenge)" }
  if (-not [string]::IsNullOrWhiteSpace($PunkuBase)) { $argLine += " -PunkuBase $(Quote-Arg $PunkuBase)" }

  $proc = Start-Process 'powershell.exe' -ArgumentList $argLine -NoNewWindow -Wait -PassThru
  return $proc.ExitCode
}

Write-Host ''
Write-Host ('=' * 90) -ForegroundColor Cyan
Write-Host " REGINSA - Ejecutar Todo Postman | Modo: $Modo | Env: $Env" -ForegroundColor Cyan
Write-Host ('=' * 90) -ForegroundColor Cyan

if ($Modo -eq 'all' -or $Modo -eq 'master') {
  $delegatedOutDir = Join-Path $OutDir $Modo
  $exitCode = Invoke-RunnerCase -CaseId $Modo -CaseOutDir $delegatedOutDir

  Write-Host ''
  Write-Host " Delegado a run-newman-completo.ps1 -Caso $Modo" -ForegroundColor DarkGray
  Write-Host " ExitCode: $exitCode" -ForegroundColor DarkGray
  exit $exitCode
}

$cases = @('01','02','03','04','05','06','07')
$results = @()
$start = Get-Date

foreach ($caseId in $cases) {
  Write-Host ''
  Write-Host ('-' * 90) -ForegroundColor DarkGray
  Write-Host " Ejecutando Caso $caseId" -ForegroundColor Yellow
  Write-Host ('-' * 90) -ForegroundColor DarkGray

  $caseOutDir = Join-Path $OutDir ("caso-$caseId")
  $caseStart = Get-Date
  $exitCode = Invoke-RunnerCase -CaseId $caseId -CaseOutDir $caseOutDir
  $elapsed = [math]::Round(((Get-Date) - $caseStart).TotalSeconds, 1)

  $results += [PSCustomObject]@{
    Caso = $caseId
    Estado = if ($exitCode -eq 0) { 'PASO' } else { 'FALLO' }
    ExitCode = $exitCode
    Segundos = $elapsed
    OutDir = $caseOutDir
  }
}

$totalElapsed = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
$passed = @($results | Where-Object { $_.ExitCode -eq 0 }).Count
$failed = @($results | Where-Object { $_.ExitCode -ne 0 }).Count

Write-Host ''
Write-Host ('=' * 90) -ForegroundColor Cyan
Write-Host ' RESUMEN CONSOLIDADO 01..07' -ForegroundColor Cyan
Write-Host ('-' * 90) -ForegroundColor DarkGray
$results | Format-Table -AutoSize | Out-String | ForEach-Object { Write-Host $_ }
Write-Host ('-' * 90) -ForegroundColor DarkGray
Write-Host " Total casos: $($results.Count) | Pasaron: $passed | Fallaron: $failed | Tiempo: ${totalElapsed}s" -ForegroundColor White
Write-Host ('=' * 90) -ForegroundColor Cyan

if ($failed -gt 0) {
  exit 1
}

exit 0
