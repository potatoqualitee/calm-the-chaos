# Read all JSON files into a combined array
$allObjects = @()

$jsonFiles = @(
    "keywords/categories/political-rhetoric.json",
    "keywords/categories/political-violence-and-security-threats.json",
    "keywords/categories/race-relations.json",
    "keywords/categories/relational-violence.json",
    "keywords/categories/religion.json",
    "keywords/categories/reproductive-health.json",
    "keywords/categories/social-policy.json",
    "keywords/categories/us-government-institutions.json",
    "keywords/categories/us-political-figures-full-name.json",
    "keywords/categories/us-political-figures-single-name.json",
    "keywords/categories/economic-policy.json",
    "keywords/categories/education.json",
    "keywords/categories/gun-policy.json",
    "keywords/categories/healthcare-and-public-health.json",
    "keywords/categories/immigration.json",
    "keywords/categories/international-coverage.json",
    "keywords/categories/lgbtq.json",
    "keywords/categories/media-personalities.json",
    "keywords/categories/military-and-defense.json",
    "keywords/categories/new-developments.json",
    "keywords/categories/political-organizations.json"
)

foreach ($file in $jsonFiles) {
    $fileObjects = Get-Content $file | ConvertFrom-Json
    $allObjects += $fileObjects
}

# Check for duplicates
$duplicates = @()
$allObjects | ForEach-Object {
    $outer = $_.psobject.Properties.Value
    $allObjects | Where-Object {
        $inner = $_.psobject.Properties.Value
        $inner -ne $outer -and (Compare-Object $outer $inner -Property * -SyncWindow 0).SideIndicator -eq "=="
    } | ForEach-Object {
        $duplicates += @($outer, $inner)
    }
}

if ($duplicates) {
    Write-Output "Duplicate entries found:"
    $duplicates | ForEach-Object {
        $_ | ForEach-Object { $_ | ConvertTo-Json -Depth 100 }
    }
} else {
    Write-Output "No duplicate entries found."
}