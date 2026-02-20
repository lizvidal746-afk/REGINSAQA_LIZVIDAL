# Manual paso a paso - Repositorio personal

## 1) Preparación

1. Instalar dependencias:
   - `npm install`
2. Copiar variables seguras:
   - crear `.env` basado en `docs/plantillas/.env.example`

## 2) Estructura base de tests

- `tests/funcionales`: specs funcionales.
- `tests/pages`: Page Objects.
- `tests/fixtures`: fixtures y contextos.
- `tests/datos`: datos anonimizados.
- `tests/utilidades`: funciones reutilizables.

## 3) Ejecución local

- Ejecutar suite E2E:
  - `npm run test:e2e`
- Ejecutar con workers 2:
  - `npm run test:e2e:workers2`
- Ver reporte HTML:
  - `npm run report:html`

## 4) Performance K6

- Ejecutar smoke:
  - `npm run k6:smoke`

## 5) Buenas prácticas

- No usar sleep en pruebas.
- No hardcodear credenciales.
- Aislar datos por test.
- Mantener trazabilidad por requerimiento/incidencia.

## 6) Transición a Azure cuando habiliten permisos

1. Congelar una versión estable en GitHub.
2. Validar checklist de seguridad y no exposición de datos.
3. Replicar pipeline y variables seguras en Azure DevOps.
4. Ejecutar corrida comparativa (GitHub vs Azure).
5. Registrar acta de migración y mantener este repo como laboratorio.
