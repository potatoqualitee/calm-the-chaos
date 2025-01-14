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

function Get-TermVariations {
    param(
        [string]$Term
    )

    $variations = [System.Collections.ArrayList]::new()

    # Add original term
    [void]$variations.Add($Term)

    # Remove trailing 's' (plural)
    if ($Term -match 's$') {
        $singular = $Term -replace 's$',''
        [void]$variations.Add($singular)
    }

    # Handle 'ing' forms
    if ($Term -match 'ing$') {
        $past = $Term -replace 'ing$','ed'
        $base = $Term -replace 'ing$',''
        [void]$variations.Add($past)
        [void]$variations.Add($base)
    }

    # Handle hyphenation
    if ($Term -match '-') {
        $spaced = $Term -replace '-',' '
        [void]$variations.Add($spaced)
    } else {
        # Check if space-separated and try hyphenated
        if ($Term -match '\s') {
            $hyphenated = $Term -replace '\s','-'
            [void]$variations.Add($hyphenated)
        }
    }

    # Handle possessives
    if ($Term -match "'s$") {
        $nonPossessive = $Term -replace "'s$",''
        [void]$variations.Add($nonPossessive)
    }

    return $variations
}

function Test-TermSimilarity {
    param(
        [string]$Term1,
        [string]$Term2
    )

    # Only check exact variations of the same term
    $variations1 = Get-TermVariations $Term1
    $variations2 = Get-TermVariations $Term2

    # Check for exact matches first (same term, different forms)
    foreach ($var1 in $variations1) {
        foreach ($var2 in $variations2) {
            # Only match if it's literally the same term (including plural/singular)
            if ($var1 -eq $var2 -or
                ($var1 -replace 's$','' -eq $var2 -replace 's$','')) {
                Write-Verbose "Exact match found: '$var1' ~ '$var2'"
                return $true
            }
        }
    }

    # For non-exact matches, use Ollama to check if they're the same topic
    # Define the Ollama API endpoint
    $apiUrl = "http://localhost:11434/api/chat"

    # Load the JSON schema from the file
    $outputSchema = Get-Content -Path (Join-Path $PSScriptRoot "output_schema.json") -Raw | ConvertFrom-Json

    function Test-TermSimilarity {
        param(
            [string]$Term1,
            [string]$Term2
        )

        # Add retries for API calls
        $maxRetries = 3
        $retryDelay = 2

        for ($i = 0; $i -lt $maxRetries; $i++) {
            try {
                # Construct the request payload
                $requestPayload = @{
                    model    = "llama3.1"
                    messages = @(
                        @{
                            role    = "user"
                            content = "Do these terms refer to exactly the same topic/subject/entity (not just related)? '$Term1' and '$Term2'? For example, 'Trump' and 'Trump Organization' would be false - they are related but distinct topics. Only respond with true if they are exactly the same topic, false if different or just related."
                        }
                    )
                    stream   = $false
                    format   = $outputSchema
                } | ConvertTo-Json -Depth 4 -Compress

                # Send the request to the Ollama API
                $invokeRestMethodParams = @{
                    Uri         = $apiUrl
                    Method      = 'Post'
                    Body        = $requestPayload
                    ContentType = 'application/json'
                    TimeoutSec  = 30
                }

                Write-Verbose "Attempting Ollama API call (attempt $($i + 1) of $maxRetries)"
                $response = Invoke-RestMethod @invokeRestMethodParams

                # Validate response format
                if ($null -eq $response.message -or $null -eq $response.message.content -or $null -eq $response.message.content.is_same_topic) {
                    throw "Invalid response format from Ollama API"
                }

                # Return the boolean result
                return $response.message.content.is_same_topic
            } catch {
                Write-Warning "Ollama API call failed (attempt $($i + 1) of $maxRetries): $_"

                if ($i -lt $maxRetries - 1) {
                    Start-Sleep -Seconds $retryDelay
                    $retryDelay *= 2  # Exponential backoff
                } else {
                    Write-Warning "All Ollama API retries failed, falling back to basic string comparison"
                    # Fallback to basic string comparison if all retries fail
                    return $Term1 -eq $Term2
                }
            }
        }
    }

    try {
        # Add -Verbose to see detailed Ollama API call logs
        $isSameTopic = Test-TermSimilarity -Term1 $Term1 -Term2 $Term2 -Verbose
        Write-Verbose "Semantic check: '$Term1' ~ '$Term2' (same topic: $isSameTopic)"
        return $isSameTopic
    }
    catch {
        Write-Warning "Ollama similarity check failed: $_"
        Write-Warning "Stack trace: $($_.ScriptStackTrace)"
        # Return false for safety - better to have duplicates than wrong groupings
        return $false
    }
}

