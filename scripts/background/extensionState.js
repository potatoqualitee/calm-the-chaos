import { loadDefaultKeywordCatalog } from './defaultKeywordLoader.js';
import { migrateManagedGroupExtras, reconcileKeywordCatalog } from './keywordCatalogMigration.js';
import { DEFAULT_IGNORED_URLS } from '../core/config/ignoredUrls.js';
import { DEFAULT_ELEMENT_GROUPS } from '../core/config/elements.js';
import { PRECONFIGURED_DOMAINS } from '../core/config/preconfiguredDomains.js';
import { checkForNewKeywords, injectContentScripts } from './updateChecker.js';

const getStorage = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));
const setStorage = values => new Promise(resolve => chrome.storage.local.set(values, resolve));
const queryTabs = query => new Promise(resolve => chrome.tabs.query(query, resolve));
const DYNAMIC_CATALOG_CATEGORIES = new Set(['New Developments']);

function matchesPreconfiguredDomain(value) {
  try {
    const candidate = /^https?:\/\//i.test(String(value))
      ? new URL(value).hostname
      : new URL(`https://${value}`).hostname;
    const hostname = candidate.toLowerCase().replace(/^www\./, '');
    return PRECONFIGURED_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch (_error) {
    return false;
  }
}

// Initialize extension state on installation or update
export async function initializeExtensionState(details) {
  const result = await getStorage([
    'ignoredDomains',
    'checkForUpdates',
    'configUrls',
    'importUrl',
    'filteringEnabled'
  ]);

  const ignoredDomains = result.ignoredDomains || DEFAULT_IGNORED_URLS;
  const checkForUpdates = result.checkForUpdates !== undefined ? result.checkForUpdates : true;
  const configUrls = [...(result.configUrls || [])];
  const filteringEnabled = result.filteringEnabled !== undefined
    ? result.filteringEnabled
    : false;

  // Handle legacy importUrl if it exists
  if (result.importUrl && typeof result.importUrl === 'string' && !configUrls.includes(result.importUrl)) {
    configUrls.push(result.importUrl);
  }

  // Ensure 'Other' category exists in ignoredDomains
  if (!ignoredDomains['Other']) {
    ignoredDomains['Other'] = [];
  }

  // Remove pre-configured domains from ignored list to make them enabled by default
  ignoredDomains['Other'] = ignoredDomains['Other'].filter(domain =>
    !matchesPreconfiguredDomain(domain)
  );

  await Promise.all([
    setStorage({
      ignoredDomains,
      checkForUpdates,
      configUrls,
      filteringEnabled
    }),
    initializeKeywordGroups(),
    initializeElementGroups(),
    initializeStats()
  ]);

  // If enabled, check for updates on install
  if (checkForUpdates && configUrls.length > 0) {
    void checkForNewKeywords(configUrls);
  }

  if (details.reason === 'update') await injectContentScripts();

  const tabs = await queryTabs({});
  tabs.forEach(tab => {
    if (!tab.url || !matchesPreconfiguredDomain(tab.url)) return;
    chrome.action.setIcon({
      tabId: tab.id,
      path: {
        "16": "images/icon16.png",
        "48": "images/icon48.png",
        "128": "images/icon128.png"
      }
    });
    chrome.tabs.reload(tab.id);
  });
}

// Initialize keyword groups with defaults
async function initializeKeywordGroups() {
  const { enabledGroups, catalogGroups, manifest, manifestError } = await loadDefaultKeywordCatalog();
  const stored = await getStorage([
    'keywordGroups',
    'keywordCatalogSnapshot',
    'keywordCatalogEnabledSnapshot',
    'customKeywords',
    'customKeywordMeta',
    'retiredDefaultKeywords',
    'pinnedKeywords',
    'disabledGroups',
    'disabledKeywords'
  ]);

  const storedGroups = stored.keywordGroups || {};
  if (!manifest) {
    if (Object.keys(storedGroups).length > 0) {
      console.error('Preserving stored keywords because catalog migration metadata failed:', manifestError);
      return;
    }
    await setStorage({
      keywordGroups: enabledGroups,
      keywordCatalogSnapshot: catalogGroups,
      keywordCatalogEnabledSnapshot: enabledGroups
    });
    return;
  }

  const hadSnapshot = Boolean(stored.keywordCatalogSnapshot);
  const legacyManagedGroups = Object.fromEntries(
    Object.entries(storedGroups).filter(([category]) =>
      category in catalogGroups && !DYNAMIC_CATALOG_CATEGORIES.has(category))
  );
  const previousCatalogGroups = stored.keywordCatalogSnapshot || legacyManagedGroups;
  const previousEnabledGroups = stored.keywordCatalogEnabledSnapshot || legacyManagedGroups;
  const migratedExtras = migrateManagedGroupExtras({
    storedGroups,
    previousCatalogGroups,
    nextCatalogGroups: catalogGroups,
    customKeywords: stored.customKeywords,
    customKeywordMeta: stored.customKeywordMeta,
    disabledGroups: stored.disabledGroups,
    disabledKeywords: stored.disabledKeywords,
    manifest,
    hadSnapshot,
    dynamicCategories: [...DYNAMIC_CATALOG_CATEGORIES]
  });
  const reconciled = reconcileKeywordCatalog({
    previousCatalogGroups,
    previousEnabledGroups,
    nextCatalogGroups: catalogGroups,
    nextEnabledGroups: enabledGroups,
    customKeywords: migratedExtras.customKeywords,
    customKeywordMeta: migratedExtras.customKeywordMeta,
    retiredDefaultKeywords: stored.retiredDefaultKeywords,
    pinnedKeywords: stored.pinnedKeywords,
    disabledGroups: stored.disabledGroups,
    disabledKeywords: migratedExtras.disabledKeywords,
    manifest
  });

  // Preserve imported/user-defined groups with distinct names, but replace
  // authoritative bundled groups wholesale so removed categories cannot linger.
  const managedCategories = new Set([
    ...Object.keys(previousCatalogGroups),
    ...Object.keys(catalogGroups)
  ]);
  const userGroups = Object.fromEntries(
    Object.entries(storedGroups).filter(([category]) => !managedCategories.has(category))
  );

  await setStorage({
    keywordGroups: { ...userGroups, ...enabledGroups },
    keywordCatalogSnapshot: catalogGroups,
    keywordCatalogEnabledSnapshot: enabledGroups,
    keywordCatalogVersion: manifest.catalogVersion,
    customKeywords: reconciled.customKeywords,
    customKeywordMeta: reconciled.customKeywordMeta,
    retiredDefaultKeywords: reconciled.retiredDefaultKeywords,
    pinnedKeywords: reconciled.pinnedKeywords,
    disabledKeywords: reconciled.disabledKeywords
  });
}

// Initialize element groups with defaults
function initializeElementGroups() {
  return new Promise(resolve => {
    chrome.storage.local.get('elementGroups', (result) => {
      const elementGroups = result.elementGroups || {};
      const newElementGroups = { ...elementGroups, ...DEFAULT_ELEMENT_GROUPS };
      chrome.storage.local.set({ elementGroups: newElementGroups }, resolve);
    });
  });
}

// Initialize statistics
function initializeStats() {
  return new Promise(resolve => {
    chrome.storage.local.set({
      stats: { totalBlocked: 0, totalScanned: 0 }
    }, resolve);
  });
}

// Reset all stats for the extension
export function resetAllStats() {
  chrome.storage.local.set({
    stats: { totalBlocked: 0, totalScanned: 0 }
  });

  // Clear all tab-specific stats
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      resetPageStats(tab.id);
    });
  });
}

