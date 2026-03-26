# AWS Pipelines (CodeBuild)

Esta carpeta define el bloque inicial homologado con la estrategia actual de pipelines:

- Modo 1: por caso especifico (01, 02, 03, 04)
- Modo 2: suite completa (solo funcional)
- Modo 3: validaciones por caso en una sola corrida (workers=1, repeat-each=1)

## Archivos

- `buildspec-functional.yml`
  - Ejecuta funcionales.
  - Soporta `CASE_TARGET=01|02|03|04|suite`.
  - Usa `PW_WORKERS` y `PW_REPEAT_EACH`.

- `buildspec-validaciones.yml`
  - Ejecuta validaciones.
  - Soporta `CASE_TARGET=01|02|03|04`.
  - Forzado a una corrida por caso (`--workers=1 --repeat-each=1`).

## Variables esperadas

Minimas:

- `REGINSA_URL`
- Credenciales necesarias para login en ejecucion

Opcionales:

- `PW_PROJECT` (default `chromium`)
- `PW_WORKERS` (solo funcional)
- `PW_REPEAT_EACH` (solo funcional)

## Ejemplo de invocacion

Proyecto CodeBuild funcional:

- Buildspec: `pipelines/aws/buildspec-functional.yml`
- Variables:
  - `TEST_TYPE=functional`
  - `CASE_TARGET=04`
  - `PW_WORKERS=3`
  - `PW_REPEAT_EACH=9`

Proyecto CodeBuild validaciones:

- Buildspec: `pipelines/aws/buildspec-validaciones.yml`
- Variables:
  - `TEST_TYPE=validaciones`
  - `CASE_TARGET=04`

## Nota

Si se requiere paridad exacta con scripts PowerShell (`test:*:scale`), se recomienda usar imagen Windows en CodeBuild e instalar PowerShell. Este bloque inicial esta orientado a portabilidad Linux con Playwright CLI.
