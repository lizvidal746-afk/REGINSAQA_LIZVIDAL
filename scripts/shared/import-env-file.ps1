param(
  [string]$Path = ''
)

$ErrorActionPreference = 'Stop'

function Resolve-EnvFile([string]$candidate) {
  if (-not [string]::IsNullOrWhiteSpace($candidate)) {
    if (Test-Path $candidate) { return (Resolve-Path $candidate).Path }
    return ''
  }

  $defaultFile = Join-Path (Get-Location) '.env'
  if (Test-Path $defaultFile) { return (Resolve-Path $defaultFile).Path }
  return ''
}

$envFile = Resolve-EnvFile $Path
if ([string]::IsNullOrWhiteSpace($envFile)) {
  return
}

Get-Content -Path $envFile | ForEach-Object {
  $line = [string]$_
  if ([string]::IsNullOrWhiteSpace($line)) { return }
  if ($line.TrimStart().StartsWith('#')) { return }

  $idx = $line.IndexOf('=')
  if ($idx -lt 1) { return }

  $key = $line.Substring(0, $idx).Trim()
  $value = $line.Substring($idx + 1).Trim()

  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  if (-not [string]::IsNullOrWhiteSpace($key)) {
    Set-Item -Path "Env:$key" -Value $value
  }
}
