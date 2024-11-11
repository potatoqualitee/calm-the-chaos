document.addEventListener('DOMContentLoaded', async function () {
  try {
    // Helper function to capitalize each word in a string
    function toTitleCase(str) {
      return str.split(' ').map(word => {
        return word.length === 3 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.substr(1).toLowerCase();
      }).join(' ');
    }

    function updateVisibility(isEnabled) {
      const statsAndKeywords = document.getElementById('statsAndKeywords');
      if (statsAndKeywords) {
        statsAndKeywords.style.display = isEnabled ? 'block' : 'none';
      }
    }

    // Set up toggle
    const toggle = document.getElementById('domainToggle');
    if (!toggle) {
      console.error('Toggle element not found');
      return;
    }

    // Get current tab's URL
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    const currentUrl = new URL(currentTab.url).href;
    console.log('Current URL:', currentUrl);

    // Update domain display
    const currentDomainElement = document.getElementById('currentDomain');
    if (currentDomainElement) {
      currentDomainElement.textContent = `Current Domain: ${new URL(currentUrl).hostname}`;
    }

    // Load current state
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
    let blockedKeywords = result[`blockedKeywords_${currentTab.id}`] || [];
    const originalKeywords = result.originalKeywords || {};

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

    // Update toggle state using pattern matching and protocol check
    const isEnabledUrl = !disabledDomains.some(urlPattern => {
      const pattern = urlPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      return new RegExp(`^${pattern}$`).test(currentUrl);
    }) && /^https?:\/\//.test(currentUrl);

    toggle.checked = isEnabledUrl;
    updateVisibility(isEnabledUrl);  // Set initial visibility

    // Update stats display
    const statsElements = document.querySelectorAll('.stat-number');
    if (statsElements.length >= 2) {
      statsElements[0].textContent = `${pageStats.pageBlocked}`;
      statsElements[1].textContent = `${(stats.totalBlocked / 1000000).toFixed(2)}M`;
    }

    // Function to normalize keywords by removing leading/trailing punctuation and trimming spaces
    function normalizeKeyword(keyword) {
      return keyword.toLowerCase().replace(/^[\s.,:;!?]+|[\s.,:;!?]+$/g, '').trim();
    }

    // Update the fetchBlockedKeywords function
    async function fetchBlockedKeywords(tabId) {
      const result = await chrome.storage.local.get([`blockedKeywords_${tabId}`, 'originalKeywords']);
      const blockedKeywords = result[`blockedKeywords_${tabId}`] || [];
      const originalKeywords = result.originalKeywords || {};
      const blockedKeywordsElement = document.getElementById('blockedKeywords');
      const keywordsTitleElement = document.querySelector('.keywords-title'); // Add this line

      if (blockedKeywordsElement && keywordsTitleElement) { // Update condition
        // Group keywords using normalized versions and display original format
        const keywordCounts = blockedKeywords.reduce((acc, keyword) => {
          const normalizedKeyword = normalizeKeyword(keyword);
          const displayKeyword = originalKeywords[normalizedKeyword] || normalizedKeyword;
          acc[displayKeyword] = (acc[displayKeyword] || 0) + 1;
          return acc;
        }, {});

        // Sort keywords alphabetically using their original format
        const sortedKeywords = Object.entries(keywordCounts).sort(([a], [b]) => a.localeCompare(b));

        // Show/hide title based on whether there are any keywords
        keywordsTitleElement.style.display = sortedKeywords.length > 0 ? 'block' : 'none';

        // Generate the display HTML with pills design
        blockedKeywordsElement.innerHTML = sortedKeywords
          .map(([keyword, count]) => `
        <span class="keyword-pill">
          ${toTitleCase(keyword)}
          <span class="keyword-count">${count}</span>
        </span>
      `)
          .join('');

        console.log('Blocked keywords (grouped and original format):', sortedKeywords);
      }
    }

    // Initial retrieval and retry after delay
    fetchBlockedKeywords(currentTab.id);
    setTimeout(() => fetchBlockedKeywords(currentTab.id), 500);

    // Listen for changes in storage and update blocked keywords list dynamically
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes[`blockedKeywords_${currentTab.id}`]) {
        fetchBlockedKeywords(currentTab.id);
      }
    });

    // Handle toggle changes
    toggle.addEventListener('change', async function () {
      const result = await chrome.storage.local.get(['ignoredDomains', 'disabledDomains']);
      let ignoredDomains = result.ignoredDomains || {};
      let disabledDomains = result.disabledDomains || [];

      if (this.checked) {
        // Remove from disabled domains if present
        disabledDomains = disabledDomains.filter(url => url !== currentUrl);
        // Remove from 'Other' category if present
        if (ignoredDomains['Other']) {
          ignoredDomains['Other'] = ignoredDomains['Other'].filter(url => url !== currentUrl);
        }
        updateVisibility(true);  // Show stats when enabled
      } else {
        // Add to 'Other' category if it doesn't exist
        if (!ignoredDomains['Other']) {
          ignoredDomains['Other'] = [];
        }
        if (!ignoredDomains['Other'].includes(currentUrl)) {
          ignoredDomains['Other'].push(currentUrl);
          ignoredDomains['Other'].sort();
        }
        updateVisibility(false);  // Hide stats when disabled
      }

      await chrome.storage.local.set({ ignoredDomains, disabledDomains });
      // Add this line to update the icon
      chrome.tabs.get(currentTab.id, tab => updateIcon(tab.url));
      chrome.tabs.reload(currentTab.id);
    });

    // Settings link handler
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
