# scripts/playwright-codegen-caso01.ps1
# ------------------------------------------------------------
# Generates a Playwright test for Caso 01 (Crear Entidad) via codegen.
# ------------------------------------------------------------

param(
    [string]$BaseUrl = "https://reginsaqa.sunedu.gob.pe",
    [string]$OutputDir = "D:/SUNEDU/AUTOMATIZACION/REGINSA/tests/playwright",
    [string]$TestName = "caso01_crear"
)

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Verify npx / node availability
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    Write-Error "npx not found. Please install Node.js and ensure it is in PATH."
    exit 1
}

# Build arguments for Playwright codegen
$npxArgs = @(
    "playwright", "codegen",
    "--output", "$OutputDir/$TestName.spec.ts",
    "--target", "typescript",
    "--save-storage", "$OutputDir/auth.json",
    "$BaseUrl/#/home"
)

Write-Host "Launching Playwright codegen…"
# Execute npx with the arguments array
npx @npxArgs

Write-Host "Recording complete. Test saved to $OutputDir/$TestName.spec.ts"
