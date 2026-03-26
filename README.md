# REGINSA QA Personal Repository

Repositorio personal para framework de QA Automation y DevSecOps de REGINSA.

Este repositorio es para:

- Pruebas automatizadas con Playwright.
- Pruebas de rendimiento con K6.
- Scripts auxiliares.
- Documentación QA y seguridad.
- Experimentación controlada.

Regla crítica:

- Nunca copiar lógica de negocio, credenciales, endpoints internos ni datos sensibles de SUNEDU.

Inicio rápido de documentación:

- Ver [docs/README.md](docs/README.md)

Estructura técnica base en raíz:

- `playwright.config.ts`
- `tests/funcionales`
- `tests/pages`
- `tests/fixtures`
- `tests/datos`
- `tests/utilidades`

Separación documental:

- Personal GitHub: [docs/personal/README.md](docs/personal/README.md)
- Entorno SUNEDU: [docs/sunedu/README.md](docs/sunedu/README.md)

Variables recomendadas para K6 local:

- Copiar `.env.k6.example` como `.env.k6.local` y completar valores reales.
- Cargar variables en la terminal actual con:
  - `powershell -ExecutionPolicy Bypass -File scripts/cargar-variables-k6.ps1`
- Si deseas persistir variables para nuevas terminales:
  - `powershell -ExecutionPolicy Bypass -File scripts/cargar-variables-k6.ps1 -Persist`
