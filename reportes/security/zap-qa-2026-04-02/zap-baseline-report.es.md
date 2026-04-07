<!-- markdownlint-disable MD001 MD012 MD013 MD034 MD060 -->

# Reporte OWASP ZAP Traducido (ES)

- Fecha: 2026-04-02 21:50:20
- Target: https://reginsaqa.sunedu.gob.pe
- Fuente: reportes\security\zap-qa-2026-04-02\zap-baseline-report.json

## Resumen Ejecutivo

- Hallazgos High (alertas): 0
- Hallazgos Medium (alertas): 5
- Hallazgos Low (alertas): 4
- Hallazgos Informational (alertas): 2

- High (ocurrencias): 0
- Medium (ocurrencias): 15
- Low (ocurrencias): 18
- Informational (ocurrencias): 4

## Interpretacion para Equipo

- High: requiere correccion prioritaria antes de liberar.
- Medium: corregir en el siguiente sprint con verificacion QA/Sec.
- Low/Info: registrar como deuda tecnica y monitorear tendencia.

## Detalle de Alertas

| Alerta | Riesgo | Ocurrencias |
| --- | --- | --- |
| CSP: Failure to Define Directive with No Fallback | Medium (High) | 3 |
| CSP: Wildcard Directive | Medium (High) | 3 |
| CSP: script-src unsafe-eval | Medium (High) | 3 |
| CSP: script-src unsafe-inline | Medium (High) | 3 |
| CSP: style-src unsafe-inline | Medium (High) | 3 |
| CSP: Notices | Low (High) | 3 |
| Server Leaks Information via "X-Powered-By" HTTP Response Header Field(s) | Low (Medium) | 5 |
| Server Leaks Version Information via "Server" HTTP Response Header Field | Low (High) | 5 |
| Timestamp Disclosure - Unix | Low (Low) | 5 |
| Modern Web Application | Informational (Medium) | 3 |
| Re-examine Cache-control Directives | Informational (Low) | 1 |

