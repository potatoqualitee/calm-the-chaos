// Import necessary modules
import { DEFAULT_IGNORED_URLS } from '../scripts/ignoredUrls.js';
import { DEFAULT_KEYWORD_GROUPS } from '../scripts/keywords.js';
import { DEFAULT_ELEMENT_GROUPS } from '../scripts/elements.js';
import { exportSettings, importSettings } from '../scripts/settingsManager.js';
import { initializeRegex } from '../scripts/regexManager.js'; // Import initializeRegex

// Initialize the settings
async function initializeSettings() {
  const result = await chrome.storage.local.get([
    'ignoredDomains',
    'keywordGroups',
    'customKeywords',
    'disabledGroups',
    'disabledKeywords',
    'disabledDomains',
    'disabledDomainGroups',
    'elementGroups',
    'disabledElementGroups',
    'disabledElements',
    'matchingOption',
    'importUrl',
    'checkForUpdates'
  ]);

  // Initialize domains
  let ignoredDomains = result.ignoredDomains;
  if (!ignoredDomains) {
    ignoredDomains = DEFAULT_IGNORED_URLS;
    await chrome.storage.local.set({ ignoredDomains });
  }

  // Initialize keyword groups
  let keywordGroups = result.keywordGroups;
  if (!keywordGroups) {
    keywordGroups = DEFAULT_KEYWORD_GROUPS;
    await chrome.storage.local.set({ keywordGroups });
  }

  // Initialize element groups
  let elementGroups = result.elementGroups;
  if (!elementGroups) {
    elementGroups = DEFAULT_ELEMENT_GROUPS;
    await chrome.storage.local.set({ elementGroups });
  }

  // Initialize other settings
  let customKeywords = result.customKeywords || [];
  let disabledGroups = result.disabledGroups || [];
  let disabledKeywords = result.disabledKeywords || [];
  let disabledDomains = result.disabledDomains || [];
  let disabledDomainGroups = result.disabledDomainGroups || [];
  let disabledElementGroups = result.disabledElementGroups || [];
  let disabledElements = result.disabledElements || [];
  let matchingOption = result.matchingOption !== undefined ? result.matchingOption : 'flexible';
  let importUrl = result.importUrl || '';
  let checkForUpdates = result.checkForUpdates !== undefined ? result.checkForUpdates : true;

  // Sort custom keywords alphabetically
  customKeywords.sort();

  await chrome.storage.local.set({
    customKeywords,
    disabledGroups,
    disabledKeywords,
    disabledDomains,
    disabledDomainGroups,
    disabledElementGroups,
    disabledElements,
    matchingOption,
    importUrl,
    checkForUpdates
  });

  // Update UI elements
  updateDomainGroups(ignoredDomains, disabledDomains, disabledDomainGroups);
  updateKeywordGroups(keywordGroups, customKeywords, disabledGroups, disabledKeywords);
  updateElementGroups(elementGroups, disabledElementGroups, disabledElements);
  document.querySelector(`input[name="matchingOptions"][value="${matchingOption}"]`).checked = true;
  document.getElementById('urlInput').value = importUrl;
  document.getElementById('checkForUpdates').checked = checkForUpdates;

  // Recompile regex after settings are initialized
  initializeRegex();
}

