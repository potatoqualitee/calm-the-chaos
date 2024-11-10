// settingsManager.js

// Function to export settings to a JSON file
function exportSettings() {
  chrome.storage.local.get(['customKeywords', 'keywordGroups', 'disabledGroups', 'disabledKeywords', 'ignoredDomains', 'disabledDomains', 'matchingOption'], (settings) => {
    const exportData = {
      customKeywords: settings.customKeywords || [],
      keywordGroups: settings.keywordGroups || {},
      disabledGroups: settings.disabledGroups || [],
      disabledKeywords: settings.disabledKeywords || [],
      ignoredDomains: settings.ignoredDomains || [],
      disabledDomains: settings.disabledDomains || [],
      matchingOption: settings.matchingOption || 'flexible'
    };

    // Include the checked state of default keywords
    for (const group in exportData.keywordGroups) {
      if (exportData.keywordGroups.hasOwnProperty(group)) {
        exportData.keywordGroups[group] = exportData.keywordGroups[group].map(keyword => ({
          keyword,
          checked: !exportData.disabledKeywords.includes(keyword)
        }));
      }
    }

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'settings.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}

// Function to import settings from a JSON file
function importSettings(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const importedSettings = JSON.parse(event.target.result);

    chrome.storage.local.get(['customKeywords', 'keywordGroups', 'disabledGroups', 'disabledKeywords', 'ignoredDomains', 'disabledDomains', 'matchingOption'], (currentSettings) => {
      const newKeywords = new Set(currentSettings.customKeywords);
      importedSettings.customKeywords.forEach(keyword => newKeywords.add(keyword));

      const updatedKeywordGroups = { ...currentSettings.keywordGroups };
      const disabledKeywords = new Set(currentSettings.disabledKeywords);

      const progressIndicator = document.getElementById('progressIndicator');
      progressIndicator.textContent = 'Importing settings...';

      for (const group in importedSettings.keywordGroups) {
        if (importedSettings.keywordGroups.hasOwnProperty(group)) {
          if (!updatedKeywordGroups[group]) {
            updatedKeywordGroups[group] = [];
          }
          importedSettings.keywordGroups[group].forEach(item => {
            if (!updatedKeywordGroups[group].includes(item.keyword)) {
              updatedKeywordGroups[group].push(item.keyword);
            }
            if (!item.checked) {
              disabledKeywords.add(item.keyword);
            }
            // Update progress indicator with the current keyword
            progressIndicator.textContent = `Importing ${item.keyword}...`;
          });
        }
      }

      const newDisabledGroups = new Set(currentSettings.disabledGroups);
      importedSettings.disabledGroups.forEach(group => newDisabledGroups.add(group));

      const newDisabledDomains = new Set(currentSettings.disabledDomains);
      importedSettings.disabledDomains.forEach(domain => newDisabledDomains.add(domain));

      const newIgnoredDomains = new Set(currentSettings.ignoredDomains);
      importedSettings.ignoredDomains.forEach(domain => newIgnoredDomains.add(domain));

      chrome.storage.local.set({
        customKeywords: Array.from(newKeywords),
        keywordGroups: updatedKeywordGroups,
        disabledGroups: Array.from(newDisabledGroups),
        disabledKeywords: Array.from(disabledKeywords),
        ignoredDomains: Array.from(newIgnoredDomains),
        disabledDomains: Array.from(newDisabledDomains),
        matchingOption: importedSettings.matchingOption || 'flexible'
      }, () => {
        // Update progress indicator to show "Import Complete" in green with margin
        progressIndicator.textContent = 'Import Complete!';
        progressIndicator.style.color = 'green';
        progressIndicator.style.fontSize = '24px';
        progressIndicator.style.fontWeight = 'bold';
        progressIndicator.style.marginTop = '20px'; // Add margin for spacing
      });
    });
  };
  reader.readAsText(file);
}

export { exportSettings, importSettings };
