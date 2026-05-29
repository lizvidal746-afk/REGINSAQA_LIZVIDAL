# Orquestador completo de seguridad — 19 herramientas
# SAST (5) - SCA (4) - Container (1) - DAST (5: ZAP, Wapiti, Nuclei, Schemathesis, +Nikto opcional standalone)
# Infra (1) - CodeQL (1*) - SonarQube (1*) - Network/Nmap (1*)
# (*) Opcionales: -IncludeCodeQL -IncludeSonar -IncludeNetwork
# Salida fechada: reportes/security/{YYYY-MM-DD_HH-mm}/{categoria}/{herramienta}/
# Genera resumen-ejecutivo.json al finalizar
# Normas: OWASP ASVS 4.0, ISO/IEC 27001, NIST SP 800-115, CVSSv3.1, OWASP Top 10 2021
param(
  [string]$Target          = $env:REGINSA_URL,
  [string]$ProjectDir      = ".",
  [string]$Date            = (Get-Date -Format 'yyyy-MM-dd_HH-mm'),
  [string]$BaseOutput      = "reportes/security",
  [switch]$SkipDast,
  [switch]$SkipInfra,
  # Herramientas opcionales (mas lentas o con requisitos especiales)
  [switch]$IncludeCodeQL,   # CodeQL SAST semantico (~15-30 min/lenguaje, requiere CodeQL CLI nativa en PATH o D:\tools\CodeQL)
  [switch]$IncludeSonar,    # SonarQube (inicia sonarqube-local, corre sonar-scanner, lee API)
  [switch]$IncludeNetwork   # Nmap + Vulners (escaneo de red — solo con autorizacion)
)

$ErrorActionPreference = 'Continue'
Set-StrictMode -Version Latest

$commonFunctions = Join-Path $PSScriptRoot '../common/functions.ps1'
if (Test-Path $commonFunctions) { . $commonFunctions }

