import { generateBlockedRegex, chromeStorageGet } from './utils.js';

let BLOCKED_REGEX;

// Initialize the regex from storage
function initializeRegex(callback) {
  chromeStorageGet(['keywordGroups', 'customKeywords', 'matchingOption', 'disabledKeywords', 'disabledGroups'], function(result) {
    try {
      const keywordGroups = result.keywordGroups || {};
      const customKeywords = result.customKeywords || [];
      const matchingOption = result.hasOwnProperty('matchingOption') ? result.matchingOption : 'flexible'; // Only set to flexible if not explicitly saved
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

      if (callback) callback();
    } catch (error) {
      console.debug('Error initializing regex:', error);
    }
  });
}

function getBlockedRegex() {
  return BLOCKED_REGEX;
}

export { initializeRegex, getBlockedRegex };
