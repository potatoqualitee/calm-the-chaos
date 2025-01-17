function Invoke-AIAnalysis {
    <#
    .SYNOPSIS
        Analyzes text content using the Ollama API with a predefined schema.

    .DESCRIPTION
        Invokes the Ollama API to analyze text content using a specified model and schema.
        The function processes the input text according to a JSON schema and returns structured results.

    .PARAMETER Content
        The text content to analyze. Accepts pipeline input.

    .PARAMETER Model
        The Ollama model to use for analysis. Defaults to llama3.1.

    .PARAMETER SchemaPath
        Path to the JSON schema file that defines the response format.
        Defaults to similar.json in the current directory.

    .PARAMETER ApiEndpoint
        The Ollama API endpoint URL. Defaults to http://localhost:11434/api/chat.

    .EXAMPLE
        Invoke-AIAnalysis -Content "Pacific Palisades, Los Angeles"

    .EXAMPLE
        "Pacific Palisades, Los Angeles" | Invoke-AIAnalysis

    .EXAMPLE
        Invoke-AIAnalysis -Content "Silicon Valley" -Model "llama2"
    #>
    [CmdletBinding()]
    param (
        [Parameter(ValueFromPipeline, ValueFromPipelineByPropertyName, Position = 0)]
        [ValidateNotNullOrEmpty()]
        [string[]]$Keywords = @("Pacific Palisades", "Los Angeles"),

        [Parameter()]
        [ValidateNotNullOrEmpty()]
        [string]$Model = "phi3",

        [Parameter()]
        [ValidateScript({ Test-Path $_ -Type Leaf })]
        [string]$SchemaPath = (Join-Path -Path "C:/github/calm-the-chaos/.github/workflows" -ChildPath similar.json),

        [Parameter()]
        [ValidateNotNullOrEmpty()]
        [uri]$ApiEndpoint,

        [Parameter()]
        [ValidateSet("ollama", "AIToolkit")]
        [string]$ApiType = "ollama"
    )

    begin {
        if ($ApiType -eq "ollama" -and $null -eq $ApiEndpoint) {
            $ApiEndpoint = "http://localhost:11434/api/chat"
        } else {
            $ApiEndpoint = "http://localhost:5272/v1/chat/completions"
        }

        Write-Verbose "Initializing Ollama analysis with model: $Model"
        try {
            $splat = @{
                Path = $SchemaPath
                ErrorAction = "Stop"
                Raw = $true
            }
            $schema = Get-Content @splat | ConvertFrom-Json -ErrorAction Stop
        }
        catch {
            $PSCmdlet.ThrowTerminatingError(
                [System.Management.Automation.ErrorRecord]::new(
                    "Failed to load schema from $SchemaPath | $_",
                    'SchemaLoadError',
                    [System.Management.Automation.ErrorCategory]::InvalidOperation,
                    $SchemaPath
                )
            )
        }
    }

    process {
        Write-Verbose "Processing content: $Content"

        $content = "You are a content filtering system evaluating keywords for duplication. You must determine if two keywords should be treated as duplicates in the context of filtering distressing or controversial news content.

        Compare these keywords:
        Keyword 1: $($Keywords[0])
        Keyword 2: $($Keywords[1])

        Would filtering content containing Keyword A capture essentially the same distressing or controversial content as filtering Keyword B?

        Consider them duplicates ONLY if:
        - They refer to the exact same event, person, or concept
        - One is a direct subset of the other (e.g., 'gunshot' vs 'gunshots')
        - They are synonyms specifically in the context of distressing news (e.g., 'killing' and 'slaying')

        Examples of words that are NOT duplicates:
        - 'Hollywood' and 'military' (even though they can appear in related content)
        - 'protest' and 'violence' (even though they sometimes co-occur)
        - 'murder' and 'crime' (one is too broad)
        - 'Trump' and 'Biden' (even though both are politicians)

        Based ONLY on the criteria above, should these be treated as duplicate keywords for content filtering purposes?"
        Write-Warning $content
        try {
            # Construct the request payload
            $payload = @{
                model    = $Model
                messages = @(
                    @{
                        role    = "user"
                        content = "$content"
                    }
                )
                stream   = $false
                format   = $schema
            }

            $payloadJson = $payload | ConvertTo-Json -Depth 3 -Compress -ErrorAction Stop

            # Prepare the request parameters
            $invokeParams = @{
                Uri         = $ApiEndpoint
                Method      = "POST"
                Body       = $payloadJson
                ErrorAction = "Stop"
            }

            Write-Verbose "Sending request to Ollama API"
            $response = Invoke-RestMethod @invokeParams

            # Process and return the response
            Write-Verbose "Processing API response"
            $result = $response.message.content | ConvertFrom-Json

            # Add type information to the output
            $result.PSObject.TypeNames.Insert(0, 'AIAnalysis.Result')
            return $result
        }
        catch {
            Write-Error "Failed to process content through Ollama API: $_"
            return
        }
    }

    end {
        Write-Verbose "Completed Ollama analysis"
    }
}

# Invoke-AIAnalysis