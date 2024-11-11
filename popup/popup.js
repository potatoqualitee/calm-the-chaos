document.addEventListener('DOMContentLoaded', async function () {
  try {
    // Helper function to capitalize each word in a string
    function toTitleCase(str) {
      return str.split(' ').map(word => {
        return word.length === 3 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.substr(1).toLowerCase();
      }).join(' ');
    }

    // Set up toggle
    const toggle = document.getElementById('domainToggle');
    if (!toggle) {
      console.error('Toggle element not found');
      return;
    }

    // Get current tab's domain
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    let hostname = new URL(currentTab.url).hostname;
    hostname = hostname.replace(/^www\./, ''); // Remove 'www.' if present
    console.log('Current hostname:', hostname);

    // Load current state
    const result = await chrome.storage.local.get([
      'disabledDomains',
      'stats',
      `pageStats_${currentTab.id}`,
      `blockedKeywords_${currentTab.id}`,
      'originalKeywords'
    ]);
    const disabledDomains = result.disabledDomains || [];
    const stats = result.stats || { totalBlocked: 0, totalScanned: 0 };
    const pageStats = result[`pageStats_${currentTab.id}`] || { pageBlocked: 0, pageTotal: 0 };
    const blockedKeywords = result[`blockedKeywords_${currentTab.id}`] || [];
    const originalKeywords = result.originalKeywords || {};

    // Update toggle state
    toggle.checked = disabledDomains.includes(hostname);

    // Update stats display
    const pageBlockedPercent = pageStats.pageTotal
      ? Math.round((pageStats.pageBlocked / pageStats.pageTotal) * 100)
      : 0;
    const totalBlockedPercent = stats.totalScanned
      ? Math.round((stats.totalBlocked / stats.totalScanned) * 100)
      : 0;

    const statsElements = document.querySelectorAll('.stat-number');
    if (statsElements.length >= 2) {
      statsElements[0].textContent = `${pageStats.pageBlocked} (${pageBlockedPercent}%)`;
      statsElements[1].textContent = `${(stats.totalBlocked / 1000000).toFixed(2)}M (${totalBlockedPercent}%)`;
    }

    // Function to normalize keywords by removing leading/trailing punctuation and trimming spaces
    function normalizeKeyword(keyword) {
      return keyword.toLowerCase().replace(/^[\s.,:;!?]+|[\s.,:;!?]+$/g, '').trim();
    }

    // Function to fetch and display blocked keywords with proper grouping and original format
    async function fetchBlockedKeywords(tabId) {
      const result = await chrome.storage.local.get([`blockedKeywords_${tabId}`, 'originalKeywords']);
      const blockedKeywords = result[`blockedKeywords_${tabId}`] || [];
      const originalKeywords = result.originalKeywords || {};
      const blockedKeywordsElement = document.getElementById('blockedKeywords');

      if (blockedKeywordsElement) {
        // Group keywords using normalized versions and display original format
        const keywordCounts = blockedKeywords.reduce((acc, keyword) => {
          const normalizedKeyword = normalizeKeyword(keyword);
          const displayKeyword = originalKeywords[normalizedKeyword] || normalizedKeyword;
          acc[displayKeyword] = (acc[displayKeyword] || 0) + 1;
          return acc;
        }, {});

        // Sort keywords alphabetically using their original format
        const sortedKeywords = Object.entries(keywordCounts).sort(([a], [b]) => a.localeCompare(b));

        // Generate the display HTML with grouped and counted keywords in title case
        blockedKeywordsElement.innerHTML = sortedKeywords
          .map(([keyword, count]) => `<div class="keyword-item">${toTitleCase(keyword)}: ${count}</div>`)
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
      const result = await chrome.storage.local.get('disabledDomains');
      let disabledDomains = result.disabledDomains || [];
      if (this.checked) {
        if (!disabledDomains.includes(hostname)) disabledDomains.push(hostname);
      } else {
        disabledDomains = disabledDomains.filter(domain => domain !== hostname);
      }
      await chrome.storage.local.set({ disabledDomains });
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
