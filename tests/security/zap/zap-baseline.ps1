param(
  [string]$Target = $env:REGINSA_URL,
  [string]$OutputDir = "reportes/security",
  [switch]$FailOnWarn
)

if ([string]::IsNullOrWhiteSpace($Target)) {
  throw "Define REGINSA_URL o pasa -Target para ejecutar ZAP."
}

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$cwd = (Get-Location).Path
# Si OutputDir es ruta absoluta, calcular relativa al cwd para que ZAP la resuelva
# dentro de /zap/wrk/ correctamente. Si ya es relativa, usarla tal cual.
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDir)
if ($resolvedOutput.StartsWith($cwd, [System.StringComparison]::OrdinalIgnoreCase)) {
  $relOutput = $resolvedOutput.Substring($cwd.Length).TrimStart('\', '/')
} else {
  $relOutput = $OutputDir
}
# ZAP corre en contenedor Linux; normalizar a '/' evita rutas invalidas con '\\'.
$outputDirForZap = ($relOutput -replace '\\', '/') -replace '/+$', ''
$reportHtmlRel = "$outputDirForZap/zap-baseline-report.html"
$reportJsonRel = "$outputDirForZap/zap-baseline-report.json"
$reportMdRel   = "$outputDirForZap/zap-baseline-report.md"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker no esta instalado o no esta en PATH. Instala/abre Docker Desktop y reintenta."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker parece no estar disponible (daemon detenido o sin permisos). Inicia Docker Desktop y reintenta."
}

Write-Host "Ejecutando OWASP ZAP baseline contra $Target"

$zapArgs = @(
  'zap-baseline.py',
  '-t', "$Target",
  '-r', "${reportHtmlRel}",
  '-J', "${reportJsonRel}",
  '-w', "${reportMdRel}",
  '-m', '5'
)

# En modo advisory (default) no se falla por WARN; en strict si.
if (-not $FailOnWarn) {
  $zapArgs += '-I'
}

docker run --rm `
  -v "${cwd}:/zap/wrk/:rw" `
  --workdir /zap/wrk `
  ghcr.io/zaproxy/zaproxy:stable `
  @zapArgs

if ($LASTEXITCODE -eq 0) {
  Write-Host "OWASP ZAP baseline finalizado sin fallos bloqueantes."
} elseif ($LASTEXITCODE -eq 2 -and -not $FailOnWarn) {
  Write-Host "OWASP ZAP baseline con WARN detectados (modo advisory)."
} else {
  throw "Fallo OWASP ZAP baseline (exit code $LASTEXITCODE)."
}

# Limpieza automatica del Markdown generado por ZAP para reducir warnings repetitivos de markdownlint.
$normalizeScript = "scripts/security/normalize-owasp-markdown.ps1"
# Pasar ruta absoluta Windows al script de normalizacion (no la ruta Unix relativa de ZAP)
$reportMdAbs = Join-Path $resolvedOutput "zap-baseline-report.md"
if ((Test-Path $normalizeScript) -and (Test-Path $reportMdAbs)) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $normalizeScript -InputPath $reportMdAbs
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo la normalizacion Markdown OWASP para $reportMdAbs"
  }
}
