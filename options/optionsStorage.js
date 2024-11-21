// optionsStorage.js
import { DEFAULT_KEYWORD_GROUPS } from '../scripts/core/config/keywords.js';

export async function getStorageData(keys) {
  try {
    console.debug('Getting storage data for keys:', keys);
    const result = await chrome.storage.local.get(keys);
    console.debug('Storage data result:', result);

    // Initialize keywordGroups with default values if not present
    if (keys.includes('keywordGroups') && !result.keywordGroups) {
      result.keywordGroups = DEFAULT_KEYWORD_GROUPS;
      await setStorageData({ keywordGroups: DEFAULT_KEYWORD_GROUPS });
      console.log('Initialized keywordGroups with defaults:', DEFAULT_KEYWORD_GROUPS);
    }

    return result;
  } catch (error) {
    console.error('Error getting storage data:', error);
    return {};
  }
}

export async function setStorageData(data) {
  try {
    console.log('Setting storage data:', data);
    await chrome.storage.local.set(data);
    console.log('Storage data set successfully');
  } catch (error) {
    console.error('Error setting storage data:', error);
  }
}

export async function addConfigUrl(url) {
  url = url.trim();
  if (!url) return false;

  const result = await getStorageData(['configUrls']);
  const configUrls = result.configUrls || [];

  if (!configUrls.includes(url)) {
    configUrls.push(url);
    configUrls.sort();
    await setStorageData({ configUrls });
    return true;
  }
  return false;
}

export async function removeConfigUrl(url) {
  console.log('Removing config URL:', url);
  const result = await getStorageData(['configUrls']);
  let configUrls = result.configUrls || [];

  configUrls = configUrls.filter(u => u !== url);
  configUrls.sort();
  await setStorageData({ configUrls });
}

export async function addDomain(domain) {
  domain = domain.trim().toLowerCase();
  if (!domain) return;

  const result = await getStorageData(['ignoredDomains', 'filteringEnabled', 'enabledDomains', 'customDomains']);
  const filteringEnabled = result.filteringEnabled;
  const ignoredDomains = result.ignoredDomains || {};
  let enabledDomains = result.enabledDomains || [];
  let customDomains = result.customDomains || [];

  // Always add to customDomains list for UI tracking
  if (!customDomains.includes(domain)) {
    customDomains.push(domain);
    customDomains.sort();
  }

  if (filteringEnabled) {
    // When filtering is enabled by default, add to excluded domains
    if (!ignoredDomains['Other']) {
      ignoredDomains['Other'] = [];
    }

    if (!ignoredDomains['Other'].includes(domain)) {
      ignoredDomains['Other'].push(domain);
      ignoredDomains['Other'].sort();
      await setStorageData({ ignoredDomains, customDomains });
      return true;
    }
  } else {
    // When filtering is disabled by default, add to enabled domains
    if (!enabledDomains.includes(domain)) {
      enabledDomains.push(domain);
      enabledDomains.sort();
      await setStorageData({ enabledDomains, customDomains });
      return true;
    }
  }
  return false;
}

export async function removeDomain(domain) {
  const result = await getStorageData(['ignoredDomains', 'filteringEnabled', 'enabledDomains', 'customDomains']);
  const filteringEnabled = result.filteringEnabled;
  const ignoredDomains = result.ignoredDomains || {};
  let enabledDomains = result.enabledDomains || [];
  let customDomains = result.customDomains || [];

  // Remove from customDomains list
  customDomains = customDomains.filter(d => d !== domain);

  if (filteringEnabled) {
    // Remove from excluded domains when filtering is enabled
    if (ignoredDomains['Other']) {
      ignoredDomains['Other'] = ignoredDomains['Other'].filter(d => d !== domain);
      if (ignoredDomains['Other'].length === 0) {
        delete ignoredDomains['Other'];
      }
      await setStorageData({ ignoredDomains, customDomains });
      return true;
    }
  } else {
    // Remove from enabled domains when filtering is disabled
    enabledDomains = enabledDomains.filter(d => d !== domain);
    await setStorageData({ enabledDomains, customDomains });
    return true;
  }
  return false;
}

