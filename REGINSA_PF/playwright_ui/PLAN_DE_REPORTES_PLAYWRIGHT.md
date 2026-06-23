# Plan de reportes Playwright - REGINSA_PF

## 1. Objetivo

Definir una reportería profesional, coherente y reutilizable para pruebas funcionales Playwright de REGINSA, separando evidencia operativa, evidencia tecnica y documentos formales.

## 2. Principio de diseño

Cada corrida genera una carpeta unica bajo:

```text
REGINSA_PF\playwright_ui\reportes\<RUN_ID>
```

No se generan reportes nuevos en la raiz `REGINSA_PF`.

## 3. Estructura oficial

```text
playwright_ui\
  reportes\
    <RUN_ID>\
      RUN_SUMMARY.txt
      *.html
      *.xlsx
      *.doc
      _technical\
        playwright-report\
          index.html
          results.json
          pf-report.json
        allure-results\
          *.json
          environment.properties
          categories.json
        allure-report\
          index.html
          data\
        test-results\
```

## 4. Tipos de reporte

| Reporte | Ruta | Uso | Apertura |
|---|---|---|---|
| HTML REGINSA | `reportes/<RUN_ID>/*.html` | Dashboard funcional ejecutivo/operativo. | `Start-Process` directo. |
| Excel REGINSA | `reportes/<RUN_ID>/*.xlsx` | Matriz QA y auditoria. | Manual. |
| Word REGINSA | `reportes/<RUN_ID>/*.doc` | Informe formal. | Manual. |
| Playwright HTML | `reportes/<RUN_ID>/_technical/playwright-report/index.html` | Debug tecnico. | Directo desde runner. |
| Allure | `reportes/<RUN_ID>/_technical/allure-report` | Evidencia tecnica por suites, steps y adjuntos. | Servidor local con `npx allure open`. |
| RUN_SUMMARY | `reportes/<RUN_ID>/RUN_SUMMARY.txt` | Indice de rutas generadas. | Texto. |

## 5. Reglas de apertura

- El runner abre reportes automaticamente por defecto.
- Usar `-NoOpenReports` para generar sin abrir ventanas.
- Allure no debe abrirse por `file://`, porque puede mostrar `500 Failed to fetch`.
- Allure debe abrirse por servidor local:

```powershell
npx allure open <ruta-allure-report>
```

## 6. Fuentes de datos

| Fuente | Productor | Consumidor |
|---|---|---|
| `results.json` | Playwright JSON reporter | `validate-dual-view.js`, `generar-excel.js`, `generar-word.js` |
| `pf-report.json` | `validate-dual-view.js` | `generar-html.js` |
| `allure-results` | `allure-playwright` | `allure generate` |
| `environment.properties` | `run-pf.ps1` | Allure |
| `RUN_SUMMARY.txt` | `run-pf.ps1` | Usuario, auditoria y soporte |

## 7. Estado de IA/Ollama

Ollama esta pausado temporalmente. El reporte Word usa heuristicas locales salvo que se active explicitamente:

```powershell
$env:REGINSA_USE_OLLAMA = "1"
```

o:

```powershell
$env:OLLAMA_ENABLED = "1"
```

## 8. Mejoras visuales aplicadas

- Las graficas Chart.js tienen margen superior para evitar recorte de totales.
- Las barras usan `grace` en el eje para no sobresalir del contenedor.
- Las etiquetas deben permanecer visibles aun con pocos datos.

## 9. Carpetas fuera de uso

Estas rutas no deben reaparecer como salida de ejecuciones orquestadas:

```text
REGINSA_PF\allure-report
REGINSA_PF\playwright-report
REGINSA_PF\playwright-ui-report
REGINSA_PF\reportes
```

Si reaparecen, revisar scripts antiguos o wrappers que sigan apuntando fuera de `playwright_ui\reportes`.

## 10. Pendientes de mejora

- Agregar portada institucional al HTML funcional.
- Homologar nombres de archivos por caso, escenario y fecha.
- Agregar seccion "Como interpretar el resultado" para jefatura QA.
- Consolidar historico por caso sin mezclar corridas tecnicas.
- Evaluar si Playwright HTML tambien debe abrirse por servidor para escenarios con traces complejos.
