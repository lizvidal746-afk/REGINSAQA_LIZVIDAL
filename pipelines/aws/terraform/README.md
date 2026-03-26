# Terraform AWS pipelines

Plantilla para desplegar recursos base en AWS con enfoque reusable:

- 2 CodeBuild projects: funcional y validaciones.
- 2 CodePipeline opcionales (uno por tipo).
- Integracion con GitHub via CodeStar Connection.
- Secrets por AWS Secrets Manager para evitar hardcode.

## Requisitos

- Terraform >= 1.5
- AWS credentials con permisos de IAM, CodeBuild, CodePipeline, S3, CloudWatch Logs y Secrets Manager
- Bucket S3 para artefactos de CodePipeline
- CodeStar Connection creada y autorizada a GitHub

## Estructura

- `versions.tf`: provider y versionado
- `variables.tf`: parametros de despliegue
- `main.tf`: recursos principales
- `outputs.tf`: nombres de recursos creados
- `terraform.tfvars.example`: ejemplo de configuracion

## Uso rapido

1. Copiar y ajustar variables:

```bash
cp terraform.tfvars.example terraform.tfvars
```

1. Inicializar y validar:

```bash
terraform init
terraform validate
terraform plan
```

1. Aplicar:

```bash
terraform apply
```

## Secretos (equivalente a GitHub Secrets)

En GitHub usas Secrets del repo. En AWS la alternativa profesional es:

- Guardar secretos en AWS Secrets Manager
- Mapearlos a variables de entorno de CodeBuild con tipo `SECRETS_MANAGER`

Ejemplo en `secrets_env`:

- `REGINSA_URL = "reginsa/qa:REGINSA_URL"`
- `REGINSA_CREDENTIALS_JSON = "reginsa/qa:REGINSA_CREDENTIALS_JSON"`

Para minimo privilegio, tambien debes declarar:

- `secrets_manager_secret_arns`: lista de ARNs permitidos de Secrets Manager
- `kms_key_arns`: lista de ARNs KMS permitidos para decrypt

La plantilla valida esta regla y falla en plan/apply si usas `secrets_env` sin `secrets_manager_secret_arns`.

## Recomendaciones para evitar conflictos

- Mantener 2 pipelines separados: funcional y validaciones.
- En funcional usar `CASE_TARGET` para caso puntual o `suite` para corrida completa.
- En validaciones mantener siempre `workers=1` y `repeat-each=1`.
- Usar `name_prefix` por ambiente (`reginsa-qa`, `reginsa-dev`) para aislar recursos.

## Nota importante

Que los casos funcionales pasen local/GitHub aumenta la probabilidad de exito en AWS/Azure, pero no es garantia absoluta.

Diferencias de runner (OS, red, permisos, throttling, secretos) pueden causar variaciones. Por eso se recomienda una etapa de smoke y validaciones en cada plataforma.
