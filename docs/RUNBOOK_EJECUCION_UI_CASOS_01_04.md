# Runbook de Ejecucion UI Casos 01-04

## 1) Objetivo

Estandarizar la operacion diaria y semanal de los casos UI 01, 02, 03 y 04, incluyendo validaciones, para equilibrar:

- Costo de ejecucion
- Tiempo de feedback
- Cobertura funcional

Este runbook aplica a ejecuciones en GitHub Actions (self-hosted) y puede reutilizarse en operacion local.

## 2) Alcance

- Casos funcionales: 01, 02, 03, 04
- Casos de validaciones: 01, 02, 03, 04
- Modos: `fast`, `demo`, `scale`

## 3) Politica de configuracion (GitHub Actions)

Precedencia de configuracion:

1. Inputs de `workflow_dispatch` (override temporal)
2. `vars` de repositorio/ambiente
3. `secrets` (base operativa)

Regla operativa:

- En operacion normal, no llenar `reginsa_url` ni `credentials_json` en cada corrida.
- Mantener URL/credenciales en `secrets` y usar inputs solo en contingencias controladas.

## 4) Parametros estandar por modo

### 4.1 Modo fast

- `workers=2`
- `repeat_each=1`
- `smoke_mode=true`
- `install_dependencies=false`
- `install_browser=false`
- `generate_reports=false`
- `pw_retries=1`
- `upload_artifacts=true`
- `gate_mode=tolerant`
- `max_failed_allowed=1`
- `reginsa_url=`
- `credentials_json=`

### 4.2 Modo demo

- `workers=2`
- `repeat_each=2`
- `smoke_mode=false`
- `install_dependencies=false`
- `install_browser=false`
- `generate_reports=true`
- `pw_retries=1`
- `upload_artifacts=true`
- `gate_mode=tolerant`
- `max_failed_allowed=1`
- `reginsa_url=`
- `credentials_json=`

### 4.3 Modo scale

- `workers=4`
- `repeat_each=6`
- `smoke_mode=false`
- `install_dependencies=false`
- `install_browser=false`
- `generate_reports=true`
- `pw_retries=2`
- `upload_artifacts=true`
- `gate_mode=strict`
- `max_failed_allowed=0`
- `reginsa_url=`
- `credentials_json=`

### 4.4 Validaciones (01-04)

- `workers=1`
- `repeat_each=1`
- `install_dependencies=false`
- `install_browser=false`
- `upload_artifacts=true`
- `reginsa_url=`
- `credentials_json=`

## 5) Plan semanal (lunes-viernes)

### Lunes

- Funcionales: 01, 02, 03, 04 en `fast`
- Validaciones: 01 y 02
- Objetivo: detectar quiebres tempranos en poco tiempo

### Martes

- Funcionales: 01 y 02 en `demo`; 03 y 04 en `fast`
- Validaciones: 03
- Objetivo: estabilidad con evidencia ligera

### Miercoles

- Funcionales: 01 y 02 en `scale`; 03 y 04 en `fast`
- Validaciones: 04
- Objetivo: carga parcial controlada

### Jueves

- Funcionales: 03 y 04 en `scale`; 01 y 02 en `demo`
- Validaciones: 01, 02, 03, 04
- Objetivo: cobertura cruzada funcional

### Viernes

- Funcionales: 01, 02, 03, 04 en `scale`
- Validaciones: 01, 02, 03, 04
- Objetivo: regresion fuerte semanal y cierre de calidad

## 6) Checklist diario de ejecucion

1. Verificar runner `self-hosted` online y libre.
2. Confirmar `secrets` vigentes (`REGINSA_URL`, credenciales).
3. Lanzar workflows segun plan del dia.
4. Revisar estado final de cada workflow.
5. Validar artifacts minimos: `playwright-report`, `test-results`, `reportes`.
6. Registrar resultado diario (OK, warning, bloqueado) con causa.

## 7) Protocolo de contingencia

Cuando falle un caso:

1. Reintentar una vez en el mismo modo.
2. Si vuelve a fallar, ejecutar el mismo caso en `demo` para evidencia.
3. Si persiste, ejecutar con `workers=1` para aislar concurrencia.
4. Revisar error en `test-results/results.json` y trazas en reportes.
5. Clasificar causa:
   - Dato no disponible
   - Inestabilidad UI/tiempos
   - Credenciales/sesion
   - Defecto funcional
6. Abrir incidencia con evidencia (captura, mensaje, paso exacto, timestamp).

Escalamiento recomendado:

- Bloqueante productivo: escalar en el mismo dia.
- Flaky no bloqueante: permitir continuidad en `tolerant`, pero crear ticket de estabilizacion.

## 8) Criterio de cierre diario

Estado `OK`:

- Sin fallas bloqueantes.
- Fallas permitidas dentro de politica del dia (`strict` o `tolerant`).

Estado `WARNING`:

- Existen flakes o fallas no bloqueantes, con ticket creado.

Estado `BLOQUEADO`:

- Fallas funcionales repetibles o indisponibilidad de entorno/credenciales.

## 9) Criterio de cierre semanal

Se considera semana cerrada cuando:

1. Los 4 casos funcionales ejecutaron en `scale` (viernes).
2. Las 4 validaciones ejecutaron y reportaron evidencia.
3. Incidencias abiertas tienen trazabilidad y estado asignado.

## 10) Workflows de referencia

Funcionales Pro:

- `.github/workflows/reginsa-funcional-pro-caso01-selfhosted.yml`
- `.github/workflows/reginsa-funcional-pro-caso02-selfhosted.yml`
- `.github/workflows/reginsa-funcional-pro-caso03-selfhosted.yml`
- `.github/workflows/reginsa-funcional-pro-caso04-selfhosted.yml`

Validaciones:

- `.github/workflows/reginsa-validaciones-caso01-selfhosted.yml`
- `.github/workflows/reginsa-validaciones-caso02-selfhosted.yml`
- `.github/workflows/reginsa-validaciones-caso03-selfhosted.yml`
- `.github/workflows/reginsa-validaciones-caso04-selfhosted.yml`