function Get-TermScore {
    param(
        [string]$Term,
        [int]$NewsFrequency,
        [object]$HistoryData,
        [array]$Variations,
        [int]$MaxFrequency,
        [int]$MaxAppearances
    )

    $score = 0

    # Frequency score (0-30)
    if ($MaxFrequency -gt 0) {
        $score += ($NewsFrequency / $MaxFrequency) * $script:relevanceScore.FrequencyWeight
    }

    # Recency score (0-25)
    if ($HistoryData.lastSeen) {
        $daysSinceLastSeen = ((Get-Date) - [DateTime]::Parse($HistoryData.lastSeen)).TotalDays
        $recencyScore = [Math]::Max(0, 1 - ($daysSinceLastSeen / 3))
        $score += $recencyScore * $script:relevanceScore.RecencyWeight
    }

    # Persistence score (0-25)
    if ($MaxAppearances -gt 0) {
        $score += ($HistoryData.appearances / $MaxAppearances) * $script:relevanceScore.PersistenceWeight
    }

    # Variation score (0-20)
    if ($Variations) {
        # Prefer original form over variations
        $variationScore = if ($Variations[0] -eq $Term) { 1 } else { 0.5 }
        $score += $variationScore * $script:relevanceScore.VariationWeight
    }

    return $score
}

function Group-SimilarTerms {
    param(
        [array]$Terms
    )

    Write-Output "Grouping terms: $($Terms.Count) total terms"
    $termGroups = @{}

    foreach ($term in $Terms) {
        $variations = Get-TermVariations $term
        $bestMatchScore = 0
        $bestMatchGroup = $null
        $currentGroups = @()

        # Check each existing group for a match
        foreach ($groupKey in $termGroups.Keys) {
            foreach ($groupTerm in $termGroups[$groupKey]) {
                $similarityScore = Test-TermSimilarity $term $groupTerm
                Write-Output "Comparing '$term' with '$groupTerm': score $similarityScore"
                if ($similarityScore -gt $bestMatchScore) {
                    $bestMatchScore = $similarityScore
                    $bestMatchGroup = $groupKey
                }
            }
        }

        # Only group if very similar (score > 8)
        if ($bestMatchGroup -and $bestMatchScore -gt 8) {
            Write-Output "Adding '$term' to group '$bestMatchGroup' (score: $bestMatchScore)"
            [void]$termGroups[$bestMatchGroup].Add($term)
        } else {
            Write-Output "Creating new group for '$term'"
            $newGroup = [System.Collections.ArrayList]::new()
            [void]$newGroup.Add($term)
            $termGroups[$term] = $newGroup
        }
    }

    Write-Output "Final groups: $($termGroups.Count)"
    return $termGroups
}

