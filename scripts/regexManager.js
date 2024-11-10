import { generateBlockedRegex, chromeStorageGet } from './utils.js';
import FuzzySet from 'fuzzyset.js';

let BLOCKED_REGEX;
let fuzzySet;

// Initialize the regex from storage
function initializeRegex(callback) {
  chromeStorageGet(['keywordGroups', 'customKeywords', 'matchingOption', 'disabledKeywords', 'disabledGroups'], function(result) {
    try {
      const keywordGroups = result.keywordGroups || {};
      const customKeywords = result.customKeywords || [];
      const matchingOption = result.matchingOption || 'flexible'; // Default to flexible if not set
      const disabledKeywords = result.disabledKeywords || [];
      const disabledGroups = result.disabledGroups || [];
      const allKeywords = new Set();

      // Add keywords from enabled groups only
      Object.entries(keywordGroups).forEach(([groupName, keywords]) => {
        if (!disabledGroups.includes(groupName)) {
          keywords.forEach(keyword => {
            if (!disabledKeywords.includes(keyword)) {
              allKeywords.add(keyword.toLowerCase());
            }
          });
        }
      });

      // Add enabled custom keywords
      customKeywords.forEach(keyword => {
        if (!disabledKeywords.includes(keyword)) {
          allKeywords.add(keyword.toLowerCase());
        }
      });

      if (matchingOption === 'fuzzy') {
        // Initialize FuzzySet for fuzzy matching
        fuzzySet = FuzzySet(Array.from(allKeywords));
      } else {
        // Use regex for exact or flexible matching
        BLOCKED_REGEX = allKeywords.size > 0 ? generateBlockedRegex(allKeywords, matchingOption) : null;
      }

      if (callback) callback();
    } catch (error) {
      console.debug('Error initializing regex:', error);
    }
  });
}

function getBlockedRegex() {
  return BLOCKED_REGEX;
}

function getFuzzySet() {
  return fuzzySet;
}

export { initializeRegex, getBlockedRegex, getFuzzySet };
