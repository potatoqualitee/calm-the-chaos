// optionsUI.js
import { PRECONFIGURED_DOMAINS } from '../scripts/core/config/preconfiguredDomains.js';
import * as storage from './optionsStorage.js';

// New function to update stats table
export async function updateStats() {
  const statsContainer = document.getElementById('keywordStats');
  if (!statsContainer) return;

  // Get all storage keys to find blocked keyword data
  const allStorage = await chrome.storage.local.get(null);
  const keywordStats = new Map();

  // Aggregate stats from all tabs
  Object.entries(allStorage).forEach(([key, value]) => {
    if (key.startsWith('blockedKeywords_')) {
      value.forEach(item => {
        if (item.blockedKeywords && Array.isArray(item.blockedKeywords)) {
          item.blockedKeywords.forEach(keyword => {
            const count = keywordStats.get(keyword) || 0;
            keywordStats.set(keyword, count + (item.count || 1));
          });
        }
      });
    }
  });

  // Convert to array and sort by count
  const sortedStats = [...keywordStats.entries()]
    .sort((a, b) => b[1] - a[1]);

  // Create table
  const table = document.createElement('table');
  table.className = 'stats-table';

  // Add header
  const header = document.createElement('tr');
  const keywordHeader = document.createElement('th');
  keywordHeader.textContent = 'Keyword';
  const countHeader = document.createElement('th');
  countHeader.textContent = 'Times Blocked';
  header.appendChild(keywordHeader);
  header.appendChild(countHeader);
  table.appendChild(header);

  // Add rows
  sortedStats.forEach(([keyword, count]) => {
    const row = document.createElement('tr');

    const keywordCell = document.createElement('td');
    keywordCell.textContent = keyword;

    const countCell = document.createElement('td');
    countCell.textContent = count;
    countCell.className = 'count-column';

    row.appendChild(keywordCell);
    row.appendChild(countCell);
    table.appendChild(row);
  });

  // If no stats, show message
  if (sortedStats.length === 0) {
    const noStats = document.createElement('div');
    noStats.className = 'info';
    noStats.textContent = 'No keywords have been blocked yet.';
    statsContainer.innerHTML = '';
    statsContainer.appendChild(noStats);
  } else {
    statsContainer.innerHTML = '';
    statsContainer.appendChild(table);
  }
}

export function updateConfigUrls(configUrls) {
  const configUrlsList = document.getElementById('configUrls');
  if (!configUrlsList) return;
  configUrlsList.innerHTML = '';

  configUrls.forEach(url => {
    const item = document.createElement('div');
    item.className = 'keyword-item';

    const label = document.createElement('label');
    label.textContent = url;

    const removeButton = document.createElement('button');
    removeButton.className = 'remove-btn';
    removeButton.innerHTML = '&times;';
    removeButton.onclick = async () => {
      await storage.removeConfigUrl(url);
      item.remove();
    };

    item.appendChild(label);
    item.appendChild(removeButton);
    configUrlsList.appendChild(item);
  });
}

export function updateDomainGroups(domainGroups, disabledDomainGroups, disabledDomains, filteringEnabled, customDomains = []) {
  const domainList = document.getElementById('domainList');
  if (!domainList) return;
  domainList.innerHTML = '';

  if (!filteringEnabled) {
    // When filtering is disabled by default, show pre-configured domains first
    const domains = new Set([...PRECONFIGURED_DOMAINS]);

    // Add any custom domains that were added for filtering
    if (domainGroups['FilteredDomains']) {
      domainGroups['FilteredDomains'].forEach(domain => domains.add(domain));
    }

    const group = document.createElement('div');
    group.className = 'keyword-group';

    const header = document.createElement('div');
    header.className = 'group-header';

    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = 'Domains to Filter';

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
      domainCheckbox.onchange = () => storage.toggleDomain(domain);

      const label = document.createElement('label');
      label.textContent = domain;

      item.appendChild(domainCheckbox);
      item.appendChild(label);

      // Add remove button for custom domains (not in PRECONFIGURED_DOMAINS)
      if (!PRECONFIGURED_DOMAINS.includes(domain)) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => storage.removeDomain(domain);
        item.appendChild(removeBtn);
      }

      domainsList.appendChild(item);
    });

    group.appendChild(domainsList);
    domainList.appendChild(group);
  } else {
    // When filtering is enabled by default, show domains to exclude from filtering
    const sortedGroupNames = Object.keys(domainGroups).sort();

    sortedGroupNames.forEach(groupName => {
      if (groupName === 'FilteredDomains') return; // Skip filtered domains when in exclude mode

      const domains = domainGroups[groupName];
      const group = document.createElement('div');
      group.className = 'keyword-group';

      const header = document.createElement('div');
      header.className = 'group-header';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !disabledDomainGroups.includes(groupName);
      checkbox.onchange = () => storage.toggleDomainGroup(groupName);

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
        domainCheckbox.onchange = () => storage.toggleDomain(domain);

        const label = document.createElement('label');
        label.textContent = domain;

        item.appendChild(domainCheckbox);
        item.appendChild(label);

        if (groupName === 'Other') {
          const removeBtn = document.createElement('button');
          removeBtn.className = 'remove-btn';
          removeBtn.innerHTML = '&times;';
          removeBtn.onclick = () => storage.removeDomain(domain);
          item.appendChild(removeBtn);
        }

        domainsList.appendChild(item);
      });

      group.appendChild(domainsList);
      domainList.appendChild(group);
    });
  }

  // Custom domains section
  const customList = document.getElementById('customDomains');
  if (customList) {
    customList.innerHTML = '';

    // Always show all custom domains in the custom domains section
    customDomains.forEach(domain => {
      const item = document.createElement('div');
      item.className = 'keyword-item';

      const domainCheckbox = document.createElement('input');
      domainCheckbox.type = 'checkbox';
      domainCheckbox.checked = !disabledDomains.includes(domain);
      domainCheckbox.onchange = () => storage.toggleDomain(domain);

      const label = document.createElement('label');
      label.textContent = domain;

      item.appendChild(domainCheckbox);
      item.appendChild(label);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.innerHTML = '&times;';
      removeBtn.onclick = () => storage.removeDomain(domain);
      item.appendChild(removeBtn);

      customList.appendChild(item);
    });
  }

  // Update placeholder text based on filtering mode
  const newDomainInput = document.getElementById('newDomain');
  if (newDomainInput) {
    newDomainInput.placeholder = filteringEnabled ?
      'Enter domain to exclude from filtering' :
      'Enter domain to include in filtering';
  }
}

