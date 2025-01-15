function Get-Gist {
    [CmdletBinding()]
    param (
        [Parameter(Position = 0)]
        [string]$GistId = "3488593dcc622acc736055fa00a9745e",
        [Parameter(Position = 1)]
        [string]$FileName = "new-development.json"
    )

    process {
        Write-Verbose "Fetching gist $GistId"

        # Validate environment variables
        if (-not (Get-Item env:GIST_PAT -ErrorAction SilentlyContinue)) {
            throw "GIST_PAT environment variable is not set"
        }

        try {
            $gistHeaders = @{
                "Accept" = "application/vnd.github+json"
                "Authorization" = "Bearer $env:GIST_PAT"
                "X-GitHub-Api-Version" = "2022-11-28"
            }

            $gistUri = "https://api.github.com/gists/$GistId"
            $gist = Invoke-RestMethod -Uri $gistUri -Headers $gistHeaders

            if ($FileName) {
                if ($gist.files.$FileName) {
                    return $gist.files.$FileName.content
                }
                else {
                    Write-Warning "File '$FileName' not found in gist"
                    return $null
                }
            }

            return $gist.files
        }
        catch {
            $PSCmdlet.ThrowTerminatingError(
                [System.Management.Automation.ErrorRecord]::new(
                    $_.Exception,
                    'GistFetchError',
                    [System.Management.Automation.ErrorCategory]::OperationStopped,
                    $GistId
                )
            )
        }
    }
}