function setupFilter() {
  // Get filter inputs
  const keywordFilter = document.getElementById('filterInput');
  const domainFilter = document.getElementById('domainFilterInput');
  const elementFilter = document.getElementById('elementFilterInput');

  // Keyword filtering
  keywordFilter?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();

    // Filter keyword items
    document.querySelectorAll('#keywordGroups .keyword-item, #customKeywords .keyword-item').forEach(item => {
      const text = item.querySelector('label').textContent.toLowerCase();
      item.style.display = text.includes(searchTerm) ? '' : 'none';
    });

    // Hide empty groups
    document.querySelectorAll('#keywordGroups .keyword-group').forEach(group => {
      const hasVisibleItems = Array.from(group.querySelectorAll('.keyword-item'))
        .some(item => item.style.display !== 'none');
      const groupTitle = group.querySelector('.group-title').textContent.toLowerCase();
      group.style.display = (hasVisibleItems || groupTitle.includes(searchTerm)) ? '' : 'none';
    });
  });

  // Domain filtering
  domainFilter?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();

    // Filter domain items
    document.querySelectorAll('#domainList .keyword-item').forEach(item => {
      const text = item.querySelector('label').textContent.toLowerCase();
      item.style.display = text.includes(searchTerm) ? '' : 'none';
    });

    // Hide empty groups
    document.querySelectorAll('#domainList .keyword-group').forEach(group => {
      const hasVisibleItems = Array.from(group.querySelectorAll('.keyword-item'))
        .some(item => item.style.display !== 'none');
      const groupTitle = group.querySelector('.group-title').textContent.toLowerCase();
      group.style.display = (hasVisibleItems || groupTitle.includes(searchTerm)) ? '' : 'none';
    });
  });

  // Element filtering
  elementFilter?.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();

    // Filter element items
    document.querySelectorAll('#elementGroups .keyword-item').forEach(item => {
      const text = item.querySelector('label').textContent.toLowerCase();
      item.style.display = text.includes(searchTerm) ? '' : 'none';
    });

    // Hide empty groups
    document.querySelectorAll('#elementGroups .keyword-group').forEach(group => {
      const hasVisibleItems = Array.from(group.querySelectorAll('.keyword-item'))
        .some(item => item.style.display !== 'none');
      const groupTitle = group.querySelector('.group-title').textContent.toLowerCase();
      group.style.display = (hasVisibleItems || groupTitle.includes(searchTerm)) ? '' : 'none';
    });
  });
}

// Update the domain groups display
function updateDomainGroups(domainGroups, disabledDomains, disabledDomainGroups) {
  const domainList = document.getElementById('domainList');
  domainList.innerHTML = '';

  // Sort group names alphabetically
  const sortedGroupNames = Object.keys(domainGroups).sort();

  sortedGroupNames.forEach(groupName => {
    const domains = domainGroups[groupName];
    const group = document.createElement('div');
    group.className = 'keyword-group';

    const header = document.createElement('div');
    header.className = 'group-header';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !disabledDomainGroups.includes(groupName);
    checkbox.onchange = () => toggleDomainGroup(groupName);

    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = groupName;

    header.appendChild(checkbox);
    header.appendChild(title);
    group.appendChild(header);

    const domainsList = document.createElement('div');
    domainsList.className = 'keyword-list';

    [...domains].sort().forEach(domain => {
      const item = document.createElement('div');
      item.className = 'keyword-item';

      const domainCheckbox = document.createElement('input');
      domainCheckbox.type = 'checkbox';
      domainCheckbox.checked = !disabledDomains.includes(domain);
      domainCheckbox.onchange = () => toggleDomain(domain);

      const label = document.createElement('label');
      label.textContent = domain;

      item.appendChild(domainCheckbox);
      item.appendChild(label);
      domainsList.appendChild(item);
    });

    group.appendChild(domainsList);
    domainList.appendChild(group);
  });
}

// Update the element groups display
function updateElementGroups(elementGroups, disabledElementGroups, disabledElements) {
  const container = document.getElementById('elementGroups');
  container.innerHTML = '';

  // Sort group names alphabetically
  const sortedGroupNames = Object.keys(elementGroups).sort();

  sortedGroupNames.forEach(groupName => {
    const elements = elementGroups[groupName];
    const group = document.createElement('div');
    group.className = 'keyword-group';

    const header = document.createElement('div');
    header.className = 'group-header';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !disabledElementGroups.includes(groupName);
    checkbox.onchange = () => toggleElementGroup(groupName);

    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = groupName;

    header.appendChild(checkbox);
    header.appendChild(title);
    group.appendChild(header);

    const elementList = document.createElement('div');
    elementList.className = 'keyword-list';

    [...elements].sort().forEach(element => {
      const item = document.createElement('div');
      item.className = 'keyword-item';

      const elementCheckbox = document.createElement('input');
      elementCheckbox.type = 'checkbox';
      elementCheckbox.checked = !disabledElements.includes(element);
      elementCheckbox.onchange = () => toggleElement(element);

      const label = document.createElement('label');
      label.textContent = element;

      item.appendChild(elementCheckbox);
      item.appendChild(label);
      elementList.appendChild(item);
    });

    group.appendChild(elementList);
    container.appendChild(group);
  });
}

