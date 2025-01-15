function Get-BraveNews {
    [CmdletBinding()]
    param (
        [string]$ApiKey = $env:BRAVE_API_KEY
    )

    Write-Verbose "Fetching news from Brave API..."
    $braveParams = @{
        Uri = "https://api.search.brave.com/res/v1/news/search?q=latest+news&count=100&country=us&search_lang=en&freshness=pd"
        Headers = @{
            "Accept" = "application/json"
            "Accept-Encoding" = "gzip"
            "X-Subscription-Token" = $ApiKey
        }
        Method = "GET"
    }

    try {
        $braveResponse = Invoke-RestMethod @braveParams
        Write-Verbose "Retrieved $($braveResponse.results.Count) items from Brave"
        return $braveResponse.results.title
    }
    catch {
        Write-Error "Failed to fetch news from Brave API: $_"
        throw
    }
}