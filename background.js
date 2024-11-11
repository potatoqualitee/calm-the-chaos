// Background.js

import { DEFAULT_IGNORED_URLS, DEFAULT_KEYWORD_GROUPS } from './scripts/keywords.js';

// Initialize default settings on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['ignoredDomains', 'checkForUpdates', 'importUrl'], (result) => {
    const ignoredDomains = result.ignoredDomains || DEFAULT_IGNORED_URLS;
    const checkForUpdates = result.checkForUpdates !== undefined ? result.checkForUpdates : true;
    const importUrl = result.importUrl || '';

    chrome.storage.local.set({
      ignoredDomains,
      checkForUpdates,
      importUrl,
    });

    // If enabled, check for updates on install
    if (checkForUpdates && importUrl) {
      checkForNewKeywords(importUrl);
    }
  });

  chrome.storage.local.get('keywordGroups', (result) => {
    const keywordGroups = result.keywordGroups || {};
    const newKeywordGroups = { ...keywordGroups, ...DEFAULT_KEYWORD_GROUPS };
    chrome.storage.local.set({ keywordGroups: newKeywordGroups });
  });

  chrome.storage.local.set({
    stats: { totalBlocked: 0, totalScanned: 0 }
  });
});

// Check for new keywords from URL
async function checkForNewKeywords(url) {
  try {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type');

    if (contentType.includes('application/json')) {
      const settings = await response.json();
      if (settings.customKeywords) {
        chrome.storage.local.get('customKeywords', (result) => {
          const existingKeywords = result.customKeywords || [];
          const newKeywords = settings.customKeywords.filter(
            keyword => !existingKeywords.includes(keyword)
          );
          if (newKeywords.length > 0) {
            const updatedKeywords = [...existingKeywords, ...newKeywords].sort();
            chrome.storage.local.set({ customKeywords: updatedKeywords });
          }
        });
      }
    } else if (contentType.includes('text/plain')) {
      const text = await response.text();
      const newKeywords = text.split('\n')
        .map(line => line.trim())
        .filter(line => line);

      chrome.storage.local.get('customKeywords', (result) => {
        const existingKeywords = result.customKeywords || [];
        const uniqueNewKeywords = newKeywords.filter(
          keyword => !existingKeywords.includes(keyword)
        );
        if (uniqueNewKeywords.length > 0) {
          const updatedKeywords = [...existingKeywords, ...uniqueNewKeywords].sort();
          chrome.storage.local.set({ customKeywords: updatedKeywords });
        }
      });
    }
  } catch (error) {
    console.error('Failed to check for new keywords:', error);
  }
}

// Check for updates on browser startup if enabled
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['checkForUpdates', 'importUrl'], (result) => {
    if (result.checkForUpdates && result.importUrl) {
      checkForNewKeywords(result.importUrl);
    }
  });
});

// Listen for tab updates to reset page counts and update badge
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

// Listen for tab activation to update badge and icon
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

// Debounce function to limit the rate of function execution
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Function to update badge with page-specific count
const updateBadge = debounce((pageCount, url) => {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  chrome.storage.local.get(['ignoredDomains', 'disabledDomains', 'disabledDomainGroups'], (result) => {
    const ignoredDomains = result.ignoredDomains || {};
    const disabledDomains = result.disabledDomains || [];
    const disabledDomainGroups = result.disabledDomainGroups || [];
    let text = '';

    // Get all enabled domains
    const enabledDomains = [];
    Object.entries(ignoredDomains).forEach(([groupName, domains]) => {
      if (!disabledDomainGroups.includes(groupName)) {
        domains.forEach(domain => {
          if (!disabledDomains.includes(domain)) {
            enabledDomains.push(domain);
          }
        });
      }
    });

    const isIgnoredUrl = enabledDomains.some(urlPattern => {
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
}, 200);

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

  chrome.storage.local.get(['ignoredDomains', 'disabledDomains', 'disabledDomainGroups'], (result) => {
    const ignoredDomains = result.ignoredDomains || {};
    const disabledDomains = result.disabledDomains || [];
    const disabledDomainGroups = result.disabledDomainGroups || [];

    // Get all enabled domains
    const enabledDomains = [];
    Object.entries(ignoredDomains).forEach(([groupName, domains]) => {
      if (!disabledDomainGroups.includes(groupName)) {
        domains.forEach(domain => {
          if (!disabledDomains.includes(domain)) {
            enabledDomains.push(domain);
          }
        });
      }
    });

    const isIgnoredUrl = enabledDomains.some(urlPattern => {
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
chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab.id;
  if (message.type === 'updateBlockCount') {
    chrome.storage.local.get(['stats', `pageStats_${tabId}`], (result) => {
      const stats = result.stats || { totalBlocked: 0, totalScanned: 0 };
      const pageStats = result[`pageStats_${tabId}`] || { pageBlocked: 0, pageTotal: 0 };

      pageStats.pageBlocked = message.count;
      pageStats.pageTotal = message.total;
      stats.totalBlocked += message.count;
      stats.totalScanned += message.total;

      chrome.storage.local.set({ stats, [`pageStats_${tabId}`]: pageStats });
      updateBadge(pageStats.pageBlocked, sender.tab.url);
    });
  } else if (message.type === 'blockedItems') {
    const storageKey = `blockedKeywords_${tabId}`;
    chrome.storage.local.set({ [storageKey]: message.items.map(item => item.blockedKeywords).flat() }, () => {
      console.log('Blocked keywords synced for tab:', tabId);
    });
  }
});
