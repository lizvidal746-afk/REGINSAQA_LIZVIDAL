---
description: "Diseñar ajustes minimos para k6 + Grafana en REGINSA, preservando smoke de los 4 casos, habilitando solo smoke y rapido por cantidad de ejecuciones, y generando resumen ejecutivo comparable con JMeter"
name: "K6 Grafana Ajustes Escalados"
argument-hint: "Describe el ajuste deseado, el modo (smoke o rapido), cantidad de ejecuciones, cantidad de IPs simuladas y el alcance minimo permitido"
agent: "agent"
---
Diseña una propuesta de ajuste minimo para la suite de performance k6 + Grafana de REGINSA con enfoque incremental, sin reestructurar todo el framework en esta primera etapa.

Contexto confirmado del repositorio:
- Carpeta oficial de performance: [tests/performance/k6-grafana](../../tests/performance/k6-grafana)
- Casos oficiales existentes:
  - [tests/performance/k6-grafana/k6_caso_01_agregar_administrado.js](../../tests/performance/k6-grafana/k6_caso_01_agregar_administrado.js)
  - [tests/performance/k6-grafana/k6_caso_02_registrar_sancion.js](../../tests/performance/k6-grafana/k6_caso_02_registrar_sancion.js)
  - [tests/performance/k6-grafana/k6_caso_03_reconsiderar_sin_sanciones.js](../../tests/performance/k6-grafana/k6_caso_03_reconsiderar_sin_sanciones.js)
  - [tests/performance/k6-grafana/k6_caso_04_reconsiderar_con_sanciones.js](../../tests/performance/k6-grafana/k6_caso_04_reconsiderar_con_sanciones.js)
- Smoke oficial:
  - [tests/performance/k6-grafana/reginsa-smoke.js](../../tests/performance/k6-grafana/reginsa-smoke.js)
- Templates rate-limit de caso 02:
  - [tests/performance/k6-grafana/templates/k6_rate_limit_case02_template.js](../../tests/performance/k6-grafana/templates/k6_rate_limit_case02_template.js)
  - [tests/performance/k6-grafana/templates/k6_rate_limit_smoke_case02.js](../../tests/performance/k6-grafana/templates/k6_rate_limit_smoke_case02.js)
  - [tests/performance/k6-grafana/templates/k6_rate_limit_stress_case02.js](../../tests/performance/k6-grafana/templates/k6_rate_limit_stress_case02.js)
- Entradas npm relevantes en [package.json](../../package.json):
  - `k6:smoke`
  - `k6:caso02`
  - `k6:caso03`
  - `k6:caso04`
  - `test:performance`
- Runners PowerShell relevantes:
  - [scripts/run-caso01-local.ps1](../../scripts/run-caso01-local.ps1)
  - [scripts/run-caso02-local.ps1](../../scripts/run-caso02-local.ps1)

  
  - [scripts/run-k6-ratelimit-case02.ps1](../../scripts/run-k6-ratelimit-case02.ps1)
  - [scripts/run-k6-ratelimit-smoke-case02.ps1](../../scripts/run-k6-ratelimit-smoke-case02.ps1)
  - [scripts/run-k6-ratelimit-stress-case02.ps1](../../scripts/run-k6-ratelimit-stress-case02.ps1)

Objetivo funcional del cambio:
- Mantener smoke para los 4 casos de prueba.
- Dejar habilitados solo 2 modos operativos:
  - `smoke`
  - `rapido`
- El modo no debe pedirse manualmente si puede inferirse por la cantidad de ejecuciones:
  - si la cantidad es `2`, se considera `smoke`
  - si la cantidad es `3` o mayor, se considera `rapido`
- Permitir parametrizar, al menos:
  - Identificador de ejecución/campaña para trazabilidad.
  - Cantidad de ejecuciones.
  - Valor de `sleep` entre iteraciones o acciones.
- Mantener el `sleep` abierto para permitir valores como `0`, `0.08`, `0.2`, `1` u otros segun el tipo de prueba.
- Mantener enfoque incremental: en esta fase se modifica solo lo minimo necesario; cambios estructurales mayores se dejan para etapas posteriores si realmente hacen falta.

Restricciones operativas reales:
- El operador hoy trabaja localmente en una PC limitada: Core i5, 16 GB RAM, disco mecanico de 500 GB.
- Las pruebas pesadas deben poder escalar a pipelines o ejecución distribuida.
- Localmente no se debe exigir una carga que degrade o invalide la ejecución.
- Ya existen antecedentes de pruebas con JMeter y se necesita complementar, no reemplazar, ese trabajo.

