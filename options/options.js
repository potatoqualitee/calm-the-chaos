import { DEFAULT_IGNORED_URLS, DEFAULT_KEYWORD_GROUPS } from '../scripts/keywords.js';
import { exportSettings, importSettings } from '../scripts/settingsManager.js';

// Initialize the settings
async function initializeSettings() {
  const result = await chrome.storage.local.get(['ignoredDomains', 'keywordGroups', 'customKeywords', 'disabledGroups', 'disabledKeywords', 'disabledDomains', 'matchingOption', 'importUrl']);

  // Initialize domains
  let ignoredDomains = result.ignoredDomains;
  if (!ignoredDomains) {
    ignoredDomains = [...DEFAULT_IGNORED_URLS];
    await chrome.storage.local.set({ ignoredDomains });
  }

  // Initialize keyword groups
  let keywordGroups = result.keywordGroups;
  if (!keywordGroups) {
    keywordGroups = DEFAULT_KEYWORD_GROUPS;
    await chrome.storage.local.set({ keywordGroups });
  }

  // Initialize custom keywords
  let customKeywords = result.customKeywords || [];
  let disabledGroups = result.disabledGroups || [];
  let disabledKeywords = result.disabledKeywords || [];
  let disabledDomains = result.disabledDomains || [];
  let matchingOption = result.matchingOption !== undefined ? result.matchingOption : 'flexible'; // Only set to flexible if undefined
  let importUrl = result.importUrl || ''; // Retrieve saved URL

  console.log('Retrieved matchingOption:', matchingOption); // Debug log

  // Sort custom keywords alphabetically
  customKeywords.sort();

  await chrome.storage.local.set({
    customKeywords,
    disabledGroups,
    disabledKeywords,
    disabledDomains,
    matchingOption
  });

  updateDomainList(ignoredDomains, disabledDomains);
  updateKeywordGroups(keywordGroups, customKeywords, disabledGroups, disabledKeywords);
  document.querySelector(`input[name="matchingOptions"][value="${matchingOption}"]`).checked = true; // Correctly set the radio button
  document.getElementById('urlInput').value = importUrl; // Set the URL input to the stored value
}

// Update the domain list display
function updateDomainList(domains, disabledDomains) {
  const domainList = document.getElementById('domainList');
  domainList.innerHTML = '';

  // Sort domains alphabetically
  domains.sort();

  domains.forEach(domain => {
    const item = document.createElement('div');
    item.className = 'domain-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !disabledDomains.includes(domain);
    checkbox.onchange = () => toggleDomain(domain);

    const text = document.createElement('span');
    text.textContent = domain;

    item.appendChild(checkbox);
    item.appendChild(text);
    domainList.appendChild(item);
  });
}

// Update keyword groups display
function updateKeywordGroups(groups, customKeywords, disabledGroups, disabledKeywords) {
  const container = document.getElementById('keywordGroups');
  container.innerHTML = '';

  // Sort group names alphabetically
  const sortedGroupNames = Object.keys(groups).sort();

  // Standard keyword groups
  sortedGroupNames.forEach(groupName => {
    const keywords = groups[groupName];
    const group = document.createElement('div');
    group.className = 'keyword-group';

    const header = document.createElement('div');
    header.className = 'group-header';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !disabledGroups.includes(groupName);
    checkbox.onchange = () => toggleGroup(groupName);

    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = groupName;

    header.appendChild(checkbox);
    header.appendChild(title);
    group.appendChild(header);

    const keywordList = document.createElement('div');
    keywordList.className = 'keyword-list';

    // Sort keywords alphabetically within each group
    [...keywords].sort().forEach(keyword => {
      const item = createKeywordItem(keyword, !disabledKeywords.includes(keyword));
      keywordList.appendChild(item);
    });

    group.appendChild(keywordList);
    container.appendChild(group);
  });

  // Custom keywords
  const customList = document.getElementById('customKeywords');
  customList.innerHTML = '';

  // Sort custom keywords alphabetically
  [...customKeywords].sort().forEach(keyword => {
    const item = createKeywordItem(keyword, !disabledKeywords.includes(keyword), true);
    customList.appendChild(item);
  });
}

