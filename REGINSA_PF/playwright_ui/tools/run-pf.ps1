# ============================================================
# tools/run-pf.ps1
# Runner funcional Playwright para REGINSA_PF, inspirado en run-k6.ps1.
# Uso:
#   powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 02 -Scenario phase1
#   powershell -ExecutionPolicy Bypass -File tools/run-pf.ps1 -CaseId 02 -Scenario phase2 -Headed
# ============================================================
param(
    [ValidateSet('01', '02', '04')]
    [string]$CaseId = '02',

    [ValidateSet('smoke', 'phase1', 'phase2', 'audit', 'negative')]
    [string]$Scenario = 'phase1',

    [ValidateSet('auto', 'new', 'legacy')]
    [string]$Model = 'auto',

    # Phase1Mode: 'minimo' (1 sanción por registro) o 'multi' (todas las combinaciones)
    [ValidateSet('multi', 'minimo')]
    [string]$Phase1Mode = 'minimo',

    # Case01Mode: stable serializa Entidad/Crear para completar funcional; audit mantiene concurrencia real para evidenciar el hallazgo.
    [ValidateSet('auto', 'stable', 'audit')]
    [string]$Case01Mode = 'auto',

    [int]$RepeatEach = 0,
    [int]$Workers = 0,

    [switch]$Headed,
    [switch]$List,
    [switch]$ReuseAuth,
    [switch]$OpenReports,
    [switch]$NoOpenReports,
    [switch]$SkipReports
)

$ErrorActionPreference = 'Stop'
$rootDir = Resolve-Path (Join-Path $PSScriptRoot '..')
$projectRoot = Resolve-Path (Join-Path $rootDir '..')
$envFile = Join-Path $rootDir '.env'
$reportsDir = Join-Path $rootDir 'reportes'
$tmpDir = Join-Path $rootDir '.tmp'
$pwtestCacheDir = Join-Path $tmpDir 'pwtest-cache'
$authStateFile = Join-Path $rootDir '.auth\user.json'
$sequencePath = Join-Path $reportsDir '.pf-run-sequence.json'

function ConvertTo-PwshSingleQuotedArg {
    param([string]$Value)
    return "'" + ($Value -replace "'", "''") + "'"
}

function Open-ReportCommand {
    param(
        [string]$Title,
        [string]$Command
    )
    Start-Process -FilePath 'powershell' -ArgumentList @(
        '-NoExit',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "Write-Host '$Title' -ForegroundColor Cyan; Set-Location -LiteralPath $(ConvertTo-PwshSingleQuotedArg $rootDir); $Command"
    ) | Out-Null
}

