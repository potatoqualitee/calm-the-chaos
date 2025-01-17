# Import all functions
. $PSScriptRoot/Get-BingNews.ps1
. $PSScriptRoot/Get-BraveNews.ps1
. $PSScriptRoot/Get-Gist.ps1
. $PSScriptRoot/Get-OpenAIAnalysis.ps1
. $PSScriptRoot/Get-TermVariation.ps1
. $PSScriptRoot/Group-SimilarTerm.ps1
. $PSScriptRoot/Set-TrendingTopic.ps1
. $PSScriptRoot/Test-TermSimilarity.ps1
. $PSScriptRoot/Update-Gist.ps1

# Export functions
Export-ModuleMember -Function @(
    'Get-BingNews',
    'Get-BraveNews',
    'Get-Gist',
    'Get-OpenAIAnalysis',
    'Get-TermVariation',
    'Group-SimilarTerm',
    'Set-TrendingTopic',
    'Test-TermSimilarity',
    'Update-Gist'
)