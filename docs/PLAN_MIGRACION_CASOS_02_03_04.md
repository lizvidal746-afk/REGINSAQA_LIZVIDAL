# Plan de migración: Casos 02, 03 y 04 a REGINSA

## 1) Objetivo

Migrar los casos pendientes desde la base temporal hacia la carpeta principal REGINSA sin interrumpir el avance del Caso 01 ni el pipeline funcional actual.

Alcance de este plan:

- Caso 02: registrar sanción.
- Caso 03: reconsiderar sin sanciones.
- Caso 04: reconsiderar con sanciones.

---

## 2) Principio de trabajo

- `playwrigth/` se mantiene solo como referencia temporal.
- Las correcciones nuevas se realizan en REGINSA.
- La publicación a repos remotos se hace desde REGINSA, excluyendo `playwrigth/`.

---

## 3) Fases por caso (orden recomendado)

### Fase A: inventario del caso

Por cada caso (02, 03, 04):

1. Identificar archivo de prueba origen.
2. Identificar utilidades dependientes (`tests/utilidades`, `helpers`, datos en `reportes`/`files`).
3. Listar variables de entorno requeridas.

Criterio de salida:

- Mapa del caso completo (test + utilidades + datos).

### Fase B: migración técnica

1. Copiar/ajustar el spec del caso en REGINSA.
2. Reusar utilidades existentes; evitar duplicar helpers.
3. Alinear naming, reporters y estructura de evidencia con Caso 01.

Criterio de salida:

- Caso compila y puede listarse con Playwright en REGINSA.

### Fase C: estabilización local

1. Ejecutar corrida corta (smoke).
2. Ejecutar corrida paralela controlada.
3. Ajustar esperas/validaciones para reducir flaky.

Criterio de salida:

- Corridas repetibles con tasa estable.

### Fase D: integración al pipeline

1. Incluir caso en el comando funcional correspondiente.
2. Confirmar que se generan artifacts (Playwright/Allure/JUnit/reportes).
3. Mantener la política: failed rompe, flaky advierte.

Criterio de salida:

- Pipeline funcional contempla el caso sin romper operación de Caso 01.

---

## 4) Secuencia de ejecución sugerida

1. Migrar y estabilizar Caso 02.
2. Migrar y estabilizar Caso 03.
3. Migrar y estabilizar Caso 04.
4. Correr campaña integrada con los 4 casos.

---

## 5) Validación mínima por caso

Checklist rápido:

- El test aparece en `--list`.
- Ejecuta en local sin errores de compilación.
- Genera evidencia en `test-results` y `allure-results`.
- No requiere tocar `playwrigth/` para funcionar.

---

## 6) Publicación de cambios (dos repos)

Flujo estándar después de cerrar cada caso:

```bash
git add -A -- ':!playwrigth/**'
git status
git commit -m "test: migracion caso XX en REGINSA"
git push personal HEAD:main
git push sunedu HEAD:main
```

---

## 7) Cierre de migración

Cuando los 3 casos estén migrados y estables:

1. Ejecutar corrida integrada en REGINSA.
2. Validar pipeline en ambos repos.
3. Recién después evaluar retiro definitivo de `playwrigth/`.
