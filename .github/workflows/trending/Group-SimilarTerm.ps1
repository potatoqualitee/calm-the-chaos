<#
.SYNOPSIS
    Groups similar terms together based on semantic similarity.

.DESCRIPTION
    Analyzes a collection of terms and groups them based on semantic similarity
    using both exact matching and Ollama-based semantic analysis. Terms that
    refer to the same topic or entity are grouped together.

.PARAMETER Term
    Collection of terms to group.

.EXAMPLE
    Group-SimilarTerm -Term @("Biden", "Joe Biden", "President Biden")
    Groups related terms into a single collection.

.OUTPUTS
    System.Collections.Hashtable
#>
function Group-SimilarTerm {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true,
                   Position = 0,
                   ValueFromPipeline = $true,
                   HelpMessage = "Collection of terms to group")]
        [ValidateNotNull()]
        [array]$Term
    )

    begin {
        Write-Verbose "Starting term grouping process with $($Term.Count) terms"
        $termGroups = @{}
    }

    process {
        try {
            foreach ($currentTerm in $Term) {
                Write-Debug "Processing term: $currentTerm"

                $variations = Get-TermVariation -Term $currentTerm
                $bestMatchScore = 0
                $bestMatchGroup = $null

                # Check each existing group for a match
                foreach ($groupKey in $termGroups.Keys) {
                    foreach ($groupTerm in $termGroups[$groupKey]) {
                        # Check each variation against the group term
                        foreach ($variation in $variations) {
                            $similarityScore = Test-TermSimilarity -Term1 $variation -Term2 $groupTerm
                            Write-Debug "Comparing variation '$variation' with '$groupTerm': score $similarityScore"

                            if ($similarityScore -gt $bestMatchScore) {
                                $bestMatchScore = $similarityScore
                                $bestMatchGroup = $groupKey
                            }
                        }
                    }
                }

                # Only group if very similar (score > 8)
                if ($bestMatchGroup -and $bestMatchScore -gt 8) {
                    Write-Verbose "Adding '$currentTerm' to group '$bestMatchGroup' (score: $bestMatchScore)"
                    [void]$termGroups[$bestMatchGroup].Add($currentTerm)
                }
                else {
                    Write-Verbose "Creating new group for '$currentTerm'"
                    $newGroup = [System.Collections.ArrayList]::new()
                    [void]$newGroup.Add($currentTerm)
                    $termGroups[$currentTerm] = $newGroup
                }
            }
        }
        catch {
            $PSCmdlet.ThrowTerminatingError(
                [System.Management.Automation.ErrorRecord]::new(
                    $_.Exception,
                    'TermGroupingError',
                    [System.Management.Automation.ErrorCategory]::OperationStopped,
                    $Term
                )
            )
        }
    }

    end {
        Write-Verbose "Completed grouping process. Created $($termGroups.Count) groups"
        return $termGroups
    }
}