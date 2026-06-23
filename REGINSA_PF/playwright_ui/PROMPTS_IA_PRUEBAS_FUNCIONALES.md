# Prompts cortos para otras IAs

> Estado: archivo de referencia secundaria. La coordinacion principal del trabajo queda en `REGINSA_PF_COORDINACION_INTERIDE.md`.
>
> Uso recomendado: consultar otras IAs solo cuando haga falta texto, tablas o validacion externa. Para implementacion en REGINSA_PF, priorizar los scripts locales y la bitacora del proyecto.

## Mapa rapido de uso

| Prompt | Donde usarlo | Que traer de vuelta | Cuando usarlo |
|---|---|---|---|
| 1. Diagnostico worker/usuario/IP | IA con buena salida JSON | JSON limpio sin enlaces | Cuando una corrida falle o no cuadre por slot |
| 2. Metricas funcionales | IA que genere tablas | Tabla Markdown limpia | Cuando se quiera ajustar KPIs o umbrales |
| 3. Plan Caso 02 | IA orientada a QA/Test Management | JSON del plan | Cuando cambie el alcance de Fase 1/Fase 2 |
| 4. Ultra corto | IA barata/rapida | Bullets accionables | Solo para lluvia rapida de mejoras |

## Regla para ahorrar tokens

No pedir mas teoria general sobre Word vs dashboard, ROI, ISTQB o dashboards. Ya se decidio:

- Dashboard/HTML: operacion diaria y lectura rapida.
- Word: cierre formal, auditoria y Go/No-Go documentado.
- Excel: matriz tabular y evidencia revisable.
- Fuente comun: resultados Playwright enriquecidos con worker, slot, usuario, IP y KPIs.

## 1. Diagnostico de reporte por worker, usuario e IP

```text
Actua como QA Automation Lead senior con enfoque en Playwright, ISTQB CTAL Test Automation, ISO/IEC/IEEE 29119 e ISO 25010.

Contexto minimo:
- Proyecto: REGINSA
- Tipo: pruebas funcionales UI automatizadas
- Framework: Playwright
- Ejecucion esperada: 9 workers, 1 usuario por worker
- Necesidad: reporte HTML/Excel que muestre worker, usuario, IP, estado, tiempo, defectos y recomendacion GO/NO-GO
- Restriccion: responde breve y accionable

Analiza este problema y responde SOLO en JSON:
{
  "causas_probables": ["string"],
  "validaciones_inmediatas": ["string"],
  "campos_minimos_reporte": ["string"],
  "riesgos_de_interpretacion": ["string"],
  "recomendacion_prioritaria": "string"
}

Problema:
[PEGA AQUI tu descripcion o el fragmento del results.json]
```

## 2. Rediseño de metricas para pruebas funcionales automatizadas

```text
Actua como especialista senior en pruebas funcionales automatizadas del sector publico.

Necesito adaptar metricas inspiradas en performance testing hacia metricas de pruebas funcionales UI automatizadas, alineadas a:
- ISTQB CTFL
- ISTQB CTAL Test Automation
- ISO/IEC/IEEE 29119
- ISO/IEC 25010
- IEEE 829

Entrega SOLO una tabla en Markdown con estas columnas:
Metrica | Formula | Objetivo | Umbral sugerido | Norma/Referencia | Como medirlo en Playwright

Incluye maximo 12 metricas realmente utiles para:
- estabilidad de automatizacion
- exito por flujo
- aislamiento por usuario/worker
- integridad de datos
- repetibilidad
- evidencia y trazabilidad
```

## 3. Plan de pruebas funcionales para caso 02

```text
Actua como Test Manager senior con mas de 10 anos de experiencia en automatizacion funcional.

Contexto:
- Sistema: REGINSA
- Caso critico: Caso 02 Registrar Sancion
- Stack: Playwright
- Fase 1: 1 registro por IP/usuario
- Fase 2: 4 registros por IP/usuario
- Pool esperado: 9 usuarios

Quiero un plan de pruebas breve y profesional.

Responde SOLO en JSON con este esquema:
{
  "objetivo_general": "string",
  "precondiciones": ["string"],
  "fase_1": {
    "objetivo": "string",
    "criterios_de_entrada": ["string"],
    "criterios_de_salida": ["string"],
    "kpis": ["string"]
  },
  "fase_2": {
    "objetivo": "string",
    "criterios_de_entrada": ["string"],
    "criterios_de_salida": ["string"],
    "kpis": ["string"]
  },
  "casos_negativos_prioritarios": ["string"],
  "riesgos_operativos": ["string"],
  "recomendacion_go_no_go": "string"
}
```

## 4. Prompt ultra corto para ahorrar tokens

```text
Resume y propone mejoras para un reporte de Playwright orientado a pruebas funcionales automatizadas. Usa ISTQB, ISO 29119 e ISO 25010. Prioriza worker, usuario, IP, tasa de exito, estabilidad, defectos y trazabilidad. Devuelve solo bullets accionables.
```
