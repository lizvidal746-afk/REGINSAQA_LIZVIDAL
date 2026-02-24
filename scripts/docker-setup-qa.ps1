param(
  [switch]$IncludeLocalObservability,
  [switch]$IncludeSeleniumGrid
)

$ErrorActionPreference = 'Stop'

function Test-DockerEngine {
  try {
    docker info | Out-Null
    return $true
  } catch {
    return $false
  }
}

Write-Host 'Validando Docker Engine...' -ForegroundColor Cyan
if (-not (Test-DockerEngine)) {
  throw 'Docker no está disponible. Abre Docker Desktop y verifica que el engine esté activo.'
}

Write-Host 'Pull OWASP ZAP (requerido para seguridad)...' -ForegroundColor Cyan
docker pull ghcr.io/zaproxy/zaproxy:stable

Write-Host 'Pull k6 image (opcional útil para ejecución en contenedor)...' -ForegroundColor Cyan
docker pull grafana/k6:latest

if ($IncludeLocalObservability) {
  Write-Host 'Pull InfluxDB + Grafana local (solo si usarás dashboards locales)...' -ForegroundColor Cyan
  docker pull influxdb:2.7
  docker pull grafana/grafana:latest
}

if ($IncludeSeleniumGrid) {
  Write-Host 'Pull Selenium images (solo si usarás Selenium Grid local)...' -ForegroundColor Cyan
  docker pull selenium/node-chrome:latest
  docker pull selenium/node-firefox:latest
}

Write-Host ''
Write-Host 'Imágenes instaladas relevantes:' -ForegroundColor Green
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | findstr /I "zaproxy grafana/k6 influxdb grafana/grafana selenium/node"

Write-Host ''
Write-Host 'Listo. Para correr OWASP local:' -ForegroundColor Yellow
Write-Host 'npm run test:security'
