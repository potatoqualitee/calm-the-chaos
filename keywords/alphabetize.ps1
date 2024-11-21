# Read the JSON file
$jsonContent = Get-Content -Path "keyword-groups.json" -Raw | ConvertFrom-Json

# Convert to hashtable/dictionary to allow modification
$dict = @{}
foreach ($property in $jsonContent.PSObject.Properties) {
    $dict[$property.Name] = $property.Value
}

# Create new sorted dictionary with sorted arrays
$sortedDict = [ordered]@{}
foreach ($category in ($dict.Keys | Sort-Object)) {
    $sortedDict[$category] = ($dict[$category] | Sort-Object)
}

# Convert back to JSON with proper formatting and without escaping
$newJson = $sortedDict | ConvertTo-Json -Depth 10

# Replace escaped characters back to their original form
$newJson = $newJson.Replace('\u0027', "'").Replace('\u0026', "&")

# Save the file with UTF8 encoding without BOM
[System.IO.File]::WriteAllText("keyword-groups.json", $newJson)