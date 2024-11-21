// settingsManager.js
import * as storage from '../../../options/optionsStorage.js';

export async function exportSettings() {
  const settings = await storage.getStorageData([
    'ignoredDomains',
    'keywordGroups',
    'customKeywords',
    'customDomains',
    'disabledGroups',
    'disabledKeywords',
    'disabledDomainGroups',
    'disabledDomains',
    'elementGroups',
    'disabledElementGroups',
    'disabledElements',
    'matchingOption',
    'configUrls',
    'checkForUpdates',
    'filteringEnabled',
    'collapseStyle',
    'enabledDomains',
    'imageFilteringEnabled',
    'imageContext',
    'imageContainerStyle',
    'filterRedditCommentThreads',
    'showBlurMessage'
  ]);

  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'content-filter-settings.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importSettings(fileOrData) {
  try {
    let settings;
    if (fileOrData instanceof File) {
      if (!fileOrData.type.includes('application/json')) {
        throw new Error('File must be in JSON format');
      }
      const text = await fileOrData.text();
      try {
        settings = JSON.parse(text);
      } catch (e) {
        throw new Error('Invalid JSON format in file');
      }
    } else {
      settings = fileOrData;
    }

    // Validate settings object
    if (!settings || typeof settings !== 'object') {
      throw new Error('Invalid settings format: must be a JSON object');
    }

    // Get current settings to merge with imported ones
    const currentSettings = await storage.getStorageData([
      'ignoredDomains',
      'keywordGroups',
      'customKeywords',
      'customDomains',
      'disabledGroups',
      'disabledKeywords',
      'disabledDomainGroups',
      'disabledDomains',
      'elementGroups',
      'disabledElementGroups',
      'disabledElements',
      'matchingOption',
      'configUrls',
      'checkForUpdates',
      'filteringEnabled',
      'collapseStyle',
      'enabledDomains',
      'imageFilteringEnabled',
      'imageContext',
      'imageContainerStyle',
      'filterRedditCommentThreads',
      'showBlurMessage'
    ]);

    // Validate data types and merge settings
    const validSettings = {};

    // Handle boolean settings
    const booleanSettings = ['filteringEnabled', 'checkForUpdates', 'imageFilteringEnabled', 'filterRedditCommentThreads', 'showBlurMessage'];
    for (const key of booleanSettings) {
      if (key in settings) {
        if (typeof settings[key] !== 'boolean') {
          throw new Error(`Invalid value for ${key}: must be a boolean`);
        }
        validSettings[key] = settings[key];
      }
    }

    // Handle array settings - merge with existing and remove duplicates
    const arraySettings = [
      'customKeywords',
      'customDomains',
      'disabledGroups',
      'disabledKeywords',
      'disabledDomainGroups',
      'disabledDomains',
      'disabledElementGroups',
      'disabledElements',
      'enabledDomains',
      'configUrls'
    ];
    for (const key of arraySettings) {
      if (key in settings) {
        if (!Array.isArray(settings[key])) {
          throw new Error(`Invalid value for ${key}: must be an array`);
        }
        // Merge with existing arrays and remove duplicates
        validSettings[key] = [...new Set([
          ...(currentSettings[key] || []),
          ...settings[key]
        ])].sort();
      }
    }

    // Handle object settings - deep merge
    const objectSettings = ['ignoredDomains', 'keywordGroups', 'elementGroups', 'imageContext'];
    for (const key of objectSettings) {
      if (key in settings) {
        if (typeof settings[key] !== 'object' || settings[key] === null) {
          throw new Error(`Invalid value for ${key}: must be an object`);
        }
        // Deep merge objects
        validSettings[key] = {
          ...(currentSettings[key] || {}),
          ...settings[key]
        };
      }
    }

    // Handle string settings
    const stringSettings = ['matchingOption', 'collapseStyle', 'imageContainerStyle'];
    for (const key of stringSettings) {
      if (key in settings) {
        if (typeof settings[key] !== 'string') {
          throw new Error(`Invalid value for ${key}: must be a string`);
        }
        validSettings[key] = settings[key];
      }
    }

    // Handle legacy importUrl if present
    if (settings.importUrl && typeof settings.importUrl === 'string') {
      const currentConfigUrls = validSettings.configUrls || currentSettings.configUrls || [];
      if (!currentConfigUrls.includes(settings.importUrl)) {
        validSettings.configUrls = [...currentConfigUrls, settings.importUrl].sort();
      }
    }

    // Special handling for filtering mode changes
    if ('filteringEnabled' in validSettings) {
      const newFilteringEnabled = validSettings.filteringEnabled;
      const currentFilteringEnabled = currentSettings.filteringEnabled;

      if (newFilteringEnabled !== currentFilteringEnabled) {
        // If switching from disabled to enabled, move enabledDomains to ignoredDomains
        if (newFilteringEnabled && validSettings.enabledDomains?.length > 0) {
          validSettings.ignoredDomains = validSettings.ignoredDomains || {};
          validSettings.ignoredDomains['Other'] = [
            ...(validSettings.ignoredDomains['Other'] || []),
            ...(validSettings.enabledDomains || [])
          ];
          validSettings.enabledDomains = [];
        }
      }
    }

    await storage.setStorageData(validSettings);
  } catch (error) {
    console.error('Failed to import settings:', error);
    throw error;
  }
}
