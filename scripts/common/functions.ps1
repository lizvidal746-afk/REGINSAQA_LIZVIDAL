Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-PathExistence {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [string]$Message
  )

  if (-not (Test-Path -Path $Path)) {
    if ([string]::IsNullOrWhiteSpace($Message)) {
      throw "Ruta no encontrada: $Path"
    }
    throw $Message
  }
}

function New-DirectoryIfMissing {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Assert-DockerAvailable {
  try {
    docker --version | Out-Null
  } catch {
    throw "Docker no esta disponible. Instala Docker antes de ejecutar este script."
  }
}

function Get-CurrentWorkspacePath {
  if ($null -eq $PWD -or [string]::IsNullOrWhiteSpace($PWD.Path)) {
    throw "No se pudo resolver el directorio actual de trabajo."
  }
  return $PWD.Path
}
