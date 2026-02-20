# Checklist de Pull Request QA y Seguridad

## Gobierno

- [ ] El cambio tiene alcance y riesgo definido.
- [ ] Se mantiene separación entorno empresa y entorno personal.
- [ ] No se incluyó código sensible de SUNEDU.

## Calidad

- [ ] Pruebas unitarias ejecutadas.
- [ ] Pruebas Playwright ejecutadas.
- [ ] Evidencias y reportes adjuntos.
- [ ] No se agregaron sleeps o datos hardcodeados.

## Performance

- [ ] K6 ejecutado para flujos críticos.
- [ ] Se revisó p95 y tasa de error.

## Seguridad

- [ ] Revisiones OWASP básicas realizadas.
- [ ] Sin credenciales en código.
- [ ] Inputs validados en escenarios críticos.

## SonarQube

- [ ] Bugs y vulnerabilities revisados.
- [ ] Quality Gate aprobado o excepción justificada.
- [ ] Trazabilidad documentada con repos Azure de referencia (Backend/Frontend).

## Trazabilidad

- [ ] Hallazgos documentados.
- [ ] Recomendaciones técnicas registradas.
- [ ] Plan de mejora definido cuando aplica.

## Transición Azure (cuando aplique)

- [ ] Se validó que el contenido es apto para migrar a Azure (sin datos sensibles).
- [ ] Se documentó el plan de traslado desde GitHub simulación a Azure oficial.
