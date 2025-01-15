<#
.SYNOPSIS
    Updates a GitHub gist with trending news terms.

.DESCRIPTION
    Fetches news from Brave and optionally Bing APIs, processes headlines to extract
    trending terms, and updates a GitHub gist with the results. Includes deduplication,
    term scoring, and history tracking.

.PARAMETER ApiSource
    Specifies which news API(s) to use. Valid values are 'Brave' or 'Both'.

.EXAMPLE
    Update-Gist -ApiSource Brave
    Updates the gist using only Brave News API.

.EXAMPLE
    Update-Gist -ApiSource Both
    Updates the gist using both Brave and Bing News APIs.

.OUTPUTS
    System.String
    The content of the updated gist.
#>
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

    begin {
        Write-Verbose "Starting gist update process using $ApiSource API(s)"

        # Validate environment variables
        $requiredVars = @('BRAVE_API_KEY', 'GIST_PAT')
        if ($ApiSource -eq 'Both') {
            $requiredVars += 'BING_API_KEY'
        }

        foreach ($var in $requiredVars) {
            if (-not (Get-Item env:$var -ErrorAction SilentlyContinue)) {
                throw "$var environment variable is not set"
            }
        }
    }

    process {
        try {
            $allNewsTitles = @()

            # API Calls based on selected source
            if ($ApiSource -in @('Brave', 'Both')) {
                Write-Verbose "Fetching news from Brave API..."
                $braveParams = @{
                    Uri = "https://api.search.brave.com/res/v1/news/search?q=latest+news&count=100&country=us&search_lang=en&freshness=pd"
                    Headers = @{
                        "Accept" = "application/json"
                        "Accept-Encoding" = "gzip"
                        "X-Subscription-Token" = $env:BRAVE_API_KEY
                    }
                    Method = "GET"
                }

                $braveResponse = Invoke-RestMethod @braveParams
                $allNewsTitles += $braveResponse.results.title
                Write-Verbose "Retrieved $($braveResponse.results.Count) items from Brave"
            }

            if ($ApiSource -in @('Bing', 'Both')) {
                Write-Verbose "Fetching news from Bing API..."
                $bingParams = @{
                    Uri = "https://api.bing.microsoft.com/v7.0/news/search"
                    Headers = @{
                        "Ocp-Apim-Subscription-Key" = $env:BING_API_KEY
                    }
                    Method = "GET"
                    Body = @{
                        q = "politics"
                        mkt = "en-US"
                        sortBy = "Date"
                        freshness = "Day"
                        count = 100
                    }
                }

                $bingResponse = Invoke-RestMethod @bingParams
                $allNewsTitles += $bingResponse.value.name
                Write-Verbose "Retrieved $($bingResponse.value.Count) items from Bing"
            }

            $newsTitles = $allNewsTitles | Out-String
            Write-Debug "Processed headlines:`n$newsTitles"

            # Get JSON schema and process keywords
            $jsonSchema = Get-Content -Path "./.github/workflows/keywords.json" -Raw
            # Results are generally better when analyzed separately due to different news source characteristics
            $braveKeywords = @()
            $bingKeywords = @()

            if ($ApiSource -in @('Brave', 'Both')) {
                Write-Verbose "Analyzing Brave headlines..."
                $braveNewsTitles = $braveResponse.results.title | Out-String
                Write-Debug "Processed Brave headlines:`n$braveNewsTitles"

                $braveAiParams = @{
                    Verbose = $false
                    ApiType = "azure"
                    AuthType = "azure"
                    ApiKey = $env:OPENAI_API_KEY
                    Model = $Model
                    ApiBase = $env:OPENAI_API_BASE
                    ApiVersion = "2024-08-01-preview"
                    SystemMessage = $systemMessage
                    Message = $braveNewsTitles
                    Format = "json_schema"
                    JsonSchema = $jsonSchema
                }

                $braveResult = Request-ChatCompletion @braveAiParams
                if ($braveResult.answer) {
                    $braveAiResponse = $braveResult.answer | ConvertFrom-Json
                    if ($braveAiResponse.keywords) {
                        $braveKeywords = if ($braveAiResponse.keywords -is [System.Array]) {
                            $braveAiResponse.keywords
                        } else {
                            $braveAiResponse.keywords.PSObject.Properties.Name
                        }
                    }
                }
            }

            if ($ApiSource -in @('Bing', 'Both')) {
                Write-Verbose "Analyzing Bing headlines..."
                $bingNewsTitles = $bingResponse.value.name | Out-String
                Write-Debug "Processed Bing headlines:`n$bingNewsTitles"

                $bingAiParams = @{
                    Verbose = $false
                    ApiType = "azure"
                    AuthType = "azure"
                    ApiKey = $env:OPENAI_API_KEY
                    Model = $Model
                    ApiBase = $env:OPENAI_API_BASE
                    ApiVersion = "2024-08-01-preview"
                    SystemMessage = $systemMessage
                    Message = $bingNewsTitles
                    Format = "json_schema"
                    JsonSchema = $jsonSchema
                }

                $bingResult = Request-ChatCompletion @bingAiParams
                if ($bingResult.answer) {
                    $bingAiResponse = $bingResult.answer | ConvertFrom-Json
                    if ($bingAiResponse.keywords) {
                        $bingKeywords = if ($bingAiResponse.keywords -is [System.Array]) {
                            $bingAiResponse.keywords
                        } else {
                            $bingAiResponse.keywords.PSObject.Properties.Name
                        }
                    }
                }
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

            # Define system message for AI
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

            # Define AI parameters
            $params = @{
                Verbose = $false
                ApiType = "azure"
                AuthType = "azure"
                ApiKey = $env:OPENAI_API_KEY
                Model = $Model
                ApiBase = $env:OPENAI_API_BASE
                ApiVersion = "2024-08-01-preview"
                SystemMessage = $systemMessage
                Message = $newsTitles
                Format = "json_schema"
                JsonSchema = $jsonSchema
            }

            $result = Request-ChatCompletion @params
            if (-not $result.answer) {
                throw "No answer returned from AI model"
            }

            # Process new keywords with deduplication
            $aiResponse = $result.answer | ConvertFrom-Json
            Write-Debug "Raw AI response: $($result.answer)"

            if (-not $aiResponse.keywords -or $aiResponse.keywords.Count -eq 0) {
                Write-Warning "No keywords found in AI response"
                return
            }

            # Ensure we're handling both array and object formats
            $newKeywords = if ($aiResponse.keywords -is [System.Array]) {
                $aiResponse.keywords
            }
            else {
                $aiResponse.keywords.PSObject.Properties.Name
            }
            Write-Verbose "Extracted keywords: $($newKeywords -join ', ')"
            $termGroups = Group-SimilarTerm -Term $newKeywords

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
            $updateParams = @{
                Uri = $gistUpdateUri
                Headers = $gistHeaders
                Method = "PATCH"
                Body = $gistBody -replace "    ", " "
                ContentType = "application/json"
            }

            $gist = Invoke-RestMethod @updateParams
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