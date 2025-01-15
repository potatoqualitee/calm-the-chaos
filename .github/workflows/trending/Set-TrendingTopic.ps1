function Set-TrendingTopic {
    [CmdletBinding()]
    param (
        [Parameter(Position = 0)]
        [ValidateSet('Brave', 'Bing', 'Both')]
        [string]$ApiSource = 'Both',

        [Parameter(Position = 1)]
        [ValidateSet('gpt-4o', 'gpt-4o-mini')]
        [string]$Model = 'gpt-4o-mini'
    )

    process {
        Write-Verbose "Starting trending topic process using $ApiSource API(s)"

        # Validate environment variables
        $requiredVars = @('BRAVE_API_KEY', 'OPENAI_API_KEY', 'OPENAI_API_BASE', 'BING_API_KEY')

        foreach ($var in $requiredVars) {
            if (-not (Get-Item env:$var -ErrorAction SilentlyContinue)) {
                throw "$var environment variable is not set"
            }
        }

        try {
            $allNewsTitles = @()
            $braveKeywords = @()
            $bingKeywords = @()

            # Get JSON schema
            $jsonSchema = Get-Content -Path "./.github/workflows/keywords.json" -Raw

            # Set default parameter values for OpenAI calls
            $PSDefaultParameterValues = @{
                'Get-OpenAIAnalysis:Model' = $Model
                'Get-OpenAIAnalysis:JsonSchema' = $jsonSchema
            }

            # API Calls based on selected source
            if ($ApiSource -in @('Brave', 'Both')) {
                Write-Verbose "Processing Brave news..."
                $braveTitles = Get-BraveNews
                $allNewsTitles += $braveTitles

                $openAiParams = @{
                    Headlines = $braveTitles
                }
                $braveKeywords = Get-OpenAIAnalysis @openAiParams
            }

            if ($ApiSource -in @('Bing', 'Both')) {
                Write-Verbose "Processing Bing news..."
                $bingTitles = Get-BingNews
                $allNewsTitles += $bingTitles

                $openAiParams = @{
                    Headlines = $bingTitles
                }
                $bingKeywords = Get-OpenAIAnalysis @openAiParams
            }

            # Combine keywords from both sources
            $newKeywords = @($braveKeywords) + @($bingKeywords) | Select-Object -Unique
            Write-Debug "Processed headlines from both sources"

            Write-Verbose "Gathering keywords from category files..."
            $allKeywords = Get-ChildItem -Path "./keywords/categories/*.json" -Exclude @(
                "new-developments.json",
                "us-political-figures-single-name.json"
            ) | ForEach-Object {
                Write-Debug "Processing $($_.Name)"
                $json = Get-Content -Path $_.FullName -Raw | ConvertFrom-Json
                $title = $json.PSObject.Properties | Select-Object -First 1
                $title.Value.keywords.PSObject.Properties.Name
            }

            Write-Verbose "Extracted keywords: $($newKeywords -join ', ')"
            $termGroups = Group-SimilarTerm -Term $newKeywords

            if (-not $newKeywords -or $newKeywords.Count -eq 0) {
                Write-Warning "No keywords found in AI responses"
                return $null
            }

            # Process keywords
            $processedKeywords = @{}
            foreach ($group in $termGroups.Values) {
                $bestTerm = $group | Select-Object -First 1
                $processedKeywords[$bestTerm] = @{
                    weight = 3
                    description = "Current trending topic"
                    timestamp = (Get-Date).ToString('o')
                }
            }

            return $processedKeywords
        }
        catch {
            $PSCmdlet.ThrowTerminatingError(
                [System.Management.Automation.ErrorRecord]::new(
                    $_.Exception,
                    'TrendingTopicError',
                    [System.Management.Automation.ErrorCategory]::OperationStopped,
                    $ApiSource
                )
            )
        }
    }

    end {
        Write-Verbose "Completed trending topic process"
    }
}