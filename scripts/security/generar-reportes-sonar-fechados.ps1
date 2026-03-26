param(
  [string]$SonarHostUrl = $env:SONAR_HOST_URL,
  [string]$SonarToken   = $env:SONAR_TOKEN,
  [string[]]$ProjectKeys = @(
    'si091reginsafrontend',
    'si091reginsabackend',
    'si091reginsaenlinea',
    'si091reginsaconfig'
  ),
  [string]$BaseDir = 'reportes/security',
  [string]$RunId   = (Get-Date -Format 'yyyyMMdd-HHmmss')
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($SonarHostUrl)) {
  throw 'Falta SONAR_HOST_URL. Define la variable de entorno o pasa -SonarHostUrl.'
}
if ([string]::IsNullOrWhiteSpace($SonarToken)) {
  throw 'Falta SONAR_TOKEN. Define la variable de entorno o pasa -SonarToken.'
}

$SonarHostUrl = $SonarHostUrl.Trim().TrimEnd('/')

function Test-SonarAuth {
  param(
    [string]$BaseUrl,
    [string]$Token
  )

  $tokenBytes = [System.Text.Encoding]::ASCII.GetBytes("$Token`:")
  $basicToken = [Convert]::ToBase64String($tokenBytes)
  $headers = @{ Authorization = "Basic $basicToken" }
  $authUrl = "$BaseUrl/api/authentication/validate"

  try {
    $res = Invoke-RestMethod -Method Get -Uri $authUrl -Headers $headers
    return ($res.valid -eq $true)
  }
  catch {
    return $false
  }
}

if (-not (Test-SonarAuth -BaseUrl $SonarHostUrl -Token $SonarToken)) {
  throw 'No se pudo autenticar contra SonarQube. Verifica SONAR_HOST_URL y SONAR_TOKEN (token vigente y con permisos de Browse/See Source Code).'
}

$tokenBytes = [System.Text.Encoding]::ASCII.GetBytes("$SonarToken`:")
$basicToken = [Convert]::ToBase64String($tokenBytes)
$sonarHeaders = @{ Authorization = "Basic $basicToken" }

function Test-SonarProjectExists {
  param(
    [string]$BaseUrl,
    [hashtable]$Headers,
    [string]$ProjectKey
  )

  try {
    $escaped = [System.Uri]::EscapeDataString($ProjectKey)
    $url = "$BaseUrl/api/projects/search?projects=$escaped&ps=1"
    $res = Invoke-RestMethod -Method Get -Uri $url -Headers $Headers
    if ($res -and $res.components -and @($res.components).Count -gt 0) {
      return $true
    }
    return $false
  }
  catch {
    return $false
  }
}

function Normalize-KeyToken {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
  return (($Value.ToLowerInvariant()) -replace '[^a-z0-9]','')
}

function Resolve-SonarProjectKey {
  param(
    [string]$BaseUrl,
    [hashtable]$Headers,
    [string]$RequestedKey
  )

  if (Test-SonarProjectExists -BaseUrl $BaseUrl -Headers $Headers -ProjectKey $RequestedKey) {
    return $RequestedKey
  }

  $suffix = ''
  if ($RequestedKey -match '^si\d+reginsa(?<suffix>.*)$') {
    $suffix = [string]$Matches['suffix']
  }
  if ([string]::IsNullOrWhiteSpace($suffix)) {
    $suffix = [string]$RequestedKey
  }

  $suffixNorm = Normalize-KeyToken -Value $suffix
  $candidates = @()

  try {
    $res = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/projects/search?q=reginsa&ps=500" -Headers $Headers
    foreach ($component in @($res.components)) {
      $k = [string]$component.key
      $n = [string]$component.name
      $kNorm = Normalize-KeyToken -Value $k
      $nNorm = Normalize-KeyToken -Value $n
      if ($kNorm.Contains($suffixNorm) -or $nNorm.Contains($suffixNorm)) {
        $candidates += $k
      }
    }
  }
  catch {
    return $RequestedKey
  }

  if (@($candidates).Count -eq 1) {
    return $candidates[0]
  }

  if (@($candidates).Count -gt 1) {
    $ordered = @($candidates | Sort-Object)
    return $ordered[0]
  }

  return $RequestedKey
}