// Update page statistics
export function updatePageStats(tabId, count, total) {
  if (!tabId) return;

  const key = `pageStats_${tabId}`;
  chrome.storage.local.get(['stats', key], (result) => {
    const currentStats = result[key] || { pageBlocked: 0, pageTotal: 0 };
    const globalStats = result.stats || { totalBlocked: 0, totalScanned: 0 };

    // Only update if count has changed
    if (count !== currentStats.pageBlocked) {
      const newStats = {
        pageBlocked: count,
        pageTotal: Math.max(total, currentStats.pageTotal)
      };

      // Update global stats with the difference
      const diff = count - currentStats.pageBlocked;
      if (diff > 0) {
        globalStats.totalBlocked += diff;
        globalStats.totalScanned = Math.max(globalStats.totalScanned, total);
      }

      // Save both page and global stats
      chrome.storage.local.set({
        [key]: newStats,
        stats: globalStats
      }, () => {
        // Update badge after stats are saved
        chrome.action.setBadgeText({
          text: count > 0 ? count.toString() : '',
          tabId: tabId
        });
      });
    }
  });
}

// Reset page statistics for a tab
export function resetPageStats(tabId) {
  chrome.storage.local.remove(`pageStats_${tabId}`);
  chrome.storage.local.remove(`blockedKeywords_${tabId}`);
}

// Update blocked keywords for a tab
export function updateBlockedKeywords(tabId, items) {
  if (!tabId || !items) return;

  // Ensure items are properly formatted
  const formattedItems = items.map(item => {
    if (typeof item === 'object' && item.blockedKeywords) {
      return {
        blockedKeywords: Array.isArray(item.blockedKeywords) ? item.blockedKeywords : [String(item.blockedKeywords)],
        count: item.count || 1
      };
    }
    return null;
  }).filter(Boolean);

  const storageKey = `blockedKeywords_${tabId}`;
  chrome.storage.local.set({
    [storageKey]: formattedItems
  }, () => {
    console.debug('Blocked keywords synced for tab:', tabId);
  });
}
