<#
.SYNOPSIS
  Runner Newman completo para REGINSA - todos los casos o uno específico.

.PARAMETER Caso
  Caso a ejecutar: 01 | 02 | 03 | 04 | 05 | 06 | 07 | all | master
  - 01..07: ejecuta el caso individual
  - all    : ejecuta todos los folders numericos del master (01..N) en secuencia
  - master : ejecuta la colección maestra (todos los casos en un solo run)
  Defecto: master

.PARAMETER Env
  Ambiente a usar: qa | prod | local
  - qa   : usa reginsa-shared.environment.json con URL QA (defecto)
  - prod : requiere REGINSA_BASE_API_PROD definido como variable de entorno
  - local: usa http://localhost:5000/api

.PARAMETER PunkuCode
  CODE de Punku (GetTokenByCodeAndCodeChallenge). Si no se pasa, usa REGINSA_PUNKU_CODE del entorno.

.PARAMETER PunkuCodeChallenge
  CODE_CHALLENGE de Punku. Si no se pasa, usa REGINSA_PUNKU_CODE_CHALLENGE del entorno.

.PARAMETER PunkuBase
  URL base de Punku. Defecto QA.

.PARAMETER OutDir
  Directorio de salida de reportes. Defecto: reportes/newman

.PARAMETER SinHtml
  Si se pasa, omite la instalación/uso de newman-reporter-htmlextra.

.EXAMPLE
  # Ejecutar colección maestra (todos los casos) en QA
  .\run-newman-completo.ps1

  # Ejecutar solo Caso 01
  .\run-newman-completo.ps1 -Caso 01

  # Ejecutar todos con token dinámico de Punku
  .\run-newman-completo.ps1 -Caso all -PunkuCode <code> -PunkuCodeChallenge <challenge>

  # Ejecutar en LOCAL
  .\run-newman-completo.ps1 -Env local
#>
param(
  [ValidateSet('01','02','03','04','05','06','07','all','master')]
  [string]$Caso = 'master',

  [ValidateSet('qa','prod','local')]
  [string]$Env = 'qa',

  [ValidateSet('con-limites','sin-limites')]
  [string]$ApiMode = 'con-limites',

  [string]$PunkuCode          = $env:REGINSA_PUNKU_CODE,
  [string]$PunkuCodeChallenge = $env:REGINSA_PUNKU_CODE_CHALLENGE,
  [string]$PunkuBase          = 'https://punkuproxyv2qa.sunedu.gob.pe',

  # -- Alternativa recomendada: usuario/contrasena del pool QA (Playwright bridge) --
  [string]$Usuario    = $env:REGINSA_USER_1,
  [string]$Contrasena = $env:REGINSA_PASS_1,
  [int]$UserSlot      = 1,
  [string]$EnvFile    = '',
  # -- O directamente el token si ya se obtuvo externamente --
  [string]$TokenJwt   = $env:REGINSA_TOKEN_JWT,

  [string]$OutDir   = 'reportes/newman',
  [switch]$SinHtml,

  # -- Pool compartido Caso 01 (k6-caso01-dataset.json / administrados-pool.json) --
  # Si se pasa -SinPool, el pre-request de la colección genera datos aleatorios (fallback).
  [switch]$SinPool
)

$ErrorActionPreference = 'Stop'
$StartTime = Get-Date
$Separator = ('=' * 80)
$SubSeparator = ('-' * 80)
$NewmanExe = 'newman.cmd'
$NewmanPrefixArgs = @()
$RunArtifacts = @{}

# ─────────────────────────────────────────────────────────────────────────────
# Rutas base
# ─────────────────────────────────────────────────────────────────────────────
$Root      = Resolve-Path (Join-Path $PSScriptRoot '../..')
$PostmanDir = Join-Path $Root 'API_TEST/postman'

$EnvLoader = Join-Path $Root 'scripts/shared/import-env-file.ps1'
if (Test-Path $EnvLoader) {
  & $EnvLoader -Path $EnvFile
}

$Collections = @{
  'login'  = Join-Path $PostmanDir 'reginsa-login-punku.collection.json'
  '01'     = Join-Path $PostmanDir 'reginsa-caso01-api-test.collection.json'
  '02'     = Join-Path $PostmanDir 'reginsa-caso02-api-test.collection.json'
  '03'     = Join-Path $PostmanDir 'reginsa-caso03-api-test.collection.json'
  '04'     = Join-Path $PostmanDir 'reginsa-caso04-api-test.collection.json'
  'master' = Join-Path $PostmanDir 'reginsa-master.collection.json'
}

$SharedEnv = Join-Path $PostmanDir 'reginsa-shared.environment.json'

# ─────────────────────────────────────────────────────────────────────────────
# Resolver URL según ambiente
# ─────────────────────────────────────────────────────────────────────────────
$BaseApi = switch ($Env) {
  'prod'  {
    if ([string]::IsNullOrWhiteSpace($env:REGINSA_BASE_API_PROD)) {
      'https://reginsaapiprod.sunedu.gob.pe/api'
    } else {
      $env:REGINSA_BASE_API_PROD
    }
  }
  'local' { 'http://localhost:5000/api' }
  default { 'https://reginsaapiqa.sunedu.gob.pe/api' }
}

