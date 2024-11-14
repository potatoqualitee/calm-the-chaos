// background.js

// Import necessary modules
import { DEFAULT_KEYWORD_GROUPS } from '../scripts/keywords.js';
import { DEFAULT_IGNORED_URLS } from '../scripts/ignoredUrls.js';
import { DEFAULT_ELEMENT_GROUPS } from '../scripts/elements.js';

// Helper function to check if a domain matches any patterns
function domainMatchesPatterns(domain, patterns) {
  return patterns.some(pattern => {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(domain);
  });
}

// Function to get all ignored domain patterns
function getIgnoredDomainsPatterns(ignoredDomains, disabledDomainGroups) {
  const patterns = [];
  Object.entries(ignoredDomains).forEach(([groupName, domains]) => {
    if (!disabledDomainGroups.includes(groupName)) {
      patterns.push(...domains);
    }
  });
  return patterns;
}

// Function to determine if the extension is enabled on the URL
function isExtensionEnabledOnUrl(url, ignoredDomains, disabledDomainGroups) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return false;
  }
  const domain = new URL(url).hostname;
  const ignoredDomainsPatterns = getIgnoredDomainsPatterns(ignoredDomains, disabledDomainGroups);
  return !domainMatchesPatterns(domain, ignoredDomainsPatterns);
}

// Function to inject content scripts into existing tabs
async function injectContentScripts() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      console.debug(`Injected content script into tab ${tab.id}`);
    } catch (error) {
      console.debug(`Failed to inject script into tab ${tab.id}:`, error);
    }
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'update') {
    await injectContentScripts();
  }

  // Initialize default settings on installation
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

  chrome.storage.local.get('elementGroups', (result) => {
    const elementGroups = result.elementGroups || {};
    const newElementGroups = { ...elementGroups, ...DEFAULT_ELEMENT_GROUPS };
    chrome.storage.local.set({ elementGroups: newElementGroups });
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
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  chrome.storage.local.get(['ignoredDomains', 'disabledDomainGroups'], (result) => {
    const ignoredDomains = result.ignoredDomains || {};
    const disabledDomainGroups = result.disabledDomainGroups || [];

    const isEnabled = isExtensionEnabledOnUrl(url, ignoredDomains, disabledDomainGroups);

    let text = '';
    if (isEnabled) {
      text = (typeof pageCount === 'number' ? pageCount.toString() : '0');
    }

    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: '#6B7280' });
  });
}, 200);

// Function to update the icon based on the URL's status
function updateIcon(url) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    setGrayIcon();
    return;
  }

  chrome.storage.local.get(['ignoredDomains', 'disabledDomainGroups'], (result) => {
    const ignoredDomains = result.ignoredDomains || {};
    const disabledDomainGroups = result.disabledDomainGroups || [];

    const isEnabled = isExtensionEnabledOnUrl(url, ignoredDomains, disabledDomainGroups);

    if (isEnabled) {
      setColorIcon();
    } else {
      setGrayIcon();
    }
  });
}

function setGrayIcon() {
  chrome.action.setIcon({
    path: {
      "16": "images/icon16_gray.png",
      "48": "images/icon48_gray.png",
      "128": "images/icon128_gray.png"
    }
  });
}

function setColorIcon() {
  chrome.action.setIcon({
    path: {
      "16": "images/icon16.png",
      "48": "images/icon48.png",
      "128": "images/icon128.png"
    }
  });
}

// Listen for tab updates to reset page counts and update badge and icon
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    chrome.storage.local.set({ [`pageStats_${tabId}`]: { pageBlocked: 0, pageTotal: 0 } });
    chrome.action.setBadgeText({ text: '0' });
    const url = tab.url || '';
    updateBadge(0, url);
    updateIcon(url);
  }
});

// Listen for tab activation to update badge and icon
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    const url = tab.url || '';
    chrome.storage.local.get([`pageStats_${activeInfo.tabId}`], (result) => {
      const pageStats = result[`pageStats_${activeInfo.tabId}`] || { pageBlocked: 0, pageTotal: 0 };
      updateBadge(pageStats.pageBlocked, url);
      updateIcon(url);
    });
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'ping') {
    return true; // Acknowledge ping
  }

  // Add null check for sender.tab
  if (!sender || !sender.tab) {
    console.debug('Received message without valid tab:', message);
    return;
  }

  console.log('Received message:', message, 'from tab:', sender.tab.id);
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
      console.debug('Blocked keywords synced for tab:', tabId);
    });
  } else if (message.type === 'setGrayIcon') {
    setGrayIcon();
  } else if (message.type === 'setColorIcon') {
    setColorIcon();
  }
});
