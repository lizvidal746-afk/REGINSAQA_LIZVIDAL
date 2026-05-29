param(
  [string]$SonarHostUrl = $env:SONAR_HOST_URL,
  [string]$SonarToken   = $env:SONAR_TOKEN,
  # "frontend", "backend", "enlinea". Config se omite (repo vacio).
  [string[]]$Projects = @('frontend', 'backend', 'enlinea')
)

$ErrorActionPreference = 'Stop'

# Cargar variables de entorno desde .env si existe (lineas KEY=VALUE, ignora #)
$envFile = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path '.env'
if (Test-Path $envFile) {
  Get-Content $envFile | Where-Object { $_ -match '^\s*[^#].*=' } | ForEach-Object {
    $parts = $_ -split '=', 2
    $key   = $parts[0].Trim()
    $val   = $parts[1].Trim().Trim('"').Trim("'")
    if ($key -and -not [string]::IsNullOrWhiteSpace($val)) {
      [System.Environment]::SetEnvironmentVariable($key, $val, 'Process')
    }
  }
  if ([string]::IsNullOrWhiteSpace($SonarHostUrl)) { $SonarHostUrl = $env:SONAR_HOST_URL }
  if ([string]::IsNullOrWhiteSpace($SonarToken))   { $SonarToken   = $env:SONAR_TOKEN }
}

if ([string]::IsNullOrWhiteSpace($SonarHostUrl)) {
  throw 'Falta SONAR_HOST_URL. Define la variable de entorno o pasa -SonarHostUrl.'
}
if ([string]::IsNullOrWhiteSpace($SonarToken)) {
  throw 'Falta SONAR_TOKEN. Define la variable de entorno o pasa -SonarToken.'
}

$SonarHostUrl = $SonarHostUrl.Trim().TrimEnd('/')

# Raiz del workspace  (scripts\security -> scripts -> raiz)
$reginsa = Resolve-Path (Join-Path $PSScriptRoot '../..') | Select-Object -ExpandProperty Path

# sonar-scanner via Docker (sonarsource/sonar-scanner-cli:latest, ~5.x)
# El npm sonar-scanner 3.1.0 (2018) es incompatible con SonarQube 9.9.x -> 0 files indexed
# Docker usa host.docker.internal para alcanzar localhost del host
$dockerHostUrl = $SonarHostUrl -replace '(?i)localhost',    'host.docker.internal' `
                               -replace '127\.0\.0\.1', 'host.docker.internal'

# ---------------------------------------------------------------
# Configuracion por proyecto
# sonar.sources: rutas relativas a la raiz del repo (montada en /usr/src)
# sonar.exclusions: patrones excluidos del analisis
# ---------------------------------------------------------------
$projectConfig = [ordered]@{
  frontend = @{
    Key        = 'si091reginsafrontend'
    Name       = 'SI091 REGINSA Frontend'
    RepoDir    = Join-Path $reginsa 'SI091_REGINSA_FRONTEND-1'
    Sources    = 'src/app'
    Exclusions = '**/*.spec.ts,**/*.test.ts,**/node_modules/**,**/dist/**'
  }
  backend = @{
    Key        = 'si091reginsabackend'
    Name       = 'SI091 REGINSA Backend'
    RepoDir    = Join-Path $reginsa 'SI091_REGINSA_BACKEND'
    Sources    = '02Application,03Domain,04Infrastructure,05Transversal'
    Exclusions = '**/bin/**,**/obj/**,**/packages/**,**/*.dll,**/*.pdb,**/*.nupkg,**/*.min.js'
  }
  enlinea = @{
    Key        = 'si091reginsaenlinea'
    Name       = 'SI091 REGINSA En Linea'
    RepoDir    = Join-Path $reginsa 'SI091_REGINSA_ENLINEA'
    Sources    = 'src'
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

  # ---------------------------------------------------------------
  # Backend C# .NET: requiere dotnet sonarscanner (Roslyn analyzers)
  # El generic sonar-scanner-cli no produce analisis de C#.
  # ---------------------------------------------------------------
  if ($proj -eq 'backend') {
    $dotnetExe = Get-Command 'dotnet' -ErrorAction SilentlyContinue
    if (-not $dotnetExe) {
      Write-Warning "[SKIP] Backend: 'dotnet' no encontrado en PATH."
      Write-Warning "       Instala .NET 8 SDK y ejecuta: dotnet tool install -g dotnet-sonarscanner"
      $failed += $proj
      continue
    }

    # Instalar dotnet-sonarscanner si no esta disponible
    $toolList = & dotnet tool list -g 2>&1 | Out-String
    if ($toolList -notmatch 'dotnet-sonarscanner') {
      Write-Host "[INFO] Instalando dotnet-sonarscanner globalmente..."
      & dotnet tool install --global dotnet-sonarscanner
      if ($LASTEXITCODE -ne 0) {
        Write-Warning "[WARN] No se pudo instalar dotnet-sonarscanner. Verifica conectividad a NuGet."
        $failed += $proj
        continue
      }
    }

    Push-Location $cfg.RepoDir
    try {
      & dotnet sonarscanner begin `
        "/k:$($cfg.Key)" `
        "/n:$($cfg.Name)" `
        "/d:sonar.host.url=$SonarHostUrl" `
        "/d:sonar.token=$SonarToken" `
        "/d:sonar.exclusions=$($cfg.Exclusions)"
      if ($LASTEXITCODE -ne 0) { throw "sonarscanner begin fallido (exit $LASTEXITCODE)" }

      & dotnet build 'Reginsa.sln'
      if ($LASTEXITCODE -ne 0) { throw "dotnet build fallido (exit $LASTEXITCODE)" }

      & dotnet sonarscanner end "/d:sonar.token=$SonarToken"
      if ($LASTEXITCODE -ne 0) { throw "sonarscanner end fallido (exit $LASTEXITCODE)" }

      Write-Host "[OK] Scan completado: $proj"
    } catch {
      Write-Warning "El scan de '$proj' fallo: $_"
      $failed += $proj
    } finally {
      Pop-Location
    }
    continue
  }

  # ---------------------------------------------------------------
  # Frontend / En Linea: sonar-scanner-cli via Docker
  # ---------------------------------------------------------------
  $repoDirDocker = $cfg.RepoDir.Replace('\', '/')

  $dockerArgs = @(
    'run', '--rm',
    '-e', "SONAR_HOST_URL=$dockerHostUrl",
    '-e', "SONAR_TOKEN=$SonarToken",
    '-v', "${repoDirDocker}:/usr/src",
    'sonarsource/sonar-scanner-cli:latest',
    "-Dsonar.projectKey=$($cfg.Key)",
    "-Dsonar.projectName=$($cfg.Name)",
    "-Dsonar.sources=$($cfg.Sources)",
    "-Dsonar.exclusions=$($cfg.Exclusions)",
    "-Dsonar.sourceEncoding=UTF-8"
  )

  docker @dockerArgs

  if ($LASTEXITCODE -ne 0) {
    Write-Warning "El scan de '$proj' termino con codigo $LASTEXITCODE."
    $failed += $proj
  } else {
    Write-Host "[OK] Scan completado: $proj"
  }
}

& "$PSScriptRoot\..\cleanup-sonar-residuals.ps1"

Write-Host ""
if ($failed.Count -gt 0) {
  Write-Warning "Proyectos con falla: $($failed -join ', ')"
  exit 1
}

Write-Host "[OK] Todos los scans completados."
exit 0