export function updateElementGroups(elementGroups, disabledElementGroups, disabledElements) {
  const container = document.getElementById('elementGroups');
  if (!container) return;
  container.innerHTML = '';

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
    checkbox.onchange = async () => {
      await storage.toggleElementGroup(groupName);
      // Refresh the UI to reflect the changes
      const result = await storage.getStorageData(['elementGroups', 'disabledElementGroups', 'disabledElements']);
      updateElementGroups(result.elementGroups, result.disabledElementGroups, result.disabledElements);
    };

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
      elementCheckbox.onchange = () => storage.toggleElement(element);

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

export function updateKeywordGroups(groups, customKeywords, disabledGroups, disabledKeywords) {
  console.log('Updating keyword groups:', { groups, customKeywords, disabledGroups, disabledKeywords });

  const container = document.getElementById('keywordGroups');
  if (!container) {
    console.error('Keyword groups container not found');
    return;
  }
  container.innerHTML = '';

  const sortedGroupNames = Object.keys(groups).sort();
  console.log('Sorted group names:', sortedGroupNames);

  sortedGroupNames.forEach(groupName => {
    const keywords = groups[groupName];
    const group = document.createElement('div');
    group.className = 'keyword-group';

    const header = document.createElement('div');
    header.className = 'group-header';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !disabledGroups.includes(groupName);
    checkbox.onchange = async () => {
      await storage.toggleGroup(groupName);
      // Refresh the UI to reflect the changes
      const result = await storage.getStorageData(['keywordGroups', 'customKeywords', 'disabledGroups', 'disabledKeywords']);
      updateKeywordGroups(result.keywordGroups, result.customKeywords, result.disabledGroups, result.disabledKeywords);
    };

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
  if (customList) {
    customList.innerHTML = '';

    [...customKeywords].sort().forEach(keyword => {
      const item = createKeywordItem(keyword, !disabledKeywords.includes(keyword), true);
      customList.appendChild(item);
    });
  }
}

export function createKeywordItem(keyword, checked, isCustom = false) {
  const item = document.createElement('div');
  item.className = 'keyword-item';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.onchange = () => storage.toggleKeyword(keyword);

  const label = document.createElement('label');
  label.textContent = keyword;

  item.appendChild(checkbox);
  item.appendChild(label);

  if (isCustom) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.onclick = () => storage.removeCustomKeyword(keyword);
    item.appendChild(removeBtn);
  }

  return item;
}

export function updateFilteringModeText(enabled) {
  const modeText = document.querySelector('.mode-text');
  const modeDescription = document.querySelector('.mode-description');
  const keywordGroupsInfo = document.querySelector('#keywords .content-section:first-child .info');
  const urlGroupsInfo = document.querySelector('#domains .content-section:nth-child(2) .info');

  if (modeText) {
    modeText.textContent = enabled ? 'Filtering Enabled by Default' : 'Filtering Disabled by Default';
  }

  if (modeDescription) {
    modeDescription.innerHTML = enabled ?
      'When enabled by default: Content is filtered everywhere EXCEPT on listed URLs<br>' +
      'When disabled by default: Content is filtered ONLY on listed URLs' :
      'When disabled by default: Content is filtered ONLY on listed URLs<br>' +
      'When enabled by default: Content is filtered everywhere EXCEPT on listed URLs';
  }

  // Update Keyword Groups info text
  if (keywordGroupsInfo) {
    keywordGroupsInfo.innerHTML = 'Enable or disable entire groups or individual keywords. These keywords will be filtered from content across websites.';
  }

  // Update URL Groups info text based on filtering mode
  if (urlGroupsInfo) {
    if (enabled) {
      urlGroupsInfo.innerHTML = 'Add URLs that should be excluded from filtering. Use wildcards to match variations:<br>' +
        'gmail.com* (matches gmail.com and all its pages)<br>' +
        '*.google.com (matches all Google subdomains)<br>' +
        '*/messages (matches any site\'s message pages)';
    } else {
      urlGroupsInfo.innerHTML = 'Select which domains to apply filtering on. Common platforms are provided by default.<br>' +
        'You can also add custom URLs using wildcards:<br>' +
        'news.com* (matches news.com and all its pages)<br>' +
        '*.socialmedia.com (matches all subdomains)<br>' +
        '*/feed (matches any site\'s feed pages)';
    }
  }
}

export function showStatus(message, type = 'success') {
  const statusIndicator = document.getElementById('importStatus');
  if (!statusIndicator) return;

  statusIndicator.textContent = message;
  statusIndicator.className = `import-status ${type}`;
  statusIndicator.style.display = 'block';
  setTimeout(() => statusIndicator.style.display = 'none', 5000);
}
