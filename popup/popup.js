// popup.js

document.addEventListener('DOMContentLoaded', async function () {
  try {
    function toTitleCase(str) {
      if (str.replace(/\s/g, '').length === 3) {
        return str.toUpperCase();
      }
      return str.split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.substr(1).toLowerCase()
      ).join(' ');
    }

    function updateVisibility(isEnabled, isGlobalEnabled) {
      const statsAndKeywords = document.getElementById('statsAndKeywords');
      const urlSection = document.querySelector('.url-section');
      if (statsAndKeywords) {
        statsAndKeywords.style.display = (isEnabled && isGlobalEnabled) ? 'block' : 'none';
      }
      if (urlSection) {
        urlSection.style.display = isGlobalEnabled ? 'block' : 'none';
      }
    }

    // Function to check if URL matches patterns
    function urlMatchesPatterns(domain, patterns) {
      return patterns.some(pattern => {
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*');
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(domain);
      });
    }

    // Function to get all ignored URL patterns
    function getIgnoredUrlPatterns(ignoredDomains, disabledDomainGroups) {
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
      const ignoredUrlPatterns = getIgnoredUrlPatterns(ignoredDomains, disabledDomainGroups);
      return !urlMatchesPatterns(domain, ignoredUrlPatterns);
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];

    // Handle cases where the URL might be undefined
    if (!currentTab || !currentTab.url) {
      console.error('Cannot access current tab URL.');
      return;
    }

    const currentUrl = new URL(currentTab.url).href;
    const currentDomain = new URL(currentTab.url).hostname;

    // Display the current URL
    const currentDomainElement = document.getElementById('currentDomain');
    if (currentDomainElement) {
      currentDomainElement.textContent = `Current URL: ${currentDomain}`;
    }

    const result = await chrome.storage.local.get([
      'ignoredDomains',
      'disabledDomainGroups',
      'stats',
      'globalEnabled',
      'previousState',
      `pageStats_${currentTab.id}`,
      `blockedKeywords_${currentTab.id}`,
      'originalKeywords'
    ]);

    const ignoredDomains = result.ignoredDomains || {};
    const disabledDomainGroups = result.disabledDomainGroups || [];
    const stats = result.stats || { totalBlocked: 0, totalScanned: 0 };
    const globalEnabled = result.globalEnabled ?? true; // Default to true if not set
    let pageStats = result[`pageStats_${currentTab.id}`] || { pageBlocked: 0, pageTotal: 0 };
    const originalKeywords = result.originalKeywords || {};

    // Determine if the extension is enabled on this URL
    const isExtensionEnabled = isExtensionEnabledOnUrl(
      currentUrl,
      ignoredDomains,
      disabledDomainGroups
    );

    // Set the toggle states
    const globalToggle = document.getElementById('globalToggle');
    const siteToggle = document.getElementById('domainToggle');

    if (globalToggle && siteToggle) {
      globalToggle.checked = globalEnabled;
      siteToggle.checked = isExtensionEnabled;
      updateVisibility(isExtensionEnabled, globalEnabled);
    } else {
      console.error('Toggle elements not found');
      return;
    }

    const statsElements = document.querySelectorAll('.stat-number');
    if (statsElements.length >= 2) {
      statsElements[0].textContent = `${pageStats.pageBlocked}`;
      statsElements[1].textContent = `${stats.totalBlocked}`;
    }

    function normalizeKeyword(keyword) {
      return keyword.toLowerCase().replace(/^[\s.,:;!?]+|[\s.,:;!?]+$/g, '').trim();
    }

    async function fetchBlockedKeywords(tabId) {
      const result = await chrome.storage.local.get([
        `blockedKeywords_${tabId}`,
        'originalKeywords',
        `pageStats_${tabId}`,
        'stats'
      ]);

      const blockedKeywords = result[`blockedKeywords_${tabId}`] || [];
      const originalKeywords = result.originalKeywords || {};
      const pageStats = result[`pageStats_${tabId}`] || { pageBlocked: 0, pageTotal: 0 };
      const stats = result.stats || { totalBlocked: 0, totalScanned: 0 };

      const statsElements = document.querySelectorAll('.stat-number');
      if (statsElements.length >= 2) {
        statsElements[0].textContent = `${pageStats.pageBlocked}`;
        statsElements[1].textContent = `${stats.totalBlocked}`;
      }

      const blockedKeywordsElement = document.getElementById('blockedKeywords');
      const keywordsTitleElement = document.querySelector('.keywords-title');

      if (blockedKeywordsElement && keywordsTitleElement) {
        const keywordCounts = blockedKeywords.reduce((acc, keyword) => {
          const normalizedKeyword = normalizeKeyword(keyword);
          const displayKeyword = originalKeywords[normalizedKeyword] || normalizedKeyword;
          acc[displayKeyword] = (acc[displayKeyword] || 0) + 1;
          return acc;
        }, {});

        const sortedKeywords = Object.entries(keywordCounts).sort(([a], [b]) => a.localeCompare(b));
        keywordsTitleElement.style.display = sortedKeywords.length > 0 ? 'block' : 'none';

        blockedKeywordsElement.innerHTML = sortedKeywords
          .map(([keyword, count]) => `
            <span class="keyword-pill">
              ${toTitleCase(keyword)}
              <span class="keyword-count">${count}</span>
            </span>
          `)
          .join('');
      }
    }

    // Initial fetch
    await fetchBlockedKeywords(currentTab.id);

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        const relevantKeys = [
          `blockedKeywords_${currentTab.id}`,
          `pageStats_${currentTab.id}`,
          'stats'
        ];

        if (relevantKeys.some(key => changes[key])) {
          fetchBlockedKeywords(currentTab.id);
        }
      }
    });

    // Global toggle event listener
    globalToggle.addEventListener('change', async function() {
      const isGlobalEnabled = this.checked;

      if (isGlobalEnabled) {
        // Restore previous state if available
        const result = await chrome.storage.local.get(['previousState']);
        if (result.previousState) {
          await chrome.storage.local.set({
            ignoredDomains: result.previousState.ignoredDomains,
            disabledDomainGroups: result.previousState.disabledDomainGroups,
            globalEnabled: true
          });
          // Clear the stored state after restoring
          await chrome.storage.local.remove('previousState');
        } else {
          await chrome.storage.local.set({ globalEnabled: true });
        }
        chrome.runtime.sendMessage({ type: 'setColorIcon' });
      } else {
        // Store current state before disabling globally
        const currentState = await chrome.storage.local.get(['ignoredDomains', 'disabledDomainGroups']);
        await chrome.storage.local.set({
          previousState: {
            ignoredDomains: currentState.ignoredDomains,
            disabledDomainGroups: currentState.disabledDomainGroups
          },
          globalEnabled: false
        });
        chrome.runtime.sendMessage({ type: 'setGrayIcon' });
      }

      updateVisibility(siteToggle.checked, isGlobalEnabled);
      chrome.tabs.reload(currentTab.id);
    });

    // Site-specific toggle event listener
    siteToggle.addEventListener('change', async function () {
      const result = await chrome.storage.local.get(['ignoredDomains']);
      let ignoredDomains = result.ignoredDomains || {};

      // Initialize 'Other' category if it doesn't exist
      if (!ignoredDomains['Other']) {
        ignoredDomains['Other'] = [];
      }

      if (this.checked) {
        // Remove the URL from ignoredDomains when enabling
        ignoredDomains['Other'] = ignoredDomains['Other'].filter(domain => domain !== currentDomain);
        updateVisibility(true, globalToggle.checked);
        chrome.runtime.sendMessage({ type: 'setColorIcon' });
      } else {
        // Add the URL to ignoredDomains when disabling
        if (!ignoredDomains['Other'].includes(currentDomain)) {
          ignoredDomains['Other'].push(currentDomain);
          ignoredDomains['Other'].sort();
        }
        updateVisibility(false, globalToggle.checked);
        chrome.runtime.sendMessage({ type: 'setGrayIcon' });
      }

      await chrome.storage.local.set({ ignoredDomains });
      chrome.tabs.reload(currentTab.id);
    });

    const settingsButton = document.getElementById('openSettings');
    if (settingsButton) {
      settingsButton.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
    }

  } catch (error) {
    console.error('Error in popup initialization:', error);
  }
});
