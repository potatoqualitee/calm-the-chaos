import { DEFAULT_KEYWORD_GROUPS } from '../core/config/keywords.js';
import { DEFAULT_IGNORED_URLS } from '../core/config/ignoredUrls.js';
import { DEFAULT_ELEMENT_GROUPS } from '../core/config/elements.js';
import { PRECONFIGURED_DOMAINS } from '../core/config/preconfiguredDomains.js';
import { checkForNewKeywords, injectContentScripts } from './updateChecker.js';

// Initialize extension state on installation or update
export async function initializeExtensionState(details) {
  if (details.reason === 'update') {
    await injectContentScripts();
  }

  // Initialize default settings on installation
  chrome.storage.local.get(['ignoredDomains', 'checkForUpdates', 'configUrls', 'importUrl'], (result) => {
    const ignoredDomains = result.ignoredDomains || DEFAULT_IGNORED_URLS;
    const checkForUpdates = result.checkForUpdates !== undefined ? result.checkForUpdates : true;
    const configUrls = result.configUrls || [];
    const filteringEnabled = false;  // Set filtering to disabled by default for non-platform sites

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
      !PRECONFIGURED_DOMAINS.some(preconfiguredDomain => domain.includes(preconfiguredDomain))
    );

    // Set colored icon for pre-configured domain tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.url && PRECONFIGURED_DOMAINS.some(domain => tab.url.includes(domain))) {
          chrome.action.setIcon({
            tabId: tab.id,
            path: {
              "16": "images/icon16.png",
              "48": "images/icon48.png",
              "128": "images/icon128.png"
            }
          });
          // Reload tab to apply filtering
          chrome.tabs.reload(tab.id);
        }
      });
    });

    chrome.storage.local.set({
      ignoredDomains,
      checkForUpdates,
      configUrls,
      filteringEnabled
    });

    // If enabled, check for updates on install
    if (checkForUpdates && configUrls.length > 0) {
      checkForNewKeywords(configUrls);
    }
  });

  initializeKeywordGroups();
  initializeElementGroups();
  initializeStats();
}

// Initialize keyword groups with defaults
function initializeKeywordGroups() {
  chrome.storage.local.get('keywordGroups', (result) => {
    const keywordGroups = result.keywordGroups || {};
    const newKeywordGroups = { ...keywordGroups, ...DEFAULT_KEYWORD_GROUPS };
    chrome.storage.local.set({ keywordGroups: newKeywordGroups });
  });
}

// Initialize element groups with defaults
function initializeElementGroups() {
  chrome.storage.local.get('elementGroups', (result) => {
    const elementGroups = result.elementGroups || {};
    const newElementGroups = { ...elementGroups, ...DEFAULT_ELEMENT_GROUPS };
    chrome.storage.local.set({ elementGroups: newElementGroups });
  });
}

// Initialize statistics
function initializeStats() {
  chrome.storage.local.set({
    stats: { totalBlocked: 0, totalScanned: 0 }
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
