function Get-GrafanaSecretsStorePath {
  $repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  return Join-Path $repoRoot 'reportes/.grafana-secrets.json'
}

function Protect-GrafanaSecretValue([string]$plainText) {
  if ([string]::IsNullOrWhiteSpace($plainText)) { return '' }
  try {
    $secure = ConvertTo-SecureString -String $plainText -AsPlainText -Force
    return ConvertFrom-SecureString -SecureString $secure
  }
  catch {
    # DPAPI no disponible: fallback a base64 para persistencia local
    return 'b64:' + [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($plainText))
  }
}

function Unprotect-GrafanaSecretValue([string]$cipherText) {
  if ([string]::IsNullOrWhiteSpace($cipherText)) { return '' }
  # Fallback base64 (cuando DPAPI no estuvo disponible al guardar)
  if ($cipherText.StartsWith('b64:')) {
    try {
      return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($cipherText.Substring(4)))
    } catch { return '' }
  }
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
    [switch]$PersistProvided,
    [switch]$Interactive
  )

  $fromStore = Get-StoredGrafanaCloudSecrets

  $resolvedProject = if (-not [string]::IsNullOrWhiteSpace($GrafanaProjectId)) {
    $GrafanaProjectId
  } elseif (-not [string]::IsNullOrWhiteSpace($fromStore.ProjectId)) {
    $fromStore.ProjectId
  } elseif (-not [string]::IsNullOrWhiteSpace($env:K6_CLOUD_PROJECT_ID)) {
    $env:K6_CLOUD_PROJECT_ID
  } else {
    ''
  }

  $resolvedToken = if (-not [string]::IsNullOrWhiteSpace($GrafanaToken)) {
    $GrafanaToken
  } elseif (-not [string]::IsNullOrWhiteSpace($fromStore.Token)) {
    $fromStore.Token
  } elseif (-not [string]::IsNullOrWhiteSpace($env:K6_CLOUD_TOKEN)) {
    $env:K6_CLOUD_TOKEN
  } else {
    ''
  }

  # Prompt interactivo: solo cuando -Interactive y algun valor sigue vacio.
  if ($Interactive) {
    if ([string]::IsNullOrWhiteSpace($resolvedProject) -and [string]::IsNullOrWhiteSpace($resolvedToken)) {
      Write-Host ''
      Write-Host '[Grafana Cloud] Credenciales no encontradas. Ingresalas una vez (se guardan localmente):' -ForegroundColor Yellow
      $resolvedProject = (Read-Host '  Project ID').Trim()
      $resolvedToken   = (Read-Host '  Token      ').Trim()
    } elseif ([string]::IsNullOrWhiteSpace($resolvedProject)) {
      Write-Host '[Grafana Cloud] Project ID no encontrado.' -ForegroundColor Yellow
      $resolvedProject = (Read-Host '  Project ID').Trim()
    } elseif ([string]::IsNullOrWhiteSpace($resolvedToken)) {
      Write-Host '[Grafana Cloud] Token no encontrado.' -ForegroundColor Yellow
      $resolvedToken   = (Read-Host '  Token      ').Trim()
    }
  }

  # Persistir cuando PersistProvided o Interactive completaron valores.
  $persisted = $false
  if ((-not [string]::IsNullOrWhiteSpace($resolvedProject)) -and (-not [string]::IsNullOrWhiteSpace($resolvedToken))) {
    if ($PersistProvided -or $Interactive) {
      $persisted = Save-GrafanaCloudSecrets -projectId $resolvedProject -token $resolvedToken
    }
  }

  return @{
    ProjectId = $resolvedProject
    Token = $resolvedToken
    Persisted = $persisted
  }
}