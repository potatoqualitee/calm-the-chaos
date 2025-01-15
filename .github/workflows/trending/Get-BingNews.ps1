function Get-BingNews {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)]
        [string]$ApiKey = $env:BING_API_KEY
    )

    Write-Verbose "Fetching news from Bing API..."
    $bingParams = @{
        Uri = "https://api.bing.microsoft.com/v7.0/news/search"
        Headers = @{
            "Ocp-Apim-Subscription-Key" = $ApiKey
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

    try {
        $bingResponse = Invoke-RestMethod @bingParams
        Write-Verbose "Retrieved $($bingResponse.value.Count) items from Bing"
        return $bingResponse.value.name
    }
    catch {
        Write-Error "Failed to fetch news from Bing API: $_"
        throw
    }
}