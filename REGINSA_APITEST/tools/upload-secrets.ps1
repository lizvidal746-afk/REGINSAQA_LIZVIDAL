# Script para cargar variables del .env a GitHub Secrets usando GitHub CLI (gh)
param (
    [string]$envFilePath = "..\playwright_api\.env"
)

# Verifica si gh CLI está instalado
if (!(Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Error: GitHub CLI ('gh') no está instalado o no está en el PATH." -ForegroundColor Red
    Write-Host "Descárgalo de: https://cli.github.com/"
    exit 1
}

# Verifica si el archivo .env existe
if (!(Test-Path $envFilePath)) {
    Write-Host "❌ Error: No se encontró el archivo $envFilePath" -ForegroundColor Red
    exit 1
}

Write-Host "🚀 Iniciando carga de secretos a GitHub desde $envFilePath..." -ForegroundColor Cyan

# Leer línea por línea
Get-Content $envFilePath | ForEach-Object {
    $line = $_.Trim()
    
    # Ignorar líneas vacías o comentarios
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) {
        return
    }

    # Separar KEY de VALUE por el primer signo '='
    $splitIndex = $line.IndexOf("=")
    if ($splitIndex -gt 0) {
        $key = $line.Substring(0, $splitIndex).Trim()
        $value = $line.Substring($splitIndex + 1).Trim()
        
        # Eliminar comillas dobles o simples alrededor del valor si existen
        if (($value.StartsWith("`"") -and $value.EndsWith("`"")) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        Write-Host "Subiendo secreto: $key..." -NoNewline
        
        # Usar Set-Content temporal para que gh lea el valor exacto y respete caracteres especiales
        $tempFile = [System.IO.Path]::GetTempFileName()
        [System.IO.File]::WriteAllText($tempFile, $value)
        
        gh secret set $key -f $tempFile
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host " OK ✅" -ForegroundColor Green
        } else {
            Write-Host " FAIL ❌" -ForegroundColor Red
        }
        
        Remove-Item $tempFile -Force
    }
}

Write-Host "🎉 Proceso finalizado." -ForegroundColor Cyan
