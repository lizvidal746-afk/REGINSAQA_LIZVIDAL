output "functional_codebuild_project" {
  value       = aws_codebuild_project.functional.name
  description = "CodeBuild project for functional tests"
}

output "validaciones_codebuild_project" {
  value       = aws_codebuild_project.validaciones.name
  description = "CodeBuild project for validaciones tests"
}

output "functional_pipeline" {
  value       = try(aws_codepipeline.functional[0].name, null)
  description = "CodePipeline for functional tests"
}

output "validaciones_pipeline" {
  value       = try(aws_codepipeline.validaciones[0].name, null)
  description = "CodePipeline for validaciones tests"
}
