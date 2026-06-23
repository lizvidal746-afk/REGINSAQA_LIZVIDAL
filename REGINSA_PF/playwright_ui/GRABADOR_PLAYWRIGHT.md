# 🎥 Guía de Grabación de Casos de Prueba con Playwright Codegen

Utiliza esta guía para generar el código automatizado de los flujos del sistema REGINSA en QA de forma rápida. Al ejecutar estos comandos, se abrirá un navegador interactivo y se guardará todo el proceso en un archivo de prueba.

---

## 🛠️ Comandos de Grabación por Caso de Prueba

Ejecuta estos comandos desde la terminal dentro del directorio de Playwright (`D:\SUNEDU\AUTOMATIZACION\REGINSA\REGINSA_PF\playwright_ui`):

### 📌 Caso 01: Agregar Administrado

Este comando grabará el flujo completo para registrar un nuevo administrado en el sistema.
powershell
npx playwright codegen -o tests/caso01-grabado.spec.ts https://reginsaqa.sunedu.gob.pe

### 📌 Caso 02: Registrar Sanción

Este comando grabará el flujo del registro de la cabecera, medida correctiva y detalle de la sanción.
powershell
npx playwright codegen -o tests/caso02-grabado.spec.ts https://reginsaqa.sunedu.gob.pe

### 📌 Caso 04: Reconsideración de Sanciones

Este comando grabará el flujo para aplicar recursos impugnatorios o reconsiderar sanciones previamente registradas.
powershell
npx playwright codegen -o tests/caso04-grabado.spec.ts https://reginsaqa.sunedu.gob.pe

---

## 💡 Consejos útiles al grabar: consejos

1. **Cierre limpio**: Para asegurar que el archivo se guarde correctamente, simplemente cierra la ventana del navegador que abrió Playwright cuando hayas terminado el flujo de prueba.
2. **Reutilizar Credenciales**: Si deseas omitir el login durante la grabación usando la sesión que ya está guardada en el proyecto, puedes agregar el estado de autenticación:
powershell
   npx playwright codegen --load-storage=.auth/user.json -o tests/caso02-grabado.spec.ts https://reginsaqa.sunedu.gob.pe
