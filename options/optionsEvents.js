// optionsEvents.js
import { showStatus, updateStats } from './optionsUI.js';
import * as storage from './optionsStorage.js';
import { exportSettings, importSettings } from '../scripts/core/managers/settingsManager.js';
import { initializeSettings } from './options.js';

const keywordIdentity = value => String(value || '')
  .normalize('NFKC')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

export function setupFilter() {
  const keywordFilter = document.getElementById('filterInput');
  const domainFilter = document.getElementById('domainFilterInput');
  const elementFilter = document.getElementById('elementFilterInput');
  const enableAllBtn = document.getElementById('enableAll');
  const disableAllBtn = document.getElementById('disableAll');
  const keywordSelector = '#keywordGroups .keyword-item:not([style*="display: none"]) label, #customKeywords .keyword-item:not([style*="display: none"]) label';

  const visibleKeywordIdentities = () => new Set(
    [...document.querySelectorAll(keywordSelector)]
      .map(label => keywordIdentity(label.textContent))
  );

  const restoreSearch = searchTerm => {
    if (!searchTerm || !keywordFilter) return;
    keywordFilter.value = searchTerm;
    keywordFilter.dispatchEvent(new Event('input'));
  };

  enableAllBtn?.addEventListener('click', async () => {
    const searchTerm = keywordFilter?.value.toLowerCase() || '';
    const result = await storage.getStorageData([
      'keywordGroups', 'keywordCatalogSnapshot', 'customKeywords', 'disabledGroups',
      'disabledKeywords', 'pinnedKeywords'
    ]);
    const keywordGroups = result.keywordGroups || {};
    let disabledGroups = result.disabledGroups || [];
    let disabledKeywords = result.disabledKeywords || [];
    let pinnedKeywords = result.pinnedKeywords || [];

    if (searchTerm) {
      const visible = visibleKeywordIdentities();
      disabledKeywords = disabledKeywords.filter(keyword =>
        !visible.has(keywordIdentity(keyword))
      );
      // Enabling visible/default keywords must not erase independent catalog
      // pins, especially metadata-only terms that are not rendered in the list.

      const disabled = new Set(disabledKeywords.map(keywordIdentity));
      for (const [groupName, keywords] of Object.entries(keywordGroups)) {
        const hasVisible = keywords.some(keyword => visible.has(keywordIdentity(keyword)));
        const anyEnabled = keywords.some(keyword => !disabled.has(keywordIdentity(keyword)));
        if (hasVisible && anyEnabled) {
          disabledGroups = disabledGroups.filter(group => group !== groupName);
        }
      }
    } else {
      disabledGroups = [];
      disabledKeywords = [];
      // Pins are explicit opt-ins, not disabled state. Enable All preserves them.
    }

    await storage.setStorageData({ disabledGroups, disabledKeywords, pinnedKeywords });
    await initializeSettings();
    restoreSearch(searchTerm);
  });

  disableAllBtn?.addEventListener('click', async () => {
    const searchTerm = keywordFilter?.value.toLowerCase() || '';
    const result = await storage.getStorageData([
      'keywordGroups', 'keywordCatalogSnapshot', 'customKeywords', 'disabledGroups',
      'disabledKeywords', 'pinnedKeywords'
    ]);
    const keywordGroups = result.keywordGroups || {};
    const catalogGroups = result.keywordCatalogSnapshot || {};
    const fullKeywordGroups = { ...keywordGroups, ...catalogGroups };
    const customKeywords = result.customKeywords || [];
    let disabledGroups = result.disabledGroups || [];
    let disabledKeywords = result.disabledKeywords || [];
    let pinnedKeywords = result.pinnedKeywords || [];
    const disabled = new Map(disabledKeywords.map(keyword => [keywordIdentity(keyword), keyword]));

    if (searchTerm) {
      const visible = visibleKeywordIdentities();
      for (const label of document.querySelectorAll(keywordSelector)) {
        const keyword = label.textContent;
        if (!disabled.has(keywordIdentity(keyword))) disabled.set(keywordIdentity(keyword), keyword);
      }
      pinnedKeywords = pinnedKeywords.filter(keyword =>
        !visible.has(keywordIdentity(keyword))
      );

      for (const [groupName, keywords] of Object.entries(keywordGroups)) {
        const allDisabled = keywords.every(keyword => disabled.has(keywordIdentity(keyword)));
        if (allDisabled && !disabledGroups.includes(groupName)) disabledGroups.push(groupName);
      }
    } else {
      pinnedKeywords = [];
      for (const [groupName, keywords] of Object.entries(fullKeywordGroups)) {
        if (!disabledGroups.includes(groupName)) disabledGroups.push(groupName);
        for (const keyword of keywords) {
          if (!disabled.has(keywordIdentity(keyword))) disabled.set(keywordIdentity(keyword), keyword);
        }
      }
      for (const keyword of customKeywords) {
        if (!disabled.has(keywordIdentity(keyword))) disabled.set(keywordIdentity(keyword), keyword);
      }
    }

    disabledKeywords = [...disabled.values()].sort((a, b) => a.localeCompare(b));
    disabledGroups.sort();
    await storage.setStorageData({ disabledGroups, disabledKeywords, pinnedKeywords });
    await initializeSettings();
    restoreSearch(searchTerm);
  });

  keywordFilter?.addEventListener('input', event => {
    const searchTerm = event.target.value.toLowerCase();
    let visibleCount = 0;
    document.querySelectorAll('#keywordGroups .keyword-item, #customKeywords .keyword-item, #retiredKeywords .keyword-item').forEach(item => {
      const text = item.querySelector('label').textContent.toLowerCase();
      const isVisible = text.includes(searchTerm);
      item.style.display = isVisible ? '' : 'none';
      if (isVisible) visibleCount++;
    });
    document.querySelectorAll('#keywordGroups .keyword-group').forEach(group => {
      const hasVisibleItems = Array.from(group.querySelectorAll('.keyword-item'))
        .some(item => item.style.display !== 'none');
      const groupTitle = group.querySelector('.group-title').textContent.toLowerCase();
      group.style.display = (hasVisibleItems || groupTitle.includes(searchTerm)) ? '' : 'none';
    });
    if (searchTerm) {
      enableAllBtn.textContent = `Enable ${visibleCount}`;
      disableAllBtn.textContent = `Disable ${visibleCount}`;
    } else {
      enableAllBtn.textContent = 'Enable All';
      disableAllBtn.textContent = 'Disable All';
    }
  });

  domainFilter?.addEventListener('input', event => {
    const searchTerm = event.target.value.toLowerCase();
    document.querySelectorAll('#domainList .keyword-item, #customDomains .keyword-item').forEach(item => {
      const text = item.querySelector('label').textContent.toLowerCase();
      item.style.display = text.includes(searchTerm) ? '' : 'none';
    });
    document.querySelectorAll('#domainList .keyword-group').forEach(group => {
      const hasVisibleItems = Array.from(group.querySelectorAll('.keyword-item'))
        .some(item => item.style.display !== 'none');
      const groupTitle = group.querySelector('.group-title').textContent.toLowerCase();
      group.style.display = (hasVisibleItems || groupTitle.includes(searchTerm)) ? '' : 'none';
    });
  });

  elementFilter?.addEventListener('input', event => {
    const searchTerm = event.target.value.toLowerCase();
    document.querySelectorAll('#elementGroups .keyword-item').forEach(item => {
      const text = item.querySelector('label').textContent.toLowerCase();
      item.style.display = text.includes(searchTerm) ? '' : 'none';
    });
    document.querySelectorAll('#elementGroups .keyword-group').forEach(group => {
      const hasVisibleItems = Array.from(group.querySelectorAll('.keyword-item'))
        .some(item => item.style.display !== 'none');
      const groupTitle = group.querySelector('.group-title').textContent.toLowerCase();
      group.style.display = (hasVisibleItems || groupTitle.includes(searchTerm)) ? '' : 'none';
    });
  });
}