function createKeywordItem(keyword, checked, isCustom = false) {
  const item = document.createElement('div');
  item.className = 'keyword-item';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.onchange = () => toggleKeyword(keyword);

  const label = document.createElement('label');
  label.textContent = keyword;

  item.appendChild(checkbox);
  item.appendChild(label);

  if (isCustom) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.onclick = () => removeCustomKeyword(keyword);
    item.appendChild(removeBtn);
  }

  return item;
}

// Directly update storage without sending a message
async function updateMatchingOption(matchingOption) {
  console.log('Setting matchingOption:', matchingOption); // Debug log
  await chrome.storage.local.set({ matchingOption });
  // Removed unnecessary removal of other options
}

// Domain management functions
async function addDomain(domain) {
  domain = domain.trim().toLowerCase();
  if (!domain) return;

  const result = await chrome.storage.local.get(['ignoredDomains', 'disabledDomains']);
  const ignoredDomains = result.ignoredDomains || [];
  const disabledDomains = result.disabledDomains || [];

  if (!ignoredDomains.includes(domain)) {
    ignoredDomains.push(domain);
    await chrome.storage.local.set({ ignoredDomains });
    updateDomainList(ignoredDomains, disabledDomains);
  }
}

async function removeDomain(domain) {
  const result = await chrome.storage.local.get(['ignoredDomains', 'disabledDomains']);
  let ignoredDomains = result.ignoredDomains || [];
  const disabledDomains = result.disabledDomains || [];

  ignoredDomains = ignoredDomains.filter(d => d !== domain);
  await chrome.storage.local.set({ ignoredDomains });
  updateDomainList(ignoredDomains, disabledDomains);
}

async function toggleDomain(domain) {
  const result = await chrome.storage.local.get('disabledDomains');
  let disabledDomains = result.disabledDomains || [];

  if (disabledDomains.includes(domain)) {
    disabledDomains = disabledDomains.filter(d => d !== domain);
  } else {
    disabledDomains.push(domain);
  }

  // Sort disabled domains alphabetically
  disabledDomains.sort();

  await chrome.storage.local.set({ disabledDomains });
  initializeSettings(); // Refresh display
}

// Keyword management functions
async function toggleGroup(groupName) {
  const result = await chrome.storage.local.get(['disabledGroups', 'keywordGroups', 'disabledKeywords']);
  let disabledGroups = result.disabledGroups || [];
  let disabledKeywords = result.disabledKeywords || [];
  const keywordGroups = result.keywordGroups || {};

  if (disabledGroups.includes(groupName)) {
    disabledGroups = disabledGroups.filter(g => g !== groupName);
    // Enable all keywords in this group
    const keywords = keywordGroups[groupName] || [];
    disabledKeywords = disabledKeywords.filter(k => !keywords.includes(k));
  } else {
    disabledGroups.push(groupName);
    // Disable all keywords in this group
    const keywords = keywordGroups[groupName] || [];
    disabledKeywords = [...new Set([...disabledKeywords, ...keywords])];
  }

  // Sort disabled groups and keywords alphabetically
  disabledGroups.sort();
  disabledKeywords.sort();

  await chrome.storage.local.set({ disabledGroups, disabledKeywords });
  initializeSettings(); // Refresh display
}

async function toggleKeyword(keyword) {
  const result = await chrome.storage.local.get('disabledKeywords');
  let disabledKeywords = result.disabledKeywords || [];

  if (disabledKeywords.includes(keyword)) {
    disabledKeywords = disabledKeywords.filter(k => k !== keyword);
  } else {
    disabledKeywords.push(keyword);
  }

  // Sort disabled keywords alphabetically
  disabledKeywords.sort();

  await chrome.storage.local.set({ disabledKeywords });
}

async function addCustomKeyword(keyword) {
  keyword = keyword.trim().toLowerCase();
  if (!keyword) return;

  const result = await chrome.storage.local.get('customKeywords');
  const customKeywords = result.customKeywords || [];

  if (!customKeywords.includes(keyword)) {
    customKeywords.push(keyword);
    // Sort custom keywords alphabetically
    customKeywords.sort();
    await chrome.storage.local.set({ customKeywords });
    initializeSettings(); // Refresh display
  }
}

