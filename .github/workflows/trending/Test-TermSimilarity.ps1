function Test-TermSimilarity {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory,
                   Position = 0,
                   HelpMessage = "First term to compare")]
        [ValidateNotNullOrEmpty()]
        [string]$Term1,

        [Parameter(Mandatory,
                   Position = 1,
                   HelpMessage = "Second term to compare")]
        [ValidateNotNullOrEmpty()]
        [string]$Term2
    )

    # Quick check for exact matches to avoid API call
    if ($Term1.ToLower().Trim() -eq $Term2.ToLower().Trim()) {
        return 10
    }

    try {
        # Load similarity schema
        $similaritySchema = Get-Content -Path "./.github/workflows/similar.json" -Raw | ConvertFrom-Json

        # Define the prompt for semantic comparison
        $prompt = "$Term1, $Term2"

        # Construct request payload
        $requestPayload = @{
            model = "llama3.1"
            messages = @(
                @{
                    role = "user"
                    content = $prompt
                }
            )
            stream = $false
            format = $similaritySchema
        } | ConvertTo-Json -Depth 4 -Compress

        # Send request to Ollama API
        $splat = @{
            Uri         = "http://localhost:11434/api/chat"
            Method      = "Post"
            Body        = $requestPayload
            ContentType = 'application/json'
        }

        $response = Invoke-RestMethod @splat


        # Convert boolean response to similarity score
        if ($response.message.content.is_same_topic) {
            return 10
        } else {
            return 0
        }
    }
    catch {
        Write-Error "Failed to compare terms using Ollama: $_"
        return 0  # Return no similarity on error
    }
}