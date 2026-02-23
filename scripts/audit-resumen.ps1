 $ErrorActionPreference = 'Stop'

$prodOnly = $false
if ($args -contains '-ProdOnly' -or $args -contains '--prod-only') {
  $prodOnly = $true
}

$argsAudit = @('--json')
if ($prodOnly) {
  $argsAudit = @('--omit=dev', '--json')
}

$json = npm audit @argsAudit 2>$null
if (-not $json) {
  throw 'No se pudo obtener salida de npm audit.'
}

$audit = $json | ConvertFrom-Json
$vulns = $audit.vulnerabilities

if (-not $vulns) {
  Write-Host 'No se detectaron vulnerabilidades.' -ForegroundColor Green
  exit 0
}

$rows = @()
foreach ($prop in $vulns.PSObject.Properties) {
  $name = $prop.Name
  $v = $prop.Value

  $fix = 'no'
  if ($v.fixAvailable -eq $true) {
    $fix = 'yes'
  } elseif ($v.fixAvailable) {
    $fix = [string]$v.fixAvailable.name
  }

  $rows += [pscustomobject]@{
    package = $name
    severity = [string]$v.severity
    isDirect = [bool]$v.isDirect
    fixAvailable = $fix
  }
}

Write-Host '=== Resumen npm audit ===' -ForegroundColor Cyan
$rows | Group-Object severity | Sort-Object Name | ForEach-Object {
  Write-Host ("{0}: {1}" -f $_.Name, $_.Count)
}

$highCritical = $rows | Where-Object { $_.severity -eq 'high' -or $_.severity -eq 'critical' }
if ($highCritical.Count -gt 0) {
  Write-Host "`n=== High/Critical (${highCritical.Count}) ===" -ForegroundColor Yellow
  $highCritical | Sort-Object severity, package | Format-Table package, severity, isDirect, fixAvailable -AutoSize
}

$reportDir = Join-Path (Get-Location) 'reportes'
if (-not (Test-Path $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir | Out-Null
}

$reportName = 'npm-audit-resumen.json'
if ($prodOnly) {
  $reportName = 'npm-audit-resumen-prod.json'
}

$outFile = Join-Path $reportDir $reportName
$rows | ConvertTo-Json -Depth 4 | Set-Content -Path $outFile -Encoding UTF8
Write-Host "`nReporte guardado en: $outFile" -ForegroundColor Gray
