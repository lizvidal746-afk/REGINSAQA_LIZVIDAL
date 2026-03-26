locals {
  functional_project_name   = "${var.name_prefix}-functional"
  validaciones_project_name = "${var.name_prefix}-validaciones"

  codebuild_secret_statement = length(var.secrets_manager_secret_arns) > 0 ? [
    {
      Sid    = "SecretsManagerRead"
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue"
      ]
      Resource = var.secrets_manager_secret_arns
    }
  ] : []

  codebuild_kms_statement = length(var.kms_key_arns) > 0 ? [
    {
      Sid    = "KMSDecrypt"
      Effect = "Allow"
      Action = [
        "kms:Decrypt"
      ]
      Resource = var.kms_key_arns
    }
  ] : []
}

resource "aws_cloudwatch_log_group" "codebuild" {
  name              = "/aws/codebuild/${var.name_prefix}"
  retention_in_days = 30
}

resource "aws_iam_role" "codebuild_role" {
  name = "${var.name_prefix}-codebuild-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "codebuild.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "codebuild_policy" {
  name = "${var.name_prefix}-codebuild-policy"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [
        {
          Sid    = "Logs"
          Effect = "Allow"
          Action = [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ]
          Resource = "*"
        },
        {
          Sid    = "Artifacts"
          Effect = "Allow"
          Action = [
            "s3:GetObject",
            "s3:PutObject",
            "s3:GetObjectVersion",
            "s3:ListBucket"
          ]
          Resource = [
            "arn:aws:s3:::${var.artifact_bucket_name}",
            "arn:aws:s3:::${var.artifact_bucket_name}/*"
          ]
        }
      ],
      local.codebuild_secret_statement,
      local.codebuild_kms_statement
    )
  })
}

resource "terraform_data" "validate_secret_permissions" {
  input = {
    secrets_env_count = length(var.secrets_env)
    secrets_arn_count = length(var.secrets_manager_secret_arns)
  }

  lifecycle {
    precondition {
      condition     = length(var.secrets_env) == 0 || length(var.secrets_manager_secret_arns) > 0
      error_message = "Define secrets_manager_secret_arns cuando uses secrets_env para mantener minimo privilegio."
    }
  }
}

resource "aws_codebuild_project" "functional" {
  name          = local.functional_project_name
  service_role  = aws_iam_role.codebuild_role.arn
  build_timeout = 120

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_LARGE"
    image                       = "aws/codebuild/standard:7.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"

    dynamic "environment_variable" {
      for_each = var.functional_env_plain
      content {
        name  = environment_variable.key
        value = environment_variable.value
        type  = "PLAINTEXT"
      }
    }

    dynamic "environment_variable" {
      for_each = var.secrets_env
      content {
        name  = environment_variable.key
        value = environment_variable.value
        type  = "SECRETS_MANAGER"
      }
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.codebuild.name
      stream_name = "functional"
    }
  }

  source {
    type      = "CODEPIPELINE"
    buildspec = var.buildspec_functional_path
  }
}

resource "aws_codebuild_project" "validaciones" {
  name          = local.validaciones_project_name
  service_role  = aws_iam_role.codebuild_role.arn
  build_timeout = 60

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_MEDIUM"
    image                       = "aws/codebuild/standard:7.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"

    dynamic "environment_variable" {
      for_each = var.validaciones_env_plain
      content {
        name  = environment_variable.key
        value = environment_variable.value
        type  = "PLAINTEXT"
      }
    }

    dynamic "environment_variable" {
      for_each = var.secrets_env
      content {
        name  = environment_variable.key
        value = environment_variable.value
        type  = "SECRETS_MANAGER"
      }
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.codebuild.name
      stream_name = "validaciones"
    }
  }

  source {
    type      = "CODEPIPELINE"
    buildspec = var.buildspec_validaciones_path
  }
}

resource "aws_iam_role" "codepipeline_role" {
  count = var.enable_codepipeline ? 1 : 0
  name  = "${var.name_prefix}-codepipeline-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "codepipeline.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "codepipeline_policy" {
  count = var.enable_codepipeline ? 1 : 0
  name  = "${var.name_prefix}-codepipeline-policy"
  role  = aws_iam_role.codepipeline_role[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "codestar-connections:UseConnection"
        ]
        Resource = var.codestar_connection_arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:GetObjectVersion",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.artifact_bucket_name}",
          "arn:aws:s3:::${var.artifact_bucket_name}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "codebuild:BatchGetBuilds",
          "codebuild:StartBuild"
        ]
        Resource = [
          aws_codebuild_project.functional.arn,
          aws_codebuild_project.validaciones.arn
        ]
      }
    ]
  })
}

resource "aws_codepipeline" "functional" {
  count    = var.enable_codepipeline ? 1 : 0
  name     = "${var.name_prefix}-functional-pipeline"
  role_arn = aws_iam_role.codepipeline_role[0].arn

  artifact_store {
    location = var.artifact_bucket_name
    type     = "S3"
  }

  stage {
    name = "Source"

    action {
      name             = "Source"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["source_output"]
      configuration = {
        ConnectionArn    = var.codestar_connection_arn
        FullRepositoryId = "${var.repo_owner}/${var.repo_name}"
        BranchName       = var.repo_branch
      }
    }
  }

  stage {
    name = "Build"

    action {
      name             = "Functional"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      input_artifacts  = ["source_output"]
      output_artifacts = ["functional_output"]
      configuration = {
        ProjectName = aws_codebuild_project.functional.name
      }
    }
  }
}

resource "aws_codepipeline" "validaciones" {
  count    = var.enable_codepipeline ? 1 : 0
  name     = "${var.name_prefix}-validaciones-pipeline"
  role_arn = aws_iam_role.codepipeline_role[0].arn

  artifact_store {
    location = var.artifact_bucket_name
    type     = "S3"
  }

  stage {
    name = "Source"

    action {
      name             = "Source"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["source_output"]
      configuration = {
        ConnectionArn    = var.codestar_connection_arn
        FullRepositoryId = "${var.repo_owner}/${var.repo_name}"
        BranchName       = var.repo_branch
      }
    }
  }

  stage {
    name = "Build"

    action {
      name             = "Validaciones"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      input_artifacts  = ["source_output"]
      output_artifacts = ["validaciones_output"]
      configuration = {
        ProjectName = aws_codebuild_project.validaciones.name
      }
    }
  }
}
