<#
.SYNOPSIS
    Tests if two terms are semantically similar using Ollama API.

.DESCRIPTION
    Determines if two terms refer to the same topic by using exact matching
    and Ollama API for semantic similarity. Includes retry logic and fallback
    to basic string comparison.

.PARAMETER Term1
    The first term to compare.

.PARAMETER Term2
    The second term to compare.

.EXAMPLE
    Test-TermSimilarity -Term1 "Biden" -Term2 "Joe Biden"
    Returns $true as they refer to the same entity.

.OUTPUTS
    System.Boolean
#>
function Test-TermSimilarity {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true,
                   Position = 0,
                   HelpMessage = "First term to compare")]
        [ValidateNotNullOrEmpty()]
        [string]$Term1,

        [Parameter(Mandatory = $true,
                   Position = 1,
                   HelpMessage = "Second term to compare")]
        [ValidateNotNullOrEmpty()]
        [string]$Term2
    )

    begin {
        Write-Verbose "Starting similarity test between '$Term1' and '$Term2'"

        # Get variations for both terms
        $variations1 = Get-TermVariation -Term $Term1
        $variations2 = Get-TermVariation -Term $Term2

        Write-Debug "Term1 variations: $($variations1 -join ', ')"
        Write-Debug "Term2 variations: $($variations2 -join ', ')"
    }

    process {
        try {
            # Check for exact matches first
            foreach ($var1 in $variations1) {
                foreach ($var2 in $variations2) {
                    if ($var1 -eq $var2 -or
                        ($var1 -replace 's$','' -eq $var2 -replace 's$','')) {
                        Write-Verbose "Exact match found: '$var1' ~ '$var2'"
                        return $true
                    }
                }
            }

            # For non-exact matches, use Ollama
            $apiUrl = "http://localhost:11434/api/chat"
            $outputSchema = Get-Content -Path (Join-Path $PSScriptRoot "..\output_schema.json") -Raw | ConvertFrom-Json

            # Retry configuration
            $maxRetries = 3
            $retryDelay = 2

            for ($i = 0; $i -lt $maxRetries; $i++) {
                try {
                    $requestPayload = @{
                        model    = "llama3.1"
                        messages = @(
                            @{
                                role    = "user"
                                content = "Do these terms refer to the same topic/subject/entity (not just related)? '$Term1' and '$Term2'? For example, 'Trump' and 'Trump Organization' would be true - they are related topics. Only respond with true if they are a simplar topic, false if different."
                            }
                        )
                        stream   = $false
                        format   = $outputSchema
                    } | ConvertTo-Json -Depth 4 -Compress

                    $invokeRestMethodParams = @{
                        Uri         = $apiUrl
                        Method      = 'Post'
                        Body        = $requestPayload
                        ContentType = 'application/json'
                        TimeoutSec  = 30
                    }

                    Write-Verbose "Attempting Ollama API call (attempt $($i + 1) of $maxRetries)"
                    $response = Invoke-RestMethod @invokeRestMethodParams

                    if ($null -eq $response.message -or
                        $null -eq $response.message.content -or
                        $null -eq $response.message.content.is_same_topic) {
                        throw "Invalid response format from Ollama API"
                    }

                    Write-Verbose "Semantic check: '$Term1' ~ '$Term2' (same topic: $($response.message.content.is_same_topic))"
                    return $response.message.content.is_same_topic
                }
                catch {
                    Write-Warning "Ollama API call failed (attempt $($i + 1) of $maxRetries): $_"

                    if ($i -lt $maxRetries - 1) {
                        Start-Sleep -Seconds $retryDelay
                        $retryDelay *= 2  # Exponential backoff
                    }
                    else {
                        Write-Warning "All Ollama API retries failed, falling back to basic string comparison"
                        return $Term1 -eq $Term2
                    }
                }
            }

            # If we get here, all retries failed
            Write-Warning "All Ollama API retries failed, falling back to basic string comparison"
            return $Term1 -eq $Term2
        }
        catch {
            $PSCmdlet.ThrowTerminatingError(
                [System.Management.Automation.ErrorRecord]::new(
                    $_.Exception,
                    'TermSimilarityError',
                    [System.Management.Automation.ErrorCategory]::OperationStopped,
                    @($Term1, $Term2)
                )
            )
        }
    }

    end {
        Write-Verbose "Completed similarity test between '$Term1' and '$Term2'"
    }
}