$slotUser = (Get-Item -Path "Env:REGINSA_USER_$($UserSlot)" -ErrorAction SilentlyContinue).Value
$slotPass = (Get-Item -Path "Env:REGINSA_PASS_$($UserSlot)" -ErrorAction SilentlyContinue).Value
if ([string]::IsNullOrWhiteSpace($Usuario)) {
  $Usuario = if (-not [string]::IsNullOrWhiteSpace($env:REGINSA_USER)) { $env:REGINSA_USER } else { $slotUser }
}
if ([string]::IsNullOrWhiteSpace($Contrasena)) {
  $Contrasena = if (-not [string]::IsNullOrWhiteSpace($env:REGINSA_PASS)) { $env:REGINSA_PASS } else { $slotPass }
}

# ─────────────────────────────────────────────────────────────────────────────
# Validar token dinámico Punku
# ─────────────────────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────────────────────────────────────
# Resolver modo de autenticación:
#   Prioridad: TOKEN_JWT directo > Playwright bridge > Punku CODE/CODE_CHALLENGE
# ─────────────────────────────────────────────────────────────────────────────
$AuthMode = if (-not [string]::IsNullOrWhiteSpace($TokenJwt)) {
  'token-directo'
} elseif (-not [string]::IsNullOrWhiteSpace($Usuario) -and -not [string]::IsNullOrWhiteSpace($Contrasena)) {
  'playwright'
} elseif (-not [string]::IsNullOrWhiteSpace($PunkuCode) -and -not [string]::IsNullOrWhiteSpace($PunkuCodeChallenge)) {
  'punku'
} else {
  'interactivo'
}