function Assert-PathInsideRoot {
    param([string]$PathToCheck)

    $rootFull = [System.IO.Path]::GetFullPath($projectRoot).TrimEnd('\')
    $targetFull = [System.IO.Path]::GetFullPath($PathToCheck).TrimEnd('\')
    if (-not $targetFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "[run-pf] Ruta fuera de REGINSA_PF bloqueada: $targetFull"
    }
    return $targetFull
}

function Reset-GeneratedDirectory {
    param([string]$DirectoryPath)

    $targetFull = Assert-PathInsideRoot $DirectoryPath
    if (Test-Path -LiteralPath $targetFull) {
        Remove-Item -LiteralPath $targetFull -Recurse -Force
    }
    New-Item -ItemType Directory -Path $targetFull | Out-Null
}

function Copy-DirectoryContents {
    param(
        [string]$SourceDir,
        [string]$TargetDir
    )

    if (-not (Test-Path -LiteralPath $SourceDir)) {
        return
    }
    if (!(Test-Path -LiteralPath $TargetDir)) {
        New-Item -ItemType Directory -Path $TargetDir | Out-Null
    }

    Copy-Item -Path (Join-Path $SourceDir '*') -Destination $TargetDir -Recurse -Force
}

function ConvertTo-AllurePropertyValue {
    param([string]$Value)

    return ($Value -replace '\\', '\\' -replace "`r", '' -replace "`n", '\n' -replace '=', '\=' -replace ':', '\:')
}

function Write-AllureEnvironment {
    param([string]$TargetDir)

    if (!(Test-Path -LiteralPath $TargetDir)) {
        New-Item -ItemType Directory -Path $TargetDir | Out-Null
    }

    $configuredIps = @()
    $configuredUsers = @()
    for ($i = 1; $i -le 50; $i++) {
        $ip = [System.Environment]::GetEnvironmentVariable("REGINSA_IP_$i", 'Process')
        $user = [System.Environment]::GetEnvironmentVariable("REGINSA_USER_$i", 'Process')
        if ($ip) { $configuredIps += "IP_$i=$ip" }
        if ($user) { $configuredUsers += "USER_$i=$user" }
    }

    $baseUrl = [System.Environment]::GetEnvironmentVariable('REGINSA_UI_BASE_URL', 'Process')
    if (-not $baseUrl) { $baseUrl = 'https://reginsaqa.sunedu.gob.pe' }

    $lines = @(
        "Sistema=REGINSA",
        "Suite=REGINSA_PF Playwright UI",
        "Caso=$CaseId - $($caseInfo.Name)",
        "Escenario=$Scenario",
        "Modelo=$selectedModel",
        "Proyecto=$projectName",
        "Spec=$specPath",
        "Headed=$($Headed.IsPresent)",
        "ReuseAuth=$($ReuseAuth.IsPresent)",
        "Workers=$Workers",
        "WorkersLogicos=$logicalWorkers",
        "WorkersFisicos=$playwrightWorkers",
        "RegistrosPorSlot=$RepeatEach",
        "RepeatEachPW=$playwrightRepeatEach",
        "Phase1Mode=$Phase1Mode",
        "Case01Mode=$case01ExecutionMode",
        "RunId=$timestamp",
        "BaseURL=$(ConvertTo-AllurePropertyValue $baseUrl)",
        "IPsConfiguradas=$($configuredIps.Count)",
        "DetalleIPs=$(ConvertTo-AllurePropertyValue ($configuredIps -join ' | '))",
        "UsuariosConfigurados=$($configuredUsers.Count)",
        "DetalleUsuarios=$(ConvertTo-AllurePropertyValue ($configuredUsers -join ' | '))",
        "CriterioGuardado=ID real backend + persistencia; toast UI no aprueba",
        "DefectoCritico=Guardar expediente sin al menos 1 sancion debe ser rechazado"
    )

    Set-Content -LiteralPath (Join-Path $TargetDir 'environment.properties') -Value $lines -Encoding UTF8

    $categories = @'
[
  {
    "name": "Defecto funcional critico",
    "matchedStatuses": ["failed", "broken"],
    "messageRegex": ".*DEFECTO FUNCIONAL.*|.*sin al menos 1 sancion.*|.*No se capturo un ID real.*|.*no aparece.*"
  },
  {
    "name": "Timeout / lentitud de UI",
    "matchedStatuses": ["failed", "broken"],
    "messageRegex": ".*timeout.*|.*Timeout.*|.*exceeded.*"
  },
  {
    "name": "Selector o componente UI inestable",
    "matchedStatuses": ["failed", "broken"],
    "messageRegex": ".*locator.*|.*selector.*|.*visible.*|.*stable.*"
  }
]
'@
    Set-Content -LiteralPath (Join-Path $TargetDir 'categories.json') -Value $categories -Encoding UTF8
}

# ── Crear directorios necesarios ──────────────────────────────────────────────
if (!(Test-Path $reportsDir)) {
    New-Item -ItemType Directory -Path $reportsDir | Out-Null
}
if (!(Test-Path $tmpDir)) {
    New-Item -ItemType Directory -Path $tmpDir | Out-Null
}

# ── Cargar .env local de playwright_ui al proceso ────────────────────────────
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
            $idx = $line.IndexOf('=')
            $name = $line.Substring(0, $idx).Trim()
            $value = $line.Substring($idx + 1).Trim()
            if ($value -match '^".*"$' -or $value -match "^'.*'$") {
                $value = $value.Substring(1, $value.Length - 2)
            }
            [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

# ── Mapa de casos soportados ─────────────────────────────────────────────────
$caseMap = @{
    '01' = @{
        NewSpec = 'tests/administrados.e2e.spec.ts'
        NewSpecPhase1 = 'tests/administrados.e2e.spec.ts'
        NewSpecPhase2 = 'tests/administrados.e2e.spec.ts'
        NewSpecNegative = 'tests/administrados-negative.e2e.spec.ts'
        LegacySpec = 'tests/legacy_tests/01-agregar-administrado.spec.ts'
        TestCaseId = 'CP-REG-01'
        Name = 'Agregar Administrado'
    }
    '02' = @{
        NewSpec = 'tests/sanciones.e2e.spec.ts'
        NewSpecPhase1 = 'tests/sanciones-phase1.e2e.spec.ts'
        NewSpecPhase2 = 'tests/sanciones-phase2.e2e.spec.ts'
        NewSpecNegative = 'tests/sanciones-negative.e2e.spec.ts'
        LegacySpec = 'tests/legacy_tests/02-registrar-sancion.spec.ts'
        TestCaseId = 'CP-REG-02'
        Name = 'Registrar Sancion'
    }
    '04' = @{
        NewSpec = 'tests/reconsideracion.e2e.spec.ts'
        NewSpecPhase1 = 'tests/reconsideracion.e2e.spec.ts'
        NewSpecPhase2 = 'tests/reconsideracion.e2e.spec.ts'
        NewSpecNegative = 'tests/reconsideracion-negative.e2e.spec.ts'
        LegacySpec = 'tests/legacy_tests/04-reconsiderar-con-sanciones.spec.ts'
        TestCaseId = 'CP-REG-04'
        Name = 'Reconsiderar con Sanciones'
    }
}

# ── Repeticiones por defecto según escenario ──────────────────────────────────
if ($RepeatEach -le 0) {
    if ($Scenario -eq 'phase2') { $RepeatEach = 4 }
    else { $RepeatEach = 1 }
}

# ── Auto-escalado de workers según usuarios declarados en .env ────────────────
if ($Workers -le 0) {
    if ($Scenario -eq 'smoke' -or $Scenario -eq 'negative') {
        $Workers = 1
    } else {
        $userCount = 0
        for ($i = 1; $i -le 50; $i++) {
            $u = [System.Environment]::GetEnvironmentVariable("REGINSA_USER_$i", 'Process')
            if ($u) { $userCount++ } else { break }
        }
        $Workers = if ($userCount -gt 0) { $userCount } else { 9 }
        Write-Host "[run-pf] Workers calculados dinamicamente: $Workers (usuarios declarados: $userCount)" -ForegroundColor DarkCyan
    }
}

# ── Advertencia si hay menos IPs que workers ──────────────────────────────────
$ipCount = 0
for ($i = 1; $i -le 50; $i++) {
    if ([System.Environment]::GetEnvironmentVariable("REGINSA_IP_$i", 'Process')) { $ipCount++ } else { break }
}
if ($ipCount -gt 0 -and $Workers -gt $ipCount) {
    Write-Warning "[run-pf] ALERTA: Hay menos IPs configuradas ($ipCount) que Workers activos ($Workers). Algunos workers compartiran la IP del host."
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$runSeed = Get-Date -Format "yyyyMMddHHmmssfff"
$caseInfo = $caseMap[$CaseId]
$selectedModel = $Model
if ($selectedModel -eq 'auto') {
    $selectedModel = if ($caseInfo.NewSpec) { 'new' } else { 'legacy' }
}
if ($selectedModel -eq 'new' -and -not $caseInfo.NewSpec) {
    Write-Warning "[run-pf] Caso $CaseId aun no tiene spec en modelo nuevo. Se usara legacy como fallback temporal."
    $selectedModel = 'legacy'
}
$specPath = if ($selectedModel -eq 'new') {
    # Seleccionar spec dedicado por fase cuando exista
    if ($Scenario -eq 'negative' -and $caseInfo.NewSpecNegative) {
        $caseInfo.NewSpecNegative
    } elseif ($Scenario -eq 'phase1' -and $caseInfo.NewSpecPhase1) {
        $caseInfo.NewSpecPhase1
    } elseif ($Scenario -eq 'phase2' -and $caseInfo.NewSpecPhase2) {
        $caseInfo.NewSpecPhase2
    } else {
        $caseInfo.NewSpec
    }
} else { $caseInfo.LegacySpec }
$projectName = if ($selectedModel -eq 'new') { 'ui-regression' } else { 'ui-legacy' }

if ($selectedModel -eq 'legacy' -and $CaseId -ne '02') {
    Write-Host ""
    Write-Host "[run-pf] Caso $CaseId - $($caseInfo.Name) no esta listo para ejecutarse en REGINSA_PF." -ForegroundColor Yellow
    Write-Host "[run-pf] Motivo: el legacy existente de este caso no es compatible con la nueva estructura funcional." -ForegroundColor Yellow
    Write-Host "[run-pf] Accion recomendada: migrar el flujo a un spec nuevo con POM dentro de REGINSA_PF/playwright_ui." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$resolvedSpecPath = Join-Path $rootDir $specPath
if (-not $specPath -or -not (Test-Path -LiteralPath $resolvedSpecPath)) {
    Write-Host ""
    Write-Host "[run-pf] Caso $CaseId - $($caseInfo.Name) no esta listo para ejecutarse en REGINSA_PF." -ForegroundColor Yellow
    Write-Host "[run-pf] Spec esperado: $specPath" -ForegroundColor Yellow
    Write-Host "[run-pf] Motivo: no existe spec nuevo ni legacy disponible en la carpeta playwright_ui." -ForegroundColor Yellow
    Write-Host "[run-pf] Accion recomendada: implementar primero el POM/spec funcional dentro de REGINSA_PF y actualizar el plan." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# El legacy de Caso 02 ya define 9 tests [slot N]. El modelo nuevo y los legacy 01/04
# usan un test base, por eso se multiplica repeat-each para conservar registros por slot.
$playwrightRepeatEach = if ($CaseId -eq '02' -and $selectedModel -eq 'legacy') { $RepeatEach } else { $RepeatEach * $Workers }
$forcedSequence = 0
if ($env:REGINSA_PF_PREFIX_SEQUENCE) {
    [void][int]::TryParse($env:REGINSA_PF_PREFIX_SEQUENCE, [ref]$forcedSequence)
}
$lastSequence = 0
if (Test-Path -LiteralPath $sequencePath) {
    try {
        $sequenceJson = Get-Content -Raw -Path $sequencePath | ConvertFrom-Json
        $lastSequence = [int]$sequenceJson.last
    } catch {
        $lastSequence = 0
    }
}
$pfRunSequence = if ($forcedSequence -gt 0) { $forcedSequence } else { $lastSequence + 1 }
$pfRunLabel = "PF {0:D2}" -f $pfRunSequence
$pfRunSlug = "PF-{0:D2}" -f $pfRunSequence
$runDirName = "$($caseInfo.TestCaseId)_PF_$Scenario`_RUN_$timestamp"
$runDir = Join-Path $reportsDir $runDirName
$technicalDir = Join-Path $runDir '_technical'
$playwrightOutputDir = Join-Path $technicalDir 'test-results'
$playwrightReportDir = Join-Path $technicalDir 'playwright-report'
$playwrightJson = Join-Path $playwrightReportDir 'results.json'
$pfReportJson = Join-Path $playwrightReportDir 'pf-report.json'
$allureResultsDir = Join-Path $technicalDir 'allure-results'
$allureReportDir = Join-Path $technicalDir 'allure-report'

$case01ExecutionMode = 'N/A'
if ($CaseId -eq '01' -and $Scenario -eq 'phase2') {
    $case01ExecutionMode = if ($Case01Mode -eq 'auto') { 'stable' } else { $Case01Mode }
}

$logicalWorkers = $Workers
$playwrightWorkers = $Workers
if ($case01ExecutionMode -eq 'stable') {
    # CP01/Entidad/Crear evidencia fallas de red con concurrencia real. En modo funcional estable
    # se conserva el reparto usuario/IP por slot, pero se ejecuta un navegador a la vez.
    $playwrightWorkers = 1
}

[System.Environment]::SetEnvironmentVariable('SCENARIO', $Scenario, 'Process')
[System.Environment]::SetEnvironmentVariable('TEST_CASE_ID', $caseInfo.TestCaseId, 'Process')
[System.Environment]::SetEnvironmentVariable('TEST_RUN_ID', $timestamp, 'Process')
[System.Environment]::SetEnvironmentVariable('TEST_RUN_SEED', $runSeed, 'Process')
[System.Environment]::SetEnvironmentVariable('REGINSA_FUNC_RUN_ID', $timestamp, 'Process')
[System.Environment]::SetEnvironmentVariable('REGINSA_FUNC_RUN_SEED', $runSeed, 'Process')
[System.Environment]::SetEnvironmentVariable('REGINSA_PF_RUN_SEQUENCE', [string]$pfRunSequence, 'Process')
[System.Environment]::SetEnvironmentVariable('REGINSA_PF_RUN_LABEL', $pfRunLabel, 'Process')
[System.Environment]::SetEnvironmentVariable('REGINSA_PF_RUN_SLUG', $pfRunSlug, 'Process')
[System.Environment]::SetEnvironmentVariable('REGINSA_REPEAT_EACH', [string]$RepeatEach, 'Process')
[System.Environment]::SetEnvironmentVariable('PLAYWRIGHT_REPEAT_EACH', [string]$playwrightRepeatEach, 'Process')
[System.Environment]::SetEnvironmentVariable('PLAYWRIGHT_WORKERS', [string]$playwrightWorkers, 'Process')
[System.Environment]::SetEnvironmentVariable('REGINSA_LOGICAL_WORKERS', [string]$logicalWorkers, 'Process')
[System.Environment]::SetEnvironmentVariable('REGINSA_PHYSICAL_WORKERS', [string]$playwrightWorkers, 'Process')
[System.Environment]::SetEnvironmentVariable('REGINSA_AUTH_SLOTS', [string]$logicalWorkers, 'Process')
[System.Environment]::SetEnvironmentVariable('REGINSA_EXECUTION_MODE', 'fast', 'Process')
[System.Environment]::SetEnvironmentVariable('SKIP_SCREENSHOTS', '1', 'Process')
[System.Environment]::SetEnvironmentVariable('REGINSA_SCALE_MODE', $(if ($logicalWorkers -gt 1 -or $RepeatEach -gt 1) { '1' } else { '0' }), 'Process')
if ($case01ExecutionMode -eq 'stable') {
    [System.Environment]::SetEnvironmentVariable('REGINSA_ADMIN_SERIALIZE_SAVE', '1', 'Process')
} elseif ($case01ExecutionMode -eq 'audit') {
    [System.Environment]::SetEnvironmentVariable('REGINSA_ADMIN_SERIALIZE_SAVE', '0', 'Process')
}
[System.Environment]::SetEnvironmentVariable('TEMP', $tmpDir, 'Process')
[System.Environment]::SetEnvironmentVariable('TMP', $tmpDir, 'Process')
[System.Environment]::SetEnvironmentVariable('PWTEST_CACHE_DIR', $pwtestCacheDir, 'Process')
[System.Environment]::SetEnvironmentVariable('REGINSA_PLAYWRIGHT_REPORT_DIR', $playwrightReportDir, 'Process')
[System.Environment]::SetEnvironmentVariable('REGINSA_ALLURE_RESULTS_DIR', $allureResultsDir, 'Process')
# Modo de Phase 1 (multi = todas las combinaciones | minimo = 1 sanción aleatoria)
[System.Environment]::SetEnvironmentVariable('PHASE1_MODE', $Phase1Mode, 'Process')

[ordered]@{
    last = $pfRunSequence
    label = $pfRunLabel
    slug = $pfRunSlug
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json | Set-Content -Path $sequencePath -Encoding UTF8

Write-Host ""
Write-Host "============================================================" -ForegroundColor DarkCyan
Write-Host "REGINSA_PF Playwright Runner" -ForegroundColor Cyan
Write-Host "Caso      : $CaseId - $($caseInfo.Name)" -ForegroundColor Green
Write-Host "Modelo    : $selectedModel | Proyecto=$projectName" -ForegroundColor Green
Write-Host "Escenario : $Scenario | WorkersLogicos=$logicalWorkers | WorkersFisicos=$playwrightWorkers | RegistrosPorSlot=$RepeatEach | RepeatEachPW=$playwrightRepeatEach" -ForegroundColor Green
Write-Host "Prefijo   : $pfRunLabel" -ForegroundColor Green
Write-Host "Modo      : headless rapido por defecto; use -Headed para ver navegador" -ForegroundColor Green
if ($case01ExecutionMode -ne 'N/A') {
    Write-Host "Case01Mode: $case01ExecutionMode" -ForegroundColor Green
}
if ($ReuseAuth) {
    Write-Host "Auth      : reutilizar storageState existente; se omite setup si .auth/user.json existe" -ForegroundColor Green
}
Write-Host "Spec      : $specPath" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor DarkCyan
Write-Host ""

$playwrightArgs = @('playwright', 'test', $specPath, "--project=$projectName", "--workers=$playwrightWorkers", "--output=$playwrightOutputDir")
if ($Scenario -eq 'smoke') {
    $playwrightArgs += '--retries=0'
}
if ($List) {
    $playwrightArgs += '--list'
    $playwrightArgs += '--no-deps'
    $playwrightArgs += '--reporter=list'
} else {
    $playwrightArgs += "--repeat-each=$playwrightRepeatEach"
}
if ($ReuseAuth -and (Test-Path $authStateFile)) {
    $playwrightArgs += '--no-deps'
} elseif ($ReuseAuth) {
    Write-Warning "[run-pf] Se solicito -ReuseAuth, pero no existe $authStateFile. Se ejecutara setup de autenticacion."
}
if ($Headed) {
    $playwrightArgs += '--headed'
}

if (-not $List) {
    Write-Host "[run-pf] Limpiando Allure antes de la corrida..." -ForegroundColor Cyan
    if (!(Test-Path $technicalDir)) {
        New-Item -ItemType Directory -Path $technicalDir -Force | Out-Null
    }
    Reset-GeneratedDirectory $allureResultsDir
    Reset-GeneratedDirectory $allureReportDir
}

Push-Location $rootDir
try {
    & npx @playwrightArgs
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($List) {
    exit $exitCode
}

if (!(Test-Path $runDir)) {
    New-Item -ItemType Directory -Path $runDir | Out-Null
}

if (-not (Test-Path $playwrightJson)) {
    Write-Warning "[run-pf] No se encontro results.json en $playwrightJson. Se omite generacion HTML/Excel/Word."
    exit $exitCode
}

if (-not $SkipReports) {
    Write-Host ""
    Write-Host "[run-pf] Generando reportes funcionales HTML, Excel y Word..." -ForegroundColor Cyan
    Push-Location $rootDir
    try {
        & node tools/validate-dual-view.js $playwrightJson
        if ($LASTEXITCODE -ne 0) { Write-Warning "[run-pf] pf-report.json no generado correctamente." }
        if (-not (Test-Path $pfReportJson)) { throw "[run-pf] No se encontro pf-report.json en $pfReportJson. No se puede generar HTML enriquecido." }
        & node tools/generar-html.js $pfReportJson $runDir
        if ($LASTEXITCODE -ne 0) { Write-Warning "[run-pf] Reporte HTML no generado correctamente." }
        & node tools/generar-excel.js $playwrightJson $runDir
        if ($LASTEXITCODE -ne 0) { Write-Warning "[run-pf] Reporte Excel no generado correctamente." }
        & node tools/generar-word.js $playwrightJson $runDir
        if ($LASTEXITCODE -ne 0) { Write-Warning "[run-pf] Reporte Word no generado correctamente." }
    } finally {
        Pop-Location
    }

    $allureResults = $allureResultsDir
    $allureReport = $allureReportDir
    if (Test-Path $allureResults) {
        Write-AllureEnvironment $allureResults
        $previousAllureHistory = Join-Path $allureReport 'history'
        $currentAllureHistory = Join-Path $allureResults 'history'
        if (Test-Path -LiteralPath $previousAllureHistory) {
            Write-Host "[run-pf] Preservando history de Allure para graficos trend/retries..." -ForegroundColor Cyan
            Copy-DirectoryContents -SourceDir $previousAllureHistory -TargetDir $currentAllureHistory
        }
        Write-Host "[run-pf] Generando reporte Allure HTML..." -ForegroundColor Cyan
        Push-Location $rootDir
        try {
            & npx allure generate $allureResults --clean -o $allureReport
            if ($LASTEXITCODE -ne 0) { Write-Warning "[run-pf] Reporte Allure no generado correctamente." }
        } finally {
            Pop-Location
        }
    } else {
        Write-Warning "[run-pf] No se encontro allure-results. Se omite reporte Allure HTML."
    }
}

Write-Host ""
Write-Host "RESULTADOS ORGANIZADOS EN:" -ForegroundColor Cyan
Write-Host $runDir -ForegroundColor Green
Write-Host ""
Write-Host "Reportes tecnicos Playwright:" -ForegroundColor Cyan
Write-Host $playwrightReportDir -ForegroundColor Green
Write-Host "Resultados tecnicos Allure:" -ForegroundColor Cyan
Write-Host $allureResultsDir -ForegroundColor Green
Write-Host "Reporte tecnico Allure HTML:" -ForegroundColor Cyan
Write-Host $allureReportDir -ForegroundColor Green
Write-Host "Carpetas vigentes por corrida: playwright_ui\reportes\<RUN_ID>\ y playwright_ui\reportes\<RUN_ID>\_technical\." -ForegroundColor Cyan
Write-Host "Carpetas fuera de ejecuciones orquestadas: REGINSA_PF\allure-report, REGINSA_PF\playwright-report, REGINSA_PF\playwright-ui-report y REGINSA_PF\reportes." -ForegroundColor Yellow
Write-Host ""

if (-not $SkipReports -and -not $NoOpenReports) {
    $functionalHtml = Get-ChildItem -Path $runDir -Filter '*.html' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($functionalHtml) {
        Write-Host "[run-pf] Abriendo reporte funcional HTML: $($functionalHtml.FullName)" -ForegroundColor Cyan
        Start-Process -FilePath $functionalHtml.FullName
    } else {
        Write-Warning "[run-pf] No se encontro reporte funcional HTML para abrir."
    }

    $playwrightHtmlIndex = Join-Path $playwrightReportDir 'index.html'
    if (Test-Path $playwrightHtmlIndex) {
        Write-Host "[run-pf] Abriendo reporte tecnico Playwright HTML: $playwrightHtmlIndex" -ForegroundColor Cyan
        Start-Process -FilePath $playwrightHtmlIndex
    } else {
        Write-Warning "[run-pf] No se encontro reporte Playwright HTML para abrir."
    }

    $allureHtmlIndex = Join-Path $allureReportDir 'index.html'
    if (Test-Path $allureHtmlIndex) {
        Write-Host "[run-pf] Abriendo reporte tecnico Allure HTML via servidor local: $allureReportDir" -ForegroundColor Cyan
        $allureReportArg = ConvertTo-PwshSingleQuotedArg $allureReportDir
        Open-ReportCommand -Title 'Abriendo Allure Report...' -Command "npx allure open $allureReportArg"
    } else {
        Write-Warning "[run-pf] No se encontro reporte Allure HTML para abrir."
    }
} elseif ($NoOpenReports) {
    Write-Host "[run-pf] Reportes no abiertos (se uso -NoOpenReports)." -ForegroundColor Cyan
}

exit $exitCode
