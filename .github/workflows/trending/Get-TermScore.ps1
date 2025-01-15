<#
.SYNOPSIS
    Calculates a relevance score for a term based on various metrics.

.DESCRIPTION
    Computes a weighted score for a term based on:
    - Frequency of appearance in news
    - Recency of mentions
    - Historical persistence
    - Quality of term variation

.PARAMETER Term
    The term to score.

.PARAMETER NewsFrequency
    How often the term appears in current news.

.PARAMETER HistoryData
    Historical data about the term including last seen date and appearance count.

.PARAMETER Variation
    List of term variations to consider.

.PARAMETER MaxFrequency
    The highest frequency among all terms for normalization.

.PARAMETER MaxAppearance
    The highest appearance count among all terms for normalization.

.EXAMPLE
    Get-TermScore -Term "Ukraine" -NewsFrequency 5 -HistoryData $histData -Variation $vars -MaxFrequency 10 -MaxAppearance 20

.OUTPUTS
    System.Double
#>
function Get-TermScore {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory,
                   Position = 0,
                   HelpMessage = "Term to score")]
        [ValidateNotNullOrEmpty()]
        [string]$Term,

        [Parameter(Mandatory,
                   Position = 1,
                   HelpMessage = "Frequency in current news")]
        [ValidateRange(0, [int]::MaxValue)]
        [int]$NewsFrequency,

        [Parameter(Mandatory,
                   Position = 2,
                   HelpMessage = "Historical data for the term")]
        [ValidateNotNull()]
        [PSCustomObject]$HistoryData,

        [Parameter(Mandatory,
                   Position = 3,
                   HelpMessage = "List of term variations")]
        [ValidateNotNull()]
        [array]$Variation,

        [Parameter(Mandatory,
                   Position = 4,
                   HelpMessage = "Maximum frequency for normalization")]
        [ValidateRange(1, [int]::MaxValue)]
        [int]$MaxFrequency,

        [Parameter(Mandatory,
                   Position = 5,
                   HelpMessage = "Maximum appearances for normalization")]
        [ValidateRange(1, [int]::MaxValue)]
        [int]$MaxAppearance
    )

    begin {
        Write-Verbose "Starting score calculation for term: $Term"

        # Import scoring weights
        . (Join-Path $PSScriptRoot "Get-TermVariation.ps1")
    }

    process {
        try {
            $score = 0.0

            # Frequency score (0-30)
            $frequencyScore = ($NewsFrequency / $MaxFrequency) * $script:relevanceScore.FrequencyWeight
            Write-Debug "Frequency score: $frequencyScore"
            $score += $frequencyScore

            # Recency score (0-25)
            if ($HistoryData.lastSeen) {
                $daysSinceLastSeen = ((Get-Date) - [DateTime]::Parse($HistoryData.lastSeen)).TotalDays
                $recencyScore = [Math]::Max(0, 1 - ($daysSinceLastSeen / 3)) * $script:relevanceScore.RecencyWeight
                Write-Debug "Recency score: $recencyScore"
                $score += $recencyScore
            }

            # Persistence score (0-25)
            $persistenceScore = ($HistoryData.appearances / $MaxAppearance) * $script:relevanceScore.PersistenceWeight
            Write-Debug "Persistence score: $persistenceScore"
            $score += $persistenceScore

            # Variation score (0-20)
            if ($Variation) {
                $variationScore = if ($Variation[0] -eq $Term) { 1 } else { 0.5 }
                $variationScore *= $script:relevanceScore.VariationWeight
                Write-Debug "Variation score: $variationScore"
                $score += $variationScore
            }

            Write-Verbose "Final score for '$Term': $score"
            return $score
        }
        catch {
            $PSCmdlet.ThrowTerminatingError(
                [System.Management.Automation.ErrorRecord]::new(
                    $_.Exception,
                    'TermScoreError',
                    [System.Management.Automation.ErrorCategory]::OperationStopped,
                    $Term
                )
            )
        }
    }

    end {
        Write-Verbose "Completed score calculation for term: $Term"
    }
}