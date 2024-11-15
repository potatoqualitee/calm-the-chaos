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

    function updateVisibility(isEnabled) {
      const statsAndKeywords = document.getElementById('statsAndKeywords');
      if (statsAndKeywords) {
        statsAndKeywords.style.display = isEnabled ? 'block' : 'none';
      }
    }

    // Function to check if domain matches patterns
    function domainMatchesPatterns(domain, patterns) {
      return patterns.some(pattern => {
        if (pattern.startsWith('.')) {
          // Handle .domain.com patterns - match both exact and subdomains
          const baseDomain = pattern.substring(1);
          return domain === baseDomain || domain.endsWith(pattern);
        }
        // Handle other patterns
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*');
        return new RegExp(`^${regexPattern}$`, 'i').test(domain);
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
    function isExtensionEnabledOnUrl(url, ignoredDomains, disabledDomainGroups, filteringEnabled) {
      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        return false;
      }
      const domain = new URL(url).hostname;
      const ignoredDomainsPatterns = getIgnoredDomainsPatterns(ignoredDomains, disabledDomainGroups);
      const matches = domainMatchesPatterns(domain, ignoredDomainsPatterns);
      return filteringEnabled ? !matches : matches;
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

    // Display the current domain
    const currentDomainElement = document.getElementById('currentDomain');
    if (currentDomainElement) {
      currentDomainElement.textContent = `Current Domain: ${currentDomain}`;
    }

    const result = await chrome.storage.local.get([
      'ignoredDomains',
      'disabledDomainGroups',
      'stats',
      `pageStats_${currentTab.id}`,
      `blockedKeywords_${currentTab.id}`,
      'originalKeywords',
      'filteringEnabled'
    ]);

    const ignoredDomains = result.ignoredDomains || {};
    const disabledDomainGroups = result.disabledDomainGroups || [];
    const stats = result.stats || { totalBlocked: 0, totalScanned: 0 };
    let pageStats = result[`pageStats_${currentTab.id}`] || { pageBlocked: 0, pageTotal: 0 };
    const originalKeywords = result.originalKeywords || {};
    const filteringEnabled = result.filteringEnabled !== undefined ? result.filteringEnabled : true;

    // Set the filter all sites toggle state
    const filterAllSitesToggle = document.getElementById('filterAllSites');
    if (filterAllSitesToggle) {
      filterAllSitesToggle.checked = filteringEnabled;
    }

    // Determine if the extension is enabled on this URL
    const isExtensionEnabled = isExtensionEnabledOnUrl(
      currentUrl,
      ignoredDomains,
      disabledDomainGroups,
      filteringEnabled
    );

    // Set the toggle state based on whether the extension is enabled
    const toggle = document.getElementById('domainToggle');
    if (toggle) {
      toggle.checked = isExtensionEnabled;
    } else {
      console.error('Toggle element not found');
      return;
    }

    updateVisibility(isExtensionEnabled);

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

    toggle.addEventListener('change', async function () {
      const result = await chrome.storage.local.get(['ignoredDomains', 'filteringEnabled']);
      let ignoredDomains = result.ignoredDomains || {};
      const filteringEnabled = result.filteringEnabled !== undefined ? result.filteringEnabled : true;

      // Initialize 'Other' category if it doesn't exist
      if (!ignoredDomains['Other']) {
        ignoredDomains['Other'] = [];
      }

      const isEnabled = this.checked;

      // Update ignoredDomains based on filteringEnabled setting
      if (filteringEnabled) {
        // In enabled mode: checked = filter (not in list), unchecked = don't filter (in list)
        if (isEnabled) {
          // Remove from list to enable filtering
          ignoredDomains['Other'] = ignoredDomains['Other'].filter(domain => domain !== currentDomain);
        } else {
          // Add to list to disable filtering
          if (!ignoredDomains['Other'].includes(currentDomain)) {
            ignoredDomains['Other'].push(currentDomain);
            ignoredDomains['Other'].sort();
          }
        }
      } else {
        // In disabled mode: checked = filter (in list), unchecked = don't filter (not in list)
        if (isEnabled) {
          // Add to list to enable filtering
          if (!ignoredDomains['Other'].includes(currentDomain)) {
            ignoredDomains['Other'].push(currentDomain);
            ignoredDomains['Other'].sort();
          }
        } else {
          // Remove from list to disable filtering
          ignoredDomains['Other'] = ignoredDomains['Other'].filter(domain => domain !== currentDomain);
        }
      }

      updateVisibility(isEnabled);

      // Set icon based on actual filtering state
      if (isEnabled) {
        chrome.runtime.sendMessage({ type: 'setColorIcon' });
      } else {
        chrome.runtime.sendMessage({ type: 'setGrayIcon' });
      }

      await chrome.storage.local.set({ ignoredDomains });
      chrome.tabs.reload(currentTab.id);
    });

    // Add event listener for filter all sites toggle
    filterAllSitesToggle.addEventListener('change', async function() {
      const filteringEnabled = this.checked;
      await chrome.storage.local.set({ filteringEnabled });

      // Update domain toggle to reflect new state
      const isEnabled = isExtensionEnabledOnUrl(
        currentUrl,
        ignoredDomains,
        disabledDomainGroups,
        filteringEnabled
      );
      toggle.checked = isEnabled;
      updateVisibility(isEnabled);

      // Set icon based on actual filtering state
      if (isEnabled) {
        chrome.runtime.sendMessage({ type: 'setColorIcon' });
      } else {
        chrome.runtime.sendMessage({ type: 'setGrayIcon' });
      }

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
