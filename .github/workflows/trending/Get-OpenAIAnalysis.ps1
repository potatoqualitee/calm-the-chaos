function Get-OpenAIAnalysis {
    [CmdletBinding()]
    param (
        [string]$ApiKey = $env:OPENAI_API_KEY,

        [string]$ApiBase = $env:OPENAI_API_BASE,

        [Parameter(Mandatory)]
        [string]$Model,

        [Parameter(Mandatory)]
        [string[]]$Headlines,

        [Parameter(Mandatory)]
        [string]$JsonSchema
    )

    $systemMessage = @"
Extract politically significant keywords from news headlines.

Guidelines:
1. Keywords must be:
- 1-3 words maximum
- Full names for political figures (e.g., "Pete Hegseth", "Donald Trump")
- Short phrases for actions/concepts (e.g., "war crimes", "cyber attack")
- Concise terms that could be used as filtering keywords

2. Focus on IMMEDIATE and TIME-SENSITIVE developments:
- Breaking political developments
- Upcoming events causing anxiety (e.g., "inauguration")

3. EXCLUDE ongoing or chronic issues:
- Long-term social problems (e.g., "housing shortage")
- Local crime/arrests

INCLUDE FULL NAMES OF ALL POLITICIANS MENTIONED
"@

    $params = @{
        Verbose = $false
        ApiType = "azure"
        AuthType = "azure"
        ApiKey = $ApiKey
        Model = $Model
        ApiBase = $ApiBase
        ApiVersion = "2024-08-01-preview"
        SystemMessage = $systemMessage
        Message = ($Headlines | Out-String)
        Format = "json_schema"
        JsonSchema = $JsonSchema
    }

    try {
        $result = Request-ChatCompletion @params
        if (-not $result.answer) {
            throw "No answer returned from AI model"
        }

        $aiResponse = $result.answer | ConvertFrom-Json
        if (-not $aiResponse.keywords -or $aiResponse.keywords.Count -eq 0) {
            Write-Warning "No keywords found in AI response"
            return @()
        }

        # Ensure we're handling both array and object formats
        if ($aiResponse.keywords -is [System.Array]) {
            return $aiResponse.keywords
        }
        else {
            return $aiResponse.keywords.PSObject.Properties.Name
        }
    }
    catch {
        Write-Error "Failed to analyze headlines with OpenAI: $_"
        throw
    }
}