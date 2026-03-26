function Get-GrafanaSecretsStorePath {
  $repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  return Join-Path $repoRoot 'reportes/.grafana-secrets.json'
}

function Protect-GrafanaSecretValue([string]$plainText) {
  if ([string]::IsNullOrWhiteSpace($plainText)) { return '' }
  $secure = ConvertTo-SecureString -String $plainText -AsPlainText -Force
  return ConvertFrom-SecureString -SecureString $secure
}

function Unprotect-GrafanaSecretValue([string]$cipherText) {
  if ([string]::IsNullOrWhiteSpace($cipherText)) { return '' }
  try {
    $secure = ConvertTo-SecureString -String $cipherText
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
      if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
      }
    }
  }
  catch {
    return ''
  }
}

function Get-StoredGrafanaCloudSecrets {
  $storePath = Get-GrafanaSecretsStorePath
  if (-not (Test-Path $storePath)) {
    return @{ ProjectId = ''; Token = '' }
  }

  try {
    $raw = Get-Content -Path $storePath -Raw -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($raw)) {
      return @{ ProjectId = ''; Token = '' }
    }

    $json = $raw | ConvertFrom-Json -ErrorAction Stop
    $projectCipher = [string]$json.projectIdCipher
    $tokenCipher = [string]$json.tokenCipher

    return @{
      ProjectId = (Unprotect-GrafanaSecretValue $projectCipher)
      Token = (Unprotect-GrafanaSecretValue $tokenCipher)
    }
  }
  catch {
    return @{ ProjectId = ''; Token = '' }
  }
}

function Save-GrafanaCloudSecrets([string]$projectId, [string]$token) {
  if ([string]::IsNullOrWhiteSpace($projectId) -or [string]::IsNullOrWhiteSpace($token)) {
    return $false
  }

  $storePath = Get-GrafanaSecretsStorePath
  $storeDir = Split-Path -Parent $storePath
  if (-not (Test-Path $storeDir)) {
    New-Item -ItemType Directory -Path $storeDir | Out-Null
  }

  $payload = [ordered]@{
    version = 1
    updatedAt = (Get-Date).ToString('s')
    projectIdCipher = Protect-GrafanaSecretValue $projectId
    tokenCipher = Protect-GrafanaSecretValue $token
    note = 'Encrypted with Windows DPAPI for the current user account.'
  }

  $payload | ConvertTo-Json -Depth 4 | Set-Content -Path $storePath -Encoding UTF8
  return $true
}

function Resolve-GrafanaCloudSecrets {
  param(
    [string]$GrafanaProjectId,
    [string]$GrafanaToken,
    [switch]$PersistProvided
  )

  $fromStore = Get-StoredGrafanaCloudSecrets

  $resolvedProject = if (-not [string]::IsNullOrWhiteSpace($GrafanaProjectId)) {
    $GrafanaProjectId
  } elseif (-not [string]::IsNullOrWhiteSpace($fromStore.ProjectId)) {
    $fromStore.ProjectId
  } else {
    ''
  }

  $resolvedToken = if (-not [string]::IsNullOrWhiteSpace($GrafanaToken)) {
    $GrafanaToken
  } elseif (-not [string]::IsNullOrWhiteSpace($fromStore.Token)) {
    $fromStore.Token
  } else {
    ''
  }

  $persisted = $false
  if ($PersistProvided -and ((-not [string]::IsNullOrWhiteSpace($GrafanaProjectId)) -or (-not [string]::IsNullOrWhiteSpace($GrafanaToken)))) {
    $persisted = Save-GrafanaCloudSecrets -projectId $resolvedProject -token $resolvedToken
  }

  return @{
    ProjectId = $resolvedProject
    Token = $resolvedToken
    Persisted = $persisted
  }
}