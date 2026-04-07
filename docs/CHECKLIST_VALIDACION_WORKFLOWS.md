# Checklist de Validación de Workflows YAML REGINSA QA

Este checklist permite validar rápidamente cada workflow YAML por caso y tipo de prueba (k6, Postman, SonarQube, OWASP, Quality Gate, Smoke Cloud) en el pipeline CI/CD de REGINSA.

## Tabla Resumen de Validación

| Caso/Test         | Workflow YAML                                         | ¿Existe? | ¿Ejecuta correctamente? | ¿Sube artefactos? | ¿Documentado? |
| ------------------- | ------------------------------------------------------ |

-----------|------------------------|-------------------|---------------|

| k6 Caso 1         | reginsa-k6-caso01-selfhosted.yml                     | [ ]      | [ ]                    | [ ]               | [ ]           |
| k6 Caso 2         | reginsa-k6-caso02-selfhosted.yml                     | [ ]      | [ ]                    | [ ]               | [ ]           |
| k6 Caso 3         | reginsa-k6-caso03-selfhosted.yml                     | [ ]      | [ ]                    | [ ]               | [ ]           |
| k6 Caso 4         | reginsa-k6-caso04-selfhosted.yml                     | [ ]      | [ ]                    | [ ]               | [ ]           |
| Postman Caso 1    | reginsa-postman-caso01-selfhosted.yml                | [ ]      | [ ]                    | [ ]               | [ ]           |
| Postman Caso 2    | reginsa-postman-caso02-selfhosted.yml                | [ ]      | [ ]                    | [ ]               | [ ]           |
| Postman Caso 3    | reginsa-postman-caso03-selfhosted.yml                | [ ]      | [ ]                    | [ ]               | [ ]           |
| Postman Caso 4    | reginsa-postman-caso04-selfhosted.yml                | [ ]      | [ ]                    | [ ]               | [ ]           |
| SonarQube         | reginsa-sonarqube-selfhosted.yml                     | [ ]      | [ ]                    | [ ]               | [ ]           |
| OWASP ZAP         | reginsa-owasp-selfhosted.yml                         | [ ]      | [ ]                    | [ ]               | [ ]           |
| Quality Gate      | reginsa-quality-gate-selfhosted.yml                  | [ ]      | [ ]                    | [ ]               | [ ]           |
| Smoke Cloud Caso 1| reginsa-smoke-caso01-cloud-selfhosted.yml            | [ ]      | [ ]                    | [ ]               | [ ]           |
| Smoke Cloud Caso 2| reginsa-smoke-caso02-cloud-selfhosted.yml            | [ ]      | [ ]                    | [ ]               | [ ]           |
| Smoke Cloud Caso 3| reginsa-smoke-caso03-cloud-selfhosted.yml            | [ ]      | [ ]                    | [ ]               | [ ]           |
| Smoke Cloud Caso 4| reginsa-smoke-caso04-cloud-selfhosted.yml            | [ ]      | [ ]                    | [ ]               | [ ]           |

## Pasos de Validación para cada Workflow

1. **Verificar existencia del archivo YAML**
   - El archivo debe estar en `.github/workflows/` y tener el nombre correcto.
2. **Revisar sintaxis YAML**
   - Validar que no tenga errores de formato.
3. **Ejecutar el workflow manualmente (workflow_dispatch)**
   - Probar con los parámetros principales.
4. **Verificar logs de ejecución**
   - Confirmar que todos los pasos se ejecutan sin errores.
5. **Validar subida de artefactos/evidencias**
   - Revisar que los resultados y reportes se suban correctamente.
6. **Confirmar integración con herramientas externas**
   - Ejemplo: SonarQube, OWASP ZAP, k6 local, etc.
7. **Revisar documentación**
   - El workflow debe estar documentado en `README_OPERACION_PACKS.md`.
8. **Repetir para cada caso y tipo de prueba**

---

> **Nota:** Marcar cada casilla `[ ]` al completar cada paso para cada workflow.
