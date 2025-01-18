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

        $content = "Compare these news keywords:
        Keyword A: $($Keywords[0])
        Keyword B: $($Keywords[1])

        SAME keywords:
        'Pacific Palisades fires' and 'Los Angeles fires'
        'DOD chief' and 'Department of Defense chief'
        'Manhattan crash' and 'New York crash'
        'Hollywood incident' and 'LA incident'

        DIFFERENT keywords:
        'San Diego fire' and 'LA fire'
        'Navy chief' and 'Army chief'
        'north crash' and 'south crash'
        'old storm' and 'new storm'"
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