export async function toggleDomain(domain) {
  const result = await getStorageData(['disabledDomains', 'ignoredDomains']);
  let disabledDomains = result.disabledDomains || [];
  let ignoredDomains = result.ignoredDomains || {};

  if (!ignoredDomains['Other']) {
    ignoredDomains['Other'] = [];
  }

  if (disabledDomains.includes(domain)) {
    // Re-enable the domain
    disabledDomains = disabledDomains.filter(d => d !== domain);
    ignoredDomains['Other'] = ignoredDomains['Other'].filter(d => d !== domain);
  } else {
    // Disable the domain
    disabledDomains.push(domain);
    if (!ignoredDomains['Other'].includes(domain)) {
      ignoredDomains['Other'].push(domain);
    }
  }

  disabledDomains.sort();
  ignoredDomains['Other'].sort();

  if (ignoredDomains['Other'].length === 0) {
    delete ignoredDomains['Other'];
  }

  await setStorageData({ disabledDomains, ignoredDomains });
}

export async function toggleDomainGroup(groupName) {
  const result = await getStorageData(['disabledDomainGroups', 'ignoredDomains']);
  let disabledDomainGroups = result.disabledDomainGroups || [];
  let ignoredDomains = result.ignoredDomains || {};

  if (disabledDomainGroups.includes(groupName)) {
    // Re-enable the domain group
    disabledDomainGroups = disabledDomainGroups.filter(g => g !== groupName);
  } else {
    // Disable the domain group
    disabledDomainGroups.push(groupName);
  }

  disabledDomainGroups.sort();
  await setStorageData({ disabledDomainGroups });
}

export async function toggleElementGroup(groupName) {
  console.log('Toggling element group:', groupName);
  const result = await getStorageData(['disabledElementGroups', 'elementGroups', 'disabledElements']);
  let disabledElementGroups = result.disabledElementGroups || [];
  let disabledElements = result.disabledElements || [];
  const elementGroups = result.elementGroups || {};

  const elements = elementGroups[groupName] || [];
  const isDisabling = !disabledElementGroups.includes(groupName);

  if (isDisabling) {
    // Disable the group and all its elements
    disabledElementGroups.push(groupName);
    elements.forEach(element => {
      if (!disabledElements.includes(element)) {
        disabledElements.push(element);
      }
    });
  } else {
    // Enable the group and all its elements
    disabledElementGroups = disabledElementGroups.filter(g => g !== groupName);
    disabledElements = disabledElements.filter(e => !elements.includes(e));
  }

  disabledElementGroups.sort();
  disabledElements.sort();

  await setStorageData({ disabledElementGroups, disabledElements });
}

export async function toggleElement(element) {
  console.log('Toggling element:', element);
  const result = await getStorageData(['disabledElements', 'elementGroups', 'disabledElementGroups']);
  let disabledElements = result.disabledElements || [];
  let disabledElementGroups = result.disabledElementGroups || [];
  const elementGroups = result.elementGroups || {};

  // Find which group this element belongs to
  let elementGroup = null;
  for (const [groupName, elements] of Object.entries(elementGroups)) {
    if (elements.includes(element)) {
      elementGroup = groupName;
      break;
    }
  }

  if (disabledElements.includes(element)) {
    // Enable the element
    disabledElements = disabledElements.filter(e => e !== element);

    // Check if all elements in the group are now enabled
    if (elementGroup) {
      const groupElements = elementGroups[elementGroup] || [];
      const allEnabled = groupElements.every(e => !disabledElements.includes(e));
      if (allEnabled) {
        disabledElementGroups = disabledElementGroups.filter(g => g !== elementGroup);
      }
    }
  } else {
    // Disable the element
    disabledElements.push(element);

    // Check if all elements in the group are now disabled
    if (elementGroup) {
      const groupElements = elementGroups[elementGroup] || [];
      const allDisabled = groupElements.every(e => disabledElements.includes(e));
      if (allDisabled && !disabledElementGroups.includes(elementGroup)) {
        disabledElementGroups.push(elementGroup);
      }
    }
  }

  disabledElements.sort();
  disabledElementGroups.sort();

  await setStorageData({ disabledElements, disabledElementGroups });
}

