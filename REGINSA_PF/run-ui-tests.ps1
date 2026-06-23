# ============================================================
# REGINSA_PF/run-ui-tests.ps1
# Entrada local simple para ejecutar pruebas funcionales UI.
#
# Ejemplos:
#   powershell -ExecutionPolicy Bypass -File .\run-ui-tests.ps1
#   powershell -ExecutionPolicy Bypass -File .\run-ui-tests.ps1 -Mode smoke-headed
#   powershell -ExecutionPolicy Bypass -File .\run-ui-tests.ps1 -Mode phase1
# ============================================================
param(
    [ValidateSet('list', 'smoke', 'smoke-headed', 'smoke-headed-fast', 'negative-sin-sanciones', 'negative-sin-sanciones-headed', 'phase1', 'phase1-multi', 'phase2', 'reports')]
    [string]$Mode = 'smoke'
)

$ErrorActionPreference = 'Stop'
$uiDir = Join-Path $PSScriptRoot 'playwright_ui'
$script:LastExitCode = 0

if (-not (Test-Path $uiDir)) {
    throw "No se encontro la carpeta playwright_ui en: $uiDir"
}

function Invoke-NpmScript {
    param([string]$ScriptName)

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor DarkCyan
    Write-Host "REGINSA_PF - Pruebas funcionales UI" -ForegroundColor Cyan
    Write-Host "Modo: $Mode | npm run $ScriptName" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor DarkCyan
    Write-Host ""

    Push-Location $uiDir
    try {
        & npm.cmd run $ScriptName
        $script:LastExitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
}

switch ($Mode) {
    'list' {
        Invoke-NpmScript 'pf:list:caso02'
    }
    'smoke' {
        Invoke-NpmScript 'pf:smoke:caso02'
    }
    'smoke-headed' {
        Invoke-NpmScript 'pf:smoke:caso02:headed'
    }
    'smoke-headed-fast' {
        Invoke-NpmScript 'pf:smoke:caso02:headed:reuse-auth'
    }
    'negative-sin-sanciones' {
        Invoke-NpmScript 'pf:negative:caso02:sin-sanciones'
    }
    'negative-sin-sanciones-headed' {
        Invoke-NpmScript 'pf:negative:caso02:sin-sanciones:headed'
    }
    'phase1' {
        Invoke-NpmScript 'pf:phase1:caso02'
    }
    'phase1-multi' {
        Invoke-NpmScript 'pf:phase1:caso02:multi'
    }
    'phase2' {
        Invoke-NpmScript 'pf:phase2:caso02'
    }
    'reports' {
        Push-Location $uiDir
        try {
            & npm.cmd run report:allure:generate
            $allureExit = $LASTEXITCODE
            & npm.cmd run report:playwright:open
            $playwrightExit = $LASTEXITCODE
            & npm.cmd run report:allure:open
            $script:LastExitCode = if ($allureExit -ne 0) { $allureExit } else { $playwrightExit }
        } finally {
            Pop-Location
        }
    }
}

exit $script:LastExitCode
