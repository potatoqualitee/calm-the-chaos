// Background.js

import { DEFAULT_IGNORED_URLS, DEFAULT_KEYWORD_GROUPS } from './scripts/keywords.js';

// background.js
chrome.runtime.onInstalled.addListener(function () {
  // Initialize disabled URLs with defaults
  chrome.storage.local.get('disabledUrls', function (result) {
    const disabledUrls = result.disabledUrls || [];
    const newDisabledUrls = [...new Set([...disabledUrls, ...DEFAULT_IGNORED_URLS])];
    chrome.storage.local.set({ disabledUrls: newDisabledUrls });
  });

  // Initialize keyword groups with defaults
  chrome.storage.local.get('keywordGroups', function (result) {
    const keywordGroups = result.keywordGroups || {};
    const newKeywordGroups = { ...keywordGroups, ...DEFAULT_KEYWORD_GROUPS };
    chrome.storage.local.set({ keywordGroups: newKeywordGroups });
  });

  // Initialize cumulative stats
  chrome.storage.local.set({
    stats: {
      totalBlocked: 0,
      totalScanned: 0
    }
  });
});

// Listen for tab updates to reset page counts
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    chrome.storage.local.set({ [`pageStats_${tabId}`]: { pageBlocked: 0, pageTotal: 0 } });
    chrome.action.setBadgeText({ text: '0' });
    if (tab.url) {
      updateBadge(0, tab.url);
      updateIcon(tab.url);
    }
  }
});

// Listen for tab activation to update badge with the correct count
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab.url) {
      chrome.storage.local.get([`pageStats_${activeInfo.tabId}`], (result) => {
        const pageStats = result[`pageStats_${activeInfo.tabId}`] || { pageBlocked: 0, pageTotal: 0 };
        updateBadge(pageStats.pageBlocked, tab.url);
        updateIcon(tab.url);
      });
    }
  });
});

// Function to update badge with page-specific count
function updateBadge(pageCount, url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  chrome.storage.local.get('disabledUrls', function (result) {
    const disabledUrls = result.disabledUrls || [];
    let text = '';

    const isIgnoredUrl = disabledUrls.some(urlPattern => {
      const pattern = urlPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const regexPattern = new RegExp(pattern);
      return regexPattern.test(url);
    });

    if (!isIgnoredUrl) {
      text = (typeof pageCount === 'number' ? pageCount.toString() : '0');
    }

    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: '#6B7280' });
  });
}

// Function to update the icon based on the URL's status
function updateIcon(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    chrome.action.setIcon({
      path: {
        "16": "images/icon16_gray.png",
        "48": "images/icon48_gray.png",
        "128": "images/icon128_gray.png"
      }
    });
    return;
  }

  chrome.storage.local.get('disabledUrls', function (result) {
    const disabledUrls = result.disabledUrls || [];
    const isIgnoredUrl = disabledUrls.some(urlPattern => {
      const pattern = urlPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const regexPattern = new RegExp(pattern);
      return regexPattern.test(url);
    });

    const iconPath = isIgnoredUrl ? {
      "16": "images/icon16_gray.png",
      "48": "images/icon48_gray.png",
      "128": "images/icon128_gray.png"
    } : {
      "16": "images/icon16.png",
      "48": "images/icon48.png",
      "128": "images/icon128.png"
    };

    chrome.action.setIcon({ path: iconPath });
  });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'updateBlockCount') {
    const tabId = sender.tab.id;
    chrome.storage.local.get(['stats', `pageStats_${tabId}`], (result) => {
      const stats = result.stats || { totalBlocked: 0, totalScanned: 0 };
      const pageStats = result[`pageStats_${tabId}`] || { pageBlocked: 0, pageTotal: 0 };

      pageStats.pageBlocked = message.count;
      pageStats.pageTotal = message.total;

      stats.totalBlocked = Math.max(stats.totalBlocked, message.count);
      stats.totalScanned += message.total;

      chrome.storage.local.set({ stats, [`pageStats_${tabId}`]: pageStats });
      updateBadge(pageStats.pageBlocked, sender.tab.url);
    });
  } else if (message.type === 'updateKeywords') {
    console.log('Keywords updated');
  } else if (message.type === 'blockedItems') {
    console.log('Blocked Items:', message.items);
  }
});
