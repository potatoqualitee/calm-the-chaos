// settingsManager.js
import * as storage from '../../../options/optionsStorage.js';
import catalogManifest from '../../../keywords/catalog-migrations.json';
import {
  inferLegacyCatalogGroups,
  migrateManagedGroupExtras,
  reconcileKeywordCatalog
} from '../../background/keywordCatalogMigration.js';

const identity = value => String(value || '')
  .normalize('NFKC')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const ENUM_SETTINGS = Object.freeze({
  matchingOption: new Set(['exact', 'flexible']),
  collapseStyle: new Set(['hideCompletely', 'keepContainer']),
  imageContainerStyle: new Set(['hideImage', 'hideContainer'])
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value, key) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`Invalid value for ${key}: must be an array of strings`);
  }
  return value.map(item => item.trim()).filter(Boolean);
}

function groupMap(value, key) {
  if (!isPlainObject(value)) {
    throw new Error(`Invalid value for ${key}: must be an object of string arrays`);
  }
  const result = {};
  for (const [group, keywords] of Object.entries(value)) {
    result[group] = stringArray(keywords, `${key}.${group}`);
  }
  return result;
}

function mergeStrings(...lists) {
  const merged = new Map();
  for (const list of lists) {
    for (const value of list || []) {
      const key = identity(value);
      if (key && !merged.has(key)) merged.set(key, value);
    }
  }
  return [...merged.values()].sort((a, b) => a.localeCompare(b));
}

function metadataMap(value, key) {
  if (!isPlainObject(value)) throw new Error(`Invalid value for ${key}: must be an object`);
  const result = {};
  for (const [keyword, record] of Object.entries(value)) {
    if (!isPlainObject(record)) {
      throw new Error(`Invalid value for ${key}.${keyword}: must be an object`);
    }
    const normalized = identity(keyword);
    if (normalized) result[normalized] = { ...record };
  }
  return result;
}

function retiredRecords(value) {
  if (!Array.isArray(value)) {
    throw new Error('Invalid value for retiredDefaultKeywords: must be an array');
  }
  return value.map((entry, index) => {
    if (typeof entry === 'string') {
      if (!entry.trim()) throw new Error(`Invalid retired keyword at index ${index}`);
      return { keyword: entry.trim() };
    }
    if (!isPlainObject(entry) || typeof entry.keyword !== 'string' || !entry.keyword.trim()) {
      throw new Error(`Invalid retired keyword record at index ${index}`);
    }
    return { ...entry, keyword: entry.keyword.trim() };
  });
}

function mergeMetadata(current, imported) {
  const merged = { ...current };
  for (const [key, value] of Object.entries(imported)) {
    if (merged[key]?.origin === 'user' && value.origin !== 'user') continue;
    merged[key] = { ...value };
  }
  return merged;
}

function projectGroupsToCatalog(groups, catalogGroups) {
  const known = new Set(
    Object.values(catalogGroups || {})
      .flatMap(keywords => Array.isArray(keywords) ? keywords : [])
      .map(identity)
      .filter(Boolean)
  );
  const projected = {};
  for (const [category, keywords] of Object.entries(groups || {})) {
    const matches = (Array.isArray(keywords) ? keywords : [])
      .filter(keyword => known.has(identity(keyword)));
    if (matches.length > 0) projected[category] = matches;
  }
  return projected;
}