export function setupTabs() {
  console.log('Setting up tabs...');
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  console.log('Found tab buttons:', tabButtons.length);
  console.log('Found tab contents:', tabContents.length);

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab;
      console.log('Tab clicked:', tabId);

      // Remove active class from all buttons and contents
      tabButtons.forEach(btn => {
        btn.classList.remove('active');
        console.log('Removed active class from button:', btn.dataset.tab);
      });
      tabContents.forEach(content => {
        content.classList.remove('active');
        console.log('Removed active class from content:', content.id);
      });

      // Add active class to clicked button and corresponding content
      button.classList.add('active');
      const content = document.getElementById(tabId);
      if (content) {
        content.classList.add('active');
        console.log('Added active class to:', tabId);

        // Update stats when stats tab is shown
        if (tabId === 'stats') {
          updateStats();
        }
      } else {
        console.error('Tab content not found for:', tabId);
      }
    });
  });
}

export async function importFromUrl(url) {
  if (!url) return;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType) {
      throw new Error('Content type not specified by server');
    }

    let settings;
    if (contentType.includes('application/json')) {
      settings = await response.json();
      await importSettings(settings);
    } else if (contentType.includes('text/plain')) {
      const text = await response.text();
      const keywords = text.split('\n')
        .map(line => line.trim())
        .filter(line => line);

      // Get current settings to merge with
      const currentSettings = await storage.getStorageData(['customKeywords']);
      const existingKeywords = currentSettings.customKeywords || [];

      // Merge keywords and remove duplicates
      const mergedKeywords = [...new Set([...existingKeywords, ...keywords])].sort();

      await storage.setStorageData({
        customKeywords: mergedKeywords
      });
    } else {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    return true;
  } catch (error) {
    console.error('Failed to import from URL:', error);
    showStatus(`Import failed for ${url}: ${error.message}`, 'error');
    return false;
  }
}

