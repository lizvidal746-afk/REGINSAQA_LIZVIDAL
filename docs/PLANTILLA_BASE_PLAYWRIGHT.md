# Plantilla base para pruebas Playwright SUNEDU

## Estructura general

```typescript
import { test } from '@playwright/test';
import {
  iniciarSesionYNavegar,
  abrirFormularioRegistrarSancion,
  obtenerAdministradoAleatorio,
  capturarPantallaMejorada,
  capturarFormularioLleno,
  capturarToastExito,
  generarFechaPonderada,
  resolverDocumentoPrueba
} from 'tests/utilidades/reginsa-actions';

/**
 * Helper para seleccionar sanciones según repeat-each
 */
function obtenerSancionesParaTest(repeatEach: number) {
  const flujos = [
    { numero: 1, nombre: 'MULTA', multa: true, suspension: false, cancelacion: false },
    { numero: 2, nombre: 'SUSPENSIÓN', multa: false, suspension: true, cancelacion: false },
    { numero: 3, nombre: 'CANCELACIÓN', multa: false, suspension: false, cancelacion: true },
    { numero: 4, nombre: 'MULTA + SUSPENSIÓN', multa: true, suspension: true, cancelacion: false },
    { numero: 5, nombre: 'MULTA + CANCELACIÓN', multa: true, suspension: false, cancelacion: true },
    { numero: 6, nombre: 'MULTA (UIT) + SUSPENSIÓN', multa: true, suspension: true, cancelacion: false, forceUIT: true },
    { numero: 7, nombre: 'MULTA (UIT)', multa: true, suspension: false, cancelacion: false, forceUIT: true },
    { numero: 8, nombre: 'MULTA (UIT) + CANCELACIÓN', multa: true, suspension: false, cancelacion: true, forceUIT: true }
  ];
  if (repeatEach <= 2) {
    return flujos;
  } else {
    const seleccionados = [];
    const usados = new Set();
    while (seleccionados.length < 3) {
      const idx = Math.floor(Math.random() * flujos.length);
      if (!usados.has(idx)) {
        seleccionados.push(flujos[idx]);
        usados.add(idx);
      }
    }
    return seleccionados;
  }
}

/**
 * Ejemplo de uso en test:
 */
test('02-REGISTRAR SANCIÓN: Sanciones dinámicas', async ({ page }, testInfo) => {
  const repeatEach = typeof testInfo.repeatEach === 'number' ? testInfo.repeatEach : 1;
  const sanciones = obtenerSancionesParaTest(repeatEach);
  // ...flujo de registro de sanciones usando sanciones[]...
});
```

---

## Documentación para tu git

- El helper `obtenerSancionesParaTest` permite adaptar la cantidad y tipo de sanciones según el modo de ejecución.
- Si repeat-each es 1 o 2, se registran los 8 flujos completos (pruebas de humo).
- Si repeat-each es 3 o más, se registran 3 sanciones aleatorias (pruebas masivas/escalables).
- El test es robusto, modular y escalable para pipelines y monitoreo con k6/grafana.
- Puedes reutilizar este patrón en otros casos de prueba.

---

### Recomendaciones

- Centraliza helpers en `reginsa-actions`.
- Usa logs claros y capturas en pasos críticos.
- Parametriza la cantidad de sanciones según el contexto de ejecución.
- Documenta el flujo y helpers en tu git para fácil mantenimiento.

---

**Ejemplo de commit:**

feat: plantilla base y helper para pruebas de sanciones dinámicas

--

¿Quieres que agregue ejemplos de otros helpers reutilizables o una guía de integración para tu pipeline CI/CD?