async function removeCustomKeyword(keyword) {
  const result = await chrome.storage.local.get('customKeywords');
  let customKeywords = result.customKeywords || [];

  customKeywords = customKeywords.filter(k => k !== keyword);
  // Sort custom keywords alphabetically
  customKeywords.sort();
  await chrome.storage.local.set({ customKeywords });
  initializeSettings(); // Refresh display
}

// Fetch and import settings from URL
async function importFromUrl() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;

  try {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type');

    if (contentType.includes('application/json')) {
      const settings = await response.json();
      await importSettings(settings);
    } else if (contentType.includes('text/plain')) {
      const text = await response.text();
      const keywords = text.split('\n').map(line => line.trim()).filter(line => line);
      for (const keyword of keywords) {
        await addCustomKeyword(keyword);
      }
    }

    // Save the URL for future use
    await chrome.storage.local.set({ importUrl: url });

    // Notify user of success
    showStatus('Import successful!', 'success');
  } catch (error) {
    console.error('Failed to import from URL:', error);
    showStatus('Failed to import from URL. Check console for details.', 'error');
  }
}

// Show status message
function showStatus(message, type) {
  let statusIndicator = document.getElementById('statusIndicator');
  if (!statusIndicator) {
    statusIndicator = document.createElement('div');
    statusIndicator.id = 'statusIndicator';
    document.body.appendChild(statusIndicator);
  }
  statusIndicator.textContent = message;
  statusIndicator.style.display = 'block';
  statusIndicator.style.color = type === 'success' ? 'green' : 'red';
  statusIndicator.style.fontSize = '16px';
  statusIndicator.style.fontWeight = 'bold';
  statusIndicator.style.marginTop = '10px';
  setTimeout(() => statusIndicator.style.display = 'none', 3000);
}

// Tab management
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.tab;

      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));

      button.classList.add('active');
      document.getElementById(tabId).classList.add('active');

      // Hide progress indicator if not on the import/export tab
      const progressIndicator = document.getElementById('progressIndicator');
      if (tabId !== 'importExportTab' && progressIndicator) {
        progressIndicator.style.display = 'none';
      }
    });
  });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  initializeSettings();
  setupTabs();

  document.getElementById('addDomain').addEventListener('click', () => {
    const domain = document.getElementById('newDomain').value;
    addDomain(domain);
    document.getElementById('newDomain').value = '';
  });

  document.getElementById('newDomain').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const domain = e.target.value;
      addDomain(domain);
      e.target.value = '';
    }
  });

  document.getElementById('addKeyword').addEventListener('click', () => {
    const keyword = document.getElementById('newKeyword').value;
    addCustomKeyword(keyword);
    document.getElementById('newKeyword').value = '';
  });

  document.getElementById('newKeyword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const keyword = e.target.value;
      addCustomKeyword(keyword);
      e.target.value = '';
    }
  });

  // Add event listener for matching options
  document.getElementById('matchingOptions').addEventListener('change', async (e) => {
    const matchingOption = e.target.value;
    updateMatchingOption(matchingOption);
  });

  // Add event listeners for export and import buttons
  document.getElementById('exportSettings').addEventListener('click', exportSettings);
  document.getElementById('importSettingsButton').addEventListener('click', () => {
    const fileInput = document.getElementById('importSettings');
    fileInput.click(); // Trigger file input

    fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        let progressIndicator = document.getElementById('progressIndicator');
        if (!progressIndicator) {
          progressIndicator = document.createElement('div');
          document.body.appendChild(progressIndicator);
        }
        progressIndicator.style.display = 'block'; // Ensure it's visible
        progressIndicator.textContent = 'Importing settings...';

        importSettings(file).then(() => {
          progressIndicator.textContent = 'Import Complete!';
          progressIndicator.style.color = 'green';
          progressIndicator.style.fontSize = '24px';
          progressIndicator.style.fontWeight = 'bold';
          progressIndicator.style.marginTop = '20px'; // Add margin for spacing
        }).catch((error) => {
          console.error('Import failed:', error);
          progressIndicator.textContent = 'Import failed! Check console for details.';
          setTimeout(() => progressIndicator.remove(), 3000);
        });
      }
    });
  });

  // Add event listener for import from URL button
  document.getElementById('importFromUrlButton').addEventListener('click', importFromUrl);
});