export async function toggleGroup(groupName) {
  console.log('Toggling group:', groupName);
  const result = await getStorageData(['disabledGroups', 'keywordGroups', 'disabledKeywords']);
  let disabledGroups = result.disabledGroups || [];
  let disabledKeywords = result.disabledKeywords || [];
  const keywordGroups = result.keywordGroups || DEFAULT_KEYWORD_GROUPS;

  const keywords = keywordGroups[groupName] || [];
  const isDisabling = !disabledGroups.includes(groupName);

  if (isDisabling) {
    // Disable the group and all its keywords
    disabledGroups.push(groupName);
    keywords.forEach(keyword => {
      if (!disabledKeywords.includes(keyword)) {
        disabledKeywords.push(keyword);
      }
    });
  } else {
    // Enable the group and all its keywords
    disabledGroups = disabledGroups.filter(g => g !== groupName);
    disabledKeywords = disabledKeywords.filter(k => !keywords.includes(k));
  }

  disabledGroups.sort();
  disabledKeywords.sort();

  await setStorageData({ disabledGroups, disabledKeywords });
}

export async function toggleKeyword(keyword) {
  console.log('Toggling keyword:', keyword);
  const result = await getStorageData(['disabledKeywords', 'keywordGroups', 'disabledGroups']);
  let disabledKeywords = result.disabledKeywords || [];
  let disabledGroups = result.disabledGroups || [];
  const keywordGroups = result.keywordGroups || DEFAULT_KEYWORD_GROUPS;

  // Find which group this keyword belongs to
  let keywordGroup = null;
  for (const [groupName, keywords] of Object.entries(keywordGroups)) {
    if (keywords.includes(keyword)) {
      keywordGroup = groupName;
      break;
    }
  }

  if (disabledKeywords.includes(keyword)) {
    // Enable the keyword
    disabledKeywords = disabledKeywords.filter(k => k !== keyword);

    // Check if all keywords in the group are now enabled
    if (keywordGroup) {
      const groupKeywords = keywordGroups[keywordGroup] || [];
      const allEnabled = groupKeywords.every(k => !disabledKeywords.includes(k));
      if (allEnabled) {
        disabledGroups = disabledGroups.filter(g => g !== keywordGroup);
      }
    }
  } else {
    // Disable the keyword
    disabledKeywords.push(keyword);

    // Check if all keywords in the group are now disabled
    if (keywordGroup) {
      const groupKeywords = keywordGroups[keywordGroup] || [];
      const allDisabled = groupKeywords.every(k => disabledKeywords.includes(k));
      if (allDisabled && !disabledGroups.includes(keywordGroup)) {
        disabledGroups.push(keywordGroup);
      }
    }
  }

  disabledKeywords.sort();
  disabledGroups.sort();

  await setStorageData({ disabledKeywords, disabledGroups });
}

export async function addCustomKeyword(keyword) {
  keyword = keyword.trim().toLowerCase();
  if (!keyword) return false;

  const result = await getStorageData(['customKeywords']);
  const customKeywords = result.customKeywords || [];

  if (!customKeywords.includes(keyword)) {
    customKeywords.push(keyword);
    customKeywords.sort();
    await setStorageData({ customKeywords });
    return true;
  }
  return false;
}

export async function removeCustomKeyword(keyword) {
  console.log('Removing custom keyword:', keyword);
  const result = await getStorageData(['customKeywords']);
  let customKeywords = result.customKeywords || [];

  customKeywords = customKeywords.filter(k => k !== keyword);
  customKeywords.sort();
  await setStorageData({ customKeywords });
}

export async function updateMatchingOption(matchingOption) {
  await setStorageData({ matchingOption });
}

export async function setFilteringEnabled(enabled) {
  await setStorageData({ filteringEnabled: enabled });
}

export async function setCheckForUpdates(enabled) {
  await setStorageData({ checkForUpdates: enabled });
}

export async function setCollapseStyle(style) {
  await setStorageData({ collapseStyle: style });
}

export async function setFilterRedditCommentThreads(enabled) {
  await setStorageData({ filterRedditCommentThreads: enabled });
}

export async function setFilterFacebookCommentThreads(enabled) {
  await setStorageData({ filterFacebookCommentThreads: enabled });
}
