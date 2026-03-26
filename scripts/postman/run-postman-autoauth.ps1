[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidAssignmentToAutomaticVariable', 'args', Scope='Script', Justification='Uso controlado de listas de argumentos para newman/npx')]
param(
  [string]$BaseApi = "https://reginsaapiqa.sunedu.gob.pe/api",
  [string]$PunkuBase = "https://punkuproxyv2qa.sunedu.gob.pe",
  [string]$PunkuCode = $env:REGINSA_PUNKU_CODE,
  [string]$PunkuCodeChallenge = $env:REGINSA_PUNKU_CODE_CHALLENGE,
  [string]$OutDir = "reportes/newman"
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($PunkuCode) -or [string]::IsNullOrWhiteSpace($PunkuCodeChallenge)) {
  Write-Host ''
  Write-Host '  DATOS PUNKU REQUERIDOS' -ForegroundColor Yellow
  Write-Host '  Define variables o pasa parámetros:'
  Write-Host '    $env:REGINSA_PUNKU_CODE = "<CODE>"'
  Write-Host '    $env:REGINSA_PUNKU_CODE_CHALLENGE = "<CODE_CHALLENGE>"'
  Write-Host ''

  if ([string]::IsNullOrWhiteSpace($PunkuCode)) {
    $PunkuCode = Read-Host '  Punku CODE'
  }
  if ([string]::IsNullOrWhiteSpace($PunkuCodeChallenge)) {
    $PunkuCodeChallenge = Read-Host '  Punku CODE_CHALLENGE'
  }
}

$root = Resolve-Path (Join-Path $PSScriptRoot '../..')
$postmanDir = Join-Path $root 'API_TEST/postman'
$sharedEnv = Join-Path $postmanDir 'reginsa-shared.environment.json'

$cases = @(
  @{ id = 'caso01'; collection = Join-Path $postmanDir 'reginsa-caso01-api-test.collection.json' },
  @{ id = 'caso02'; collection = Join-Path $postmanDir 'reginsa-caso02-api-test.collection.json' },
  @{ id = 'caso03'; collection = Join-Path $postmanDir 'reginsa-caso03-api-test.collection.json' },
  @{ id = 'caso04'; collection = Join-Path $postmanDir 'reginsa-caso04-api-test.collection.json' }
)

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

foreach ($c in $cases) {
  $targetDir = Join-Path $OutDir $c.id
  if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  }

  $xml = Join-Path $targetDir "$($c.id)-api-test.xml"
  $json = Join-Path $targetDir "$($c.id)-api-test.json"

  Write-Host "[Postman] Ejecutando $($c.id) con auth Punku..." -ForegroundColor Cyan

  $newmanCmd = @(
    'run', $c.collection,
    '-e', $sharedEnv,
    '--env-var', "base_api=$BaseApi",
    '--env-var', "punku_base=$PunkuBase",
    '--env-var', "punku_code=$PunkuCode",
    '--env-var', "punku_code_challenge=$PunkuCodeChallenge",
    '--reporters', 'cli,junit,json',
    '--reporter-junit-export', $xml,
    '--reporter-json-export', $json,
    '--bail'
  )

  $npxArgs = @('newman') + $newmanCmd
  & npx @npxArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo $($c.id) (exit $LASTEXITCODE)"
  }
}

Write-Host "[Postman] Ejecución finalizada. Reportes en: $OutDir" -ForegroundColor Green
