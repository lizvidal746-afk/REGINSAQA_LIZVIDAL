# Ejecucion del flujo completo k6 para Caso 02

## Preparar entorno

- Asegurate de tener Node.js y k6 instalados.
- Coloca tu archivo de datos en `playwrigth/files/listado_100.json`.
- Configura las variables de entorno necesarias:
  - `BASE_API` (URL de la API)
  - `TOKEN` (token de autenticacion)

## Ubicacion del script

- Flujo oficial: `tests/performance/k6-grafana/k6_caso_02_registrar_sancion.js`

## Ejecucion

- Desde la raiz del proyecto:

```sh
k6 run tests/performance/k6-grafana/k6_caso_02_registrar_sancion.js
```

- Con variables de entorno inline:

```sh
BASE_API=https://reginsaapiqa.sunedu.gob.pe/api TOKEN=tu_token k6 run tests/performance/k6-grafana/k6_caso_02_registrar_sancion.js
```

## Personalizacion

- Modifica `listado_100.json` para agregar mas casos o ajustar datos de entrada.
- El script recorre cada entrada del listado y ejecuta el flujo completo por cada registro.

## Notas

- El script asume que la segunda infraccion de cada RIS es valida. Ajusta el indice si es necesario.
- Si necesitas adaptar el flujo para otros casos, replica la estructura y ajusta los campos requeridos.
