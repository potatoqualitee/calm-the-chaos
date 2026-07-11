// regexManager.js
import { generateBlockedRegex } from '../../utils/regex.js';
import { getStorageData } from '../../utils/chromeStorage.js';

let BLOCKED_REGEX;

// Initialize the regex from storage using async/await
export async function initializeRegex() {
  try {
    const result = await getStorageData([
      'keywordGroups',
      'customKeywords',
      'retiredDefaultKeywords',
      'pinnedKeywords',
      'matchingOption',
      'disabledKeywords',
      'disabledGroups'
    ]);

    const keywordGroups = result.keywordGroups || {};
    const customKeywords = result.customKeywords || [];
    const retiredDefaultKeywords = result.retiredDefaultKeywords || [];
    const pinnedKeywords = result.pinnedKeywords || [];
    const matchingOption = result.hasOwnProperty('matchingOption') ? result.matchingOption : 'flexible';
    const disabledKeywords = result.disabledKeywords || [];
    const disabledGroups = result.disabledGroups || [];
    const allKeywords = new Set();
    const identity = value => String(value || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const disabledIdentities = new Set(disabledKeywords.map(identity));
    const addKeyword = keyword => {
      const normalized = identity(keyword);
      if (normalized && !disabledIdentities.has(normalized)) allKeywords.add(normalized);
    };

    // Add keywords from enabled groups only
    Object.entries(keywordGroups).forEach(([groupName, keywords]) => {
      if (!disabledGroups.includes(groupName)) {
        keywords.forEach(keyword => {
          addKeyword(keyword);
        });
      }
    });

    // Add enabled custom keywords
    customKeywords.forEach(keyword => {
      addKeyword(keyword);
    });

    // Retired defaults stay active only while the user reviews whether to
    // keep or remove them. They are not silently relabeled as user-authored.
    retiredDefaultKeywords.forEach(record => {
      const keyword = typeof record === 'string' ? record : record.keyword;
      if (keyword) addKeyword(keyword);
    });

    // Pins override a disabled group and keep explicit opt-ins active through
    // weight-zero priority changes. An explicit disabled keyword still wins.
    pinnedKeywords.forEach(addKeyword);

    // Use regex for exact or flexible matching
    BLOCKED_REGEX = allKeywords.size > 0 ? generateBlockedRegex(allKeywords, matchingOption) : null;
  } catch (error) {
    console.error('Error initializing regex:', error);
    throw error;
  }
}

export function getBlockedRegex() {
  return BLOCKED_REGEX;
}
