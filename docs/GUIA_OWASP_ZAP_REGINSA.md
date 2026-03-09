# GUIA OWASP ZAP REGINSA

Documento exclusivo para DAST con OWASP ZAP.

Documento relacionado (SAST):

- `docs/GUIA_SONARQUBE_REGINSA.md`
- `docs/MATRIZ_SEGURIDAD_REGINSA.md`
- `docs/GUIA_OWASP_ZAP_MANUAL_AUTENTICADO_REGINSA.md`

## 1. Objetivo

Detectar vulnerabilidades de seguridad en endpoints web/API y generar evidencia tecnica y ejecutiva.

## 2. Modos recomendados

1. Baseline diario: rapido, no intrusivo.
2. Full semanal: mas profundo.
3. Re-test despues de correcciones.

Importante:

- `baseline` no cubre automaticamente todos los flujos de negocio ni toda la navegacion autenticada.
- Complementar con `docs/GUIA_POSTMAN_NEWMAN_CASOS_01_04.md` y pruebas manuales criticas.
- Para cobertura real por navegacion autenticada, usar `docs/GUIA_OWASP_ZAP_MANUAL_AUTENTICADO_REGINSA.md`.

## 3. Ejecucion local

```powershell
$env:REGINSA_URL="https://reginsaapiqa.sunedu.gob.pe"
npm run security:owasp:baseline:es
```

El comando ejecuta:

1. `tests/security/zap/zap-baseline.ps1`
2. `scripts/security/translate-zap-report.ps1`

## 4. Artefactos generados

- `reportes/security/zap-baseline-report.html`
- `reportes/security/zap-baseline-report.json`
- `reportes/security/zap-baseline-report.md`
- `reportes/security/zap-baseline-report.es.md`

## 5. Ejecucion por pipeline

Pipelines recomendados:

- Azure DevOps: `pipelines/azure/azure-pipelines-enterprise.yml` (activar `RUN_SONAR` segun necesidad y agregar stage DAST dedicado).
- Jenkins: `pipelines/jenkins/Jenkinsfile` con `TEST_TYPE=security`.

Inputs:

- `zap_mode=baseline|full`
- `target_url`
- `max_minutes`

## 6. Herramientas de apoyo implementadas

- Traductor de hallazgos a espanol (`translate-zap-report.ps1`).
- Pipeline institucional con carga de artefactos en Azure/Jenkins.
- Integracion con evidencia funcional (Newman XML) para analisis conjunto.

## 7. Reporte profesional de hallazgos

Plantilla minima:

1. Hallazgo (titulo + endpoint).
2. Severidad OWASP (High/Medium/Low).
3. Evidencia tecnica (request/response/trace).
4. Impacto en negocio y datos.
5. Recomendacion de remediacion.
6. Criterio de cierre y re-test.
7. Resumen ejecutivo en espanol (`.es.md`).

## 8. Matriz operativa integral

Para el plan completo (DAST + SAST + API + SCA + pentest), usar:

- `docs/MATRIZ_SEGURIDAD_REGINSA.md`

## 9. Cobertura manual real (desktop)

Para ejecutar OWASP navegando manualmente todo flujo critico de REGINSA:

- `docs/GUIA_OWASP_ZAP_MANUAL_AUTENTICADO_REGINSA.md`
