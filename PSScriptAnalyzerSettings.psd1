@{
  ExcludeRules = @(
    'PSAvoidUsingWriteHost',
    'PSReviewUnusedParameter',
    'PSUseShouldProcessForStateChangingFunctions',
    'PSUseApprovedVerbs'
  )
  Rules = @{
    PSAvoidAssignmentToAutomaticVariable = @{
      Enable = $false
    }
  }
}
