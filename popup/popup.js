document.addEventListener('DOMContentLoaded', async function () {
  try {
    // Get current tab's domain
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    const hostname = new URL(currentTab.url).hostname;
    console.log('Current hostname:', hostname);

    // Show current domain
    const domainElement = document.getElementById('currentDomain');
    if (domainElement) {
      domainElement.textContent = hostname;
    }

    // Set up toggle
    const toggle = document.getElementById('domainToggle');
    if (!toggle) {
      console.error('Toggle element not found');
      return;
    }

    // Load current state
    const result = await chrome.storage.local.get(['disabledDomains', 'stats', `pageStats_${currentTab.id}`]);
    const disabledDomains = result.disabledDomains || [];
    console.log('Loaded disabled domains:', disabledDomains);

    const stats = result.stats || {
      totalBlocked: 0,
      totalScanned: 0
    };
    const pageStats = result[`pageStats_${currentTab.id}`] || {
      pageBlocked: 0,
      pageTotal: 0
    };
    console.log('Loaded stats:', stats);
    console.log('Loaded page stats:', pageStats);

    // Update toggle state
    toggle.checked = disabledDomains.includes(hostname);
    console.log('Toggle state set to:', toggle.checked);

    // Update stats display
    const pageBlockedPercent = pageStats.pageTotal ?
      Math.round((pageStats.pageBlocked / pageStats.pageTotal) * 100) : 0;
    const totalBlockedPercent = stats.totalScanned ?
      Math.round((stats.totalBlocked / stats.totalScanned) * 100) : 0;

    // Update stats in UI
    const statsElements = document.querySelectorAll('.stat-number');
    if (statsElements.length >= 2) {
      statsElements[0].textContent = `${pageStats.pageBlocked} (${pageBlockedPercent}%)`;
      statsElements[1].textContent = `${(stats.totalBlocked / 1000000).toFixed(2)}M (${totalBlockedPercent}%)`;
    }

    // Handle toggle changes
    toggle.addEventListener('change', async function () {
      try {
        let result = await chrome.storage.local.get('disabledDomains');
        let disabledDomains = result.disabledDomains || [];
        console.log('Current disabled domains before change:', disabledDomains);

        if (this.checked) {
          if (!disabledDomains.includes(hostname)) {
            disabledDomains.push(hostname);
            console.log('Added domain to disabled list');
          }
        } else {
          disabledDomains = disabledDomains.filter(domain => domain !== hostname);
          console.log('Removed domain from disabled list');
        }

        console.log('New disabled domains list:', disabledDomains);
        await chrome.storage.local.set({ disabledDomains });
        console.log('Saved new disabled domains list');

        // Reload the current tab to apply changes
        chrome.tabs.reload(currentTab.id);
      } catch (error) {
        console.error('Error in toggle change handler:', error);
      }
    });

    // Settings link handler
    document.getElementById('openSettings').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

  } catch (error) {
    console.error('Error in popup initialization:', error);
  }
});
