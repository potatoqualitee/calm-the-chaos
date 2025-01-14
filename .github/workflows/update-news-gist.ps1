function Update-Gist {
    [CmdletBinding()]
    param ()
    process {
        # Validate environment variables
        if (-not $env:BRAVE_API_KEY -or -not $env:GIST_PAT -or -not $env:BING_API_KEY) {
            throw "BRAVE_API_KEY or GIST_PAT or BING_API_KEY environment variable is not set"
        }
        try {
            if ((Get-Random -Minimum 1 -Maximum 3) -eq 1) {
                Write-Output "Using Brave News API for news search..."
                # Base URL for the Brave News API
                $baseUrl = "https://api.search.brave.com/res/v1/news/search"
                Write-Output "Using Brave News API endpoint: $baseUrl"

                # Parameters for the news search
                $params = @{
                    q           = "latest news"
                    count       = 100
                    country     = "us"
                    search_lang = "en"
                    freshness   = "pd"
                }
                $queryString = @()
                foreach ($key in $params.Keys) {
                    $queryString += "$key=$($params[$key])"
                }

                $uri = "$baseUrl" + "?" + ($queryString -join "&")
                $headers = @{
                    "Accept"               = "application/json"
                    "Accept-Encoding"      = "gzip"
                    "X-Subscription-Token" = $env:BRAVE_API_KEY
                }
                $invokeParams = @{
                    Uri     = $uri
                    Headers = $headers
                    Method  = "GET"
                }

                Write-Output "Fetching news from Brave API..."
                $response = Invoke-RestMethod @invokeParams
                $newstitles = $response.results.title | Out-String
                Write-Output "Successfully retrieved $(($response.results | Measure-Object).Count) news items"
            } else {
                if ((Get-Random -Minimum 1 -Maximum 3) -eq 1) {
                    Write-Output "Using Bing News API for news search..."
                    # Set your API key and endpoint
                    $endpoint = "https://api.bing.microsoft.com/v7.0/news/search"

                    # Define the search parameters
                    $params = @{
                        q         = "politics"
                        mkt       = "en-US"
                        sortBy    = "Date"
                        freshness = "Day"
                        count     = 100
                    }
                } else {
                    # Set your API key and endpoint
                    Write-Output "Using Bing Trending Topics API for news search..."
                    $endpoint = "https://api.bing.microsoft.com/v7.0/news/trendingtopics"

                    # Define the query parameters
                    $params = @{
                        mkt    = "en-US"
                        sortBy = "Date"
                        count  = 100
                    }
                }

                # Set up the HTTP request headers
                $headers = @{
                    "Ocp-Apim-Subscription-Key" = $env:BING_API_KEY
                }

                # Define the splat for Invoke-RestMethod
                $invokeParams = @{
                    Uri     = $endpoint
                    Headers = $headers
                    Method  = "GET"
                    Body    = $params
                }

                # Make the API request using the splat
                $response = Invoke-RestMethod @invokeParams
                $newstitles = $response.value.name | Out-String
            }


            $jsonSchema = Get-Content -Path "./.github/workflows/keywords.json" -Raw

            Write-Output "Gathering keywords from category files..."
            # Get all keywords from category files
            $allKeywords = Get-ChildItem -Path "./keywords/categories/*.json" -Exclude "new-developments.json", "us-political-figures-single-name.json" | ForEach-Object {
                Write-Output "--- $($PSItem.Name) ---"
                $json = Get-Content -Path $PSItem.FullName -Raw | ConvertFrom-Json
                $title = $json.PSObject.Properties | Select-Object -First 1
                $title.Value.keywords.PSObject.Properties.Name
            }
            $keywordsfromfiles = $allKeywords

            Write-Output "Fetching existing keywords from Gist..."
            $existingjson = Invoke-RestMethod https://gist.githubusercontent.com/potatoqualitee/3488593dcc622acc736055fa00a9745e/raw/new-development.json
            $existingkeywords = $existingjson."New Developments".keywords.PSObject.Properties.Name

            $allKeywords += $existingkeywords
            Write-Output "Total keywords gathered: $(($allKeywords | Measure-Object).Count)"

            $params = @{
                ApiType       = "azure"
                AuthType      = "azure"
                ApiKey        = $env:OPENAI_API_KEY
                Model         = "gpt-4o-mini"
                ApiBase       = $env:OPENAI_API_BASE
                ApiVersion    = "2024-08-01-preview"
                Verbose       = $false
                SystemMessage = "
                    **System Prompt:**
                    You are an AI designed to extract **distressing keywords** from U.S.-centric but globally relevant news headlines. Focus on topics tied to **conflict, violence, or inflammatory rhetoric** that evoke strong emotions and are distressing across the political spectrum. Avoid bias toward any ideology or stance.

                    **Input Details**:
                    1. **Headlines**: A batch of recent, distressing, or controversial news headlines.
                    2. **Pre-existing Keywords**: A comprehensive list of terms to exclude from the output.

                    **Task**:
                    1. Extract **new, distressing terms or phrases** that are not in the pre-existing keyword list.
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
                    $allKeywords"
                Message       = $newstitles
                Format        = "json_schema"
                JsonSchema    = $jsonSchema
            }

            Write-Output "Requesting AI analysis of headlines..."
            $result = Request-ChatCompletion @params
            if (-not $result.answer) {
                Write-Error "No answer returned from AI model"
                throw "No answer returned from AI model"
            }
            $processedKeywords = @{}
            $currentTime = Get-Date
            $cutoffTime = $currentTime.AddHours(-72)

            Write-Output "Filtering existing keywords within 72-hour window..."
            $existingJson = $existingjson."New Developments".keywords

            foreach ($keyword in $existingkeywords) {
                # Skip keywords that would require HTML encoding
                if ($keyword -notmatch [System.Web.HttpUtility]::HtmlEncode($keyword)) {
                    Write-Output "Skipping keyword with special characters: $keyword"
                    continue
                }

                if ($existingJson.$keyword.timestamp) {
                    $timestamp = [DateTime]::Parse($existingJson.$keyword.timestamp)
                    if ($timestamp -gt $cutoffTime) {
                        Write-Output "Retaining keyword: $keyword (timestamp: $timestamp)"
                        $processedKeywords[$keyword] = @{
                            weight      = 3
                            description = "Current trending topic"
                            timestamp   = $existingJson.$keyword.timestamp
                        }
                    } else {
                        Write-Output "Dropping expired keyword: $keyword (timestamp: $timestamp)"
                    }
                }
            }
            Write-Output "Total existing keywords retained: $(($processedKeywords.Keys | Measure-Object).Count)"

            # Add new keywords with current timestamp
            foreach ($keyword in ($result.answer | ConvertFrom-Json).keywords) {
                # Skip keywords that would require HTML encoding
                if ($keyword -notmatch [System.Web.HttpUtility]::HtmlEncode($keyword)) {
                    Write-Output "Skipping keyword with special characters: $keyword"
                    continue
                }

                <# LEAVE THIS ALONE: Sometimes I am tempted to remove keywords but i shouldn't
                # bc the person might not have it blocked in mutesky but maybe I'll change my mind
                foreach ($existingKw in @($processedKeywords.Keys)) {
                    foreach ($kw in $keywordsfromfiles) {
                        if ($kw.length -le 3) {
                            continue
                        }
                        if ($existingKw -match "\b$kw(ing|s|ed|er|ment)?\b") {
                            Write-Output "Removing new keyword '$existingKw' as it is contained within existing keyword '$kw'"
                            $processedKeywords.Remove($existingKw)
                            continue
                        }
                    }
                }
                #>

                Write-Output "Adding new keyword: $keyword"
                $processedKeywords[$keyword] = @{
                    weight      = 3
                    description = "Current trending topic"
                    timestamp   = $currentTime.ToString('o')  # ISO 8601 format
                }
            }

            Write-Output "Total combined keywords: $(($processedKeywords.Keys | Measure-Object).Count)"

            if (($processedKeywords.Keys | Measure-Object).Count -gt 50) {
                #  Slim down to 50 max and remove duplicates
                Write-Output "Going slim it down from: $($processedKeywords.Keys) because there are $(($processedKeywords.Keys | Measure-Object).Count -gt 50) keywords"

                $params.SystemMessage = "Order these keywords and keyword phrases by their relevance to distressing news headlines, from most distressing to least distressing. Focus on terms that are **most distressing** for those looking to avoid disaster and politics."
                $params.Message = $processedKeywords.Keys | Out-String
                $result = Request-ChatCompletion @params

                # Create new hashtable with filtered keywords
                $filteredKeywords = @{}
                $resultCount = 0
                foreach ($keyword in (($result.answer | ConvertFrom-Json).keywords | Select-Object -First 50)) {
                    if ($processedKeywords.ContainsKey($keyword)) {
                        $resultCount++
                        $filteredKeywords[$keyword] = $processedKeywords[$keyword]
                    }
                }
                if ($resultCount -gt 20) {
                    # i've seen it do 0 before
                    $processedKeywords = $filteredKeywords
                }
                Write-Output "Total updated combined keywords: $(($processedKeywords.Keys | Measure-Object).Count)"
            }

            Write-Output "Preparing Gist update payload..."
            $newsObject = @{
                "New Developments" = @{
                    description = "Recently emerging political figures and developing stories"
                    keywords    = $processedKeywords
                }
            }

            $newsContent = $newsObject | ConvertTo-Json -Depth 10
            $gistid = "3488593dcc622acc736055fa00a9745e"
            Write-Output "Setting up GitHub Gist API request..."
            $gistUpdateUri = "https://api.github.com/gists/$gistid"

            # Set up headers for the GitHub API request
            $gistHeaders = @{
                "Accept"               = "application/vnd.github+json"
                "Authorization"        = "Bearer $env:GIST_PAT"
                "X-GitHub-Api-Version" = "2022-11-28"
            }

            # Create the body with the required file structure
            $gistBody = @{
                files = @{
                    "new-development.json" = @{
                        content = $newsContent
                    }
                }
            } | ConvertTo-Json -Depth 10

            Write-Output "Updating GitHub Gist..."
            $updateParams = @{
                Uri         = $gistUpdateUri
                Headers     = $gistHeaders
                Method      = "PATCH"
                Body        = $gistBody -replace "    ", " "
                ContentType = "application/json"
            }
            $gist = Invoke-RestMethod @updateParams
            Write-Output "GitHub Gist updated successfully"

            # Return the updated content
            $gist.files."new-development.json".content
        } catch {
            Write-Error "Failed to update news Gist: $_"
            Write-Output "Stack Trace: $($_.ScriptStackTrace)"
            throw
        }
    }
}

Update-Gist