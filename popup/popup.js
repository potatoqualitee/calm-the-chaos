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

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    const currentUrl = new URL(currentTab.url).href;
    const currentDomain = new URL(currentTab.url).hostname;

    // Display the current domain
    const currentDomainElement = document.getElementById('currentDomain');
    if (currentDomainElement) {
      currentDomainElement.textContent = `Current Domain: ${currentDomain}`;
    }

    const result = await chrome.storage.local.get([
      'ignoredDomains',
      'disabledDomains',
      'disabledDomainGroups',
      'stats',
      `pageStats_${currentTab.id}`,
      `blockedKeywords_${currentTab.id}`,
      'originalKeywords'
    ]);

    const ignoredDomains = result.ignoredDomains || {};
    const disabledDomains = result.disabledDomains || [];
    const disabledDomainGroups = result.disabledDomainGroups || [];
    const stats = result.stats || { totalBlocked: 0, totalScanned: 0 };
    let pageStats = result[`pageStats_${currentTab.id}`] || { pageBlocked: 0, pageTotal: 0 };
    const originalKeywords = result.originalKeywords || {};

    const ignoredDomainsPatterns = getIgnoredDomainsPatterns(ignoredDomains, disabledDomainGroups);

    // Determine if the extension is enabled on this domain
    const isIgnoredDomain = domainMatchesPatterns(currentDomain, ignoredDomainsPatterns);
    const isDisabledDomain = domainMatchesPatterns(currentDomain, disabledDomains);

    const isExtensionEnabled = !isIgnoredDomain && !isDisabledDomain;

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
      const result = await chrome.storage.local.get(['disabledDomains']);
      let disabledDomains = result.disabledDomains || [];

      if (this.checked) {
        // Remove the domain from disabledDomains when enabling
        disabledDomains = disabledDomains.filter(domain => domain !== currentDomain);
        updateVisibility(true);
        chrome.runtime.sendMessage({ type: 'setColorIcon' });
      } else {
        // Add the domain to disabledDomains when disabling
        if (!disabledDomains.includes(currentDomain)) {
          disabledDomains.push(currentDomain);
          disabledDomains.sort();
        }
        updateVisibility(false);
        chrome.runtime.sendMessage({ type: 'setGrayIcon' });
      }

      await chrome.storage.local.set({ disabledDomains });
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
