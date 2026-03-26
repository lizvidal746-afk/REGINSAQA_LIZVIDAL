param(
  [string]$EnvFile = '.env.k6.local',
  [switch]$Persist,
  [switch]$ShowValues
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path $EnvFile)) {
  throw "No existe $EnvFile. Crea el archivo desde .env.k6.example"
}

$isIgnoredLine = {
  param([string]$line)
  if ($null -eq $line) { return $true }
  $trim = $line.Trim()
  if ($trim.Length -eq 0) { return $true }
  if ($trim.StartsWith('#')) { return $true }
  return $false
}

$parseEnvLine = {
  param([string]$line)
  $parts = $line.Split('=', 2)
  if ($parts.Count -lt 2) { return $null }

  $key = $parts[0].Trim()
  $value = $parts[1].Trim()
  if ([string]::IsNullOrWhiteSpace($key)) { return $null }

  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  return @{ Key = $key; Value = $value }
}

$maskSecret = {
  param([string]$value)
  if ([string]::IsNullOrWhiteSpace($value)) { return '(vacio)' }
  if ($value.Length -le 8) { return '********' }
  return "{0}...{1}" -f $value.Substring(0, 4), $value.Substring($value.Length - 4)
}

$loaded = @()
Get-Content $EnvFile | ForEach-Object {
  if (& $isIgnoredLine $_) { return }
  $entry = & $parseEnvLine $_
  if ($null -eq $entry) { return }

  [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
  if ($Persist) {
    setx $entry.Key $entry.Value | Out-Null
  }

  $loaded += $entry
}

if ($loaded.Count -eq 0) {
  throw "No se cargaron variables desde $EnvFile."
}

Write-Output ("Variables cargadas desde {0}:" -f $EnvFile)
$loaded | ForEach-Object {
  $isSecret = $_.Key -match 'TOKEN|PASS|AUTH|KEY'
  if ($ShowValues -and -not $isSecret) {
    Write-Output ("- {0} = {1}" -f $_.Key, $_.Value)
  }
  elseif ($isSecret) {
    Write-Output ("- {0} = {1}" -f $_.Key, (& $maskSecret $_.Value))
  }
  else {
    Write-Output ("- {0} = (cargado)" -f $_.Key)
  }
}

if ($Persist) {
  Write-Output "Las variables tambien se persistieron con setx. Abre una nueva terminal para verlas fuera de esta sesion."
}
else {
  Write-Output "Variables disponibles en esta terminal actual (scope Process)."
}
