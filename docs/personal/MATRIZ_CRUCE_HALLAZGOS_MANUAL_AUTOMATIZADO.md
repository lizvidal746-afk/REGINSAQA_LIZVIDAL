# Matriz de Cruce de Hallazgos (Manual vs Automatizado)

Fecha de corte: 2026-03-12
Proyecto: REGINSA

## Objetivo

Unificar hallazgos de escaneo automatizado (SonarQube y OWASP) con evidencia manual (validaciones funcionales, API y reglas de negocio) para clasificar:

- Confirmado
- Falso positivo
- Pendiente de validacion
- Hallazgo solo manual

## Criterio de uso

1. Registrar el hallazgo automatizado con su identificador (rule key, alerta ZAP, issue key).
2. Asociar evidencia manual (caso, captura, endpoint, log).
3. Evaluar impacto real de negocio/seguridad.
4. Asignar estado final y plan de remediacion.

## Tabla de cruce

| ID | Fuente automatizada | Regla/Alerta | Repositorio/Modulo | Archivo/Endpoint | Severidad auto | Evidencia manual asociada | Resultado del cruce | Impacto real | Decision | Responsable | Fecha compromiso | Estado |
|----|---------------------|--------------|--------------------|------------------|----------------| -----------------------
|--------|---------------------|--------------|----------|-------------|------------------|
| 1 | SonarQube | (ej. typescript:Sxxxx) | SI091_REGINSA_FRONTEND-1 | src/... | Major | Caso manual X + captura Y | Coincide parcial | Medio | Corregir en sprint | Dev Front | 2026-03-20 | Pendiente |
| 2 | OWASP ZAP | CSP: script-src unsafe-eval | ENLINEA/REGINSA WEB | / + headers CSP | Medium | Prueba manual de cabeceras | Confirmado | Alto | Corregir prioritario | Dev Web/DevOps | 2026-03-18 | En progreso |
| 3 | OWASP ZAP | Server header leak | Gateway/API | Header Server | Low | Verificacion manual curl/browser | Confirmado | Medio | Hardening | DevOps | 2026-03-22 | Pendiente |
| 4 | Manual | Regla de negocio N | API REGINSA | /api/... | N/A | Evidencia funcional y log backend | Hallazgo solo manual | Alto | Corregir backend | Dev Backend | 2026-03-19 | Pendiente |

## Catalogo de decisiones

- Corregir prioritario: requiere atencion inmediata.
- Corregir en sprint: programado para el sprint vigente.
- Monitorear: no bloqueante, seguimiento por tendencia.
- Falso positivo justificado: documentar razon tecnica y evidencia.

## Reglas de cierre

- Confirmado cerrado: existe evidencia tecnica de correccion + re-ejecucion automatizada sin recurrencia.
- Falso positivo cerrado: existe justificacion tecnica aprobada + evidencia reproducible.
- Pendiente: requiere validacion adicional o reproduccion controlada.

## Resumen ejecutivo para comite

| Categoria | Cantidad |
|--        -|--       -|
| Confirmados | 0 |
| Falsos positivos justificados | 0 |
| Pendientes de validacion | 0 |
| Solo manual (no detectados automatico) | 0 |
| Cerrados con evidencia | 0 |

## Referencias sugeridas

- Sonar dashboards por repositorio.
- OWASP baseline JSON/HTML/ES.
- Evidencia manual (casos de validacion, capturas, logs API/backend).
