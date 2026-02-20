# README mínimo (SUNEDU profesional)

## Ejecución local

```bash
npm run base:reiniciar-completo
set REGINSA_POOL_TARGET=1200
npm run test:01:scale -- --workers=6 --repeat-each=10 --project=chromium
```

En PowerShell:

```powershell
npm run base:reiniciar-completo
$env:REGINSA_POOL_TARGET="1200"
npm run test:01:scale -- --workers=6 --repeat-each=10 --project=chromium
```

## Pipeline GitHub Actions

Workflow: `.github/workflows/reginsa-funcional.yml`

Inputs:

- `workers`
- `repeat_each`
- `pool_target`

## Pipeline Azure DevOps

Archivo: `azure-pipelines.yml`

Variables:

- `REGINSA_URL`
- `REGINSA_USER_1..6`
- `REGINSA_PASS_1..6`
- `POOL_TARGET`
- `PW_WORKERS`
- `PW_REPEAT_EACH`

## Nota operativa

El modo `scale` está configurado para estabilidad en concurrencia:

- confirmación API de creación
- verificación de listado opcional para rendimiento
- retry técnico controlado

Política de calidad CI:

- `failed > 0`: pipeline en rojo.
- `flaky > 0` con `failed = 0`: warning operativo (no bloquea).
- Script de evaluación: `node scripts/evaluate-playwright-results.js`.
