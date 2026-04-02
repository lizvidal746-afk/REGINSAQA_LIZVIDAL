param(
  [string]$SonarHostUrl = $env:SONAR_HOST_URL,
  [string]$SonarToken   = $env:SONAR_TOKEN,
  # "frontend", "backend", "enlinea". Config se omite (repo vacio).
  [string[]]$Projects = @('frontend', 'backend', 'enlinea')
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($SonarHostUrl)) {
  throw 'Falta SONAR_HOST_URL. Define la variable de entorno o pasa -SonarHostUrl.'
}
if ([string]::IsNullOrWhiteSpace($SonarToken)) {
  throw 'Falta SONAR_TOKEN. Define la variable de entorno o pasa -SonarToken.'
}

$SonarHostUrl = $SonarHostUrl.Trim().TrimEnd('/')

# Raiz del workspace  (scripts\security -> scripts -> raiz)
$reginsa    = Resolve-Path (Join-Path $PSScriptRoot '../..') | Select-Object -ExpandProperty Path

# sonar-scanner instalado como devDependency en REGINSA
$scannerCmd = Join-Path $reginsa 'node_modules\.bin\sonar-scanner.cmd'
if (-not (Test-Path $scannerCmd)) {
  throw "sonar-scanner no encontrado en $scannerCmd. Ejecuta 'npm ci' en $reginsa primero."
}

# ---------------------------------------------------------------
# Configuracion por proyecto
# sonar.sources:  rutas relativas a la raiz del repo
# sonar.exclusions: patrones excluidos del analisis
# ---------------------------------------------------------------
$projectConfig = [ordered]@{
  frontend = @{
    Key        = 'si091reginsafrontend'
    Name       = 'SI091 REGINSA Frontend'
    RepoDir    = Join-Path $reginsa 'SI091_REGINSA_FRONTEND-1'
    Sources    = 'src/app/components/pages,src/app/models,src/app/services'
    Exclusions = '**/*.spec.ts,**/*.test.ts,**/node_modules/**,**/dist/**'
  }
  backend = @{
    Key        = 'si091reginsabackend'
    Name       = 'SI091 REGINSA Backend'
    RepoDir    = Join-Path $reginsa 'SI091_REGINSA_BACKEND'
    Sources    = '.'
    Exclusions = '**/bin/**,**/obj/**,**/packages/**,**/*.dll,**/*.pdb,**/*.nupkg,**/*.min.js'
  }
  enlinea = @{
    Key        = 'si091reginsaenlinea'
    Name       = 'SI091 REGINSA En Linea'
    RepoDir    = Join-Path $reginsa 'SI091_REGINSA_ENLINEA'
    Sources    = 'src/app/services,src/models,src/package'
    Exclusions = '**/*.spec.ts,**/*.test.ts,**/node_modules/**,**/dist/**'
  }
}

$failed = @()

foreach ($proj in $Projects) {

  $proj = $proj.ToLower().Trim()
  $cfg = $projectConfig[$proj]
  if (-not $cfg) {
    Write-Warning "Proyecto '$proj' no reconocido. Valores validos: frontend, backend, enlinea"
    continue
  }

  if (-not (Test-Path $cfg.RepoDir)) {
    Write-Warning "Directorio no encontrado: $($cfg.RepoDir). Saltando $proj."
    $failed += $proj
    continue
  }

  Write-Host ""
  Write-Host "=========================================="
  Write-Host "[SCAN] $proj  ->  $($cfg.Key)"
  Write-Host "[DIR]  $($cfg.RepoDir)"
  Write-Host "=========================================="

  Push-Location $cfg.RepoDir
  try {
    $scanArgs = @(
      "-Dsonar.host.url=$SonarHostUrl",
      "-Dsonar.token=$SonarToken",
      "-Dsonar.projectKey=$($cfg.Key)",
      "-Dsonar.projectName=$($cfg.Name)",
      "-Dsonar.sources=$($cfg.Sources)",
      "-Dsonar.exclusions=$($cfg.Exclusions)",
      "-Dsonar.sourceEncoding=UTF-8"
    )

    & $scannerCmd @scanArgs

    if ($LASTEXITCODE -ne 0) {
      Write-Warning "El scan de '$proj' termino con codigo $LASTEXITCODE."
      $failed += $proj
    } else {
      Write-Host "[OK] Scan completado: $proj"
    }
  } finally {
    Pop-Location
  }
}

Write-Host ""
if ($failed.Count -gt 0) {
  Write-Warning "Proyectos con falla: $($failed -join ', ')"
  exit 1
}

Write-Host "[OK] Todos los scans completados."
exit 0