export async function importFromAllUrls() {
  const result = await storage.getStorageData(['configUrls']);
  const configUrls = result.configUrls || [];

  let successCount = 0;
  for (const url of configUrls) {
    if (await importFromUrl(url)) {
      successCount++;
    }
  }

  if (successCount > 0) {
    showStatus(`Successfully imported from ${successCount} of ${configUrls.length} URLs`);
    initializeSettings();
  }
}

export function setupEventListeners() {
  console.log('Setting up event listeners...');

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.allTimeKeywordStats) {
      console.log('Keyword stats updated:', changes.allTimeKeywordStats);
      const statsTab = document.querySelector('.tab-button[data-tab="stats"]');
      if (statsTab?.classList.contains('active')) {
        updateStats();
      }
    }
  });

  // Domain events
  const addDomainButton = document.getElementById('addDomain');
  const newDomainInput = document.getElementById('newDomain');

  addDomainButton?.addEventListener('click', async () => {
    const domain = newDomainInput?.value;
    if (domain) {
      await storage.addDomain(domain);
      if (newDomainInput) newDomainInput.value = '';
      initializeSettings();
    }
  });

  newDomainInput?.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const domain = e.target.value;
      await storage.addDomain(domain);
      e.target.value = '';
      initializeSettings();
    }
  });

  // Keyword events
  const addKeywordButton = document.getElementById('addKeyword');
  const newKeywordInput = document.getElementById('newKeyword');

  addKeywordButton?.addEventListener('click', async () => {
    const keyword = newKeywordInput?.value;
    if (keyword) {
      await storage.addCustomKeyword(keyword);
      if (newKeywordInput) newKeywordInput.value = '';
      initializeSettings();
    }
  });

  newKeywordInput?.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const keyword = e.target.value;
      await storage.addCustomKeyword(keyword);
      e.target.value = '';
      initializeSettings();
    }
  });

  // Config URL events
  const addConfigUrlButton = document.getElementById('addConfigUrl');
  const urlInput = document.getElementById('urlInput');
  const configUrlsList = document.getElementById('configUrls');

  // Function to create and append a config URL item
  const createConfigUrlItem = (url) => {
    const item = document.createElement('div');
    item.className = 'keyword-item';

    const urlText = document.createElement('span');
    urlText.className = 'keyword-text';
    urlText.textContent = url;

    const removeButton = document.createElement('button');
    removeButton.className = 'remove-btn';
    removeButton.innerHTML = '&times;';
    removeButton.onclick = async () => {
      await storage.removeConfigUrl(url);
      item.remove();
    };

    item.appendChild(urlText);
    item.appendChild(removeButton);
    return item;
  };

  // Initialize config URLs list
  const initConfigUrls = async () => {
    const result = await storage.getStorageData(['configUrls']);
    const configUrls = result.configUrls || [];
    configUrlsList.innerHTML = '';
    configUrls.forEach(url => {
      configUrlsList.appendChild(createConfigUrlItem(url));
    });
  };

  addConfigUrlButton?.addEventListener('click', async () => {
    const url = urlInput?.value.trim();
    if (url) {
      if (await storage.addConfigUrl(url)) {
        configUrlsList?.appendChild(createConfigUrlItem(url));
        if (urlInput) urlInput.value = '';
        await importFromUrl(url);
      }
    }
  });

  urlInput?.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      const url = e.target.value.trim();
      if (url) {
        if (await storage.addConfigUrl(url)) {
          configUrlsList?.appendChild(createConfigUrlItem(url));
          e.target.value = '';
          await importFromUrl(url);
        }
      }
    }
  });

  // Initialize config URLs
  initConfigUrls();

  // Filtering mode toggle
  const filteringModeInput = document.getElementById('filteringMode');
  filteringModeInput?.addEventListener('change', async (e) => {
    await storage.setFilteringEnabled(e.target.checked);
    initializeSettings();
  });

  // Matching options
  const matchingOptions = document.getElementById('matchingOptions');
  matchingOptions?.addEventListener('change', async (e) => {
    if (e.target instanceof HTMLInputElement) {
      await storage.updateMatchingOption(e.target.value);
    }
  });

  // Export and import buttons
  const exportButton = document.getElementById('exportSettings');
  const importButton = document.getElementById('importSettingsButton');
  const importInput = document.getElementById('importSettings');

  exportButton?.addEventListener('click', exportSettings);

  importButton?.addEventListener('click', () => {
    importInput?.click();
  });

  importInput?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        await importSettings(file);
        showStatus('Import successful!');
        initializeSettings();
      } catch (error) {
        console.error('Import failed:', error);
        showStatus(`Import failed: ${error.message}`, 'error');
      }
    }
    // Clear the input to allow importing the same file again
    if (event.target instanceof HTMLInputElement) {
      event.target.value = '';
    }
  });

  // Check for updates toggle
  const checkForUpdatesInput = document.getElementById('checkForUpdates');
  checkForUpdatesInput?.addEventListener('change', async (e) => {
    if (e.target instanceof HTMLInputElement) {
      await storage.setCheckForUpdates(e.target.checked);
      if (e.target.checked) {
        await importFromAllUrls();
      }
    }
  });

  // Collapse style options
  const collapseOptions = document.getElementById('collapseOptions');
  collapseOptions?.addEventListener('change', async (e) => {
    if (e.target instanceof HTMLInputElement) {
      await storage.setCollapseStyle(e.target.value);
      initializeSettings();
    }
  });

  // Reddit comment thread filtering toggle
  const filterRedditInput = document.getElementById('filterRedditCommentThreads');
  filterRedditInput?.addEventListener('change', async (e) => {
    if (e.target instanceof HTMLInputElement) {
      await storage.setFilterRedditCommentThreads(e.target.checked);
      initializeSettings();
    }
  });

  // Facebook comment thread filtering toggle
  const filterFacebookInput = document.getElementById('filterFacebookCommentThreads');
  filterFacebookInput?.addEventListener('change', async (e) => {
    if (e.target instanceof HTMLInputElement) {
      await storage.setFilterFacebookCommentThreads(e.target.checked);
      initializeSettings();
    }
  });

  // Blur message toggle
  const showBlurMessageInput = document.getElementById('showBlurMessage');
  showBlurMessageInput?.addEventListener('change', async (e) => {
    if (e.target instanceof HTMLInputElement) {
      await storage.setStorageData({ showBlurMessage: e.target.checked });
      initializeSettings();
    }
  });

  // Auto-update new developments toggle
  const autoUpdateInput = document.getElementById('autoUpdateNewDevelopments');
  autoUpdateInput?.addEventListener('change', async (e) => {
    if (e.target instanceof HTMLInputElement) {
      await storage.setAutoUpdateNewDevelopments(e.target.checked);
      // Create or clear alarm based on setting
      if (e.target.checked) {
        chrome.alarms.create('updateNewDevelopments', {
          periodInMinutes: 30,
          delayInMinutes: 1
        });
      } else {
        chrome.alarms.clear('updateNewDevelopments');
      }
    }
  });

  console.log('Event listeners setup complete');
}
