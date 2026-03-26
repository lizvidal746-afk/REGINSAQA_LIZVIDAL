# Checklist Operativo CI/CD por Plataforma

## Objetivo

Estandarizar ejecuciones REGINSA en GitHub, Azure, Jenkins y AWS con dos niveles:

- Minimo para pasar: funcional y estable.
- Nivel profesional: escalable, auditable y mantenible.

## GitHub Actions

### GitHub minimo para pasar

- Workflows en `.github/workflows/`.
- `workflow_dispatch` para ejecucion manual por caso.
- Secrets minimos configurados en repositorio/entorno:
  - `REGINSA_URL`
  - `REGINSA_USER_*` / `REGINSA_PASS_*` (segun flujo)
  - `REGINSA_API_BASE` (cuando aplica)
- Artefactos basicos (reportes Playwright, logs).

### GitHub nivel profesional

- Reglas por entorno (`dev/qa/preprod`) con GitHub Environments.
- Protection rules y aprobaciones por ambiente.
- Reusable workflows (`workflow_call`) para evitar duplicidad.
- Matriz controlada para casos/targets y versionado de runners self-hosted.
- Gates de calidad (sonar, security, smoke) previos a despliegue.

## Azure Pipelines

### Azure minimo para pasar

- Pipeline principal en `azure-pipelines.yml`.
- Variables minimas cargadas en Variable Group seguro.
- Trigger manual o por branch definida.
- Publicacion de reportes como pipeline artifact.

### Azure nivel profesional

- Templates YAML reutilizables por tipo de prueba.
- Variable Groups por ambiente y permisos RBAC.
- Service Connections separados por entorno.
- Stage gates y approvals antes de pasar de QA a entornos superiores.

## Jenkins

### Jenkins minimo para pasar

- Jenkinsfile definido y referenciado en el job.
- Credenciales en Jenkins Credentials Store (nunca en texto plano).
- Parametros para `CASE_TARGET`, `PW_WORKERS`, `PW_REPEAT_EACH`.
- Archivo actual: `pipelines/jenkins/Jenkinsfile`.

### Jenkins nivel profesional

- Multibranch Pipeline con descubrimiento por rama.
- Shared Libraries para pasos comunes (checkout, test, reportes).
- Agentes etiquetados por tipo de carga (playwright, k6, security).
- Politica de retencion de builds y artefactos.

## AWS (CodeBuild / CodePipeline)

### AWS minimo para pasar

- Buildspec configurado en el proyecto CodeBuild:
  - `pipelines/aws/buildspec-functional.yml`
  - `pipelines/aws/buildspec-validaciones.yml`
- Variables en CodeBuild/SSM/Secrets Manager.
- Ejecutar funcional y validaciones por separado.

### AWS nivel profesional

- Infra declarativa con Terraform (`pipelines/aws/terraform/`).
- IAM least privilege para secretos/KMS.
- CodePipeline con etapas separadas y aprobaciones.
- Logs centralizados y alarmas (CloudWatch).
- Convencion de nombres por entorno y tagging estandar.

## Reglas de reconocimiento por herramienta

- GitHub Actions detecta automaticamente archivos en `.github/workflows/`.
- Azure DevOps detecta por defecto `azure-pipelines.yml` en raiz, o ruta custom al crear pipeline.
- Jenkins usa `Jenkinsfile` por defecto en raiz, o ruta custom en configuracion del job.
- AWS CodeBuild usa `buildspec.yml` por defecto en raiz, o ruta custom definida en el proyecto.

## Nota sobre advertencias amarillas en VS Code

- Muchas advertencias en workflows del tipo `Context access might be invalid` vienen del analizador estatico de GitHub Actions.
- El analizador no conoce en local los `secrets.*` y `vars.*` reales de GitHub, por eso marca amarillo aunque en runtime pueda funcionar.
- Si los secretos/variables existen en GitHub, el workflow puede ejecutar correctamente aunque VS Code muestre advertencia.

## Verificacion rapida recomendada

- Abrir la pestaña Problems y filtrar por `.github/workflows`.
- Confirmar que no hay errores de sintaxis YAML.
- Confirmar en GitHub Settings que existen los secrets/vars usados por cada workflow.
- Ejecutar un `workflow_dispatch` de prueba por caso (01, 02, 03, 04).
