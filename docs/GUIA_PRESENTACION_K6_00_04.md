# Guia Presentacion K6 Casos 00-04

## Objetivo

Ejecucion estandar para presentacion de los casos 00, 01, 02, 03 y 04 con:

- sleep interno en 0 por defecto
- cantidad obligatoria
- token y project de Grafana Cloud modificables
- resumen final automatico en JSON y Markdown

## Script principal

- scripts/run-k6-presentacion-00-04.ps1

## Scripts npm

- k6:presentacion
- k6:presentacion:grafana
- report:k6:presentacion

## Comandos recomendados

### 1) Local (sin cloud)

npm run k6:presentacion -- --cantidad=10

### 2) Cloud con token/project rotables

npm run k6:presentacion:grafana -- --cantidad=10 --project=123456 --token=K6CLOUD_TOKEN_ACTUAL

### 3) Cloud con archivo .env (opcional)

powershell -ExecutionPolicy Bypass -File scripts/run-k6-presentacion-00-04.ps1 -K6Output cloud -K6Cantidad 10 -K6SleepSeconds 0 -EnvFile .env -UserMode pool

## Parametros principales

- K6Cantidad: obligatorio
- K6SleepSeconds: default 0
- K6Vus: default 1
- K6Output: local|cloud
- GrafanaProjectId / GrafanaToken: modificables
- UserMode: single|pool (para caso 00 login y autenticacion por slots)
- PoolSize: default 8
- Casos: por defecto 00,01,02,03,04

## Reportes generados

- reportes/k6-presentacion-status.json
- reportes/k6-presentacion-00-04-resumen.json
- reportes/k6-presentacion-00-04-resumen.md

## Notas

- El Caso 01 mantiene su control de dataset unico para alta de administrado.
- Si faltan credenciales API para algun caso, el estado de ese caso quedara en FAIL dentro del resumen final.
- El resumen final consolida HTTP principal y KPI de negocio disponible por caso.
