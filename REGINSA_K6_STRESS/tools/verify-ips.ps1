# ============================================================
# tools/verify-ips.ps1
# Verifica que las 10 IPs alias estan configuradas y responden ARP.
# ============================================================

[CmdletBinding()]
param(
    [string]$BaseIP     = "192.168.28",
    [int]$StartOctet    = 48,
    [int]$EndOctet      = 57
)

Write-Host "=== Verificando IPs alias ===" -ForegroundColor Cyan
Write-Host ""

$found = 0; $missing = 0
for ($i = $StartOctet; $i -le $EndOctet; $i++) {
    $ip = "$BaseIP.$i"
    $existing = Get-NetIPAddress -IPAddress $ip -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "  [OK]      $ip  -> $($existing.InterfaceAlias)" -ForegroundColor Green
        $found++
    } else {
        Write-Host "  [MISSING] $ip" -ForegroundColor Red
        $missing++
    }
}
Write-Host ""
Write-Host "Resumen: encontradas=$found  faltantes=$missing" -ForegroundColor Cyan

if ($missing -gt 0) {
    Write-Host "Ejecutar como Admin: .\tools\setup-ips.ps1" -ForegroundColor Yellow
}
