// optionsStorage.js
import { DEFAULT_KEYWORD_GROUPS } from '../scripts/core/config/keywords.js';

const KEYWORD_STORAGE_KEYS = new Set([
  'keywordGroups', 'customKeywords', 'retiredDefaultKeywords',
  'pinnedKeywords', 'disabledKeywords', 'disabledGroups', 'matchingOption'
]);

const keywordIdentity = value => String(value || '')
  .normalize('NFKC')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const groupKeywordIdentities = groups => new Set(
  Object.values(groups || {})
    .flatMap(keywords => Array.isArray(keywords) ? keywords : [])
    .map(keywordIdentity)
    .filter(Boolean)
);

async function broadcastKeywordChanges() {
  if (!chrome.tabs?.query || !chrome.tabs?.sendMessage) return;
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(tabs
      .filter(tab => Number.isInteger(tab.id))
      .map(tab => chrome.tabs.sendMessage(tab.id, { type: 'updateKeywords' })));
  } catch (error) {
    console.debug('Unable to notify tabs about keyword changes:', error);
  }
}

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
    const keywordKeys = Object.keys(data).filter(key => KEYWORD_STORAGE_KEYS.has(key));
    const previous = keywordKeys.length > 0
      ? await chrome.storage.local.get(keywordKeys)
      : {};

    await chrome.storage.local.set(data);
    console.log('Storage data set successfully');

    const keywordStateChanged = keywordKeys.some(key =>
      JSON.stringify(previous[key]) !== JSON.stringify(data[key])
    );
    if (keywordStateChanged) await broadcastKeywordChanges();
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
  const result = await getStorageData([
    'disabledGroups', 'keywordGroups', 'keywordCatalogSnapshot',
    'disabledKeywords', 'pinnedKeywords'
  ]);
  let disabledGroups = result.disabledGroups || [];
  let disabledKeywords = result.disabledKeywords || [];
  let pinnedKeywords = result.pinnedKeywords || [];
  const keywordGroups = result.keywordGroups || DEFAULT_KEYWORD_GROUPS;
  const catalogGroups = result.keywordCatalogSnapshot || {};
  // Managed categories use the full snapshot so metadata-only pinned members
  // participate in whole-group intent. Distinct user groups fall back normally.
  const keywords = catalogGroups[groupName] || keywordGroups[groupName] || [];
  const groupIdentities = new Set(keywords.map(keywordIdentity));
  const isDisabling = !disabledGroups.includes(groupName);

  // Whole-group intent supersedes stale per-keyword pins in either direction.
  pinnedKeywords = pinnedKeywords.filter(keyword => !groupIdentities.has(keywordIdentity(keyword)));
  if (isDisabling) {
    if (!disabledGroups.includes(groupName)) disabledGroups.push(groupName);
    const disabledIdentities = new Set(disabledKeywords.map(keywordIdentity));
    for (const keyword of keywords) {
      if (!disabledIdentities.has(keywordIdentity(keyword))) disabledKeywords.push(keyword);
    }
  } else {
    disabledGroups = disabledGroups.filter(group => group !== groupName);
    disabledKeywords = disabledKeywords.filter(keyword =>
      !groupIdentities.has(keywordIdentity(keyword))
    );
  }

  disabledGroups.sort();
  disabledKeywords.sort();
  pinnedKeywords.sort();
  await setStorageData({ disabledGroups, disabledKeywords, pinnedKeywords });
}

export async function toggleKeyword(keyword) {
  console.log('Toggling keyword:', keyword);
  const result = await getStorageData([
    'disabledKeywords', 'keywordGroups', 'disabledGroups', 'pinnedKeywords',
    'keywordCatalogSnapshot', 'customKeywords', 'customKeywordMeta'
  ]);
  let disabledKeywords = result.disabledKeywords || [];
  let disabledGroups = result.disabledGroups || [];
  let pinnedKeywords = result.pinnedKeywords || [];
  const keywordGroups = result.keywordGroups || DEFAULT_KEYWORD_GROUPS;
  const identity = keywordIdentity(keyword);
  const bundledIdentities = groupKeywordIdentities(
    result.keywordCatalogSnapshot || DEFAULT_KEYWORD_GROUPS
  );
  const customOwned = (result.customKeywords || [])
    .some(value => keywordIdentity(value) === identity)
    || Boolean(result.customKeywordMeta?.[identity]);
  const isBundledDefault = bundledIdentities.has(identity) && !customOwned;

  let keywordGroup = null;
  for (const [groupName, keywords] of Object.entries(keywordGroups)) {
    if (keywords.some(value => keywordIdentity(value) === identity)) {
      keywordGroup = groupName;
      break;
    }
  }

  const isDisabled = disabledKeywords.some(value => keywordIdentity(value) === identity);
  if (isDisabled) {
    // Materialize every current member before releasing a disabled group. This
    // covers defaults added after the user originally disabled the group.
    if (keywordGroup && disabledGroups.includes(keywordGroup)) {
      const disabledIdentities = new Set(disabledKeywords.map(keywordIdentity));
      for (const groupKeyword of keywordGroups[keywordGroup] || []) {
        const groupIdentity = keywordIdentity(groupKeyword);
        if (!disabledIdentities.has(groupIdentity)) {
          disabledKeywords.push(groupKeyword);
          disabledIdentities.add(groupIdentity);
        }
      }
    }

    disabledKeywords = disabledKeywords.filter(value => keywordIdentity(value) !== identity);
    if (isBundledDefault) {
      if (!pinnedKeywords.some(value => keywordIdentity(value) === identity)) pinnedKeywords.push(keyword);
    } else {
      pinnedKeywords = pinnedKeywords.filter(value => keywordIdentity(value) !== identity);
    }

    // Once one member is explicitly enabled, individual disabledKeywords carry
    // the remaining group state; the coarse disabled-group switch must release.
    if (keywordGroup) disabledGroups = disabledGroups.filter(group => group !== keywordGroup);
  } else {
    if (!disabledKeywords.some(value => keywordIdentity(value) === identity)) {
      disabledKeywords.push(keyword);
    }
    pinnedKeywords = pinnedKeywords.filter(value => keywordIdentity(value) !== identity);

    if (keywordGroup) {
      const disabledIdentities = new Set(disabledKeywords.map(keywordIdentity));
      const groupKeywords = keywordGroups[keywordGroup] || [];
      if (groupKeywords.every(value => disabledIdentities.has(keywordIdentity(value)))
          && !disabledGroups.includes(keywordGroup)) {
        disabledGroups.push(keywordGroup);
      }
    }
  }

  disabledKeywords.sort();
  disabledGroups.sort();
  pinnedKeywords.sort();
  await setStorageData({ disabledKeywords, disabledGroups, pinnedKeywords });
}