function Update-Gist {
    [CmdletBinding()]
    param (
        [ValidateSet('Brave', 'Both')]
        [string]$ApiSource = 'Both'
    )

    process {
        # Validate environment variables
        if (-not $env:BRAVE_API_KEY -or -not $env:GIST_PAT) {
            throw "BRAVE_API_KEY or GIST_PAT environment variable is not set"
        }
        if ($ApiSource -eq 'Both' -and -not $env:BING_API_KEY) {
            throw "BING_API_KEY environment variable is not set for 'Both' API source"
        }

        try {
            # Use specified APIs
            $allNewsTitles = @()

            # Brave API Call
            Write-Output "Using Brave News API for news search..."
            $braveBaseUrl = "https://api.search.brave.com/res/v1/news/search"
            $braveParams = @{
                q           = "latest news"
                count       = 100
                country     = "us"
                search_lang = "en"
                freshness   = "pd"
            }
            $braveQueryString = ($braveParams.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "&"
            $braveUri = "$braveBaseUrl`?$braveQueryString"

            $braveHeaders = @{
                "Accept"               = "application/json"
                "Accept-Encoding"      = "gzip"
                "X-Subscription-Token" = $env:BRAVE_API_KEY
            }

            $braveResponse = Invoke-RestMethod -Uri $braveUri -Headers $braveHeaders -Method GET
            $allNewsTitles += $braveResponse.results.title
            Write-Output "Retrieved $($braveResponse.results.Count) items from Brave"

            # Bing API Call if specified
            if ($ApiSource -eq 'Both') {
                Write-Output "Using Bing News API for news search..."
                $bingEndpoint = "https://api.bing.microsoft.com/v7.0/news/search"
                $bingParams = @{
                    q         = "politics"
                    mkt       = "en-US"
                    sortBy    = "Date"
                    freshness = "Day"
                    count     = 100
                }

                $bingHeaders = @{
                    "Ocp-Apim-Subscription-Key" = $env:BING_API_KEY
                }

                $bingResponse = Invoke-RestMethod -Uri $bingEndpoint -Headers $bingHeaders -Method GET -Body $bingParams
                $allNewsTitles += $bingResponse.value.name
                Write-Output "Retrieved $($bingResponse.value.Count) items from Bing"
            }

            $newsTitles = $allNewsTitles | Out-String

            Write-Output "`nProcessing headlines:"
            Write-Output "===================="
            $allNewsTitles | ForEach-Object { Write-Output "- $PSitem" }
            Write-Output "====================`n"

            # Get JSON schema and process keywords
            $jsonSchema = Get-Content -Path "./.github/workflows/keywords.json" -Raw

            Write-Output "Gathering keywords from category files..."
            $allKeywords = Get-ChildItem -Path "./keywords/categories/*.json" -Exclude "new-developments.json", "us-political-figures-single-name.json" | ForEach-Object {
                Write-Output "Processing $($_.Name)"
                $json = Get-Content -Path $_.FullName -Raw | ConvertFrom-Json
                $title = $json.PSObject.Properties | Select-Object -First 1
                $title.Value.keywords.PSObject.Properties.Name
            }

            # Fetch gist history
            Write-Output "Fetching gist history..."
            $gistId = "3488593dcc622acc736055fa00a9745e"
            $gistHeaders = @{
                "Accept"               = "application/vnd.github+json"
                "Authorization"        = "Bearer $env:GIST_PAT"
                "X-GitHub-Api-Version" = "2022-11-28"
            }

            $revisionsUrl = "https://api.github.com/gists/$gistId/commits"
            $history = Invoke-RestMethod -Uri $revisionsUrl -Headers $gistHeaders

            # Process history and build keyword data
            $keywordHistory = @{}
            foreach ($revision in $history | Select-Object -First 10) { # Last 10 revisions
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

            # Get AI suggestions for new keywords
            Write-Output "Requesting AI analysis of headlines..."
            $params = @{
                Verbose       = $false
                ApiType       = "azure"
                AuthType      = "azure"
                ApiKey        = $env:OPENAI_API_KEY
                Model         = "gpt-4o-mini"
                ApiBase       = $env:OPENAI_API_BASE
                ApiVersion    = "2024-08-01-preview"
                SystemMessage = @"
                You are an AI designed to extract **distressing keywords** from U.S.-centric but globally relevant news headlines. Focus on topics tied to **conflict, violence, or inflammatory rhetoric** that evoke strong emotions and are distressing across the political spectrum. Avoid bias toward any ideology or stance.

                    **Input Details**:
                    1. **Headlines**: A batch of recent, distressing, or controversial news headlines.
                    2. **Pre-existing Keywords**: A comprehensive list of terms to exclude from the output.

                    **Task**:
                    1. Extract **new, distressing terms or phrases** that belong in the following categories:
                    climate and environment
                    economic policy
                    education
                    gun policy
                    healthcare and public health
                    immigration
                    international coverage
                    lgbtq
                    media personalities
                    military and defense
                    political organizations
                    political rhetoric
                    political violence and security threats
                    race relations
                    relational violence
                    religion
                    reproductive health
                    social policy
                    us government institutions
                    us political figures full name
                    us political figures single name
                    vaccine policy
                    world leaders

                    BUT are not in the pre-existing keyword list.
                    2. Focus on concise, impactful phrases representing events, people, or places linked to distressing news.
                    3. Avoid:
                    - Neutral or generic terms that lack an emotional charge like 'App Store suit', 'military officers', or 'economic growth'.
                    - Overly specific phrases tied to exact headline wording
                       - Gaza hostages released → Gaza hostages
                       - Student loans cancelled → Student loans
                       - IRS stimulus checks → stimulus checks
                       - calls for special session → special session
                       - Hunter Biden report → Hunter Biden
                       - IRS stimulus checks → stimulus checks
                    - Terms already covered in the pre-existing list:
                    $allKeywords

                    IGNORE all:
                    - Local crime/arrests
                    - Individual incidents
                    - Celebrity news
                    - Minor accidents
                    - Local business news
                    - Personal interest stories

                    Focus on event names (e.g. 'Palisades Fire') and major developments that affect many people.

                    Consider that Idaho Supreme Court is not usually a distressing topic, but if they are in the news for overturning gay marriage, that could be relevant.
"@
                Message       = $newsTitles
                Format       = "json_schema"
                JsonSchema   = $jsonSchema
            }

            $result = Request-ChatCompletion @params
            if (-not $result.answer) {
                throw "No answer returned from AI model"
            }

            # Process new keywords with deduplication
            $aiResponse = $result.answer | ConvertFrom-Json
            Write-Output "Raw AI response: $($result.answer)"

            if (-not $aiResponse.keywords -or $aiResponse.keywords.Count -eq 0) {
                Write-Warning "No keywords found in AI response"
                return
            }

            # Ensure we're handling both array and object formats
            $newKeywords = if ($aiResponse.keywords -is [System.Array]) {
                $aiResponse.keywords
            } else {
                $aiResponse.keywords.PSObject.Properties.Name
            }

            Write-Output "Extracted keywords: $($newKeywords -join ', ')"
            $termGroups = Group-SimilarTerms $newKeywords

            # Calculate max values for scoring with default fallbacks
            $maxFrequency = if ($keywordHistory.Count -gt 0) {
                ($keywordHistory.Values | Where-Object { $_ -ne $null } | ForEach-Object { $_.appearances } | Measure-Object -Maximum).Maximum
            } else { 1 }

            $maxAppearances = if ($keywordHistory.Count -gt 0) {
                ($keywordHistory.Values | Where-Object { $_ -ne $null } | ForEach-Object { $_.appearances } | Measure-Object -Maximum).Maximum
            } else { 1 }

            # Score and select best terms
            $processedKeywords = @{}
            foreach ($group in $termGroups.Values) {
                $bestTerm = $group | Sort-Object {
                    $historyData = if ($keywordHistory.ContainsKey($_)) {
                        $keywordHistory[$_]
                    } else {
                        @{ appearances = 0; lastSeen = $null }
                    }
                    Get-TermScore $_ 1 $historyData $group $maxFrequency $maxAppearances
                } -Descending | Select-Object -First 1

                $processedKeywords[$bestTerm] = @{
                    weight = 3
                    description = "Current trending topic"
                    timestamp = (Get-Date).ToString('o')
                }
            }

            # Keep meaningful number of terms (minimum 10, maximum 100)
            if ($processedKeywords.Count -gt 0) {
                $minKeywords = [Math]::Max(10, $processedKeywords.Count * 0.2) # Keep at least 20% or 10 keywords
                $maxKeywords = 100

                $topTerms = $processedKeywords.Keys | Sort-Object {
                    $historyData = if ($keywordHistory.ContainsKey($_)) {
                        $keywordHistory[$_]
                    } else {
                        @{ appearances = 0; lastSeen = $null }
                    }
                    Get-TermScore $_ 1 $historyData $null $maxFrequency $maxAppearances
                } -Descending | Select-Object -First ([Math]::Min($maxKeywords, [Math]::Max($minKeywords, $processedKeywords.Count)))

                $finalKeywords = @{}
                foreach ($term in $topTerms) {
                    $finalKeywords[$term] = $processedKeywords[$term]
                }
                $processedKeywords = $finalKeywords
            } else {
                Write-Warning "No keywords were processed. Check AI response and filtering logic."
            }

            Write-Output "Final keyword count: $($processedKeywords.Count)"

            # Prepare and update gist
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

            Write-Output "Updating GitHub Gist..."
            $updateParams = @{
                Uri = $gistUpdateUri
                Headers = $gistHeaders
                Method = "PATCH"
                Body = $gistBody -replace "    ", " "
                ContentType = "application/json"
            }

            $gist = Invoke-RestMethod @updateParams
            Write-Output "GitHub Gist updated successfully"

            return $gist.files."new-development.json".content
        }
        catch {
            Write-Error "Failed to update news Gist: $_"
            Write-Output "Stack Trace: $($_.ScriptStackTrace)"
            throw
        }
    }
}

# Export the function
Export-ModuleMember -Function Test-TermSimilarity
Export-ModuleMember -Function Update-Gist