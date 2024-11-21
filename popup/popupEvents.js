// popupEvents.js
import { DEFAULT_IGNORED_URLS } from '../scripts/core/config/ignoredUrls.js';
import { isPreconfiguredDomain, needsPermissionRequest, requestDomainPermission } from '../scripts/core/config/preconfiguredDomains.js';

function isUrlIgnored(url) {
  const lowercaseUrl = url.toLowerCase();
  return Object.values(DEFAULT_IGNORED_URLS).some(category =>
    category.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(lowercaseUrl);
      }
      return lowercaseUrl.includes(pattern.toLowerCase());
    })
  );
}

async function updateDomainState(currentDomain, isEnabled, storage) {
  let {
    ignoredDomains = { Other: [] },
    enabledDomains = [],
    previouslyEnabled = [],
    manuallyEnabled = [],
    filteringEnabled = true
  } = storage;

  // Ensure Other category exists
  if (!ignoredDomains.Other) {
    ignoredDomains.Other = [];
  }

  if (filteringEnabled) {
    // Global filtering mode
    if (isEnabled) {
      // Remove from ignored list when enabled
      ignoredDomains.Other = ignoredDomains.Other.filter(d => d !== currentDomain);
      if (!manuallyEnabled.includes(currentDomain)) {
        manuallyEnabled.push(currentDomain);
        manuallyEnabled.sort();
      }
      if (!previouslyEnabled.includes(currentDomain)) {
        previouslyEnabled.push(currentDomain);
        previouslyEnabled.sort();
      }
    } else {
      // Add to ignored list when disabled
      if (!ignoredDomains.Other.includes(currentDomain)) {
        ignoredDomains.Other.push(currentDomain);
        ignoredDomains.Other.sort();
      }
      manuallyEnabled = manuallyEnabled.filter(d => d !== currentDomain);
      previouslyEnabled = previouslyEnabled.filter(d => d !== currentDomain);
    }
    // Clear enabledDomains in global filtering mode
    enabledDomains = [];
  } else {
    // Site-specific filtering mode
    if (isEnabled) {
      if (!enabledDomains.includes(currentDomain)) {
        enabledDomains.push(currentDomain);
        enabledDomains.sort();
      }
      if (!manuallyEnabled.includes(currentDomain)) {
        manuallyEnabled.push(currentDomain);
        manuallyEnabled.sort();
      }
      if (!previouslyEnabled.includes(currentDomain)) {
        previouslyEnabled.push(currentDomain);
        previouslyEnabled.sort();
      }
      // Remove from ignored list if present
      ignoredDomains.Other = ignoredDomains.Other.filter(d => d !== currentDomain);
    } else {
      enabledDomains = enabledDomains.filter(d => d !== currentDomain);
      manuallyEnabled = manuallyEnabled.filter(d => d !== currentDomain);
      previouslyEnabled = previouslyEnabled.filter(d => d !== currentDomain);
      // Add to ignored list for preconfigured domains
      if (isPreconfiguredDomain(currentDomain) && !ignoredDomains.Other.includes(currentDomain)) {
        ignoredDomains.Other.push(currentDomain);
        ignoredDomains.Other.sort();
      }
    }
  }

  return {
    ignoredDomains,
    enabledDomains,
    previouslyEnabled,
    manuallyEnabled
  };
}

export async function setupDomainToggle(toggle, currentDomain, updateVisibility, currentTab) {
  toggle.addEventListener('change', async function() {
    const isEnabled = this.checked;

    // Only request permission if enabling and permission is needed
    if (isEnabled && await needsPermissionRequest(currentDomain)) {
      const granted = await requestDomainPermission(currentDomain);
      if (!granted) {
        this.checked = false;
        return;
      }
    }

    const storage = await chrome.storage.local.get([
      'ignoredDomains',
      'filteringEnabled',
      'enabledDomains',
      'previouslyEnabled',
      'manuallyEnabled'
    ]);

    const updatedState = await updateDomainState(currentDomain, isEnabled, storage);
    await chrome.storage.local.set(updatedState);

    updateVisibility(isEnabled);

    // Update icon
    chrome.runtime.sendMessage({
      type: isEnabled ? 'setColorIcon' : 'setGrayIcon'
    });

    // Reload the tab
    await chrome.tabs.reload(currentTab.id);
  });
}

export async function setupFilterAllSitesToggle(filterAllSitesToggle, toggle, updateVisibility, currentTab) {
  filterAllSitesToggle.addEventListener('change', async function() {
    const newFilteringEnabled = this.checked;

    // Request all sites permission when enabling
    if (newFilteringEnabled) {
      const granted = await chrome.permissions.request({
        origins: ["http://*/*", "https://*/*"]
      });

      if (!granted) {
        this.checked = false;
        return;
      }
    }

    const url = new URL(currentTab.url);
    const currentDomain = url.hostname;
    const isHttps = url.protocol === 'https:' || url.protocol === 'http:';

    const storage = await chrome.storage.local.get([
      'ignoredDomains',
      'enabledDomains',
      'previouslyEnabled',
      'manuallyEnabled',
      'filteringEnabled'
    ]);

    // Ensure storage values have defaults
    const {
      manuallyEnabled = [],
      filteringEnabled = true
    } = storage;

    // When enabling filter all sites, enable the current domain
    // When disabling, keep current domain's state
    const shouldEnableDomain = newFilteringEnabled ? true : toggle.checked;

    // Update domain state
    const updatedState = await updateDomainState(currentDomain, shouldEnableDomain, {
      ...storage,
      filteringEnabled: newFilteringEnabled
    });

    // Save all changes
    await chrome.storage.local.set({
      ...updatedState,
      filteringEnabled: newFilteringEnabled,
      filterAllSites: newFilteringEnabled // Save the filter all sites state
    });

    // Update toggle state
    toggle.checked = shouldEnableDomain;
    updateVisibility(shouldEnableDomain);

    // Update icon
    chrome.runtime.sendMessage({
      type: shouldEnableDomain ? 'setColorIcon' : 'setGrayIcon'
    });

    // Reload the tab
    await chrome.tabs.reload(currentTab.id);
  });
}

// Add Settings button click handler
document.addEventListener('DOMContentLoaded', () => {
  const settingsButton = document.getElementById('openSettings');
  if (settingsButton) {
    settingsButton.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }
});
