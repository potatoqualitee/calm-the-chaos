// optionsUI.js
import { PRECONFIGURED_DOMAINS } from '../scripts/core/config/preconfiguredDomains.js';
import * as storage from './optionsStorage.js';

// New function to update stats table
export async function updateStats() {
  console.log('Updating stats...');
  const statsContainer = document.getElementById('keywordStats');
  if (!statsContainer) {
    console.error('Stats container not found');
    return;
  }

  // Get all-time keyword stats
  const allStorage = await chrome.storage.local.get('allTimeKeywordStats');
  console.log('Retrieved stats from storage:', allStorage);
  const keywordStats = allStorage.allTimeKeywordStats || {};
  console.log('Keyword stats:', keywordStats);

  // Convert to array and sort by count
  const sortedStats = Object.entries(keywordStats)
    .sort((a, b) => b[1] - a[1]);
  console.log('Sorted stats:', sortedStats);

  console.log('Creating stats grid...');
  // Create grid container
  const grid = document.createElement('div');
  grid.className = 'stats-table';

  // Add stat items
  sortedStats.forEach(([keyword, count]) => {
    console.log(`Adding stat item: ${keyword} (${count})`);
    const statItem = document.createElement('div');
    statItem.className = 'stat-item';

    const keywordSpan = document.createElement('span');
    keywordSpan.className = 'keyword';
    keywordSpan.textContent = keyword;

    const countSpan = document.createElement('span');
    countSpan.className = 'count';
    countSpan.textContent = count;

    statItem.appendChild(keywordSpan);
    statItem.appendChild(countSpan);
    grid.appendChild(statItem);
  });

  // If no stats, show message
  if (sortedStats.length === 0) {
    console.log('No stats available, showing empty state');
    // The empty state message will be handled by CSS :empty pseudo-class
    statsContainer.innerHTML = '';
    statsContainer.appendChild(document.createElement('div'));
  } else {
    console.log(`Displaying ${sortedStats.length} stat items`);
    statsContainer.innerHTML = '';
    statsContainer.appendChild(grid);
  }
}

export function updateConfigUrls(configUrls) {
  const configUrlsList = document.getElementById('configUrls');
  if (!configUrlsList) return;
  configUrlsList.innerHTML = '';

  configUrls.forEach(url => {
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
    // Convert group name to URL-friendly ID
    const groupId = groupName
      .replace(/[^a-zA-Z0-9\s-()]/g, '') // Remove special characters except spaces, hyphens, and parentheses
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/\(|\)/g, '') // Remove parentheses
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .trim(); // Remove leading/trailing spaces

    const group = document.createElement('div');
    group.className = 'keyword-group';
    group.id = groupId;

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
