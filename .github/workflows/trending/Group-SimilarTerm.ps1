function Group-SimilarTerm {
    <#
    .SYNOPSIS
        Groups similar terms together based on semantic similarity.

    .DESCRIPTION
        Analyzes a collection of terms and groups them based on semantic similarity
        using Ollama-based semantic analysis. Terms that refer to the same topic
        or entity are grouped together.

    .PARAMETER Term
        Collection of terms to group.

    .EXAMPLE
        Group-SimilarTerm -Term @("Biden", "Joe Biden", "President Biden")
        Groups related terms into a single collection.

    .OUTPUTS
        System.Collections.Hashtable
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory,
                   Position = 0,
                   ValueFromPipeline = $true,
                   HelpMessage = "Collection of terms to group")]
        [ValidateNotNull()]
        [array]$Term
    )

    begin {
        Write-Verbose "Starting term grouping process with $($Term.Count) terms"
        $termGroups = @{}
        $processedCount = 0
    }

    process {
        try {
            foreach ($currentTerm in $Term) {
                $processedCount++
                # Update progress every 3 items to slow down the progress bar
                if ($processedCount % 3 -eq 0 -or $processedCount -eq 1 -or $processedCount -eq $Term.Count) {
                    $percentage = [math]::Round(($processedCount / $Term.Count) * 100)
                    $splat = @{
                        Activity        = "Analyzing Terms"
                        Status          = "$processedCount out of $($Term.Count) terms processed ($percentage%)"
                        PercentComplete = $percentage
                    }

                    Write-Progress @splat
                }

                Write-Debug "Processing term: $currentTerm"
                $bestMatchGroup = $null

                # Check each existing group for a match
                foreach ($groupKey in $termGroups.Keys) {

                    foreach ($groupTerm in $termGroups[$groupKey]) {
                        $similarityScore = Test-TermSimilarity -Term1 $currentTerm -Term2 $groupTerm
                        Write-Debug "Comparing '$currentTerm' with '$groupTerm': score $similarityScore"

                        if ($similarityScore -eq 10) {
                            $bestMatchGroup = $groupKey
                            break
                        }
                    }
                    if ($bestMatchGroup) { break }
                }

                if ($bestMatchGroup) {
                    Write-Verbose "Adding '$currentTerm' to group '$bestMatchGroup'"
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
            Write-Progress -Activity "Analyzing Terms" -Completed
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
        Write-Progress -Activity "Analyzing Terms" -Completed
        Write-Verbose "Completed grouping process. Created $($termGroups.Count) groups"
        return $termGroups
    }
}