# Ejecución del flujo completo k6 para Caso 2

1. **Prepara el entorno:**
   - Asegúrate de tener Node.js y k6 instalados.
   - Coloca tu archivo de datos en:
     - `playwrigth/files/listado_100.json`
   - Configura las variables de entorno necesarias:
     - `BASE_API` (URL de la API)
     - `TOKEN` (token de autenticación)

2. **Ubicación del script:**
   - El flujo completo está en:
     - `docs/plantillas/k6_caso_02_registrar_sancion_completo.js`

3. **Ejecución:**
   - Desde la raíz del proyecto, ejecuta:
     ```sh
     k6 run docs/plantillas/k6_caso_02_registrar_sancion_completo.js
     ```
   - Puedes pasar variables de entorno así:
     ```sh
     BASE_API=https://reginsaapiqa.sunedu.gob.pe/api TOKEN=tu_token k6 run docs/plantillas/k6_caso_02_registrar_sancion_completo.js
     ```

4. **Personalización:**
   - Modifica `listado_100.json` para agregar más casos o ajustar los datos de entrada.
   - El script recorre cada entrada del listado y ejecuta el flujo completo para cada una.

5. **Notas:**
   - El script asume que la segunda infracción de cada RIS es válida. Ajusta el índice si es necesario.
   - Si necesitas adaptar el flujo para otros casos, replica la estructura del archivo y ajusta los campos requeridos.