Hechos de negocio y rendimiento que debes respetar:
- La operacion deseada en esta etapa es gratuita o localmente ejecutable, sin depender de servicios de pago.
- Se maneja una regla operativa donde el smoke usa exactamente `2` ejecuciones.
- A partir de `3` ejecuciones en adelante se debe reconocer automaticamente el modo `rapido`.
- Se necesita distinguir correctamente entre:
  - usuarios virtuales
  - iteraciones o ejecuciones
  - registros o datos simulados
  - tiempos de espera (`sleep`)
- Se requiere un resumen aparte que explique el valor operativo de k6 cuando la data se simula dentro del script, a diferencia de JMeter donde normalmente se usa CSV externo.

Aclaracion tecnica obligatoria:
- Debes explicar con precision que `usuarios virtuales` no es lo mismo que `cantidad de ejecuciones`.
- Debes dejar claro cuando conviene controlar carga por:
  - VUs
  - iteraciones
  - tasa
  - `sleep`
- Debes aterrizar esa explicacion al uso practico del proyecto REGINSA, no en abstracto.

Tambien debes incorporar el contexto de JMeter:
- Se adjuntaron resultados previos de JMeter donde se observan diferencias de comportamiento entre operaciones ligeras y operaciones mas costosas.
- Se necesita un resumen puntual de que se debe hacer a nivel tecnico y operativo.
- Se necesita explicar el valor agregado que aporta k6 sobre lo que ya se viene implementando en JMeter.
- El resumen final debe conectar:
  - hallazgos actuales,
  - mejoras propuestas,
  - y siguientes pasos de capacidad operativa.
- Debes incluir explicitamente que en k6 puede generarse o simularse data desde el propio script, mientras que en JMeter frecuentemente se depende de CSV o archivos de entrada.

Cuando respondas, entrega exactamente estas secciones:

## 1. Diagnostico
- Resume lo que ya existe en k6 + Grafana.
- Explica si los casos 01, 02, 03 y 04 ya cubren smoke y performance basica.
- Explica el estado del soporte de rate-limit.

## 2. Limite Tecnico Multi-IP
- Explica brevemente que este ajuste ya no prioriza multi-IP en la fase actual.
- Si mencionas multi-IP, debe ser solo como restriccion futura y sin proponer implementacion en esta etapa.

## 3. Propuesta Incremental
- Propón solo el primer cambio minimo viable.
- Indica que archivos tocar.
- Mantén el smoke de los 4 casos.
- Define el modo `rapido` posterior al smoke.
- Define la regla automatica de reconocimiento por cantidad de ejecuciones.
- Define los nuevos parametros de entrada que deberia pedir la ejecucion.

## 4. Parametros Requeridos
Debes definir al menos estos parametros:
- `grafana_project_id`
- `cantidad`
- `sleep`
- y cualquier otro que realmente sea necesario

Para cada parametro indica:
- finalidad
- tipo
- valor por defecto sugerido
- donde se usaria

## 5. Diseno de Ejecucion
- Explica como se ejecutaria:
  - local
  - pipeline
-  - observabilidad local en reportes si aplica
- Separa claramente lo que si puede ejecutarse en la PC local y lo que debe ir a pipeline.
- Si propones rangos, usa ejemplos como 2, 3, 5, 10, 50 y 100.
- Explica en que casos conviene controlar por iteraciones y en que casos por VUs.

## 6. Reglas de Proteccion del Entorno
- Define reglas para no saturar el sistema.
- Incluye la logica de smoke y luego modo rapido.
- Propón criterios de escalamiento progresivo.
- Incluye ejemplos con `sleep=0`, `sleep=0.08`, `sleep=0.2` y `sleep=1` y explica el efecto esperado.

## 7. Valor Agregado Frente a JMeter
- Explica que valor adicional aporta k6 respecto a JMeter en este proyecto.
- No hables en abstracto; aterrízalo al caso REGINSA.
- Incluye observabilidad, versionado, automatizacion, pipelines, control por caso, simulacion de data en script y resumen ejecutivo.

## 8. Resumen Ejecutivo Puntual
- Entrega una lista concreta y breve de lo que se debe hacer primero.
- Luego una lista de lo que se haria en fase posterior solo si hace falta.

## 9. Cambios Propuestos por Archivo
- Lista archivo por archivo.
- Explica para que se cambiaria cada uno.
- No propongas cambios innecesarios.

## 10. Comandos de Validacion
- Incluye comandos o runners para validar sin romper lo actual.
- Debe existir una ruta de validacion rapida y otra de validacion escalada.

## 11. Riesgos y Mitigaciones
- Riesgos tecnicos
- Riesgos operativos
- Riesgos de interpretacion incorrecta entre VUs, iteraciones y cantidad de registros

Criterios de calidad de tu respuesta:
- Debe ser concreta, aplicable y honesta tecnicamente.
- Debe priorizar el menor cambio posible en la primera etapa.
- Debe preservar compatibilidad con lo que ya existe.
- Debe dejar lista una base para escalar luego si el usuario lo aprueba.
