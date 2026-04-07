<#
.SYNOPSIS
  Agrega o elimina IPs secundarias para pruebas k6 con localAddress.
.DESCRIPTION
  La IP principal (asignada por DHCP, ej. 192.168.28.8) NUNCA se modifica.
  Solo se agregan/eliminan IPs secundarias en el mismo adaptador.
  Al activar, exporta K6_LOCAL_IPS con la lista completa (principal + secundarias).
.PARAMETER Action
  on     = Agregar IPs secundarias
  off    = Eliminar IPs secundarias
  status = Mostrar estado actual
  export = Solo exportar K6_LOCAL_IPS con IPs activas (no requiere admin)
.PARAMETER AdapterName
  Nombre del adaptador de red. Por defecto "Ethernet".
  Usa Get-NetAdapter para ver el nombre exacto.
.PARAMETER IPs
  Lista de IPs secundarias a usar (sobrescribe la lista por defecto).
  Ejemplo: -IPs "192.168.28.50","192.168.28.51"
.PARAMETER PoolSize
  Cuántas IPs del pool por defecto activar (1-10). Por defecto: todas.
.PARAMETER ReservarPrimera
  Reserva la primera IP del pool (.48) para conexión remota (RDP/VPN).
  Con -Action on:  activa TODAS las IPs del pool, pero K6_LOCAL_IPS excluye .48.
  Con -Action off: elimina solo .49-.57; .48 se mantiene ACTIVA en el adaptador.
  Así puedes conectarte a la máquina via .48 incluso cuando el pool está apagado.
.EXAMPLE
  .\k6-ips-toggle.ps1 -Action on
  .\k6-ips-toggle.ps1 -Action on -PoolSize 5
  .\k6-ips-toggle.ps1 -Action on -ReservarPrimera           # .48 para RDP, .49-.57 para k6
  .\k6-ips-toggle.ps1 -Action off
  .\k6-ips-toggle.ps1 -Action off -ReservarPrimera          # mantiene .48 activa
  .\k6-ips-toggle.ps1 -Action status
  .\k6-ips-toggle.ps1 -Action export
  .\k6-ips-toggle.ps1 -Action on -IPs "192.168.28.40","192.168.28.41"
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("on", "off", "status", "export")]
    [string]$Action,

    [string]$AdapterName = "Ethernet",

    [string[]]$IPs,

    [ValidateRange(1, 10)]
    [int]$PoolSize = 0,

    # Reserva la primera IP del pool para conexion remota (RDP/VPN).
    # K6_LOCAL_IPS no la incluye; con -Action off tampoco se elimina.
    [switch]$ReservarPrimera,

    # IP fija para conexion remota (RDP/SSH). Nunca se elimina aunque sea del pool.
    # Por defecto: la IP DHCP detectada automaticamente (recomendado no cambiar).
    # Ejemplo: -RemoteIP '192.168.28.8'
    [string]$RemoteIP = ''
)

# ── Configuración por defecto ──────────────────────────────────
# Pool de 10 IPs secundarias para k6 — asignadas por administrador de red.
# Subred: 192.168.28.0/26 → rango válido: .2 a .62
$DefaultSecondaryIPs = @(
    "192.168.28.48",
    "192.168.28.49",
    "192.168.28.50",
    "192.168.28.51",
    "192.168.28.52",
    "192.168.28.53",
    "192.168.28.54",
    "192.168.28.55",
    "192.168.28.56",
    "192.168.28.57"
)
$PrefixLength = 26   # equivale a 255.255.255.192

# Detectar la IP principal dinámicamente (la que asigna DHCP)
# Es la primera IP del adaptador que NO sea secundaria del pool conocido
$_allCurrentIPs = Get-NetIPAddress -InterfaceAlias $AdapterName -AddressFamily IPv4 -ErrorAction SilentlyContinue
$PrimaryIP = if ($_allCurrentIPs) {
    $candidate = $_allCurrentIPs | Where-Object { $DefaultSecondaryIPs -notcontains $_.IPAddress } | Select-Object -First 1
    if ($candidate) { $candidate.IPAddress } else { $_allCurrentIPs | Select-Object -First 1 -ExpandProperty IPAddress }
} else { $null }

if (-not $PrimaryIP) {
    Write-Host "[ERROR] No se pudo detectar la IP principal del adaptador '$AdapterName'." -ForegroundColor Red
    Write-Host "        Verifica que el adaptador este conectado y tenga IP asignada." -ForegroundColor Yellow
    exit 1
}