export async function exportSettings() {
  const settings = await storage.getStorageData([
    'ignoredDomains',
    'keywordGroups',
    'keywordCatalogSnapshot',
    'customKeywords',
    'retiredDefaultKeywords',
    'customKeywordMeta',
    'pinnedKeywords',
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
    'filterAllSites',
    'collapseStyle',
    'enabledDomains',
    'imageFilteringEnabled',
    'imageContext',
    'imageContainerStyle',
    'filterRedditCommentThreads',
    'filterFacebookCommentThreads',
    'showBlurMessage',
    'autoUpdateNewDevelopments'
  ]);

  // Catalog groups and revision snapshots are extension-owned. Export only
  // distinctly named user/imported groups so restoring a backup cannot roll
  // the bundled catalog backward.
  const managedCategories = new Set(Object.keys(settings.keywordCatalogSnapshot || {}));
  const userKeywordGroups = Object.fromEntries(
    Object.entries(settings.keywordGroups || {})
      .filter(([category, keywords]) =>
        !managedCategories.has(category) && Array.isArray(keywords))
  );
  const exported = { ...settings, userKeywordGroups };
  delete exported.keywordGroups;
  delete exported.keywordCatalogSnapshot;

  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
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
    if (typeof File !== 'undefined' && fileOrData instanceof File) {
      const hasJsonName = fileOrData.name?.toLowerCase().endsWith('.json');
      if (fileOrData.type && !fileOrData.type.includes('application/json') && !hasJsonName) {
        throw new Error('File must be in JSON format');
      }
      try {
        settings = JSON.parse(await fileOrData.text());
      } catch (_error) {
        throw new Error('Invalid JSON format in file');
      }
    } else {
      settings = fileOrData;
    }

    if (!isPlainObject(settings)) {
      throw new Error('Invalid settings format: must be a JSON object');
    }

    const currentSettings = await storage.getStorageData([
      'ignoredDomains',
      'keywordGroups',
      'keywordCatalogSnapshot',
      'keywordCatalogEnabledSnapshot',
      'customKeywords',
      'retiredDefaultKeywords',
      'customKeywordMeta',
      'pinnedKeywords',
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
      'filterAllSites',
      'collapseStyle',
      'enabledDomains',
      'imageFilteringEnabled',
      'imageContext',
      'imageContainerStyle',
      'filterRedditCommentThreads',
      'filterFacebookCommentThreads',
      'showBlurMessage',
      'autoUpdateNewDevelopments'
    ]);

    const validSettings = {};
    const booleanSettings = [
      'filteringEnabled', 'filterAllSites', 'checkForUpdates',
      'imageFilteringEnabled', 'filterRedditCommentThreads',
      'filterFacebookCommentThreads', 'showBlurMessage', 'autoUpdateNewDevelopments'
    ];
    for (const key of booleanSettings) {
      if (!(key in settings)) continue;
      if (typeof settings[key] !== 'boolean') {
        throw new Error(`Invalid value for ${key}: must be a boolean`);
      }
      validSettings[key] = settings[key];
    }

    const arraySettings = [
      'pinnedKeywords', 'customDomains', 'disabledGroups', 'disabledKeywords',
      'disabledDomainGroups', 'disabledDomains', 'disabledElementGroups',
      'disabledElements', 'enabledDomains', 'configUrls'
    ];
    for (const key of arraySettings) {
      if (!(key in settings)) continue;
      validSettings[key] = mergeStrings(
        stringArray(currentSettings[key] || [], key),
        stringArray(settings[key], key)
      );
    }

    for (const key of ['ignoredDomains', 'elementGroups']) {
      if (!(key in settings)) continue;
      const imported = groupMap(settings[key], key);
      validSettings[key] = { ...(currentSettings[key] || {}), ...imported };
    }
    if ('imageContext' in settings) {
      if (!isPlainObject(settings.imageContext)
          || Object.values(settings.imageContext).some(value => typeof value !== 'boolean')) {
        throw new Error('Invalid value for imageContext: must be an object of booleans');
      }
      validSettings.imageContext = {
        ...(currentSettings.imageContext || {}),
        ...settings.imageContext
      };
    }

    for (const [key, allowed] of Object.entries(ENUM_SETTINGS)) {
      if (!(key in settings)) continue;
      if (typeof settings[key] !== 'string' || !allowed.has(settings[key])) {
        throw new Error(
          `Invalid value for ${key}: must be one of ${[...allowed].join(', ')}`
        );
      }
      validSettings[key] = settings[key];
    }

    const importedCustom = 'customKeywords' in settings
      ? stringArray(settings.customKeywords, 'customKeywords')
      : [];
    let customKeywords = mergeStrings(currentSettings.customKeywords || [], importedCustom);
    const currentMeta = metadataMap(currentSettings.customKeywordMeta || {}, 'current customKeywordMeta');
    const importedMeta = 'customKeywordMeta' in settings
      ? metadataMap(settings.customKeywordMeta, 'customKeywordMeta')
      : {};
    let customKeywordMeta = mergeMetadata(currentMeta, importedMeta);
    for (const keyword of importedCustom) {
      const key = identity(keyword);
      if (!customKeywordMeta[key]) customKeywordMeta[key] = { origin: 'user' };
    }

    // New exports contain userKeywordGroups only. Legacy backups may include
    // bundled groups and snapshots; those are migration evidence, never state
    // that can replace the current bundled catalog.
    const incomingGroupSources = [];
    if ('userKeywordGroups' in settings) {
      incomingGroupSources.push(groupMap(settings.userKeywordGroups, 'userKeywordGroups'));
    }
    if ('keywordGroups' in settings) {
      incomingGroupSources.push(groupMap(settings.keywordGroups, 'keywordGroups'));
    }
    const importedGroups = {};
    for (const groups of incomingGroupSources) {
      for (const [category, keywords] of Object.entries(groups)) {
        importedGroups[category] = mergeStrings(importedGroups[category] || [], keywords);
      }
    }

    const currentSnapshot = groupMap(
      currentSettings.keywordCatalogSnapshot || currentSettings.keywordGroups || {},
      'current keywordCatalogSnapshot'
    );
    const currentEnabledSnapshot = groupMap(
      currentSettings.keywordCatalogEnabledSnapshot || currentSettings.keywordGroups || {},
      'current keywordCatalogEnabledSnapshot'
    );
    const importedSnapshot = 'keywordCatalogSnapshot' in settings
      ? groupMap(settings.keywordCatalogSnapshot, 'keywordCatalogSnapshot')
      : {};
    const importedEnabledSnapshot = 'keywordCatalogEnabledSnapshot' in settings
      ? groupMap(settings.keywordCatalogEnabledSnapshot, 'keywordCatalogEnabledSnapshot')
      : {};
    const hadSnapshot = Object.keys(importedSnapshot).length > 0;
    const previousCatalogGroups = hadSnapshot
      ? importedSnapshot
      : inferLegacyCatalogGroups({
          storedGroups: importedGroups,
          currentCatalogGroups: currentSnapshot,
          manifest: catalogManifest
        });
    const previousEnabledGroups = Object.keys(importedEnabledSnapshot).length > 0
      ? importedEnabledSnapshot
      : projectGroupsToCatalog(importedGroups, previousCatalogGroups);

    const managedCategories = new Set([
      ...Object.keys(currentSnapshot),
      ...Object.keys(previousCatalogGroups)
    ]);
    const keywordGroups = groupMap(currentSettings.keywordGroups || {}, 'current keywordGroups');
    for (const [category, keywords] of Object.entries(importedGroups)) {
      if (!managedCategories.has(category)) {
        keywordGroups[category] = mergeStrings(keywordGroups[category] || [], keywords);
      }
    }
    if (incomingGroupSources.length > 0) validSettings.keywordGroups = keywordGroups;

    const disabledGroups = validSettings.disabledGroups
      || stringArray(currentSettings.disabledGroups || [], 'current disabledGroups');
    const disabledKeywords = validSettings.disabledKeywords
      || stringArray(currentSettings.disabledKeywords || [], 'current disabledKeywords');
    const pinnedKeywords = validSettings.pinnedKeywords
      || stringArray(currentSettings.pinnedKeywords || [], 'current pinnedKeywords');
    const migratedExtras = migrateManagedGroupExtras({
      storedGroups: importedGroups,
      previousCatalogGroups,
      nextCatalogGroups: currentSnapshot,
      customKeywords,
      customKeywordMeta,
      disabledGroups,
      disabledKeywords,
      manifest: catalogManifest,
      hadSnapshot,
      requireProvenanceWithoutSnapshot: true
    });

    const importedRetired = 'retiredDefaultKeywords' in settings
      ? retiredRecords(settings.retiredDefaultKeywords)
      : [];
    const reconciled = reconcileKeywordCatalog({
      previousCatalogGroups,
      previousEnabledGroups,
      nextCatalogGroups: currentSnapshot,
      nextEnabledGroups: currentEnabledSnapshot,
      customKeywords: migratedExtras.customKeywords,
      customKeywordMeta: migratedExtras.customKeywordMeta,
      retiredDefaultKeywords: [
        ...retiredRecords(currentSettings.retiredDefaultKeywords || []),
        ...importedRetired
      ],
      pinnedKeywords,
      disabledGroups,
      disabledKeywords: migratedExtras.disabledKeywords,
      manifest: catalogManifest
    });

    validSettings.customKeywords = reconciled.customKeywords;
    validSettings.customKeywordMeta = reconciled.customKeywordMeta;
    validSettings.retiredDefaultKeywords = reconciled.retiredDefaultKeywords;
    validSettings.pinnedKeywords = reconciled.pinnedKeywords;
    validSettings.disabledKeywords = reconciled.disabledKeywords;

    if (settings.importUrl && typeof settings.importUrl === 'string') {
      const currentConfigUrls = validSettings.configUrls || currentSettings.configUrls || [];
      validSettings.configUrls = mergeStrings(currentConfigUrls, [settings.importUrl]);
    }

    if ('filteringEnabled' in validSettings
        && validSettings.filteringEnabled !== currentSettings.filteringEnabled
        && validSettings.filteringEnabled
        && validSettings.enabledDomains?.length > 0) {
      validSettings.ignoredDomains = validSettings.ignoredDomains || {};
      validSettings.ignoredDomains.Other = mergeStrings(
        validSettings.ignoredDomains.Other || [],
        validSettings.enabledDomains
      );
      validSettings.enabledDomains = [];
    }

    await storage.setStorageData(validSettings);
  } catch (error) {
    console.error('Failed to import settings:', error);
    throw error;
  }
}
