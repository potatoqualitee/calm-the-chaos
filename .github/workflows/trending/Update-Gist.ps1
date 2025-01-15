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
        Write-Verbose "Starting gist update process"

        # Validate environment variables
        if (-not (Get-Item env:GIST_PAT -ErrorAction SilentlyContinue)) {
            throw "GIST_PAT environment variable is not set"
        }

        try {
            # Get trending topics
            $processedKeywords = Set-TrendingTopic -ApiSource $ApiSource -Model $Model
            if (-not $processedKeywords) {
                Write-Warning "No keywords found to update"
                return
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
            $scoredKeywords = @{}
            foreach ($keyword in $processedKeywords.Keys) {
                $historyData = if ($keywordHistory.ContainsKey($keyword)) {
                    $keywordHistory[$keyword]
                }
                else {
                    @{ appearances = 0; lastSeen = $null }
                }

                $score = Get-TermScore -Term $keyword -NewsFrequency 1 -HistoryData $historyData -MaxFrequency $maxFrequency -MaxAppearance $maxAppearances
                if ($score -gt 0) {
                    $scoredKeywords[$keyword] = $processedKeywords[$keyword]
                }
            }

            # Merge with existing keywords and update gist
            Write-Verbose "Preparing gist update..."
            $newsObject = @{
                "New Developments" = @{
                    description = "Recently emerging political figures and developing stories"
                    keywords = $scoredKeywords
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