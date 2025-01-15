function Update-Gist {
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
        Write-Verbose "Starting gist update process using $ApiSource API(s)"

        # Validate environment variables
        $requiredVars = @('BRAVE_API_KEY', 'GIST_PAT', 'OPENAI_API_KEY', 'OPENAI_API_BASE', 'BING_API_KEY')

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

            # Fetch gist history
            Write-Verbose "Fetching gist history..."
            $gistId = "3488593dcc622acc736055fa00a9745e"
            $gistHeaders = @{
                "Accept" = "application/vnd.github+json"
                "Authorization" = "Bearer $env:GIST_PAT"
                "X-GitHub-Api-Version" = "2022-11-28"
            }

            $revisionsUrl = "https://api.github.com/gists/$gistId/commits"
            $history = Invoke-RestMethod -Uri $revisionsUrl -Headers $gistHeaders

            # Process history and build keyword data
            $keywordHistory = @{}
            foreach ($revision in $history | Select-Object -First 10) {
                $revisionContent = Invoke-RestMethod -Uri "https://api.github.com/gists/$gistId/$($revision.version)" -Headers $gistHeaders
                $keywords = ($revisionContent.files."new-development.json".content | ConvertFrom-Json)."New Developments".keywords

                foreach ($keyword in $keywords.PSObject.Properties.Name) {
                    if (-not $keywordHistory.ContainsKey($keyword)) {
                        $keywordHistory[$keyword] = @{
                            appearances = 0
                            lastSeen = $null
                            firstSeen = $revision.committed_at
                        }
                    }
                    $keywordHistory[$keyword].appearances++
                    $keywordHistory[$keyword].lastSeen = $revision.committed_at
                }
            }

            if (-not $newKeywords -or $newKeywords.Count -eq 0) {
                Write-Warning "No keywords found in AI responses"
                return
            }

            # Calculate max values for scoring
            $maxFrequency = ($keywordHistory.Values |
                Where-Object { $_ -ne $null } |
                ForEach-Object { $_.appearances } |
                Measure-Object -Maximum).Maximum
            if ($maxFrequency -eq 0) { $maxFrequency = 1 }

            $maxAppearances = ($keywordHistory.Values |
                Where-Object { $_ -ne $null } |
                ForEach-Object { $_.appearances } |
                Measure-Object -Maximum).Maximum
            if ($maxAppearances -eq 0) { $maxAppearances = 1 }

            # Score and select best terms
            $processedKeywords = @{}
            foreach ($group in $termGroups.Values) {
                $bestTerm = $group | Sort-Object {
                    $historyData = if ($keywordHistory.ContainsKey($_)) {
                        $keywordHistory[$_]
                    }
                    else {
                        @{ appearances = 0; lastSeen = $null }
                    }
                    Get-TermScore -Term $_ -NewsFrequency 1 -HistoryData $historyData -Variation $group -MaxFrequency $maxFrequency -MaxAppearance $maxAppearances
                } -Descending | Select-Object -First 1

                $processedKeywords[$bestTerm] = @{
                    weight = 3
                    description = "Current trending topic"
                    timestamp = (Get-Date).ToString('o')
                }
            }

            # Merge with existing keywords and update gist
            Write-Verbose "Preparing gist update..."
            $newsObject = @{
                "New Developments" = @{
                    description = "Recently emerging political figures and developing stories"
                    keywords = $processedKeywords
                }
            }

            $newsContent = $newsObject | ConvertTo-Json -Depth 10
            $gistUpdateUri = "https://api.github.com/gists/$gistId"

            $gistBody = @{
                files = @{
                    "new-development.json" = @{
                        content = $newsContent
                    }
                }
            } | ConvertTo-Json -Depth 10

            Write-Verbose "Updating GitHub Gist..."
            $gistParams = @{
                Uri = $gistUpdateUri
                Headers = $gistHeaders
                Method = "PATCH"
                Body = $gistBody.Replace("    ", " ")
                ContentType = "application/json"
            }

            $gist = Invoke-RestMethod @gistParams
            Write-Verbose "GitHub Gist updated successfully"

            return $gist.files."new-development.json".content
        }
        catch {
            $PSCmdlet.ThrowTerminatingError(
                [System.Management.Automation.ErrorRecord]::new(
                    $_.Exception,
                    'GistUpdateError',
                    [System.Management.Automation.ErrorCategory]::OperationStopped,
                    $ApiSource
                )
            )
        }
    }

    end {
        Write-Verbose "Completed gist update process"
    }
}