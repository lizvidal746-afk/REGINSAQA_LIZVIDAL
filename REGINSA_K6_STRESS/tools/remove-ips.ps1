# ============================================================
# tools/remove-ips.ps1
# Remueve las 10 IPs alias. NO afecta la IP principal DHCP.
# Requiere admin para netsh; si no eres admin, se intenta UAC (Run as administrator).
# ============================================================

[CmdletBinding()]
param(
    [switch]$Elevated,
    [string]$InterfaceAlias = "",
    [string]$BaseIP         = "192.168.28",
    [int]$StartOctet        = 48,
    [int]$EndOctet          = 57
)

function Test-IsAdministrator {
    $p = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
    if ($Elevated) {
        Write-Host "Sin permisos de administrador (UAC cancelado o denegado)." -ForegroundColor Red
        Write-Host "Abre PowerShell con clic derecho > Ejecutar como administrador y vuelve a ejecutar:" -ForegroundColor Yellow
        Write-Host "  $($PSCommandPath)" -ForegroundColor White
        exit 1
    }
    Write-Host "Se necesita administrador para quitar direcciones IPv4. Acepta el aviso UAC de Windows." -ForegroundColor Cyan
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

if (-not $InterfaceAlias) {
    $iface = Get-NetIPAddress -AddressFamily IPv4 `
        | Where-Object { $_.IPAddress -like "192.168.28.*" -and $_.PrefixOrigin -eq "Dhcp" } `
        | Select-Object -First 1
    if ($iface) { $InterfaceAlias = $iface.InterfaceAlias }
    else { Write-Host "ERROR: no se detecto interfaz. Use -InterfaceAlias" -ForegroundColor Red; exit 1 }
}

Write-Host "=== Removiendo IPs alias en $InterfaceAlias ===" -ForegroundColor Cyan
$ok = 0; $skip = 0
for ($i = $StartOctet; $i -le $EndOctet; $i++) {
    $ip = "$BaseIP.$i"
    $existing = Get-NetIPAddress -IPAddress $ip -ErrorAction SilentlyContinue
    if (-not $existing) {
        Write-Host "  [SKIP] $ip no existe" -ForegroundColor Yellow
        $skip++
        continue
    }
    netsh interface ipv4 delete address name="$InterfaceAlias" addr=$ip | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] $ip removida" -ForegroundColor Green
        $ok++
    } else {
        Write-Host "  [FAIL] $ip" -ForegroundColor Red
    }
}
Write-Host ""
Write-Host "Resumen: OK=$ok  SKIP=$skip" -ForegroundColor Cyan
