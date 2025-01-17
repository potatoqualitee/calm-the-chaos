# Score weights for term importance
$script:relevanceScore = @{
    FrequencyWeight = 30    # How often term appears
    RecencyWeight = 25      # How recent the term is
    PersistenceWeight = 25  # Historical importance
    VariationWeight = 20    # Best form of the term
}

# Deduplication match scores
$script:deduplicationScore = @{
    ExactMatch = 10         # Identical terms
    PluralMatch = 9        # Simple plural/singular
    VerbVariation = 8      # Different verb forms
    CompoundMatch = 7      # Hyphenated vs space-separated
    SubstringMatch = 6     # One term contains another
    PrefixSuffixMatch = 5  # Common modifiers
}

<#
.SYNOPSIS
    Generates variations of a given term.

.DESCRIPTION
    Creates different variations of a term including plural/singular forms,
    verb forms, hyphenated/space-separated versions, and possessive forms.

.PARAMETER Term
    The term to generate variations for.

.EXAMPLE
    Get-TermVariation -Term "running"
    Returns variations like ["running", "run", "ran"]

.OUTPUTS
    System.Collections.ArrayList
#>
function Get-TermVariation {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory,
                   Position = 0,
                   ValueFromPipeline = $true,
                   HelpMessage = "Term to generate variations for")]
        [ValidateNotNullOrEmpty()]
        [string]$Term
    )

    begin {
        Write-Verbose "Starting Get-TermVariation for term: $Term"
    }

    process {
        try {
            $variations = [System.Collections.ArrayList]::new()

            # Add original term
            [void]$variations.Add($Term)
            Write-Debug "Added original term: $Term"

            # Remove trailing 's' (plural)
            if ($Term -match 's$') {
                $singular = $Term -replace 's$',''
                [void]$variations.Add($singular)
                Write-Debug "Added singular form: $singular"
            }

            # Handle 'ing' forms
            if ($Term -match 'ing$') {
                $past = $Term -replace 'ing$','ed'
                $base = $Term -replace 'ing$',''
                [void]$variations.Add($past)
                [void]$variations.Add($base)
                Write-Debug "Added verb forms: $past, $base"
            }

            # Handle hyphenation
            if ($Term -match '-') {
                $spaced = $Term -replace '-',' '
                [void]$variations.Add($spaced)
                Write-Debug "Added space-separated form: $spaced"
            } elseif ($Term -match '\s') {
                $hyphenated = $Term -replace '\s','-'
                [void]$variations.Add($hyphenated)
                Write-Debug "Added hyphenated form: $hyphenated"
            }

            # Handle possessives
            if ($Term -match "'s$") {
                $nonPossessive = $Term -replace "'s$",''
                [void]$variations.Add($nonPossessive)
                Write-Debug "Added non-possessive form: $nonPossessive"
            }

            Write-Verbose "Generated $(($variations | Measure-Object).Count) variations for term: $Term"
            return $variations
        }
        catch {
            $PSCmdlet.ThrowTerminatingError(
                [System.Management.Automation.ErrorRecord]::new(
                    $_.Exception,
                    'TermVariationError',
                    [System.Management.Automation.ErrorCategory]::OperationStopped,
                    $Term
                )
            )
        }
    }

    end {
        Write-Verbose "Completed Get-TermVariation"
    }
}