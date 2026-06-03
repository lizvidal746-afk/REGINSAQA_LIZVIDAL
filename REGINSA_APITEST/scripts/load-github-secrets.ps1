<#
.SYNOPSIS
    Script para cargar secretos de GitHub desde un archivo .env

.DESCRIPTION
    Lee un archivo .env, ignora comentarios y líneas vacías, y ejecuta
    gh secret set para cargar masivamente los secretos al repositorio actual.
    Maneja correctamente valores con caracteres especiales (=, @, /).

.PARAMETER EnvFile
    Ruta al archivo .env a procesar. Por defecto: playwright_api/.env

.PARAMETER DryRun
    Si se especifica, muestra los comandos que se ejecutarán sin ejecutarlos

.EXAMPLE
    .\load-github-secrets.ps1
    Ejecuta el script con el archivo .env por defecto

.EXAMPLE
    .\load-github-secrets.ps1 -EnvFile "custom.env"
    Ejecuta el script con un archivo .env personalizado

.EXAMPLE
    .\load-github-secrets.ps1 -DryRun
    Muestra los comandos sin ejecutarlos
#>

param(
    [string]$EnvFile = "playwright_api\.env",
    [switch]$DryRun
)

# Colores para output
$ColorSuccess = "Green"
$ColorWarning = "Yellow"
$ColorError = "Red"
$ColorInfo = "Cyan"

# Verificar que gh CLI está instalado
Write-Host "Verificando GitHub CLI..." -ForegroundColor $ColorInfo
try {
    $ghVersion = gh version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ GitHub CLI instalado: $($ghVersion[0])" -ForegroundColor $ColorSuccess
    } else {
        throw "GitHub CLI no encontrado"
    }
} catch {
    Write-Host "✗ Error: GitHub CLI no está instalado. Instálalo desde https://cli.github.com/" -ForegroundColor $ColorError
    exit 1
}

# Verificar que estamos en un repositorio git
Write-Host "Verificando repositorio git..." -ForegroundColor $ColorInfo
try {
    $gitRemote = git remote get-url origin 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Repositorio git detectado: $gitRemote" -ForegroundColor $ColorSuccess
    } else {
        throw "No es un repositorio git"
    }
} catch {
    Write-Host "✗ Error: No estás en un repositorio git." -ForegroundColor $ColorError
    exit 1
}

# Verificar autenticación con GitHub
Write-Host "Verificando autenticación con GitHub..." -ForegroundColor $ColorInfo
try {
    $ghAuth = gh auth status 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Autenticado con GitHub" -ForegroundColor $ColorSuccess
    } else {
        throw "No autenticado"
    }
} catch {
    Write-Host "✗ Error: No estás autenticado con GitHub. Ejecuta 'gh auth login' primero." -ForegroundColor $ColorError
    exit 1
}

# Verificar que el archivo .env existe
Write-Host "Verificando archivo .env..." -ForegroundColor $ColorInfo
if (-not (Test-Path $EnvFile)) {
    Write-Host "✗ Error: El archivo '$EnvFile' no existe." -ForegroundColor $ColorError
    Write-Host "  Ruta actual: $(Get-Location)" -ForegroundColor $ColorWarning
    exit 1
}

Write-Host "✓ Archivo encontrado: $EnvFile" -ForegroundColor $ColorSuccess

# Leer y procesar el archivo .env
Write-Host "`nProcesando archivo .env..." -ForegroundColor $ColorInfo

$secretsLoaded = 0
$secretsSkipped = 0
$errors = 0

try {
    $lines = Get-Content $EnvFile -Encoding UTF8
    
    foreach ($line in $lines) {
        $trimmedLine = $line.Trim()
        
        # Ignorar líneas vacías
        if ([string]::IsNullOrWhiteSpace($trimmedLine)) {
            continue
        }
        
        # Ignorar comentarios
        if ($trimmedLine.StartsWith('#')) {
            continue
        }
        
        # Parsear KEY=VALUE
        # Manejar casos donde el valor puede contener =
        $firstEqualIndex = $trimmedLine.IndexOf('=')
        
        if ($firstEqualIndex -eq -1) {
            Write-Host "⚠ Línea sin '=': $trimmedLine" -ForegroundColor $ColorWarning
            $secretsSkipped++
            continue
        }
        
        $key = $trimmedLine.Substring(0, $firstEqualIndex).Trim()
        $value = $trimmedLine.Substring($firstEqualIndex + 1).Trim()
        
        # Validar que la key no esté vacía
        if ([string]::IsNullOrWhiteSpace($key)) {
            Write-Host "⚠ Línea con KEY vacía: $trimmedLine" -ForegroundColor $ColorWarning
            $secretsSkipped++
            continue
        }
        
        # Mostrar información del secreto a cargar
        $valueDisplay = if ($value.Length -gt 20) { $value.Substring(0, 20) + "..." } else { $value }
        Write-Host "  Cargando: $key = $valueDisplay" -ForegroundColor $ColorInfo
        
        # Ejecutar gh secret set
        if ($DryRun) {
            Write-Host "    [DRY RUN] gh secret set $key -b '$value'" -ForegroundColor $ColorWarning
            $secretsLoaded++
        } else {
            try {
                $output = gh secret set $key -b $value 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "    ✓ Secret '$key' cargado exitosamente" -ForegroundColor $ColorSuccess
                    $secretsLoaded++
                } else {
                    Write-Host "    ✗ Error al cargar '$key': $output" -ForegroundColor $ColorError
                    $errors++
                }
            } catch {
                Write-Host "    ✗ Error al cargar '$key': $_" -ForegroundColor $ColorError
                $errors++
            }
        }
    }
} catch {
    Write-Host "✗ Error al leer el archivo: $_" -ForegroundColor $ColorError
    exit 1
}

# Resumen
Write-Host "`n" + ("=" * 50) -ForegroundColor $ColorInfo
Write-Host "RESUMEN" -ForegroundColor $ColorInfo
Write-Host ("=" * 50) -ForegroundColor $ColorInfo
Write-Host "Secrets cargados: $secretsLoaded" -ForegroundColor $ColorSuccess
Write-Host "Secrets omitidos: $secretsSkipped" -ForegroundColor $ColorWarning
Write-Host "Errores: $errors" -ForegroundColor $(if ($errors -gt 0) { $ColorError } else { $ColorSuccess })

if ($DryRun) {
    Write-Host "`nModo DRY RUN - No se ejecutaron cambios" -ForegroundColor $ColorWarning
    Write-Host "Para ejecutar realmente, elimina el parámetro -DryRun" -ForegroundColor $ColorWarning
} elseif ($errors -eq 0 -and $secretsLoaded -gt 0) {
    Write-Host "`n✓ Todos los secretos fueron cargados exitosamente" -ForegroundColor $ColorSuccess
} elseif ($errors -gt 0) {
    Write-Host "`n✗ Hubo errores durante la carga de secretos" -ForegroundColor $ColorError
    exit 1
} elseif ($secretsLoaded -eq 0) {
    Write-Host "`n⚠ No se cargaron secretos (archivo vacío o solo comentarios)" -ForegroundColor $ColorWarning
}

exit $errors
