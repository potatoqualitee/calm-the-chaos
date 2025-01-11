function Update-Gist {
    [CmdletBinding()]
    param ()
    process {
        # Validate environment variables
        if (-not $env:BRAVE_API_KEY -or -not $env:GITHUB_TOKEN -or -not $env:BING_API_KEY) {
            throw "BRAVE_API_KEY or GITHUB_TOKEN or BING_API_KEY environment variable is not set"
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
                Write-Output "Processing category file: $($PSItem.Name)"
                $json = Get-Content -Path $PSItem.FullName -Raw | ConvertFrom-Json
                $title = $json.PSObject.Properties | Select-Object -First 1
                $title.Value.keywords.PSObject.Properties.Name
            }

            Write-Output "Fetching existing keywords from Gist..."
            $existingjson = Invoke-RestMethod https://gist.githubusercontent.com/potatoqualitee/3488593dcc622acc736055fa00a9745e/raw/new-development.json
            $existingkeywords = $existingjson."New Developments".keywords.PSObject.Properties.Name

            $allKeywords += $existingkeywords
            Write-Output "Total keywords gathered: $(($allKeywords | Measure-Object).Count)"

            $params = @{
                Model         = "gpt-4o-mini"
                Verbose       = $false
                SystemMessage = "You are an expert news-headline analyzer focused on spotting content that can cause distress, anxiety, or a desire to disengage (i.e., political turmoil, extreme violence, hateful speech, severe crises, etc.).

                - You have access to an existing list of disqualifying keywords (e.g., references to war, gun violence, inflammatory politicians, controversial legislation) that are already being blocked.
                - Use that list only as a guide to understand the kinds of people, topics, or phrases that are considered inflammatory or distressing.

                Your task: When a headline contains a new or unlisted trigger (e.g., 'Idaho Supreme Court' overturning gay marriage) represents the same categories of distress (violent acts, hateful rhetoric, political clampdowns, or major social upheaval) - then flag that headline accordingly.

                1. If a headline references a new or emergent person, entity, or topic that aligns with the same high-distress categories exemplified by our existing keyword list, flag it.
                2. Ignore trivial or unrelated uses of words that happen to appear in the same domain but have no distressing or inflammatory context.
                3. Ignore words that would be too broad such as 'ruthless'

                Goal: Make sure new triggers (like 'Idaho Supreme Court' in a harmful civil rights context) are also caught-even if they aren't in the existing keyword list.

                Existing keywords: $allKeywords

                Prefer conciseness.
                DO NOT: LA schools closed due to wildfires
                DO: wildfires
                DO NOT: Tougher U.S. sanctions to curb Russian oil supply
                DO: Russian oil"
                Message       = $newstitles
                Format        = "json_schema"
                JsonSchema    = $jsonSchema
            }

            Write-Output "Requesting AI analysis of headlines..."
            $result = Request-ChatCompletion @params
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
                if (-not ($existingkeywords | Where-Object { $keyword.Split(' ') -contains $PSItem }) -and -not ($allKeywords | Where-Object { $keyword.Split(' ') -contains $PSItem })) {
                    Write-Output "Adding new keyword: $keyword"
                    $processedKeywords[$keyword] = @{
                        weight      = 3
                        description = "Current trending topic"
                        timestamp   = $currentTime.ToString('o')  # ISO 8601 format
                    }
                }
            }

            Write-Output "Total combined keywords: $(($processedKeywords.Keys | Measure-Object).Count)"

            if (($processedKeywords.Keys | Measure-Object).Count -gt 50) {
                #  Slim down to 50 max and remove duplicates
                Write-Output "Going slim it down from: $($processedKeywords.Keys) because there are $(($processedKeywords.Keys | Measure-Object).Count -gt 50) keywords"

                $params.SystemMessage = "You are an expert content filtering analyst specializing in optimizing keyword lists for anxiety-reducing content filters. Your task is to analyze and refine a list of potentially distressing keywords.

                Guidelines:
                1. LIMIT: Return exactly 50 keywords maximum, prioritizing based on:
                - Primary: Terms with highest potential for causing anxiety/distress (e.g., 'mass shooting' over 'political debate')
                - Secondary: Terms with highest likelihood of appearance in headlines

                2. DUPLICATE HANDLING:
                - Remove redundant variations (e.g., keep 'Trump' over 'Trump Administration', 'Trump Campaign')
                - Choose the most broadly applicable term that maintains accuracy
                - Exception: Keep specific variations only if they represent distinctly different contexts

                3. SELECTION CRITERIA:
                - Prefer concrete terms over abstract concepts
                - Prioritize current, active threats/issues over historical references
                - Focus on terms that represent ongoing or developing situations
                - Keep terms that are unique identifiers for major distressing events

                Output Format: Return a JSON array of exactly 50 or fewer strings, representing the most critical keywords for content filtering.

                Example Transformation:
                Input: ['Trump', 'Trump Administration', 'Trump Campaign', 'mass shooting']
                Output: ['Trump', 'mass shooting']
                Reasoning: 'Trump' covers all Trump-related content, 'mass shooting' is distressing."
                $params.Message = $processedKeywords.Keys -join " "
                $result = Request-ChatCompletion @params

                # Create new hashtable with filtered keywords
                $filteredKeywords = @{}
                foreach ($keyword in ($result.answer | ConvertFrom-Json).keywords) {
                    if ($processedKeywords.ContainsKey($keyword)) {
                        $filteredKeywords[$keyword] = $processedKeywords[$keyword]
                    }
                }
                $processedKeywords = $filteredKeywords
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
                "Authorization"        = "Bearer $env:GITHUB_TOKEN"
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