# IP de conexion remota: por defecto la DHCP primaria. Nunca se toca.
$RemoteConnectionIP = if (-not [string]::IsNullOrWhiteSpace($RemoteIP)) { $RemoteIP } else { $PrimaryIP }

# Resolver lista final de IPs secundarias
if ($IPs -and $IPs.Count -gt 0) {
    $SecondaryIPs = $IPs
} elseif ($PoolSize -gt 0) {
    $SecondaryIPs = $DefaultSecondaryIPs | Select-Object -First $PoolSize
} else {
    $SecondaryIPs = $DefaultSecondaryIPs
}
# ───────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

# solo on/off requieren admin (modifican la red); status/export solo leen
$needsAdmin = $Action -in @('on', 'off')

if ($needsAdmin) {
    $isAdmin = ([Security.Principal.WindowsPrincipal] `
        [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $isAdmin) {
        Write-Host "`n[ERROR] Este script requiere ejecutar PowerShell como Administrador." -ForegroundColor Red
        Write-Host "        Clic derecho en PowerShell -> 'Ejecutar como administrador'`n" -ForegroundColor Yellow
        exit 1
    }
}

# Verificar que el adaptador existe
$adapter = Get-NetAdapter -Name $AdapterName -ErrorAction SilentlyContinue
if (-not $adapter) {
    Write-Host "`n[ERROR] Adaptador '$AdapterName' no encontrado." -ForegroundColor Red
    Write-Host "Adaptadores disponibles:" -ForegroundColor Yellow
    Get-NetAdapter | Format-Table Name, Status, InterfaceDescription -AutoSize
    exit 1
}

function Get-ActiveK6IPs {
    $currentIPs = Get-NetIPAddress -InterfaceAlias $AdapterName -AddressFamily IPv4 |
        Select-Object IPAddress, PrefixLength
    $activeSecondary = @($currentIPs | Where-Object { $_.IPAddress -ne $PrimaryIP -and $SecondaryIPs -contains $_.IPAddress })
    if ($activeSecondary.Count -gt 0) {
        return @($PrimaryIP) + @($activeSecondary | ForEach-Object { $_.IPAddress })
    }
    return @()
}

function Export-K6LocalIPs {
    $ips = Get-ActiveK6IPs
    if ($ips.Count -gt 0) {
        $csvIPs = $ips -join ','
        $env:K6_LOCAL_IPS = $csvIPs
        Write-Host "[k6-ips] K6_LOCAL_IPS=$csvIPs ($($ips.Count) IPs)" -ForegroundColor Green
    } else {
        Remove-Item Env:K6_LOCAL_IPS -ErrorAction SilentlyContinue
        Write-Host "[k6-ips] Pool apagado - k6 usara solo la IP principal" -ForegroundColor DarkGray
    }
    return $ips
}

function Show-Status {
    Write-Host "`n=== Estado actual del adaptador '$AdapterName' ===" -ForegroundColor Cyan
    Write-Host "  IP REMOTA/PRINCIPAL: $RemoteConnectionIP  <-- usa esta para conectarte remotamente" -ForegroundColor Green
    Write-Host ""
    $currentIPs = Get-NetIPAddress -InterfaceAlias $AdapterName -AddressFamily IPv4 |
        Select-Object IPAddress, PrefixLength
    foreach ($ip in $currentIPs) {
        $label = if ($ip.IPAddress -eq $RemoteConnectionIP) { " (REMOTA/DHCP - nunca se modifica)" }
                 elseif ($ip.IPAddress -eq $PrimaryIP -and $ip.IPAddress -ne $RemoteConnectionIP) { " (PRINCIPAL)" }
                 elseif ($SecondaryIPs -contains $ip.IPAddress) { " (k6 pool)" }
                 else { "" }
        $color = if ($ip.IPAddress -eq $RemoteConnectionIP) { "Green" }
                 elseif ($ip.IPAddress -eq $PrimaryIP) { "Cyan" }
                 elseif ($SecondaryIPs -contains $ip.IPAddress) { "Yellow" }
                 else { "White" }
        Write-Host "  $($ip.IPAddress)/$($ip.PrefixLength)$label" -ForegroundColor $color
    }

    $activeIPs = Get-ActiveK6IPs
    if ($activeIPs.Count -gt 0) {
        $secondaryCount = $activeIPs.Count - 1
        $poolLabel = '(' + $secondaryCount + ' IPs secundarias + principal)'
        Write-Host ("`n  Estado k6 pool: ENCENDIDO " + $poolLabel) -ForegroundColor Yellow
        Write-Host "  K6_LOCAL_IPS:   $($activeIPs -join ',')" -ForegroundColor DarkGray
    } else {
        Write-Host "`n  Estado k6 pool: APAGADO (solo IP principal)" -ForegroundColor DarkGray
    }
    Write-Host ""
}

