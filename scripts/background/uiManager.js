import { BADGE_COLOR, GRAY_ICONS, COLOR_ICONS, BADGE_UPDATE_DEBOUNCE } from './constants.js';
import { isExtensionEnabledOnUrl } from './urlMatcher.js';

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
export const updateBadge = debounce(async (pageCount, url) => {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  chrome.storage.local.get(['ignoredDomains', 'disabledDomainGroups', 'filteringEnabled', 'enabledDomains'], async (result) => {
    const ignoredDomains = result.ignoredDomains || {};
    const disabledDomainGroups = result.disabledDomainGroups || [];
    const filteringEnabled = result.filteringEnabled !== undefined ? result.filteringEnabled : true;
    const enabledDomains = result.enabledDomains || [];

    const isEnabled = await isExtensionEnabledOnUrl(url, ignoredDomains, disabledDomainGroups, filteringEnabled, enabledDomains);

    let text = '';
    if (isEnabled && pageCount > 0) {
      // Get the current tab to ensure we're updating the correct badge
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]) {
          const tabId = tabs[0].id;
          // Get the blocked keywords to calculate total occurrences
          chrome.storage.local.get(`blockedKeywords_${tabId}`, (result) => {
            const blockedKeywords = result[`blockedKeywords_${tabId}`] || [];
            let totalOccurrences = 0;

            // Calculate total occurrences from blocked keywords
            blockedKeywords.forEach(item => {
              if (typeof item === 'object' && item.count) {
                totalOccurrences += item.count;
              } else if (typeof item === 'string') {
                totalOccurrences += 1;
              }
            });

            // Update badge with total occurrences
            text = totalOccurrences > 0 ? totalOccurrences.toString() : '';
            chrome.action.setBadgeText({ text });
            chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });

            // Update page stats
            chrome.storage.local.set({
              [`pageStats_${tabId}`]: {
                pageBlocked: totalOccurrences,
                pageTotal: 0  // Remove document.body reference
              }
            });
          });
        }
      });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
    chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  });
}, BADGE_UPDATE_DEBOUNCE);

// Function to update the icon based on the URL's status
export function updateIcon(url) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    setGrayIcon();
    return;
  }

  chrome.storage.local.get(['ignoredDomains', 'disabledDomainGroups', 'filteringEnabled', 'enabledDomains'], async (result) => {
    const ignoredDomains = result.ignoredDomains || {};
    const disabledDomainGroups = result.disabledDomainGroups || [];
    const filteringEnabled = result.filteringEnabled !== undefined ? result.filteringEnabled : true;
    const enabledDomains = result.enabledDomains || [];

    const isEnabled = await isExtensionEnabledOnUrl(url, ignoredDomains, disabledDomainGroups, filteringEnabled, enabledDomains);
    if (isEnabled) {
      setColorIcon();
    } else {
      setGrayIcon();
    }
  });
}

export function setGrayIcon() {
  chrome.action.setIcon({
    path: GRAY_ICONS
  });
}

export function setColorIcon() {
  chrome.action.setIcon({
    path: COLOR_ICONS
  });
}