$runRoot = Join-Path $BaseDir "sonar/$RunId"
New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
Write-Host "[INICIO] Run ID: $RunId  |  Proyectos: $($ProjectKeys -join ', ')"
Write-Host "[DIR]    $runRoot"
Write-Host ""

$failedProjects = @()

foreach ($projectKey in $ProjectKeys) {

  $effectiveProjectKey = Resolve-SonarProjectKey -BaseUrl $SonarHostUrl -Headers $sonarHeaders -RequestedKey $projectKey
  if ($effectiveProjectKey -ne $projectKey) {
    Write-Host "[MAP] Key solicitada '$projectKey' resuelta como '$effectiveProjectKey' en esta instancia Sonar."
  }

  $projectDir = Join-Path $runRoot $projectKey
  New-Item -ItemType Directory -Path $projectDir -Force | Out-Null

  Write-Host "=========================================="
  Write-Host "[PROYECTO] $projectKey"
  Write-Host "[DIR]      $projectDir"
  Write-Host "=========================================="

  Write-Host "[RUN] Generando reportes resumen (HTML/DOCX) ..."
  & powershell -NoProfile -ExecutionPolicy Bypass `
    -File scripts/security/generar-reporte-sonar-local.ps1 `
    -SonarHostUrl $SonarHostUrl `
    -SonarToken   $SonarToken `
    -ProjectKeys  @($effectiveProjectKey) `
    -OutputDir    $projectDir
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Fallo generar-reporte-sonar-local.ps1 para $projectKey. Se continua con el siguiente proyecto."
    $failedProjects += $projectKey
    Write-Host ""
    continue
  }

  Write-Host "[RUN] Exportando detalle de issues (HTML) ..."
  & powershell -NoProfile -ExecutionPolicy Bypass `
    -File scripts/security/exportar-sonar-issues.ps1 `
    -SonarUrl    $SonarHostUrl `
    -SonarToken  $SonarToken `
    -ProjectKeys @($effectiveProjectKey) `
    -OutputDir   $projectDir
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Fallo exportar-sonar-issues.ps1 para $projectKey. Se continua con el siguiente proyecto."
    $failedProjects += $projectKey
    Write-Host ""
    continue
  }

  Write-Host "[RUN] Generando resumen accionable y plan de remediacion ..."
  & powershell -NoProfile -ExecutionPolicy Bypass `
    -File scripts/security/generar-resumen-sonar-accionable.ps1 `
    -SonarUrl    $SonarHostUrl `
    -SonarToken  $SonarToken `
    -ProjectKey  $effectiveProjectKey `
    -OutputDir   $projectDir
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "No se pudo generar resumen accionable para $projectKey. Se continua con organizacion por idioma."
  }

  # Organizar artefactos por idioma para plantillas reutilizables.
  $esDir = Join-Path $projectDir 'es'
  $enDir = Join-Path $projectDir 'en'
  New-Item -ItemType Directory -Path $esDir -Force | Out-Null
  New-Item -ItemType Directory -Path $enDir -Force | Out-Null

  Get-ChildItem -Path $projectDir -File |
    Where-Object { $_.Name -match '-es\.(docx|html|md|rtf)$' } |
    Move-Item -Destination $esDir -Force

  Get-ChildItem -Path $projectDir -File |
    Where-Object { $_.Name -match '-en\.(docx|html|md|rtf)$' } |
    Move-Item -Destination $enDir -Force

  # Mantener solo entregables finales, sin residuos rtf/md.
  Get-ChildItem -Path $projectDir -Recurse -File |
    Where-Object { $_.Extension -in @('.rtf', '.md') } |
    Remove-Item -Force

  Write-Host "[OK] $projectKey completado."
  Write-Host ""
}

Write-Host "=========================================="
Write-Host "[COMPLETADO] Sonar fechado por proyecto:"
foreach ($projectKey in $ProjectKeys) {
  Write-Host "  - $(Join-Path $runRoot $projectKey)"
}
Write-Host "=========================================="

if (@($failedProjects).Count -gt 0) {
  $uniqueFailed = @($failedProjects | Sort-Object -Unique)
  Write-Warning ("Proyectos con fallas durante la generación: " + ($uniqueFailed -join ', '))
  exit 1
}

exit 0