// Domain management functions
async function addDomain(domain) {
  domain = domain.trim().toLowerCase();
  if (!domain) return;

  const result = await chrome.storage.local.get(['ignoredDomains']);
  const ignoredDomains = result.ignoredDomains || {};

  if (!ignoredDomains['Other']) {
    ignoredDomains['Other'] = [];
  }

  if (!ignoredDomains['Other'].includes(domain)) {
    ignoredDomains['Other'].push(domain);
    ignoredDomains['Other'].sort();
    await chrome.storage.local.set({ ignoredDomains });
    initializeSettings();
  }
}

async function toggleDomainGroup(groupName) {
  const result = await chrome.storage.local.get(['disabledDomainGroups', 'ignoredDomains', 'disabledDomains']);
  let disabledDomainGroups = result.disabledDomainGroups || [];
  let disabledDomains = result.disabledDomains || [];
  const ignoredDomains = result.ignoredDomains || {};

  if (disabledDomainGroups.includes(groupName)) {
    disabledDomainGroups = disabledDomainGroups.filter(g => g !== groupName);
    const domains = ignoredDomains[groupName] || [];
    disabledDomains = disabledDomains.filter(d => !domains.includes(d));
  } else {
    disabledDomainGroups.push(groupName);
    const domains = ignoredDomains[groupName] || [];
    disabledDomains = [...new Set([...disabledDomains, ...domains])];
  }

  disabledDomainGroups.sort();
  disabledDomains.sort();

  await chrome.storage.local.set({ disabledDomainGroups, disabledDomains });
  initializeSettings();
}

async function toggleElementGroup(groupName) {
  const result = await chrome.storage.local.get(['disabledElementGroups', 'elementGroups', 'disabledElements']);
  let disabledElementGroups = result.disabledElementGroups || [];
  let disabledElements = result.disabledElements || [];
  const elementGroups = result.elementGroups || {};

  if (disabledElementGroups.includes(groupName)) {
    disabledElementGroups = disabledElementGroups.filter(g => g !== groupName);
    const elements = elementGroups[groupName] || [];
    disabledElements = disabledElements.filter(e => !elements.includes(e));
  } else {
    disabledElementGroups.push(groupName);
    const elements = elementGroups[groupName] || [];
    disabledElements = [...new Set([...disabledElements, ...elements])];
  }

  disabledElementGroups.sort();
  disabledElements.sort();

  await chrome.storage.local.set({ disabledElementGroups, disabledElements });
  initializeSettings();
}

async function toggleElement(element) {
  const result = await chrome.storage.local.get('disabledElements');
  let disabledElements = result.disabledElements || [];

  if (disabledElements.includes(element)) {
    disabledElements = disabledElements.filter(e => e !== element);
  } else {
    disabledElements.push(element);
  }

  disabledElements.sort();
  await chrome.storage.local.set({ disabledElements });
  initializeSettings();
}

async function toggleDomain(domain) {
  const result = await chrome.storage.local.get('disabledDomains');
  let disabledDomains = result.disabledDomains || [];

  if (disabledDomains.includes(domain)) {
    disabledDomains = disabledDomains.filter(d => d !== domain);
  } else {
    disabledDomains.push(domain);
  }

  disabledDomains.sort();
  await chrome.storage.local.set({ disabledDomains });
  initializeSettings();
}

