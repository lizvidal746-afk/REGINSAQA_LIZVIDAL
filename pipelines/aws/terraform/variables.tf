variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Common prefix for resources"
  type        = string
  default     = "reginsa"
}

variable "repo_owner" {
  description = "GitHub organization or user"
  type        = string
}

variable "repo_name" {
  description = "GitHub repository name"
  type        = string
}

variable "repo_branch" {
  description = "Git branch for pipeline trigger"
  type        = string
  default     = "main"
}

variable "codestar_connection_arn" {
  description = "CodeStar connection ARN for GitHub"
  type        = string
}

variable "artifact_bucket_name" {
  description = "S3 bucket for CodePipeline artifacts"
  type        = string
}

variable "enable_codepipeline" {
  description = "Create CodePipeline resources"
  type        = bool
  default     = true
}

variable "buildspec_functional_path" {
  description = "Path to functional buildspec inside repository"
  type        = string
  default     = "pipelines/aws/buildspec-functional.yml"
}

variable "buildspec_validaciones_path" {
  description = "Path to validaciones buildspec inside repository"
  type        = string
  default     = "pipelines/aws/buildspec-validaciones.yml"
}

variable "functional_env_plain" {
  description = "Plain environment variables for functional CodeBuild"
  type        = map(string)
  default = {
    TEST_TYPE                           = "functional"
    CASE_TARGET                         = "suite"
    PW_WORKERS                          = "3"
    PW_REPEAT_EACH                      = "3"
    PW_PROJECT                          = "chromium"
    REGINSA_CASO04_SKIP_EXHAUSTED_PAGES = "1"
  }
}

variable "validaciones_env_plain" {
  description = "Plain environment variables for validaciones CodeBuild"
  type        = map(string)
  default = {
    TEST_TYPE  = "validaciones"
    CASE_TARGET = "01"
    PW_PROJECT = "chromium"
  }
}

variable "secrets_env" {
  description = "Secrets Manager mappings used in both projects. key=env var name, value=secret-id:json-key"
  type        = map(string)
  default = {
    REGINSA_URL              = "reginsa/qa:REGINSA_URL"
    REGINSA_CREDENTIALS_JSON = "reginsa/qa:REGINSA_CREDENTIALS_JSON"
  }
}

variable "secrets_manager_secret_arns" {
  description = "Allowed Secrets Manager secret ARNs for CodeBuild"
  type        = list(string)
  default     = []
}

variable "kms_key_arns" {
  description = "Allowed KMS key ARNs for decrypting secrets"
  type        = list(string)
  default     = []
}
