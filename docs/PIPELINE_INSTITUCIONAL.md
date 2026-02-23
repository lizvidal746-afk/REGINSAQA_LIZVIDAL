# Pipeline Institucional

Pipelines disponibles:

- GitHub Actions: `pipelines/github-actions/reginsa-enterprise.yml`
- Azure DevOps: `pipelines/azure/azure-pipelines-enterprise.yml`
- Jenkins: `pipelines/jenkins/Jenkinsfile`

Parámetros soportados:

- tipo de suite (`smoke`, `functional`, `regression`, `performance`, `security`)
- workers
- repeat-each
- cantidad de registros
- ambiente (`dev`, `qa`, `prod`)
- headless
