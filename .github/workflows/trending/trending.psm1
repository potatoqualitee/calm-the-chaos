# Import all function files
. $PSScriptRoot\Get-TermVariation.ps1
. $PSScriptRoot\Test-TermSimilarity.ps1
. $PSScriptRoot\Get-TermScore.ps1
. $PSScriptRoot\Group-SimilarTerm.ps1
. $PSScriptRoot\Update-Gist.ps1

# Export functions
Export-ModuleMember -Function @(
    'Get-TermVariation',
    'Test-TermSimilarity',
    'Get-TermScore',
    'Group-SimilarTerm',
    'Update-Gist'
)