if ($AuthMode -eq 'interactivo') {
  Write-Host ''
  Write-Host '  AUTENTICACIÓN REQUERIDA' -ForegroundColor Yellow
  Write-Host '  Elegir modo:'
  Write-Host '    1. Usuario/Contrasena QA  (recomendado - Playwright headless)'
  Write-Host '       .\run-newman-completo.ps1 -Usuario pattyvidal -Contrasena QA12345qa'
  Write-Host '    2. TOKEN_JWT ya obtenido'
  Write-Host '       .\run-newman-completo.ps1 -TokenJwt <jwt>'
  Write-Host '    3. Punku CODE/CODE_CHALLENGE  (de DevTools Network tab)'
  Write-Host '       .\run-newman-completo.ps1 -PunkuCode <code> -PunkuCodeChallenge <challenge>'
  Write-Host ''
  $eleccion = Read-Host '  Modo [1/2/3]'
  switch ($eleccion) {
    '2' {
      $AuthMode = 'token-directo'
      $TokenJwt = Read-Host '  TOKEN_JWT'
    }
    '3' {
      $AuthMode = 'punku'
      if ([string]::IsNullOrWhiteSpace($PunkuCode))          { $PunkuCode          = Read-Host '  Punku CODE' }
      if ([string]::IsNullOrWhiteSpace($PunkuCodeChallenge)) { $PunkuCodeChallenge = Read-Host '  Punku CODE_CHALLENGE' }
    }
    default {
      $AuthMode   = 'playwright'
      $Usuario    = Read-Host '  Usuario'
      $Contrasena = Read-Host '  Contrasena'
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Verificar/instalar newman
# ─────────────────────────────────────────────────────────────────────────────
function Assert-Newman {
  $newmanCmd = Get-Command 'newman' -ErrorAction SilentlyContinue
  $npxCmd = Get-Command 'npx' -ErrorAction SilentlyContinue

  if ($newmanCmd) {
    $script:NewmanExe = 'newman.cmd'
    $script:NewmanPrefixArgs = @()
  } elseif ($npxCmd) {
    Write-Host '  newman no encontrado en PATH. Se usará npx newman.' -ForegroundColor Yellow
    $script:NewmanExe = 'npx.cmd'
    $script:NewmanPrefixArgs = @('newman')
  } else {
    Write-Host '  Instalando newman globalmente...' -ForegroundColor Cyan
    npm install -g newman
    $newmanCmd = Get-Command 'newman' -ErrorAction SilentlyContinue
    if ($newmanCmd) {
      $script:NewmanExe = 'newman.cmd'
      $script:NewmanPrefixArgs = @()
    } else {
      throw 'No se encontró newman ni npx después de intentar instalación.'
    }
  }

  if (-not $SinHtml) {
    $htmlReporter = npm list -g newman-reporter-htmlextra 2>$null
    if ($htmlReporter -notmatch 'newman-reporter-htmlextra') {
      Write-Host '  Instalando newman-reporter-htmlextra...' -ForegroundColor Cyan
      npm install -g newman-reporter-htmlextra
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Crear directorio de salida con subcarpeta de fecha
# ─────────────────────────────────────────────────────────────────────────────
$DateStamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$RunDir    = Join-Path $Root "$OutDir/$DateStamp"
New-Item -ItemType Directory -Path $RunDir -Force | Out-Null
$RuntimeEnv = Join-Path $RunDir 'runtime.environment.json'
Copy-Item -Path $SharedEnv -Destination $RuntimeEnv -Force

# ─────────────────────────────────────────────────────────────────────────────
# Helpers de colección para ejecución sin re-login por folder/caso
# ─────────────────────────────────────────────────────────────────────────────
function Remove-InlineAuthItems {
  param([object]$Node)

  if (-not $Node) { return }

  if ($Node.PSObject.Properties.Name -contains 'item' -and $Node.item) {
    $filtered = @()
    foreach ($child in @($Node.item)) {
      $childName = [string]$child.name
      $isInlineAuth = $false
      if (-not [string]::IsNullOrWhiteSpace($childName)) {
        $isInlineAuth = $childName -match 'Auth/(Login|Punku)'
      }

      if (-not $isInlineAuth) {
        Remove-InlineAuthItems -Node $child
        $filtered += $child
      }
    }
    $Node.item = @($filtered)
  }
}

function New-NoAuthCollectionCopy {
  param(
    [string]$SourceCollection,
    [string]$OutCollection
  )

  $json = Get-Content -Path $SourceCollection -Raw -Encoding UTF8
  $obj = $json | ConvertFrom-Json
  Remove-InlineAuthItems -Node $obj
  # Escribir sin BOM (PS 5.1 con -Encoding UTF8 agrega BOM que newman rechaza)
  $jsonOut = $obj | ConvertTo-Json -Depth 100
  [System.IO.File]::WriteAllText($OutCollection, $jsonOut, (New-Object System.Text.UTF8Encoding $false))
  return $OutCollection
}

function Get-MasterFolderName {
  param(
    [string]$CaseId,
    [string]$MasterCollectionPath
  )

  if (-not (Test-Path $MasterCollectionPath)) { return $null }

  $masterJson = Get-Content -Path $MasterCollectionPath -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($folder in @($masterJson.item)) {
    $folderName = [string]$folder.name
    if ([string]::IsNullOrWhiteSpace($folderName)) { continue }
    if ($folderName -match ("^{0}\s*-" -f [regex]::Escape($CaseId))) {
      return $folderName
    }
  }

  return $null
}

function Get-MasterCaseFolders {
  param(
    [string]$MasterCollectionPath
  )

  if (-not (Test-Path $MasterCollectionPath)) { return @() }

  $masterJson = Get-Content -Path $MasterCollectionPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $folders = @()
  foreach ($folder in @($masterJson.item)) {
    $folderName = [string]$folder.name
    if ([string]::IsNullOrWhiteSpace($folderName)) { continue }
    if ($folderName -match '^\d+\s*-') {
      $folders += $folderName
    }
  }

  return @($folders)
}

# ─────────────────────────────────────────────────────────────────────────────
# Función: leer un registro del pool compartido Caso 01
#   Prioridad: reportes/k6-caso01-dataset.json → reportes/administrados-pool.json
#   Retorna PSCustomObject{Ruc, RazonSocial, NombreComercial, Source} o $null
# ─────────────────────────────────────────────────────────────────────────────
function Get-PoolRecord {
  $candidates = @(
    (Join-Path $Root 'reportes/k6-caso01-dataset.json'),
    (Join-Path $Root 'reportes/administrados-pool.json')
  )

  foreach ($candidatePath in $candidates) {
    if (-not (Test-Path $candidatePath)) { continue }
    try {
      $raw  = Get-Content -Path $candidatePath -Raw -Encoding UTF8
      $data = $raw | ConvertFrom-Json
      $arr  = if ($data -is [array]) { @($data) } else { @() }
      if ($arr.Count -eq 0) { continue }

      $idx     = Get-Random -Minimum 0 -Maximum $arr.Count
      $record  = $arr[$idx]
      $ruc     = [string]($record.ruc)
      $razon   = [string]$(if ($record.razonSocial)     { $record.razonSocial }     else { $record.razon_social })
      $comerc  = [string]$(if ($record.nombreComercial) { $record.nombreComercial } else { $record.nombre_comercial })
      if (-not $comerc) { $comerc = $razon }

      if ([System.Text.RegularExpressions.Regex]::IsMatch($ruc, '^\d{11}$') -and
          -not [string]::IsNullOrWhiteSpace($razon)) {
        return [PSCustomObject]@{
          Ruc            = $ruc
          RazonSocial    = $razon
          NombreComercial = $comerc
          Source         = (Split-Path $candidatePath -Leaf)
        }
      }
    } catch {}
  }

  return $null
}

# ─────────────────────────────────────────────────────────────────────────────
# Función: construir y ejecutar comando newman
# ─────────────────────────────────────────────────────────────────────────────
function Invoke-Newman {
  param(
    [string]$CollectionPath,
    [string]$Label,
    [string]$EnvironmentPath = $RuntimeEnv,
    [string]$FolderName = ''
  )

  if (-not (Test-Path $CollectionPath)) {
    Write-Host "  [SKIP] Colección no encontrada: $CollectionPath" -ForegroundColor Yellow
    return $false
  }

  $SafeLabel = $Label -replace '[^a-zA-Z0-9_-]','_'
  $JunitOut  = Join-Path $RunDir "$SafeLabel-junit.xml"
  $JsonOut   = Join-Path $RunDir "$SafeLabel-result.json"
  $HtmlOut   = Join-Path $RunDir "$SafeLabel-report.html"

  # Construir variables de override de ambiente
  $envVars = @(
    "base_api=$BaseApi",
    "punku_base=$PunkuBase",
    "punku_code=$PunkuCode",
    "punku_code_challenge=$PunkuCodeChallenge",
    "api_mode=$ApiMode",
    "expected_rate_limit=$(if ($ApiMode -eq 'con-limites') { '1' } else { '0' })"
  )

  # Reporters
  $reporters = 'cli,junit,json'
  $reporterArgs = @(
    "--reporter-junit-export", $JunitOut,
    "--reporter-json-export",  $JsonOut
  )

  if (-not $SinHtml) {
    $reporters += ',htmlextra'
    $reporterArgs += @(
      "--reporter-htmlextra-export", $HtmlOut,
      "--reporter-htmlextra-title",  "REGINSA API - $Label",
      "--reporter-htmlextra-titleSize", "3",
      "--reporter-htmlextra-browserTitle", "REGINSA $Label",
      "--reporter-htmlextra-logs",
      "--reporter-htmlextra-testPaging",
      "--reporter-htmlextra-showFolderDescription",
      "--reporter-htmlextra-showEnvironmentData",
      "--reporter-htmlextra-showMarkdownLinks",
      "--reporter-htmlextra-skipHeaders", "Authorization,Cookie,Set-Cookie",
      "--reporter-htmlextra-skipEnvironmentVars", "TOKEN_JWT,token,auth_header,punku_code,punku_code_challenge,contrasena,REGINSA_PASS_1,REGINSA_TOKEN_JWT",
      "--reporter-htmlextra-hideRequestBody", "00.1) Auth/Punku - Login unico,01.1) Auth/Login,02.1) Auth/Login,03.1) Auth/Login,04.1) Auth/Login,05.1) Auth/Punku",
      "--reporter-htmlextra-hideResponseBody", "00.1) Auth/Punku - Login unico,01.1) Auth/Login,02.1) Auth/Login,03.1) Auth/Login,04.1) Auth/Login,05.1) Auth/Punku"
    )
  }

  $newmanArgs = @(
    'run', $CollectionPath,
    '-e',  $EnvironmentPath,
    '--export-environment', $EnvironmentPath,
    '--reporters', $reporters,
    '--timeout-request', '15000',
    '--timeout-script',  '10000',
    '--bail'
  ) + $reporterArgs

  if (-not [string]::IsNullOrWhiteSpace($FolderName)) {
    $newmanArgs += '--folder'
    $newmanArgs += $FolderName
  }

  # Inyectar variables de entorno override
  foreach ($v in $envVars) {
    $newmanArgs += '--env-var'
    $newmanArgs += $v
  }

  Write-Host ''
  Write-Host $SubSeparator -ForegroundColor DarkGray
  Write-Host "  Ejecutando: $Label" -ForegroundColor Cyan
  Write-Host "  Ambiente:   $Env ($BaseApi)" -ForegroundColor DarkGray
  Write-Host "  Colección:  $CollectionPath" -ForegroundColor DarkGray
  if (-not [string]::IsNullOrWhiteSpace($FolderName)) {
    Write-Host "  Folder:     $FolderName" -ForegroundColor DarkGray
  }
  Write-Host $SubSeparator -ForegroundColor DarkGray

  $fullArgs = @($script:NewmanPrefixArgs) + @($newmanArgs)
  # En PS 5.1, Start-Process no cita automaticamente los argumentos con espacios.
  # Se construye una cadena donde cada elemento con espacios va entre comillas dobles.
  $quotedArgs = $fullArgs | ForEach-Object { if ($_ -match '\s') { "`"$_`"" } else { $_ } }
  $argString  = $quotedArgs -join ' '
  $proc = Start-Process $script:NewmanExe -ArgumentList $argString -NoNewWindow -Wait -PassThru

  if ($proc.ExitCode -eq 0) {
    Write-Host "  [OK] $Label - PASO" -ForegroundColor Green
  } else {
    Write-Host "  [FAIL] $Label - FALLO (exit code: $($proc.ExitCode))" -ForegroundColor Red
  }

  return ($proc.ExitCode -eq 0)
}

function Convert-ToSafeLabel {
  param([string]$Label)
  if ([string]::IsNullOrWhiteSpace($Label)) { return 'run' }
  return ($Label -replace '[^a-zA-Z0-9_-]','_')
}

function Get-RunStatsFromJson {
  param([string]$JsonPath)

  $empty = [PSCustomObject]@{
    Requests = 0
    Tests = 0
    Assertions = 0
    Failures = 0
  }

  if (-not (Test-Path $JsonPath)) {
    return $empty
  }

  try {
    $obj = Get-Content -Path $JsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $stats = $obj.run.stats
    $failures = @($obj.run.failures).Count

    return [PSCustomObject]@{
      Requests = [int]($stats.requests.total)
      Tests = [int]($stats.tests.total)
      Assertions = [int]($stats.assertions.total)
      Failures = [int]$failures
    }
  } catch {
    return $empty
  }
}

function New-ConsolidatedReportArtifacts {
  param(
    [hashtable]$ResultsMap,
    [string]$ReportDir
  )

  if (-not (Test-Path $ReportDir)) { return $null }

  $rows = @()
  foreach ($label in $ResultsMap.Keys) {
    $safeLabel = Convert-ToSafeLabel -Label $label
    $jsonFile = "$safeLabel-result.json"
    $htmlFile = "$safeLabel-report.html"
    $junitFile = "$safeLabel-junit.xml"

    $jsonPath = Join-Path $ReportDir $jsonFile
    $htmlPath = Join-Path $ReportDir $htmlFile
    $junitPath = Join-Path $ReportDir $junitFile
    $stats = Get-RunStatsFromJson -JsonPath $jsonPath

    $rows += [PSCustomObject]@{
      Caso = $label
      Estado = if ($ResultsMap[$label]) { 'PASO' } else { 'FALLO' }
      Requests = $stats.Requests
      Tests = $stats.Tests
      Assertions = $stats.Assertions
      Fallos = $stats.Failures
      Html = if (Test-Path $htmlPath) { $htmlFile } else { '' }
      Json = if (Test-Path $jsonPath) { $jsonFile } else { '' }
      Junit = if (Test-Path $junitPath) { $junitFile } else { '' }
    }
  }

  $totals = [PSCustomObject]@{
    Requests = @($rows | Measure-Object -Property Requests -Sum)[0].Sum
    Tests = @($rows | Measure-Object -Property Tests -Sum)[0].Sum
    Assertions = @($rows | Measure-Object -Property Assertions -Sum)[0].Sum
    Fallos = @($rows | Measure-Object -Property Fallos -Sum)[0].Sum
  }

  $summary = [PSCustomObject]@{
    generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    runDir = $ReportDir
    totalCasos = @($rows).Count
    totalRequests = [int]$totals.Requests
    totalTests = [int]$totals.Tests
    totalAssertions = [int]$totals.Assertions
    totalFallos = [int]$totals.Fallos
    casos = $rows
  }

  $summaryJsonPath = Join-Path $ReportDir 'resumen-consolidado.json'
  $summaryMdPath = Join-Path $ReportDir 'resumen-consolidado.md'
  $indexHtmlPath = Join-Path $ReportDir 'index-reportes.html'

  $summary | ConvertTo-Json -Depth 8 | Set-Content -Path $summaryJsonPath -Encoding UTF8

  $mdLines = @()
  $mdLines += '# REGINSA - Resumen Consolidado Newman'
  $mdLines += ''
  $mdLines += "Generado: $($summary.generatedAt)"
  $mdLines += "RunDir: $($summary.runDir)"
  $mdLines += ''
  $mdLines += "- Total casos: $($summary.totalCasos)"
  $mdLines += "- Total requests: $($summary.totalRequests)"
  $mdLines += "- Total tests: $($summary.totalTests)"
  $mdLines += "- Total assertions: $($summary.totalAssertions)"
  $mdLines += "- Total fallos: $($summary.totalFallos)"
  $mdLines += ''
  $mdLines += '| Caso | Estado | Requests | Tests | Assertions | Fallos | HTML | JSON | JUnit |'
  $mdLines += '|---|---:|---:|---:|---:|---:|---|---|---|'
  foreach ($row in $rows) {
    $htmlLink = if ($row.Html) { "[$($row.Html)]($($row.Html))" } else { '-' }
    $jsonLink = if ($row.Json) { "[$($row.Json)]($($row.Json))" } else { '-' }
    $junitLink = if ($row.Junit) { "[$($row.Junit)]($($row.Junit))" } else { '-' }
    $mdLines += "| $($row.Caso) | $($row.Estado) | $($row.Requests) | $($row.Tests) | $($row.Assertions) | $($row.Fallos) | $htmlLink | $jsonLink | $junitLink |"
  }
  $mdLines -join [Environment]::NewLine | Set-Content -Path $summaryMdPath -Encoding UTF8

  $htmlRows = @()
  foreach ($row in $rows) {
    $stateColor = if ($row.Estado -eq 'PASO') { '#117a37' } else { '#b42318' }
    $htmlLink = if ($row.Html) { "<a href='$($row.Html)'>HTML</a>" } else { '-' }
    $jsonLink = if ($row.Json) { "<a href='$($row.Json)'>JSON</a>" } else { '-' }
    $junitLink = if ($row.Junit) { "<a href='$($row.Junit)'>JUNIT</a>" } else { '-' }
    $htmlRows += "<tr><td>$($row.Caso)</td><td style='color:$stateColor;font-weight:700;'>$($row.Estado)</td><td>$($row.Requests)</td><td>$($row.Tests)</td><td>$($row.Assertions)</td><td>$($row.Fallos)</td><td>$htmlLink</td><td>$jsonLink</td><td>$junitLink</td></tr>"
  }

  $indexHtml = @"
<!doctype html>
<html lang='es'>
<head>
  <meta charset='utf-8' />
  <meta name='viewport' content='width=device-width, initial-scale=1' />
  <title>REGINSA - Índice Consolidado Newman</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 24px; color: #1f2328; background: #f6f8fa; }
    .card { background: #fff; border: 1px solid #d0d7de; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
    h1 { margin: 0 0 8px 0; }
    .meta { color: #57606a; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { border: 1px solid #d0d7de; padding: 8px 10px; font-size: 14px; text-align: left; }
    th { background: #f3f4f6; }
    .totals { display: flex; gap: 12px; flex-wrap: wrap; }
    .pill { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 999px; padding: 6px 12px; font-size: 13px; }
  </style>
</head>
<body>
  <div class='card'>
    <h1>REGINSA - Índice Consolidado Newman</h1>
    <div class='meta'>Generado: $($summary.generatedAt)</div>
    <div class='meta'>RunDir: $($summary.runDir)</div>
    <div class='totals' style='margin-top:10px;'>
      <div class='pill'>Casos: $($summary.totalCasos)</div>
      <div class='pill'>Requests: $($summary.totalRequests)</div>
      <div class='pill'>Tests: $($summary.totalTests)</div>
      <div class='pill'>Assertions: $($summary.totalAssertions)</div>
      <div class='pill'>Fallos: $($summary.totalFallos)</div>
    </div>
  </div>
  <div class='card'>
    <table>
      <thead>
        <tr>
          <th>Caso</th>
          <th>Estado</th>
          <th>Requests</th>
          <th>Tests</th>
          <th>Assertions</th>
          <th>Fallos</th>
          <th>HTML</th>
          <th>JSON</th>
          <th>JUnit</th>
        </tr>
      </thead>
      <tbody>
        $(($htmlRows -join [Environment]::NewLine))
      </tbody>
    </table>
  </div>
</body>
</html>
"@

  $indexHtml | Set-Content -Path $indexHtmlPath -Encoding UTF8

  return [PSCustomObject]@{
    SummaryJson = $summaryJsonPath
    SummaryMd = $summaryMdPath
    IndexHtml = $indexHtmlPath
    Rows = $rows
    Totals = $totals
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host $Separator -ForegroundColor Cyan
Write-Host '  REGINSA - Newman Runner' -ForegroundColor Cyan
Write-Host "  Caso: $Caso | Ambiente: $Env | Auth: Login unico + reutilizacion TOKEN_JWT" -ForegroundColor Cyan
Write-Host $Separator -ForegroundColor Cyan

Assert-Newman

$Results = @{}
$NoAuthCollections = @{}
foreach ($k in @('01','02','03','04','master')) {
  $out = Join-Path $RunDir ("noauth-{0}.collection.json" -f $k)
  $NoAuthCollections[$k] = New-NoAuthCollectionCopy -SourceCollection $Collections[$k] -OutCollection $out
}

# ─── Resolver token antes de Newman ───────────────────────────────────────────
# Modo Playwright: login headless con usuario/contrasena -> captura TOKEN_JWT
if ($AuthMode -eq 'playwright') {
  Write-Host ''
  Write-Host "  Obteniendo TOKEN_JWT via Playwright ($Usuario)..." -ForegroundColor Cyan
  $bridgeScript = Join-Path $PSScriptRoot 'get-punku-token.js'
  if (-not (Test-Path $bridgeScript)) {
    Write-Host "  [STOP] No se encontró get-punku-token.js en: $bridgeScript" -ForegroundColor Red
    exit 1
  }
  $bridgeStdOut = Join-Path $RunDir 'playwright-token.stdout.txt'
  $bridgeStdErr = Join-Path $RunDir 'playwright-token.stderr.txt'
  $bridgeProc = Start-Process 'node.exe' -ArgumentList @($bridgeScript, $Usuario, $Contrasena) -NoNewWindow -Wait -PassThru -RedirectStandardOutput $bridgeStdOut -RedirectStandardError $bridgeStdErr
  $rawToken = if (Test-Path $bridgeStdOut) { (Get-Content -Path $bridgeStdOut -Raw -Encoding UTF8).Trim() } else { '' }
  $bridgeError = if (Test-Path $bridgeStdErr) { (Get-Content -Path $bridgeStdErr -Raw -Encoding UTF8).Trim() } else { '' }
  if ($bridgeProc.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($rawToken)) {
    Write-Host '  [STOP] Playwright bridge fallo. Verifica usuario, contrasena y URL de REGINSA.' -ForegroundColor Red
    if (-not [string]::IsNullOrWhiteSpace($bridgeError)) {
      Write-Host '  Detalle Playwright:' -ForegroundColor Yellow
      Write-Host "  $bridgeError" -ForegroundColor DarkGray
    }
    exit 1
  }
  $TokenJwt = $rawToken.Trim()
  $AuthMode  = 'token-directo'
  Write-Host '  [OK] TOKEN_JWT obtenido via Playwright' -ForegroundColor Green
}

# Modo Token Directo: inyectar TOKEN_JWT en RuntimeEnv, omitir login collection
$TokenPreCargado = $false
if ($AuthMode -eq 'token-directo' -and -not [string]::IsNullOrWhiteSpace($TokenJwt)) {
  $envObj = Get-Content $RuntimeEnv -Raw -Encoding UTF8 | ConvertFrom-Json
  $existingKeys = @($envObj.values | Select-Object -ExpandProperty key)
  foreach ($v in @($envObj.values)) {
    if ($v.key -eq 'TOKEN_JWT')   { $v.value = $TokenJwt }
    if ($v.key -eq 'token')       { $v.value = $TokenJwt }
    if ($v.key -eq 'auth_header') { $v.value = "Bearer $TokenJwt" }
  }
  if ($existingKeys -notcontains 'TOKEN_JWT')   { $envObj.values += [PSCustomObject]@{key='TOKEN_JWT';   value=$TokenJwt;          enabled=$true; type='default'} }
  if ($existingKeys -notcontains 'token')       { $envObj.values += [PSCustomObject]@{key='token';       value=$TokenJwt;          enabled=$true; type='default'} }
  if ($existingKeys -notcontains 'auth_header') { $envObj.values += [PSCustomObject]@{key='auth_header'; value="Bearer $TokenJwt"; enabled=$true; type='default'} }
  $envObj | ConvertTo-Json -Depth 20 | Set-Content -Path $RuntimeEnv -Encoding UTF8
  $Results['00-Login-Punku'] = $true
  $TokenPreCargado = $true
  Write-Host "  TOKEN_JWT inyectado en ambiente (colección Login omitida)" -ForegroundColor Green
}

# Modo Punku CODE/CODE_CHALLENGE: login via Newman + colección login
if (-not $TokenPreCargado) {
  $Results['00-Login-Punku'] = Invoke-Newman -CollectionPath $Collections['login'] -Label '00-Login-Punku' -EnvironmentPath $RuntimeEnv
}

if (-not $Results['00-Login-Punku']) {
  Write-Host '  [STOP] Login fallo. No se ejecutan casos dependientes.' -ForegroundColor Red
} else {

  # ─── Inyectar datos del pool compartido Caso 01 (k6 + funcional) ────────────
  # Solo para casos que incluyan el flujo Registrar Administrado (01, all, master).
  # El pre-request de la colección lee estas vars y sólo genera aleatoriamente si
  # están vacías (modo fallback para Postman Desktop o ejecución sin runner).
  if ($Caso -in @('01', 'all', 'master') -and -not $SinPool) {
    $poolRecord = Get-PoolRecord
    if ($poolRecord) {
      $envObj      = Get-Content $RuntimeEnv -Raw -Encoding UTF8 | ConvertFrom-Json
      $existingKeys = @($envObj.values | Select-Object -ExpandProperty key)
      foreach ($v in @($envObj.values)) {
        if ($v.key -eq 'ruc_nuevo')              { $v.value = $poolRecord.Ruc }
        if ($v.key -eq 'razon_social_nueva')     { $v.value = $poolRecord.RazonSocial }
        if ($v.key -eq 'nombre_comercial_nuevo') { $v.value = $poolRecord.NombreComercial }
      }
      if ($existingKeys -notcontains 'ruc_nuevo')              { $envObj.values += [PSCustomObject]@{key='ruc_nuevo';              value=$poolRecord.Ruc;             enabled=$true; type='default'} }
      if ($existingKeys -notcontains 'razon_social_nueva')     { $envObj.values += [PSCustomObject]@{key='razon_social_nueva';     value=$poolRecord.RazonSocial;     enabled=$true; type='default'} }
      if ($existingKeys -notcontains 'nombre_comercial_nuevo') { $envObj.values += [PSCustomObject]@{key='nombre_comercial_nuevo'; value=$poolRecord.NombreComercial; enabled=$true; type='default'} }
      $envObj | ConvertTo-Json -Depth 20 | Set-Content -Path $RuntimeEnv -Encoding UTF8
      $Script:PoolRecordUsed = $poolRecord   # guardado para marcar como usado tras run exitoso
      Write-Host "  [POOL] Caso 01: $($poolRecord.Ruc) / $($poolRecord.RazonSocial) (from $($poolRecord.Source))" -ForegroundColor Cyan
    } else {
      Write-Host '  [POOL] Dataset no encontrado - Caso 01 usara generacion aleatoria (pre-request fallback)' -ForegroundColor DarkGray
    }
  }

  switch ($Caso) {
    'all' {
      $allCaseFolders = Get-MasterCaseFolders -MasterCollectionPath $NoAuthCollections['master']
      if ($allCaseFolders.Count -gt 0) {
        foreach ($folderName in $allCaseFolders) {
          $label = $folderName
          $Results[$label] = Invoke-Newman -CollectionPath $NoAuthCollections['master'] -Label $label -EnvironmentPath $RuntimeEnv -FolderName $folderName
        }
      } else {
        foreach ($c in @('01','02','03','04')) {
          $label = "Caso$c"
          $folderName = Get-MasterFolderName -CaseId $c -MasterCollectionPath $NoAuthCollections['master']
          if ($folderName) {
            $Results[$label] = Invoke-Newman -CollectionPath $NoAuthCollections['master'] -Label $label -EnvironmentPath $RuntimeEnv -FolderName $folderName
          } else {
            $Results[$label] = Invoke-Newman -CollectionPath $NoAuthCollections[$c] -Label $label -EnvironmentPath $RuntimeEnv
          }
        }
      }
    }
    'master' {
      $masterJson = Get-Content -Path $NoAuthCollections['master'] -Raw -Encoding UTF8 | ConvertFrom-Json
      foreach ($folder in @($masterJson.item)) {
        $folderName = [string]$folder.name
        if ([string]::IsNullOrWhiteSpace($folderName)) { continue }
        $label = $folderName
        $Results[$label] = Invoke-Newman -CollectionPath $NoAuthCollections['master'] -Label $label -EnvironmentPath $RuntimeEnv -FolderName $folderName
      }
    }
    default {
      $folderName = Get-MasterFolderName -CaseId $Caso -MasterCollectionPath $NoAuthCollections['master']
      if ($folderName) {
        $label = $folderName
        $Results[$label] = Invoke-Newman -CollectionPath $NoAuthCollections['master'] -Label $label -EnvironmentPath $RuntimeEnv -FolderName $folderName
      } else {
        if ($NoAuthCollections.ContainsKey($Caso)) {
          $label = "Caso$Caso"
          $Results[$label] = Invoke-Newman -CollectionPath $NoAuthCollections[$Caso] -Label $label -EnvironmentPath $RuntimeEnv
        } else {
          Write-Host "  [SKIP] Caso $Caso no encontrado en master y sin colección individual." -ForegroundColor Yellow
          $Results["Caso$Caso"] = $false
        }
      }
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Post-run: marcar registro de pool como usado si Caso 01 insertó datos exitosamente.
# Elimina el RUC de k6-caso01-dataset.json y agrega 'usadoEn' en administrados-pool.json
# para que el generador de dataset (generar-k6-caso01-dataset.js) reponga el registro.
# ─────────────────────────────────────────────────────────────────────────────
if ($Script:PoolRecordUsed) {
  $caso01Exitoso = $Results.Keys | Where-Object { $_ -match '^01' -or $_ -match 'Agregar.Administrado' } | ForEach-Object { $Results[$_] } | Where-Object { $_ -eq $true }
  if ($caso01Exitoso) {
    $usadoRuc = $Script:PoolRecordUsed.Ruc
    $usadoEn  = (Get-Date).ToString('o')

    # 1. Remover de k6-caso01-dataset.json
    $datasetFile = Join-Path $Root 'reportes/k6-caso01-dataset.json'
    if (Test-Path $datasetFile) {
      try {
        $ds  = Get-Content $datasetFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $ds2 = @($ds | Where-Object { [string]$_.ruc -ne $usadoRuc })
        $ds2 | ConvertTo-Json -Depth 5 | Set-Content -Path $datasetFile -Encoding UTF8
        Write-Host "  [POOL-USED] Removido de dataset: $usadoRuc ($($ds.Count) → $($ds2.Count) entradas)" -ForegroundColor DarkGray
      } catch {
        Write-Host "  [POOL-USED] No se pudo actualizar dataset: $_" -ForegroundColor Yellow
      }
    }

    # 2. Marcar usadoEn en administrados-pool.json
    $poolFile = Join-Path $Root 'reportes/administrados-pool.json'
    if (Test-Path $poolFile) {
      try {
        $pool  = Get-Content $poolFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $pool2 = @($pool | ForEach-Object {
          if ([string]$_.ruc -eq $usadoRuc) {
            $_ | Add-Member -NotePropertyName 'usadoEn' -NotePropertyValue $usadoEn -Force
          }
          $_
        })
        $pool2 | ConvertTo-Json -Depth 5 | Set-Content -Path $poolFile -Encoding UTF8
        Write-Host "  [POOL-USED] Marcado usadoEn=$usadoEn en pool: $usadoRuc" -ForegroundColor DarkGray
      } catch {
        Write-Host "  [POOL-USED] No se pudo marcar en pool: $_" -ForegroundColor Yellow
      }
    }
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Resumen final
# ─────────────────────────────────────────────────────────────────────────────
$ElapsedSec = [math]::Round(((Get-Date) - $StartTime).TotalSeconds, 1)
$Passed     = ($Results.Values | Where-Object { $_ -eq $true  }).Count
$Failed     = ($Results.Values | Where-Object { $_ -eq $false }).Count

Write-Host ''
Write-Host $Separator -ForegroundColor Cyan
Write-Host '  RESUMEN DE EJECUCIÓN' -ForegroundColor Cyan
Write-Host $SubSeparator -ForegroundColor DarkGray
foreach ($k in $Results.Keys) {
  $icon  = if ($Results[$k]) { '[PASO]' } else { '[FALLO]' }
  $color = if ($Results[$k]) { 'Green'  } else { 'Red'    }
  Write-Host "  $icon  $k" -ForegroundColor $color
}
Write-Host $SubSeparator -ForegroundColor DarkGray
Write-Host "  Total: $($Results.Count)  |  Pasaron: $Passed  |  Fallaron: $Failed  |  Tiempo: ${ElapsedSec}s" -ForegroundColor White
Write-Host "  Reportes en: $RunDir" -ForegroundColor DarkGray

$consolidated = New-ConsolidatedReportArtifacts -ResultsMap $Results -ReportDir $RunDir
if ($consolidated) {
  Write-Host "  Total requests (todos los casos): $([int]$consolidated.Totals.Requests)" -ForegroundColor White
  Write-Host "  Total tests (todos los casos):    $([int]$consolidated.Totals.Tests)" -ForegroundColor White
  Write-Host "  Total assertions:                 $([int]$consolidated.Totals.Assertions)" -ForegroundColor White
  Write-Host "  Fallos de assertions:             $([int]$consolidated.Totals.Fallos)" -ForegroundColor White
  Write-Host "  Índice consolidado: $($consolidated.IndexHtml)" -ForegroundColor DarkGray
}

Write-Host $Separator -ForegroundColor Cyan
Write-Host ''

# Listar archivos generados
Get-ChildItem $RunDir | ForEach-Object {
  Write-Host "    $($_.Name)" -ForegroundColor DarkGray
}

# Abrir índice consolidado (o primer HTML) si existe y no es CI
$HtmlFiles = Get-ChildItem $RunDir -Filter '*.html' -ErrorAction SilentlyContinue
if ($HtmlFiles -and -not $env:CI) {
  Write-Host ''
  if ($consolidated -and (Test-Path $consolidated.IndexHtml)) {
    Write-Host '  Abriendo índice consolidado de reportes...' -ForegroundColor Cyan
    Start-Process $consolidated.IndexHtml
  } else {
    Write-Host '  Abriendo reporte HTML...' -ForegroundColor Cyan
    Start-Process $HtmlFiles[0].FullName
  }
}

# Exit code para CI/CD
exit $Failed
