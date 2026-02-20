# Usuarios y credenciales (REGINSA)

## Estado actual (profesional)

La fuente oficial de credenciales para ejecución en este proyecto es el archivo `.env` en la raíz del repositorio.

- URL: `BASE_URL` y `REGINSA_URL`
- Usuario único: `REGINSA_USER` + `REGINSA_PASS`
- Pool paralelo: `REGINSA_USER_1..N` + `REGINSA_PASS_1..N`

## Dónde se usan

- Flujo de pruebas: `tests/utilidades/reginsa-actions.ts`
- Global setup: `tests/global-setup.js`

Ambos archivos leen variables de entorno; no almacenan contraseñas hardcodeadas.

## Seguridad y ocultamiento

- `.env` está excluido por `.gitignore` (no se sube al repositorio).
- En pipelines usar secretos del orquestador (Azure Variable Groups / Key Vault).
- No colocar credenciales en archivos `.ts`, `.js`, `README` o YAML.

## Pool actual cargado localmente

1. `lizvidal / QA1234510qa`
2. `lgvidalm / QA12345qa`
3. `lgvidal / QA12345qa`
4. `lgvm / QA12345qa`
5. `lizividal / QA12345qa`
6. `lizitavidal / QA12345qa`

## Regla de escalabilidad

Para ejecutar 100-1000 iteraciones de Caso 1, no se crean 1000 usuarios; se reutiliza el pool por `workerIndex` y se escala por datos de prueba únicos (RUC/Razón Social), no por credenciales.