function updateKeywordGroups(groups, customKeywords, disabledGroups, disabledKeywords) {
  const container = document.getElementById('keywordGroups');
  container.innerHTML = '';

  // Sort group names alphabetically
  const sortedGroupNames = Object.keys(groups).sort();

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

async function updateMatchingOption(matchingOption) {
  console.log('Setting matchingOption:', matchingOption);
  await chrome.storage.local.set({ matchingOption });
}

async function toggleGroup(groupName) {
  const result = await chrome.storage.local.get(['disabledGroups', 'keywordGroups', 'disabledKeywords']);
  let disabledGroups = result.disabledGroups || [];
  let disabledKeywords = result.disabledKeywords || [];
  const keywordGroups = result.keywordGroups || {};

  if (disabledGroups.includes(groupName)) {
    disabledGroups = disabledGroups.filter(g => g !== groupName);
    const keywords = keywordGroups[groupName] || [];
    disabledKeywords = disabledKeywords.filter(k => !keywords.includes(k));
  } else {
    disabledGroups.push(groupName);
    const keywords = keywordGroups[groupName] || [];
    disabledKeywords = [...new Set([...disabledKeywords, ...keywords])];
  }

  disabledGroups.sort();
  disabledKeywords.sort();

  await chrome.storage.local.set({ disabledGroups, disabledKeywords });
  initializeSettings();
}

async function toggleKeyword(keyword) {
  const result = await chrome.storage.local.get('disabledKeywords');
  let disabledKeywords = result.disabledKeywords || [];

  if (disabledKeywords.includes(keyword)) {
    disabledKeywords = disabledKeywords.filter(k => k !== keyword);
  } else {
    disabledKeywords.push(keyword);
  }

  disabledKeywords.sort();
  await chrome.storage.local.set({ disabledKeywords });
  initializeSettings();
}

async function addCustomKeyword(keyword) {
  keyword = keyword.trim().toLowerCase();
  if (!keyword) return;

  const result = await chrome.storage.local.get('customKeywords');
  const customKeywords = result.customKeywords || [];

  if (!customKeywords.includes(keyword)) {
    customKeywords.push(keyword);
    customKeywords.sort();
    await chrome.storage.local.set({ customKeywords });
    initializeSettings();
  }
}

async function removeCustomKeyword(keyword) {
  const result = await chrome.storage.local.get('customKeywords');
  let customKeywords = result.customKeywords || [];

  customKeywords = customKeywords.filter(k => k !== keyword);
  customKeywords.sort();
  await chrome.storage.local.set({ customKeywords });
  initializeSettings();
}

function showStatus(message, type = 'success') {
  const statusIndicator = document.getElementById('statusIndicator');
  statusIndicator.textContent = message;
  statusIndicator.style.display = 'block';
  statusIndicator.style.color = type === 'success' ? '#28a745' : '#dc3545';
  setTimeout(() => statusIndicator.style.display = 'none', 3000);
}

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

    await chrome.storage.local.set({ importUrl: url });
    showStatus('Import successful!');
    initializeSettings();
  } catch (error) {
    console.error('Failed to import from URL:', error);
    showStatus('Failed to import from URL', 'error');
  }
}

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
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initializeSettings();
  setupTabs();
  setupFilter();

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
    await updateMatchingOption(matchingOption);
  });

  // Add event listeners for export and import buttons
  document.getElementById('exportSettings').addEventListener('click', exportSettings);

  document.getElementById('importSettingsButton').addEventListener('click', () => {
    const fileInput = document.getElementById('importSettings');
    fileInput.click();
  });

  document.getElementById('importSettings').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        await importSettings(file);
        showStatus('Import successful!');
        initializeSettings();
      } catch (error) {
        console.error('Import failed:', error);
        showStatus('Import failed!', 'error');
      }
    }
  });

  // Add event listener for import from URL button
  document.getElementById('importFromUrlButton').addEventListener('click', importFromUrl);

  // Add event listener for check for updates toggle
  document.getElementById('checkForUpdates').addEventListener('change', async (e) => {
    await chrome.storage.local.set({ checkForUpdates: e.target.checked });
  });
});

export { initializeSettings };
