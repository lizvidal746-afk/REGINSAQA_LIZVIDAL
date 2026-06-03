# ============================================================
# tools/setup-ips.ps1
# Agrega las 10 IPs alias 192.168.28.48 -> 192.168.28.57 a la
# interfaz de red. Requiere admin para netsh; si no, se intenta UAC.
#
# Tu IP principal (DHCP), p. ej. 192.168.28.8, NO se toca.
# Las IPs alias permiten round-robin con K6_LOCAL_IPS (util en cable/lab).
# En WiFi suele ser mas estable usar solo la IP DHCP en .env y no este script.
# ============================================================

[CmdletBinding()]
param(
    [switch]$Elevated,
    [string]$InterfaceAlias = "Ethernet",
    [string]$BaseIP         = "192.168.28",
    [int]$StartOctet        = 48,
    [int]$EndOctet          = 57,
    [string]$Mask           = "255.255.255.192"
)

function Test-IsAdministrator {
    $p = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
    if ($Elevated) {
        Write-Host "Sin permisos de administrador (UAC cancelado o denegado)." -ForegroundColor Red
        Write-Host "Abre PowerShell como administrador y ejecuta: $($PSCommandPath)" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "Se necesita administrador para agregar direcciones IPv4. Acepta el aviso UAC de Windows." -ForegroundColor Cyan
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Elevated')
    if ($InterfaceAlias) { $argList += '-InterfaceAlias', $InterfaceAlias }
    try {
        $proc = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList $argList
        exit $(if ($null -ne $proc.ExitCode) { $proc.ExitCode } else { 1 })
    } catch {
        Write-Host "No se pudo elevar: $_" -ForegroundColor Red
        exit 1
    }
}

Write-Host "=== Configuracion de IPs alias para k6 ===" -ForegroundColor Cyan

# Auto-detectar interfaz si no se especifica
if (-not $InterfaceAlias) {
    $iface = Get-NetIPAddress -AddressFamily IPv4 `
        | Where-Object { $_.IPAddress -like "192.168.28.*" -and $_.PrefixOrigin -eq "Dhcp" } `
        | Select-Object -First 1
    if (-not $iface) {
        Write-Host "ERROR: no se detecto interfaz con IP 192.168.28.x DHCP" -ForegroundColor Red
        Write-Host "Pasalo manualmente: .\setup-ips.ps1 -InterfaceAlias 'Ethernet'" -ForegroundColor Yellow
        exit 1
    }
    $InterfaceAlias = $iface.InterfaceAlias
}

Write-Host "Interfaz objetivo: $InterfaceAlias" -ForegroundColor Cyan
Write-Host "Rango          : ${BaseIP}.${StartOctet} -> ${BaseIP}.${EndOctet}" -ForegroundColor Cyan
Write-Host ""

$ok = 0; $skip = 0; $err = 0
for ($i = $StartOctet; $i -le $EndOctet; $i++) {
    $ip = "$BaseIP.$i"
    $existing = Get-NetIPAddress -IPAddress $ip -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "  [SKIP] $ip ya existe" -ForegroundColor Yellow
        $skip++
        continue
    }
    try {
        netsh interface ipv4 add address name="$InterfaceAlias" addr=$ip mask=$Mask | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  [OK]   $ip agregada" -ForegroundColor Green
            $ok++
        } else {
            Write-Host "  [FAIL] $ip (netsh exit $LASTEXITCODE)" -ForegroundColor Red
            $err++
        }
    } catch {
        Write-Host "  [FAIL] ${ip}: $_" -ForegroundColor Red
        $err++
    }
}

Write-Host ""
Write-Host "Resumen: OK=$ok  SKIP=$skip  ERR=$err" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verificar con: .\tools\verify-ips.ps1" -ForegroundColor Yellow
Write-Host "Usar en k6   : `$env:K6_LOCAL_IPS = '${BaseIP}.${StartOctet}-${BaseIP}.${EndOctet}'" -ForegroundColor Yellow
