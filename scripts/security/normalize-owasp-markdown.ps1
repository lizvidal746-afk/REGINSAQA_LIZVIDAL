param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $InputPath)) {
  throw "No existe archivo Markdown a normalizar: $InputPath"
}

$raw = Get-Content -Path $InputPath -Raw
if ([string]::IsNullOrWhiteSpace($raw)) {
  Write-Host "[OWASP-MD] Archivo vacio, sin cambios: $InputPath"
  exit 0
}

# Normaliza EOL para trabajar consistentemente.
$text = $raw -replace "`r`n", "`n"

# Regla controlada: para Markdown crudo de ZAP, se desactivan reglas de formato repetitivas
# que no afectan contenido tecnico (evidencia, severidades, URLs, referencias).
$lintDisable = '<!-- markdownlint-disable MD001 MD012 MD013 MD034 MD060 -->'
if ($text -notmatch '(?m)^<!--\s*markdownlint-disable\s+MD001\s+MD012\s+MD013\s+MD034\s+MD060\s*-->\s*$') {
  $text = $lintDisable + "`n" + $text
}

# MD039: elimina espacios sobrantes dentro de [ label ]( url ) sin alterar URL ni texto tecnico.
$text = [System.Text.RegularExpressions.Regex]::Replace(
  $text,
  '\[(?<label>[^\]\r\n]+?)\]\((?<url>[^)\r\n]+?)\)',
  {
    param($m)
    $label = $m.Groups['label'].Value.Trim()
    $url = $m.Groups['url'].Value.Trim()
    return "[$label]($url)"
  }
)

# MD034: normaliza URLs bare en bloques tecnicos sin cambiar valor.
# Ejemplo: "* URL: https://..." -> "* URL: <https://...>"
$text = [System.Text.RegularExpressions.Regex]::Replace(
  $text,
  '(?m)(^\s*\*\s+URL:\s+)(https?://\S+)(\s*$)',
  '$1<$2>$3'
)

# MD012: colapsa lineas en blanco repetidas.
$text = [System.Text.RegularExpressions.Regex]::Replace($text, "`n{3,}", "`n`n")

$lines = $text -split "`n"
$seenByLevel = @{}
$duplicateCount = 0

for ($i = 0; $i -lt $lines.Length; $i++) {
  $line = $lines[$i]

  # MD001: evita salto h3 -> h5 en salida ZAP, manteniendo semantica del texto.
  if ($line -match '^#####\s+') {
    $line = $line -replace '^#####\s+', '#### '
    $lines[$i] = $line
  }

  if ($line -match '^(#{1,6})\s+(.+?)\s*$') {
    $hashes = $matches[1]
    $title = $matches[2].Trim()
    $level = $hashes.Length
    $key = "$level|$title"

    if ($seenByLevel.ContainsKey($key)) {
      $seenByLevel[$key] = [int]$seenByLevel[$key] + 1
      $occ = $seenByLevel[$key]
      # MD024: hace unico el heading repetido con sufijo controlado y consistente.
      $lines[$i] = "$hashes $title ($occ)"
      $duplicateCount += 1
    }
    else {
      $seenByLevel[$key] = 1
    }
  }
}

$out = ($lines -join "`n") -replace "`n", "`r`n"
Set-Content -Path $InputPath -Value $out -Encoding UTF8
Write-Host "[OWASP-MD] Normalizacion aplicada: $InputPath | headings ajustados=$duplicateCount"
