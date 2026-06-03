// scripts/codegen-caso01.ps1
# ---------------------------------------------------------------
# Script: codegen-caso01.ps1
# Description: Generates the K6 test for Caso 01 (Crear Entidad) using
#              k6-codegen from an OpenAPI / Swagger specification.
# ---------------------------------------------------------------

param(
    [Parameter(Mandatory=$true,HelpMessage="Path to the OpenAPI/Swagger JSON or YAML file.")]
    [string] $SpecPath,

    [Parameter(Mandatory=$false,HelpMessage="Output directory for the generated test file.")]
    [string] $OutDir = "D:/SUNEDU/AUTOMATIZACION/REGINSA/tests/performance/k6",

    [Parameter(Mandatory=$false,HelpMessage="Name of the generated test file (without extension).")]
    [string] $TestName = "k6_caso_01_generated"
)

# Ensure the specification file exists
if (-not (Test-Path $SpecPath)) {
    Write-Error "Spec file not found: $SpecPath"
    exit 1
}

# Resolve full paths (PowerShell uses \; we convert for npm compatibility)
$specFull = (Resolve-Path $SpecPath).Path -replace "\\", "/"
$outFull  = (Resolve-Path $OutDir).Path -replace "\\", "/"

# Create output directory if it does not exist
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

# Install k6-codegen locally (fast, no global install)
Write-Host "Installing k6-codegen (npm) …"
# –quiet suppresses npm's progress bars for cleaner logs
npm i -g k6-codegen --silent

# Build the command line for k6-codegen
# We generate a single test named after the operationId "crearEntidad"
$cmd = "k6-codegen openapi --input $specFull --output $outFull/$TestName.js --single-test crearEntidad"

Write-Host "Running: $cmd"
# Execute the command; capture any error
$process = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $cmd" -NoNewWindow -Wait -PassThru
if ($process.ExitCode -ne 0) {
    Write-Error "k6-codegen failed with exit code $($process.ExitCode)"
    exit $process.ExitCode
}

Write-Host "Generated K6 test saved to: $outFull/$TestName.js"

# Optional: display a short preview of the generated file (first 20 lines)
Get-Content "$outFull/$TestName.js" -TotalCount 20 | ForEach-Object { Write-Host $_ }

# End of script
