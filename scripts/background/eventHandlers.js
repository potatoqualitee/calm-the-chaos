import { updateBadge, updateIcon, setGrayIcon, setColorIcon } from './uiManager.js';
import { initializeExtensionState, updatePageStats, resetPageStats, updateBlockedKeywords, resetAllStats } from './extensionState.js';
import { checkForNewKeywords } from './updateChecker.js';
import { PRECONFIGURED_DOMAINS } from '../core/config/preconfiguredDomains.js';

// Handle extension installation and updates
export function setupInstallHandler() {
  chrome.runtime.onInstalled.addListener(async (details) => {
    await initializeExtensionState(details);
    // Reset all stats on install/update
    resetAllStats();
  });
}

// Handle browser startup
export function setupStartupHandler() {
  chrome.runtime.onStartup.addListener(() => {
    // Reset all stats on browser startup
    resetAllStats();

    // Get current ignored domains and ensure pre-configured domains aren't in the list
    chrome.storage.local.get(['ignoredDomains'], (result) => {
      let ignoredDomains = result.ignoredDomains || {};

      // Ensure 'Other' category exists
      if (!ignoredDomains['Other']) {
        ignoredDomains['Other'] = [];
      }

      // Remove pre-configured domains from ignored list to keep them enabled
      ignoredDomains['Other'] = ignoredDomains['Other'].filter(domain =>
        !PRECONFIGURED_DOMAINS.some(preconfiguredDomain => domain.includes(preconfiguredDomain))
      );

      // Set storage with updated ignored domains and ensure filtering is disabled by default
      chrome.storage.local.set({
        ignoredDomains,
        filteringEnabled: false
      }, () => {
        // After ensuring pre-configured domains are enabled, check for updates if configured
        chrome.storage.local.get(['checkForUpdates', 'configUrls', 'importUrl'], (result) => {
          if (result.checkForUpdates) {
            // Handle both new configUrls and legacy importUrl
            const urls = [];
            if (result.configUrls && Array.isArray(result.configUrls)) {
              urls.push(...result.configUrls);
            }
            if (result.importUrl && typeof result.importUrl === 'string') {
              urls.push(result.importUrl);
            }
            if (urls.length > 0) {
              checkForNewKeywords(urls);
            }
          }
        });
      });
    });
  });
}

// Handle tab updates and wake-ups
export function setupTabUpdateHandler() {
  // Handle regular tab updates
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
      resetPageStats(tabId);
      chrome.action.setBadgeText({ text: '' }); // Start with no badge
      const url = tab.url || '';
      updateBadge(0, url);
      updateIcon(url);
    }

    // Handle tab wake-up from discarded state
    if (changeInfo.discarded === false) {
      console.log('Tab woken up:', tabId);
      // Send message to re-initialize content filtering
      chrome.tabs.sendMessage(tabId, {
        type: 'extensionReloaded',
        reason: 'tab_wake_up'
      }).catch(error => {
        // If content script isn't ready yet, retry after a short delay
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, {
            type: 'extensionReloaded',
            reason: 'tab_wake_up_retry'
          }).catch(console.debug);
        }, 1000);
      });
    }
  });
}

// Handle tab activation
export function setupTabActivationHandler() {
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
}

// Handle messages from content script
export function setupMessageHandler() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ping') {
      return true; // Acknowledge ping
    }

    // Handle getCurrentTab request
    if (message.type === 'getCurrentTab') {
      if (sender && sender.tab) {
        sendResponse({ tabId: sender.tab.id });
      }
      return true; // Keep channel open for async response
    }

    // Add null check for sender.tab
    if (!sender || !sender.tab) {
      console.debug('Received message without valid tab:', message);
      return;
    }

    console.log('Received message:', message, 'from tab:', sender.tab.id);
    const tabId = message.tabId || sender.tab.id;

    switch (message.type) {
      case 'updateBlockCount':
        updatePageStats(tabId, message.count, message.total);
        updateBadge(message.count, sender.tab.url);
        break;
      case 'blockedItems':
        updateBlockedKeywords(tabId, message.items);
        break;
      case 'setGrayIcon':
        setGrayIcon();
        break;
      case 'setColorIcon':
        setColorIcon();
        break;
      case 'resetStats':
        resetAllStats();
        break;
    }
  });
}

// Initialize all event handlers
export function initializeEventHandlers() {
  setupInstallHandler();
  setupStartupHandler();
  setupTabUpdateHandler();
  setupTabActivationHandler();
  setupMessageHandler();
}
