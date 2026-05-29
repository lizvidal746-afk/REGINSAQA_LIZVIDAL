@{
  ExcludeRules = @(
    'PSAvoidUsingWriteHost',
    'PSReviewUnusedParameter',
    'PSUseShouldProcessForStateChangingFunctions',
    'PSUseApprovedVerbs',
    # Nombres de funciones con sufijos de dominio (Findings, RecommendationsEs, etc.)
    # son terminologia de seguridad, no plurales gramaticales.
    'PSUseSingularNouns'
  )
  Rules = @{
    PSAvoidAssignmentToAutomaticVariable = @{
      Enable = $false
    }
  }
}
