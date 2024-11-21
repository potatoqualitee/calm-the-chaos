// regexManager.js
import { generateBlockedRegex } from '../../utils/regex.js';
import { getStorageData } from '../../../options/optionsStorage.js';

let BLOCKED_REGEX;

// Initialize the regex from storage using async/await
export async function initializeRegex() {
  try {
    const result = await getStorageData([
      'keywordGroups',
      'customKeywords',
      'matchingOption',
      'disabledKeywords',
      'disabledGroups'
    ]);

    const keywordGroups = result.keywordGroups || {};
    const customKeywords = result.customKeywords || [];
    const matchingOption = result.hasOwnProperty('matchingOption') ? result.matchingOption : 'flexible';
    const disabledKeywords = result.disabledKeywords || [];
    const disabledGroups = result.disabledGroups || [];
    const allKeywords = new Set();

    // Add keywords from enabled groups only
    Object.entries(keywordGroups).forEach(([groupName, keywords]) => {
      if (!disabledGroups.includes(groupName)) {
        keywords.forEach(keyword => {
          if (!disabledKeywords.includes(keyword)) {
            allKeywords.add(keyword.toLowerCase().trim());
          }
        });
      }
    });

    // Add enabled custom keywords
    customKeywords.forEach(keyword => {
      if (!disabledKeywords.includes(keyword)) {
        allKeywords.add(keyword.toLowerCase().trim());
      }
    });

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
