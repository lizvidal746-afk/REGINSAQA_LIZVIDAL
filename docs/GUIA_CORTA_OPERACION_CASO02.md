# Guía corta de operación — Caso 02

Esta guía resume los comandos finales para ejecutar Caso 02 sin tener que ajustar parámetros manualmente cada vez.

## 1) Smoke funcional (local, recomendado)

```powershell
npm run clean:run
npm run test:02:fast -- --workers=2 --repeat-each=2 --project=chromium
```

## 2) Smoke funcional (local, modo más estable)

Usar solo cuando tu equipo esté inestable o la UI esté lenta.

```powershell
npm run clean:run
$env:REGINSA_CASE02_STABLE='1'
$env:REGINSA_CASE02_MAX_REINTENTOS_SMOKE='4'
npm run test:02:fast -- --workers=2 --repeat-each=2 --project=chromium
```

## 3) Escala funcional (local)

Para 3/5/10+ registros, preferir `scale`.

```powershell
npm run clean:run
npm run test:02:scale -- --workers=3 --repeat-each=10 --project=chromium
```

El runner `scale` detecta automáticamente perfil de máquina (CPU/RAM/disco) y puede ajustar `workers` para estabilidad local.

Notas:

- En laptop/PC con disco mecánico, evitar `workers` altos (ej. 8) porque puede fallar por concurrencia UI.
- Si necesitas más carga, subir `repeat-each` antes que `workers`.
- Si cambias de equipo (ej. i7 SSD 32GB o i9 SSD 32GB), el ajuste se recalcula automáticamente.

Opcional: forzar perfil manual si deseas comportamiento fijo.

```powershell
$env:REGINSA_MACHINE_PROFILE='i7-ssd-32'
# valores soportados: i5-hdd-16 | i7-ssd-32 | i9-ssd-32
```

### Verificación rápida por perfil

#### i5-hdd-16 (local conservador)

```powershell
npm run clean:run
$env:REGINSA_MACHINE_PROFILE='i5-hdd-16'
npm run test:02:scale -- --workers=4 --repeat-each=3 --project=chromium
```

#### i7-ssd-32 (medio)

```powershell
npm run clean:run
$env:REGINSA_MACHINE_PROFILE='i7-ssd-32'
npm run test:02:scale -- --workers=5 --repeat-each=5 --project=chromium
```

#### i9-ssd-32 (alto)

```powershell
npm run clean:run
$env:REGINSA_MACHINE_PROFILE='i9-ssd-32'
npm run test:02:scale -- --workers=8 --repeat-each=8 --project=chromium
```

Qué validar:

- Debe salir en log el perfil detectado/forzado y los workers efectivos.
- Si pides más de lo recomendado, verás ajuste automático en amarillo.

Para volver a auto-detección:

```powershell
Remove-Item Env:REGINSA_MACHINE_PROFILE -ErrorAction SilentlyContinue
```

## 4) Validaciones negativas (separadas)

```powershell
npm run clean:run
npm run test:02:validaciones -- --repeat-each=1 --project=chromium
```

## 5) Regla de negocio activa en Caso 02

- `repeat-each <= 2`: 8 sanciones por registro (humo/regresión completa).
- `repeat-each >= 3`: 1/2/3 sanciones aleatorias por registro (escala).

## 6) Reset de variables (solo si usaste modo estable)

Aplicar en la misma terminal para volver al comportamiento por defecto.

```powershell
Remove-Item Env:REGINSA_CASE02_STABLE -ErrorAction SilentlyContinue
Remove-Item Env:REGINSA_CASE02_MAX_REINTENTOS_SMOKE -ErrorAction SilentlyContinue
```

## 7) Pipeline (recomendación operativa)

Mantener separado:

- Workflow funcional Caso 02.
- Workflow validaciones Caso 02.
- Workflow performance k6 (script canónico).

Esto evita mezcla de resultados y facilita diagnóstico por tipo de prueba.

## 8) Compatibilidad PowerShell y optimización

Punto clave: el tipo de CPU (i5/i7/i9) no define la versión de PowerShell. Son cosas independientes.

- Windows PowerShell 5.1: típico en Windows.
- PowerShell 7.x (`pwsh`): versión moderna y multiplataforma.

El script `run-test02-scale.ps1` quedó en sintaxis compatible para 5.1 y 7.x.

Verifica tu versión actual:

```powershell
$PSVersionTable.PSEdition
$PSVersionTable.PSVersion
```

Optimización recomendada:

- Local: usar `test:02:scale` con workers moderados y dejar auto-ajuste de perfil.
- Pipeline/self-hosted potente: subir workers gradualmente y validar estabilidad por lotes.
- Si necesitas forzar capacidad máxima puntual: usar `REGINSA_ALLOW_OVERCOMMIT=1`.

Nota: si tus scripts npm llaman `powershell`, normalmente ejecutan Windows PowerShell 5.1. Si llamas `pwsh`, ejecutas PowerShell 7.x.
