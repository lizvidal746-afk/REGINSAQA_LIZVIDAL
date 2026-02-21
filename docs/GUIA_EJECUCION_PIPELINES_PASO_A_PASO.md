# Guía rápida: ejecución de pipelines (GitHub y Azure)

## 1) GitHub Actions (clic por clic)

Ruta:

1. Entrar al repositorio en GitHub.
2. Ir a **Actions**.
3. Seleccionar workflow **REGINSA Functional Scale**.
4. Hacer clic en **Run workflow**.
5. Elegir rama (`main`).
6. Llenar estos campos del formulario:
   - `workers`
   - `repeat_each`
   - `pool_target`
7. Clic en **Run workflow** para ejecutar.

Dónde se configuran esos campos en código:

- `.github/workflows/reginsa-funcional.yml` en la sección `workflow_dispatch.inputs`.

---

## 2) Azure DevOps Pipelines (clic por clic)

Ruta:

1. Entrar a Azure DevOps.
2. Ir a **Pipelines**.
3. Seleccionar el pipeline basado en `azure-pipelines.yml`.
4. Clic en **Run pipeline**.
5. Abrir panel **Variables**.
6. Ajustar variables por corrida:
   - `PW_WORKERS`
   - `PW_REPEAT_EACH`
   - `POOL_TARGET`
7. Ejecutar con **Run**.

---

## 3) Ejemplos listos para usar

Usa estos valores directamente en GitHub (inputs) o Azure (variables):

- 10 registros:
  - `workers=6`
  - `repeat_each=10`
  - `pool_target=360`

- 30 registros:
  - `workers=6`
  - `repeat_each=30`
  - `pool_target=1080`

- 50 registros:
  - `workers=6`
  - `repeat_each=50`
  - `pool_target=1800`

- 100 registros:
  - `workers=6`
  - `repeat_each=100`
  - `pool_target=3600`

- 200 registros:
  - `workers=6`
  - `repeat_each=200`
  - `pool_target=7200`

Regla usada:

`pool_target = workers * repeat_each * 6`

---

## 4) Cómo validar que tomó los valores

- En GitHub: abrir el job y revisar logs del paso **Run functional scale**.
- En Azure: revisar logs del paso **Run functional scale** y variables efectivas del run.

---

## 5) Nota de operación

- Si no llenas valores en GitHub, se usan defaults del workflow o variables del repo.
- Si no cambias variables en Azure al ejecutar, se usan los valores guardados en el pipeline.

## 6) Caso URL interna SUNEDU

Si tu URL solo resuelve en red interna/VPN SUNEDU, usa workflow self-hosted:

- `REGINSA Functional Scale (Self-hosted)`

Guía de instalación y operación:

- `docs/GUIA_RUNNER_SELF_HOSTED_GITHUB.md`
