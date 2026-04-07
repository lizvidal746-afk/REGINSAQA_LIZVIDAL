<#
.SYNOPSIS
  Detecta IPs secundarias activas del pool k6 y exporta K6_LOCAL_IPS.
.DESCRIPTION
  Lee las IPs IPv4 del adaptador de red. Intenta deteccion con SkipAsSource
  primero; si falla (sesion sin admin) usa lista de pool conocida como fallback.
  Si el pool no esta activo, preserva K6_LOCAL_IPS si ya estaba definido.
  Nunca borra K6_LOCAL_IPS heredado del proceso padre.
#>
param(
    [string]$AdapterName = "Ethernet"
)

# Pool conocido - debe coincidir con $DefaultSecondaryIPs en k6-ips-toggle.ps1
$PoolIPList = @(
    '192.168.28.48','192.168.28.49','192.168.28.50','192.168.28.51',
    '192.168.28.52','192.168.28.53','192.168.28.54','192.168.28.55',
    '192.168.28.56','192.168.28.57'
)

try {
    $currentIPs = Get-NetIPAddress -InterfaceAlias $AdapterName -AddressFamily IPv4 -ErrorAction SilentlyContinue
    if (-not $currentIPs) { return }

    # Metodo 1: SkipAsSource (funciona en sesiones admin o cuando el flag es legible)
    $secondaryIPs = @($currentIPs |
        Where-Object { $_.SkipAsSource -eq $true } |
        ForEach-Object { $_.IPAddress })
    $primaryObj = $currentIPs | Where-Object { $_.SkipAsSource -ne $true } | Select-Object -First 1

    if ($secondaryIPs.Count -gt 0 -and $primaryObj) {
        $detectedPrimary = $primaryObj.IPAddress
        $allIPs = @($detectedPrimary) + $secondaryIPs
        $env:K6_LOCAL_IPS = $allIPs -join ','
        Write-Host "[k6-ips] Pool detectado (SkipAsSource): $($allIPs.Count) IPs ($($env:K6_LOCAL_IPS))" -ForegroundColor Cyan
        return
    }

    # Metodo 2 (fallback): distinguir por lista del pool conocida
    # Util cuando SkipAsSource no es legible sin admin
    $poolPresent = @($currentIPs |
        Where-Object { $PoolIPList -contains $_.IPAddress } |
        ForEach-Object { $_.IPAddress })
    $nonPoolIPs = @($currentIPs | Where-Object { $PoolIPList -notcontains $_.IPAddress })

    if ($nonPoolIPs.Count -gt 0 -and $poolPresent.Count -gt 0) {
        # Caso normal: IP DHCP fuera del pool + IPs del pool activas
        $detectedPrimary = $nonPoolIPs[0].IPAddress
        $allIPs = @($detectedPrimary) + $poolPresent
        $env:K6_LOCAL_IPS = $allIPs -join ','
        Write-Host "[k6-ips] Pool detectado (lista): $($allIPs.Count) IPs ($($env:K6_LOCAL_IPS))" -ForegroundColor Cyan
    } elseif ($poolPresent.Count -gt 1) {
        # Caso especial: IP DHCP coincide con una IP del pool (ej. .57 asignado por DHCP)
        # Todas las IPs activas son del pool -> usar todas como pool
        $env:K6_LOCAL_IPS = $poolPresent -join ','
        Write-Host "[k6-ips] Pool detectado (pool-only, $($poolPresent.Count) IPs): $($env:K6_LOCAL_IPS)" -ForegroundColor Cyan
    } else {
        # Pool no activo - preservar K6_LOCAL_IPS si ya estaba definido
        if (-not [string]::IsNullOrWhiteSpace($env:K6_LOCAL_IPS)) {
            Write-Host "[k6-ips] Pool no activo en adaptador, preservando K6_LOCAL_IPS heredado." -ForegroundColor DarkYellow
        }
        # No borrar - dejar que el proceso padre/heredado decida
    }
} catch {
    # Silencioso - preservar K6_LOCAL_IPS si ya estaba seteado por el padre o toggle
    if (-not [string]::IsNullOrWhiteSpace($env:K6_LOCAL_IPS)) {
        Write-Host "[k6-ips] Error en deteccion, preservando K6_LOCAL_IPS: $($env:K6_LOCAL_IPS)" -ForegroundColor DarkYellow
    }
}
