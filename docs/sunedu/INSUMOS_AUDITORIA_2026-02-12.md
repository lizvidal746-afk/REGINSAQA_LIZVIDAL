# Insumos reutilizables de auditoría (2026-02-12)

## 1. Fuente revisada

Documentos analizados (legacy de referencia):

- `playwrigth/docs/auditoria/resultados/AUDITORIA_TECNICA_REGINSA_2026-02-12.md`
- `playwrigth/docs/auditoria/validacion/VALIDACION_AUDITORIA_REGINSA_2026-02-12.md`

## 2. ¿Sirven para complementar?

Sí. Sirven como línea base técnica y de madurez para la transición a Azure DevOps.

## 3. Hallazgos vigentes reutilizables

1. Madurez Nivel 3 (Avanzado) con brechas para Nivel 4.
2. Riesgo general medio, principalmente por parametrización y seguridad operativa.
3. Fortalezas:
   - Reportería múltiple (HTML + Allure + JUnit)
   - Pipeline CI existente
   - Estructura modular de pruebas
4. Brechas:
   - Parametrización incompleta de workers/headless
   - Riesgo por sesiones persistentes (`storageState`)
   - Falta de estandarización total de ejecución aislada por entorno

## 4. Hallazgos que deben reinterpretarse (por cambio de ruta)

Los informes fueron emitidos cuando la base operativa estaba en `playwrigth/`.

Ahora, la base activa es `REGINSA/` (raíz), por lo que los hallazgos deben mapearse a:

- `playwright.config.ts` en raíz
- `tests/casos-prueba`
- `tests/utilidades`
- `helpers`
- `docs/sunedu`

## 5. Decisión de uso institucional

Uso recomendado de estos informes:

- Evidencia histórica de madurez y control de calidad.
- Insumo para justificar la migración a Azure cuando habiliten permisos.
- Base para auditoría comparativa “antes/después” (legacy vs raíz actual).

## 6. Acciones concretas derivadas

1. Mantener estos informes como historial (no reemplazarlos).
2. Emitir una nueva auditoría sobre la raíz `REGINSA` con mismo formato.
3. Comparar resultados contra 2026-02-12 para medir avance objetivo.
4. Adjuntar esta comparación al plan de migración a Azure.

## 7. Criterio de trazabilidad

Toda recomendación que se herede de la auditoría 2026-02-12 debe indicar:

- Fuente legacy (archivo y fecha)
- Mapeo a ruta actual en raíz
- Estado (vigente, parcial, cerrado)
