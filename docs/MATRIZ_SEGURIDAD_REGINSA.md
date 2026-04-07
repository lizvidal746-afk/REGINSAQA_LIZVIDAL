# MATRIZ DE SEGURIDAD REGINSA

Documento operativo para ejecutar seguridad de forma continua y con evidencia auditable.

## 1. Matriz principal

| Tipo de prueba | Herramienta | Frecuencia | Criterio de pase | Evidencia |
| ---------------- | ------------- | ------------ | ------------------ | ----------- |

| DAST baseline | OWASP ZAP (`npm run security:owasp:baseline:es`) | Diario o por despliegue QA | Sin nuevos hallazgos High en baseline | `reportes/security/zap-baseline-report.*` |
| DAST full | OWASP ZAP (`zap_mode=full`) | Semanal | Tendencia controlada y plan de remediacion por Medium/Low | Artefactos de workflow OWASP |
| SAST | SonarQube (`npm run test:sonar`) | Cada release candidate y nightly | Quality Gate en PASS | Dashboard Sonar + URL del analisis |
| API funcional + reglas de negocio | Postman/Newman (`npm run api:test:all`) | Diario y por merge a rama principal | 100% colecciones criticas en verde | `reportes/newman/*.xml` |
| Dependencias (SCA) | `npm audit --json` | Diario y por cambio de lockfile | Sin Critical; High con plan de mitigacion aprobado | JSON de auditoria + ticket de riesgo |
| Pentest funcional | Manual guiado (casos 02/03/04) | Mensual o por release mayor | Sin bypass de autorizacion/integridad | Informe pentest + PoC controlada |

## 1.1 Herramientas por tipo de test importante

| Tipo de test | Herramientas usadas en REGINSA | Modo recomendado |
| -------------- | -------------------------------- | ------------------ |

| DAST rapido | OWASP ZAP baseline | Script/pipeline |
| DAST cobertura real | OWASP ZAP Desktop manual/autenticado | Manual guiado + active scan focalizado |
| SAST | SonarQube + `sonar-scanner` | Pipeline + terminal |
| API seguridad/reglas de negocio | Postman Desktop + Newman | Desktop para debug, Newman para evidencia CI |
| Dependencias (SCA) | `npm audit` | Terminal + registro de riesgos |
| E2E seguridad funcional | Playwright (flujos criticos) | Terminal/pipeline |

## 2. Priorizacion de seguridad para mercado actual

Orden recomendado para equipos QA/DevSecOps:

1. SAST + SCA en cada pipeline.
2. DAST baseline continuo.
3. API Security negativa (authn/authz, input malicioso, abuso de negocio).
4. DAST full semanal.
5. Pentest manual en flujos de alto impacto.

## 3. Cobertura real de OWASP baseline

`baseline` es util pero no cubre todo:

1. Evalua superficie alcanzable desde la URL objetivo.
2. No garantiza cubrir todos los flujos autenticados o de negocio profundo.
3. Debe complementarse con:
   - Newman (reglas de negocio y contratos API)
   - Pruebas manuales de navegacion critica
   - SonarQube y auditoria de dependencias

## 4. Flujo recomendado por iteracion

1. `npm ci`
2. `npm run api:test:all`
3. `npm run security:owasp:baseline:es`
4. `npm run test:sonar`
5. Registrar hallazgos y decisiones en Jira/Confluence.

## 5. Regla de decision para release

1. Bloquear release si hay Critical o High explotable sin mitigacion.
2. Permitir release con Medium/Low solo con plan y fecha de correccion.
3. Re-test obligatorio tras remediacion (DAST + API + SAST).