# Máscara de subred para /26
$SubnetMask = "255.255.255.192"

switch ($Action) {
    "on" {
        # Si -ReservarPrimera, la primera IP se activa en el adaptador pero NO se pasa a k6
        $k6IPs = if ($ReservarPrimera -and $SecondaryIPs.Count -gt 1) {
            $reservada = $SecondaryIPs[0]
            Write-Host "`n[k6-ips] IP RESERVADA para conexion remota: $reservada (no usada por k6)" -ForegroundColor Magenta
            $SecondaryIPs[1..($SecondaryIPs.Count - 1)]
        } else { $SecondaryIPs }

        Write-Host "`n[k6-ips] Agregando $($SecondaryIPs.Count) IPs secundarias (via netsh)..." -ForegroundColor Cyan
        $added = 0
        foreach ($ip in $SecondaryIPs) {
            $exists = Get-NetIPAddress -InterfaceAlias $AdapterName -IPAddress $ip -ErrorAction SilentlyContinue
            if ($exists) {
                Write-Host "  $ip -> ya existe, omitida" -ForegroundColor DarkGray
            } else {
                # Usar netsh: no toca DHCP ni convierte el adaptador a estático
                $result = netsh interface ipv4 add address name="$AdapterName" address=$ip mask=$SubnetMask skipassource=true 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  $ip -> agregada" -ForegroundColor Green
                    $added++
                    Start-Sleep -Seconds 8   # esperar 8s para no disparar port-security del switch
                } else {
                    Write-Host "  $ip -> error: $result" -ForegroundColor Red
                }
            }
        }
        Write-Host "`n[k6-ips] $added IPs agregadas. DHCP e IP principal ($PrimaryIP) no modificados." -ForegroundColor Green

        # Exportar K6_LOCAL_IPS excluyendo la IP reservada si corresponde
        if ($ReservarPrimera -and $k6IPs.Count -gt 0) {
            $csvIPs = @($PrimaryIP) + $k6IPs
            $env:K6_LOCAL_IPS = $csvIPs -join ','
            Write-Host "[k6-ips] K6_LOCAL_IPS=$($env:K6_LOCAL_IPS) ($($csvIPs.Count) IPs - .48 reservada, no usada por k6)" -ForegroundColor Green
        } else {
            Export-K6LocalIPs | Out-Null
        }
        Show-Status
    }

    "off" {
        Write-Host "`n[k6-ips] Eliminando IPs secundarias de k6 (via netsh)..." -ForegroundColor Cyan
        $removed = 0
        # Si -ReservarPrimera, no eliminar la primera IP del pool (.48)
        $ipReservada = if ($ReservarPrimera) { $DefaultSecondaryIPs[0] } else { $null }
        if ($ipReservada) {
            Write-Host "[k6-ips] Manteniendo IP reservada activa: $ipReservada (para conexion remota)" -ForegroundColor Magenta
        }
        $allKnownIPs = $DefaultSecondaryIPs + $SecondaryIPs | Select-Object -Unique
        foreach ($ip in $allKnownIPs) {
            # Nunca eliminar la IP de conexion remota ni la primaria DHCP
            if ($ip -eq $RemoteConnectionIP -or $ip -eq $PrimaryIP) {
                Write-Host "  $ip -> protegida (IP de conexion remota, no se elimina)" -ForegroundColor Green
                continue
            }
            if ($ipReservada -and $ip -eq $ipReservada) {
                Write-Host "  $ip -> conservada (reservada para conexion remota)" -ForegroundColor Magenta
                continue
            }
            $exists = Get-NetIPAddress -InterfaceAlias $AdapterName -IPAddress $ip -ErrorAction SilentlyContinue
            if ($exists) {
                $result = netsh interface ipv4 delete address name="$AdapterName" address=$ip 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  $ip -> eliminada" -ForegroundColor Yellow
                    $removed++
                } else {
                    Write-Host "  $ip -> error al eliminar: $result" -ForegroundColor Red
                }
            }
        }
        Write-Host "`n[k6-ips] $removed IPs eliminadas. DHCP e IP principal ($PrimaryIP) intactos." -ForegroundColor Green
        Remove-Item Env:K6_LOCAL_IPS -ErrorAction SilentlyContinue
        Show-Status
    }

    "status" {
        Show-Status
    }

    "export" {
        Export-K6LocalIPs | Out-Null
    }
}