export async function addCustomKeyword(keyword) {
  keyword = keyword.trim().toLowerCase();
  if (!keyword) return false;

  const result = await getStorageData(['customKeywords', 'customKeywordMeta']);
  const customKeywords = result.customKeywords || [];
  const customKeywordMeta = result.customKeywordMeta || {};

  if (!customKeywords.includes(keyword)) {
    customKeywords.push(keyword);
    customKeywords.sort();
    customKeywordMeta[keyword] = { origin: 'user' };
    await setStorageData({ customKeywords, customKeywordMeta });
    return true;
  }
  return false;
}

export async function removeCustomKeyword(keyword) {
  const result = await getStorageData([
    'customKeywords', 'customKeywordMeta', 'pinnedKeywords'
  ]);
  const identity = keywordIdentity(keyword);
  const customKeywords = (result.customKeywords || [])
    .filter(value => keywordIdentity(value) !== identity);
  const customKeywordMeta = result.customKeywordMeta || {};
  delete customKeywordMeta[identity];
  const pinnedKeywords = (result.pinnedKeywords || [])
    .filter(value => keywordIdentity(value) !== identity);
  customKeywords.sort();
  pinnedKeywords.sort();
  await setStorageData({ customKeywords, customKeywordMeta, pinnedKeywords });
}

export async function keepRetiredKeyword(keyword) {
  const result = await getStorageData([
    'retiredDefaultKeywords', 'customKeywords', 'customKeywordMeta', 'pinnedKeywords'
  ]);
  const identity = keywordIdentity(keyword);
  const records = result.retiredDefaultKeywords || [];
  const record = records.find(value =>
    keywordIdentity(typeof value === 'string' ? value : value.keyword) === identity
  );
  if (!record) return;

  const customKeywords = result.customKeywords || [];
  const alreadyCustom = customKeywords.some(value => keywordIdentity(value) === identity);
  if (!alreadyCustom) customKeywords.push(keyword);
  const customKeywordMeta = result.customKeywordMeta || {};
  if (!alreadyCustom || customKeywordMeta[identity]?.origin !== 'user') {
    customKeywordMeta[identity] = {
      origin: 'user-kept-retired',
      retiredIn: record.retiredIn || null,
      lifecycle: record.lifecycle || 'unknown',
      previousCategory: record.category || null,
      reason: record.reason || 'Removed from the curated catalog'
    };
  }
  // The Custom list now owns this mute. Remove any legacy catalog pin so
  // deleting the custom keyword later cannot leave an invisible active filter.
  const pinnedKeywords = (result.pinnedKeywords || [])
    .filter(value => keywordIdentity(value) !== identity);

  await setStorageData({
    retiredDefaultKeywords: records.filter(value =>
      keywordIdentity(typeof value === 'string' ? value : value.keyword) !== identity
    ),
    customKeywords: customKeywords.sort(),
    customKeywordMeta,
    pinnedKeywords: pinnedKeywords.sort()
  });
}

export async function removeRetiredKeyword(keyword) {
  const result = await getStorageData(['retiredDefaultKeywords']);
  const identity = keyword.toLowerCase();
  await setStorageData({
    retiredDefaultKeywords: (result.retiredDefaultKeywords || []).filter(value =>
      (typeof value === 'string' ? value : value.keyword).toLowerCase() !== identity
    )
  });
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

export async function setAutoUpdateNewDevelopments(enabled) {
  await setStorageData({ autoUpdateNewDevelopments: enabled });
}