function Get-WorkspaceRoot {
  try { [System.IO.Path]::GetFullPath((Get-CurrentWorkspacePath)) }
  catch { [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../')) }
}
$workspacePath = Get-WorkspaceRoot
$dateOutput    = [System.IO.Path]::GetFullPath((Join-Path $workspacePath "$BaseOutput/$Date"))
New-Item -ItemType Directory -Path $dateOutput -Force | Out-Null

$scriptDir  = $PSScriptRoot
$resultados = [System.Collections.Generic.List[PSCustomObject]]::new()
$startTime  = Get-Date

# ── Detectar repos clonados de REGINSA (para SAST: Semgrep, Bearer) ──────────
# Solo se escanea codigo de LA APLICACION REGINSA, no el proyecto de automatizacion.
# SI091_REGINSA_BACKEND es el repo principal (Java/Spring Boot).
# SI091_REGINSA_CONFIG no tiene codigo Java — solo configuracion de entorno, se omite.
# si091reginsabackend es un clon duplicado de SI091_REGINSA_BACKEND — se omite.
$reginsa_repo_dirs = @(
  'SI091_REGINSA_BACKEND',
  'SI091_REGINSA_FRONTEND-1',
  'SI091_REGINSA_ENLINEA'
) | ForEach-Object {
  $fullPath = Join-Path $workspacePath $_
  if (Test-Path $fullPath) { $fullPath }
}

# Si no existe ninguno, fallback al workspace completo (como array)
if (-not $reginsa_repo_dirs -or @($reginsa_repo_dirs).Count -eq 0) {
  Write-Host "  [WARN] No se encontraron repos clonados de REGINSA. Semgrep/Bearer escanearan el workspace completo." -ForegroundColor Yellow
  $sast_dirs = @($workspacePath)
} else {
  $sast_dirs = @($reginsa_repo_dirs)
  Write-Host "  [SAST] $($sast_dirs.Count) repos detectados para Semgrep/Bearer:" -ForegroundColor DarkGray
  $sast_dirs | ForEach-Object { Write-Host "    - $_" -ForegroundColor DarkGray }
}

# ── Cargar .env desde la raiz del workspace (dotenv para PowerShell) ──────
# Los scripts npm usan -NoProfile, por lo que .env NO se carga automaticamente.
# Node/dotenv solo aplica al proceso Node. Aqui lo cargamos manualmente.
$envFile = Join-Path $workspacePath '.env'
if (Test-Path $envFile) {
  Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -match '^\s*([^#\s][^=]*)=(.*)$' } | ForEach-Object {
    $partes = $_ -split '=', 2
    $k = $partes[0].Trim()
    $v = $partes[1].Trim().Trim('"').Trim("'")
    if (-not [string]::IsNullOrWhiteSpace($k)) {
      [System.Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }
  }
  Write-Host "  [.env] Variables cargadas desde $envFile" -ForegroundColor DarkGray
}

# Si $Target no fue pasado explicitamente como parametro, leer del .env ya cargado
if ([string]::IsNullOrWhiteSpace($Target)) {
  $Target = $env:REGINSA_URL
}

# Auto-detectar URL local si aun sigue vacio despues del .env
if ([string]::IsNullOrWhiteSpace($Target)) {
  $candidatos = @(5000, 8080, 8000, 3000, 4200, 7080, 5001)
  foreach ($puerto in $candidatos) {
    try {
      $tcp = [System.Net.Sockets.TcpClient]::new()
      $ia  = $tcp.BeginConnect('127.0.0.1', $puerto, $null, $null)
      $ok  = $ia.AsyncWaitHandle.WaitOne(800)
      $tcp.Close()
      if ($ok) { $Target = "http://localhost:$puerto"; break }
    } catch {
      Write-Verbose "Puerto $puerto no disponible: $_"
    }
  }
  if (-not [string]::IsNullOrWhiteSpace($Target)) {
    Write-Host "  [AUTO] REGINSA_URL detectado en $Target" -ForegroundColor Cyan
  }
}
$hasTarget  = -not [string]::IsNullOrWhiteSpace($Target)

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "  REGINSA Security Suite -- Ejecucion Completa" -ForegroundColor Cyan
Write-Host "  Fecha  : $Date" -ForegroundColor Cyan
Write-Host "  Target : $(if ($hasTarget) { $Target } else { '(no definido -- DAST sera omitido)' })" -ForegroundColor Cyan
Write-Host "  Salida : $dateOutput" -ForegroundColor Cyan
Write-Host "======================================================`n" -ForegroundColor Cyan

function Invoke-SecurityTool {
  param(
    [string]$Name,
    [string]$Category,
    [string]$SubDir,
    [scriptblock]$Block
  )
  $outDir = Join-Path $dateOutput "$Category/$SubDir"
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  $inicio = Get-Date
  $estado = "PASS"
  $errMsg = ""
  Write-Host "`n--- [$Category] $Name ---" -ForegroundColor Cyan
  try {
    & $Block $outDir
  } catch {
    Write-Host "  WARN: $_" -ForegroundColor Yellow
    $estado = "WARN"
    $errMsg = ($_.ToString() -split "`n")[0]
  }
  $dur = [math]::Round(((Get-Date) - $inicio).TotalSeconds)
  $r = [PSCustomObject]@{
    Herramienta = $Name
    Categoria   = $Category
    Estado      = $estado
    Duracion    = "${dur}s"
    Directorio  = $outDir
    Error       = $errMsg
  }
  $resultados.Add($r)
  $color = if ($estado -eq "PASS") { "Green" } else { "Yellow" }
  Write-Host "  [${estado}] ${dur}s  -> $outDir" -ForegroundColor $color
  return $outDir
}

$resultados = [System.Collections.Generic.List[PSCustomObject]]::new()

# ─────────────────────────────────────────────
# 1. OWASP ZAP — llama al script existente en tests/security/zap/

# ══════════════════════════════════════════════════════
# FASE 1: SAST — Analisis estatico de codigo
# ══════════════════════════════════════════════════════
Write-Host "`n=== FASE 1: SAST ===" -ForegroundColor Magenta

Invoke-SecurityTool -Name "Bearer (data-flow + PII)" -Category "sast" -SubDir "bearer" -Block {
  param($outDir)
  $allRuns = [System.Collections.Generic.List[object]]::new()
  foreach ($repo in $sast_dirs) {
    $repoName = Split-Path $repo -Leaf
    $repoOutDir = Join-Path $outDir $repoName
    New-Item -ItemType Directory -Path $repoOutDir -Force | Out-Null
    & "$scriptDir\run-bearer.ps1" -ProjectDir $repo -OutputDir $repoOutDir
    $sarifPath = Join-Path $repoOutDir 'bearer-results.sarif'
    if (Test-Path $sarifPath) {
      $rawContent = Get-Content $sarifPath -Raw
      # Bearer devuelve texto plano (no SARIF) cuando el lenguaje no es soportado -- ignorar
      if ($rawContent.TrimStart().StartsWith('{') -or $rawContent.TrimStart().StartsWith('[')) {
        try {
          $sarif = $rawContent | ConvertFrom-Json
          foreach ($run in $sarif.runs) { $allRuns.Add($run) }
        } catch {
          Write-Verbose "Bearer SARIF de $repoName no es JSON valido, ignorado: $_"
        }
      } else {
        Write-Host "  [Bearer] ${repoName}: lenguaje no soportado (texto plano ignorado)" -ForegroundColor DarkGray
      }
    }
  }
  if ($allRuns.Count -gt 0) {
    $merged = [ordered]@{ '$schema' = 'https://json.schemastore.org/sarif-2.1.0.json'; version = '2.1.0'; runs = @($allRuns) }
    $merged | ConvertTo-Json -Depth 20 | Set-Content -Path (Join-Path $outDir 'bearer-results.sarif') -Encoding UTF8
  }
}

Invoke-SecurityTool -Name "Checkov (IaC: Dockerfile + Actions)" -Category "sast" -SubDir "checkov" -Block {
  param($outDir)
  & "$scriptDir\run-checkov.ps1" -ProjectDir $workspacePath -OutputDir $outDir
}

Invoke-SecurityTool -Name "Semgrep (OWASP Top 10 + TS/JS)" -Category "sast" -SubDir "semgrep" -Block {
  param($outDir)
  & "$scriptDir\run-semgrep.ps1" -ProjectDirs $sast_dirs -OutputDir $outDir
}

Invoke-SecurityTool -Name "Gitleaks (secrets en historial git)" -Category "sast" -SubDir "gitleaks" -Block {
  param($outDir)
  & "$scriptDir\run-gitleaks.ps1" -ProjectDir $workspacePath -OutputDir $outDir
}

Invoke-SecurityTool -Name "TruffleHog v3 (secrets con verificacion activa)" -Category "sast" -SubDir "trufflehog" -Block {
  param($outDir)
  & "$scriptDir\run-trufflehog.ps1" -OutputDir $outDir
}

# ══════════════════════════════════════════════════════
# FASE 2: SCA — Analisis de componentes de terceros
# ══════════════════════════════════════════════════════
Write-Host "`n=== FASE 2: SCA ===" -ForegroundColor Magenta

Invoke-SecurityTool -Name "OWASP Dependency-Check (NVD)" -Category "sca" -SubDir "dependency-check" -Block {
  param($outDir)
  & "$scriptDir\run-dependency-check.ps1" -ProjectDir $workspacePath -OutputDir $outDir
}

Invoke-SecurityTool -Name "OSV-Scanner Google (base mas rapida que NVD)" -Category "sca" -SubDir "osv" -Block {
  param($outDir)
  & "$scriptDir\run-osv.ps1" -ProjectDir $workspacePath -OutputDir $outDir
}

Invoke-SecurityTool -Name "Retire.js (CVE en librerias JS)" -Category "sca" -SubDir "retirejs" -Block {
  param($outDir)
  & "$scriptDir\run-retirejs.ps1" -ProjectDir $workspacePath -OutputDir $outDir
}

Invoke-SecurityTool -Name "Syft + Grype (SBOM CycloneDX + CVE)" -Category "sca" -SubDir "syft-grype" -Block {
  param($outDir)
  & "$scriptDir\run-syft-grype.ps1" -ProjectDir $workspacePath -OutputDir $outDir
}

# ══════════════════════════════════════════════════════
# FASE 3: Container Security
# ══════════════════════════════════════════════════════
Write-Host "`n=== FASE 3: Container ===" -ForegroundColor Magenta

Invoke-SecurityTool -Name "Trivy (filesystem + container CVE + misconfiguracion)" -Category "container" -SubDir "trivy" -Block {
  param($outDir)
  & "$scriptDir\run-trivy.ps1" -ProjectDir $workspacePath -OutputDir $outDir
}

# ══════════════════════════════════════════════════════
# FASE 4: DAST — Pruebas dinamicas (requiere URL activa)
# ══════════════════════════════════════════════════════
Write-Host "`n=== FASE 4: DAST ===" -ForegroundColor Magenta

if (-not $hasTarget -or $SkipDast) {
  $skipMsg = if (-not $hasTarget) { "REGINSA_URL no definido" } else { "-SkipDast indicado" }
  Write-Host "  SKIP DAST: $skipMsg" -ForegroundColor Yellow
  Write-Host "  Para ejecutar DAST: `$env:REGINSA_URL='https://tu-url' ; npm run test:security:all" -ForegroundColor Yellow
  $resultados.Add([PSCustomObject]@{
    Herramienta = "DAST (ZAP, Wapiti, Nuclei, Schemathesis)"
    Categoria   = "dast"
    Estado      = "SKIP"
    Duracion    = "0s"
    Directorio  = ""
    Error       = $skipMsg
  })
} else {
  Invoke-SecurityTool -Name "OWASP ZAP (baseline + translate)" -Category "dast" -SubDir "zap" -Block {
    param($outDir)
    & "$scriptDir\run-owasp-baseline-and-translate.ps1" -Target $Target -OutputDir $outDir
  }

  # NOTA: Nikto eliminado del pipeline regular -- Nuclei lo subsume al ~95%.
  # Si se necesita auditoria especifica de headers HTTP/configs defecto, ejecutar manualmente:
  #   npm run test:security:nikto

  Invoke-SecurityTool -Name "Wapiti (SQLi + XSS + SSRF + XXE)" -Category "dast" -SubDir "wapiti" -Block {
    param($outDir)
    & "$scriptDir\run-wapiti.ps1" -Target $Target -OutputDir $outDir
  }

  Invoke-SecurityTool -Name "Nuclei (5000+ templates CVE + misconfig)" -Category "dast" -SubDir "nuclei" -Block {
    param($outDir)
    & "$scriptDir\run-nuclei.ps1" -Target $Target -OutputDir $outDir
  }

  Invoke-SecurityTool -Name "Schemathesis (API fuzzer OWASP API Top 10)" -Category "dast" -SubDir "schemathesis" -Block {
    param($outDir)
    & "$scriptDir\run-schemathesis.ps1" -Target $Target -OutputDir $outDir
  }
}

# ══════════════════════════════════════════════════════
# FASE 5: Infra — Hardening del sistema
# ══════════════════════════════════════════════════════
Write-Host "`n=== FASE 5: Infra ===" -ForegroundColor Magenta

if (-not $SkipInfra) {
  Invoke-SecurityTool -Name "Lynis (hardening OS + SSH + kernel)" -Category "infra" -SubDir "lynis" -Block {
    param($outDir)
    & "$scriptDir\run-lynis.ps1" -OutputDir $outDir
  }
} else {
  Write-Host "  SKIP Infra: -SkipInfra indicado" -ForegroundColor Yellow
}

# ══════════════════════════════════════════════════════
# FASE 6 (OPCIONAL): CodeQL — Analisis semantico profundo
# Activar con: -IncludeCodeQL
# Tiempo estimado: 15-30 min por lenguaje. Requiere CodeQL CLI nativa.
# Instalacion: descargar de https://github.com/github/codeql-cli-binaries/releases
#              extraer a D:\tools\CodeQL y agregar al PATH.
# ══════════════════════════════════════════════════════
Write-Host "`n=== FASE 6: CodeQL (opcional) ===" -ForegroundColor Magenta

if ($IncludeCodeQL) {
  # Auto-skip si la CLI no esta disponible (evita fallo en pipeline).
  $codeqlCmd = Get-Command codeql -ErrorAction SilentlyContinue
  if (-not $codeqlCmd -and (Test-Path 'D:\tools\CodeQL\codeql.exe')) {
    # Permitir uso aun si no esta en PATH; run-codeql.ps1 hara fallback
    $codeqlCmd = $true
  }

  if ($codeqlCmd) {
    # Backend .NET (C#) — repo SI091_REGINSA_BACKEND
    $backendPath = Join-Path $workspacePath 'SI091_REGINSA_BACKEND'
    if (Test-Path $backendPath) {
      Invoke-SecurityTool -Name "CodeQL csharp (SI091_REGINSA_BACKEND)" -Category "sast" -SubDir "codeql/csharp" -Block {
        param($outDir)
        & "$scriptDir\run-codeql.ps1" -ProjectDir $backendPath -OutputDir $outDir -Language csharp
      }
    } else {
      Write-Host "  SKIP CodeQL csharp: $backendPath no existe" -ForegroundColor DarkGray
    }

    # Frontend Angular/TypeScript — escanea ambos repos en una sola DB
    $frontendRepos = @('SI091_REGINSA_FRONTEND-1', 'SI091_REGINSA_ENLINEA') | ForEach-Object {
      $p = Join-Path $workspacePath $_
      if (Test-Path $p) { $_ }
    }
    foreach ($repoName in $frontendRepos) {
      $repoPath = Join-Path $workspacePath $repoName
      Invoke-SecurityTool -Name "CodeQL javascript ($repoName)" -Category "sast" -SubDir "codeql/$repoName" -Block {
        param($outDir)
        & "$scriptDir\run-codeql.ps1" -ProjectDir $repoPath -OutputDir $outDir -Language javascript
      }
    }
  } else {
    Write-Host "  SKIP CodeQL: CLI no encontrada. Instalar desde https://github.com/github/codeql-cli-binaries/releases (extraer a D:\tools\CodeQL y agregar al PATH)" -ForegroundColor Yellow
    $resultados.Add([PSCustomObject]@{
      Herramienta = "CodeQL (analisis semantico C# + JS/TS)"
      Categoria   = "sast"
      Estado      = "SKIP"
      Duracion    = "0s"
      Directorio  = ""
      Error       = "CodeQL CLI no instalada en PATH ni en D:\tools\CodeQL"
    })
  }
} else {
  Write-Host "  SKIP CodeQL: use -IncludeCodeQL para activar (~15-30 min por lenguaje)" -ForegroundColor DarkGray
  $resultados.Add([PSCustomObject]@{
    Herramienta = "CodeQL (analisis semantico C# + JS/TS)"
    Categoria   = "sast"
    Estado      = "SKIP"
    Duracion    = "0s"
    Directorio  = ""
    Error       = "Omitido -- use -IncludeCodeQL para activar"
  })
}

# ══════════════════════════════════════════════════════
# FASE 7 (OPCIONAL): SonarQube — Calidad y seguridad de codigo
# Activar con: -IncludeSonar
# Requiere: Docker + imagen sonarqube. Inicia sonarqube-local automaticamente.
# Proyectos: si091reginsabackend, si091reginsaenlinea, si091reginsafrontend
# ══════════════════════════════════════════════════════
Write-Host "`n=== FASE 7: SonarQube (opcional) ===" -ForegroundColor Magenta

if ($IncludeSonar) {
  $sonarToken = $env:SONAR_TOKEN
  $sonarUrl   = if ($env:SONAR_HOST_URL) { $env:SONAR_HOST_URL } else { 'http://localhost:9000' }
  if ([string]::IsNullOrWhiteSpace($sonarToken)) {
    Write-Host "  SKIP SonarQube: SONAR_TOKEN no definido en .env" -ForegroundColor Yellow
    $resultados.Add([PSCustomObject]@{
      Herramienta = "SonarQube (calidad + seguridad de codigo)"
      Categoria   = "code-quality"
      Estado      = "SKIP"
      Duracion    = "0s"
      Directorio  = ""
      Error       = "SONAR_TOKEN no encontrado en .env"
    })
  } else {
    Invoke-SecurityTool -Name "SonarQube (calidad + seguridad de codigo)" -Category "code-quality" -SubDir "sonar" -Block {
      param($outDir)
      # Paso 1: detectar contenedor existente (cualquier nombre que contenga 'sonarqube')
      $sqContainerName = (docker ps -a --filter "name=sonarqube" --format "{{.Names}}" 2>$null | Select-Object -First 1)
      $sqRunning       = (docker ps    --filter "name=sonarqube" --format "{{.Names}}" 2>$null | Select-Object -First 1)
      if (-not $sqRunning) {
        if (-not $sqContainerName) {
          throw "No existe ningun contenedor SonarQube. Crear con: docker run -d --name sonarqube-local -p 9000:9000 sonarqube:lts-community"
        }
        Write-Host "  [SonarQube] Iniciando contenedor '$sqContainerName'..." -ForegroundColor Cyan
        docker start $sqContainerName 2>$null | Out-Null
        # Esperar que SonarQube levante (hasta 120 segundos)
        $sqReady = $false
        for ($i = 0; $i -lt 24; $i++) {
          Start-Sleep -Seconds 5
          try {
            $resp = Invoke-RestMethod -Uri "$sonarUrl/api/system/status" -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($resp.status -eq 'UP') { $sqReady = $true; break }
          } catch {
            Write-Verbose "SonarQube aun no responde: $_"
          }
          Write-Host "  [SonarQube] Esperando... ($([int](($i+1)*5))s)" -ForegroundColor DarkGray
        }
        if (-not $sqReady) { throw "SonarQube no levanto en 120 segundos" }
        Write-Host "  [SonarQube] Listo en $sonarUrl" -ForegroundColor Green
      } else {
        Write-Host "  [SonarQube] Contenedor '$sqRunning' ya esta corriendo en $sonarUrl" -ForegroundColor Green
      }
      # Paso 2: Usar el script existente escanear-repos-sonar.ps1 (ya configurado con los proyectos reales)
      & "$scriptDir\escanear-repos-sonar.ps1" -SonarHostUrl $sonarUrl -SonarToken $sonarToken
      # Paso 3: Guardar referencia para extraer-hallazgos
      @{ sonar_url = $sonarUrl; token_configured = $true; proyectos = @('si091reginsafrontend','si091reginsabackend','si091reginsaenlinea') } |
        ConvertTo-Json | Out-File -FilePath (Join-Path $outDir 'sonar-scan-info.json') -Encoding UTF8 -Force
    }
  }
} else {
  Write-Host "  SKIP SonarQube: use -IncludeSonar para activar" -ForegroundColor DarkGray
  $resultados.Add([PSCustomObject]@{
    Herramienta = "SonarQube (calidad + seguridad de codigo)"
    Categoria   = "code-quality"
    Estado      = "SKIP"
    Duracion    = "0s"
    Directorio  = ""
    Error       = "Omitido -- use -IncludeSonar para activar"
  })
}

# ══════════════════════════════════════════════════════
# FASE 8 (OPCIONAL): Network Recon — Descubrimiento de red
# Activar con: -IncludeNetwork
# ADVERTENCIA: Solo ejecutar con autorizacion previa sobre el target.
# Norma: NIST SP 800-115 (Discovery Phase)
# ══════════════════════════════════════════════════════
Write-Host "`n=== FASE 8: Network Recon (opcional) ===" -ForegroundColor Magenta

if ($IncludeNetwork) {
  if (-not $hasTarget) {
    Write-Host "  SKIP Network: REGINSA_URL no definido (requerido para Nmap)" -ForegroundColor Yellow
    $resultados.Add([PSCustomObject]@{
      Herramienta = "Nmap + Vulners NSE (discovery red + CVE)"
      Categoria   = "network"
      Estado      = "SKIP"
      Duracion    = "0s"
      Directorio  = ""
      Error       = "REGINSA_URL no definido"
    })
  } else {
    # Extraer solo el host del target URL
    try { $nmapTarget = ([System.Uri]$Target).Host } catch { $nmapTarget = $Target }
    Invoke-SecurityTool -Name "Nmap + Vulners NSE (discovery red + CVE)" -Category "network" -SubDir "nmap" -Block {
      param($outDir)
      & "$scriptDir\run-nmap-vulners.ps1" -Target $nmapTarget -OutputDir $outDir
    }
  }
} else {
  Write-Host "  SKIP Network: use -IncludeNetwork para activar (requiere autorizacion)" -ForegroundColor DarkGray
  $resultados.Add([PSCustomObject]@{
    Herramienta = "Nmap + Vulners NSE (discovery red + CVE)"
    Categoria   = "network"
    Estado      = "SKIP"
    Duracion    = "0s"
    Directorio  = ""
    Error       = "Omitido -- use -IncludeNetwork para activar"
  })
}

# ══════════════════════════════════════════════════════
# RESUMEN FINAL
# ══════════════════════════════════════════════════════
$totalMinutos = [math]::Round(((Get-Date) - $startTime).TotalMinutes, 1)
$pass = @($resultados | Where-Object { $_.Estado -eq "PASS" }).Count
$warn = @($resultados | Where-Object { $_.Estado -eq "WARN" }).Count
$skip = @($resultados | Where-Object { $_.Estado -eq "SKIP" }).Count

Write-Host "`n======================================================" -ForegroundColor Green
Write-Host "  RESUMEN -- $Date  (${totalMinutos} min)" -ForegroundColor Green
Write-Host "  PASS: $pass   WARN: $warn   SKIP: $skip" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
$resultados | Format-Table Herramienta, Categoria, Estado, Duracion -AutoSize

# Guardar resumen JSON
$resumenPath = Join-Path $dateOutput "resumen-ejecutivo.json"
$resumen = [ordered]@{
  fecha        = $Date
  generadoEn   = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  target       = if ($hasTarget) { $Target } else { $null }
  duracionMin  = $totalMinutos
  totales      = [ordered]@{ pass = $pass; warn = $warn; skip = $skip }
  herramientas = @($resultados | ForEach-Object {
    [ordered]@{
      herramienta = $_.Herramienta
      categoria   = $_.Categoria
      estado      = $_.Estado
      duracion    = $_.Duracion
      directorio  = $_.Directorio
      error       = $_.Error
    }
  })
}
$resumen | ConvertTo-Json -Depth 5 | Out-File -FilePath $resumenPath -Encoding UTF8 -Force
Write-Host "`nResumen JSON: $resumenPath"
Write-Host "Para generar reportes Word/HTML ejecuta:"
Write-Host "  npm run test:security:report -- -Date $Date`n"
