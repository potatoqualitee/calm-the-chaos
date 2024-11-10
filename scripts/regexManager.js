import { generateBlockedRegex, chromeStorageGet } from './utils.js';
import FuzzySet from 'fuzzyset.js';

let BLOCKED_REGEX;
let fuzzySet;

// Initialize the regex from storage
function initializeRegex(callback) {
  chromeStorageGet(['keywordGroups', 'customKeywords', 'matchingOption'], function(result) {
    try {
      const keywordGroups = result.keywordGroups || {};
      const customKeywords = result.customKeywords || [];
      const matchingOption = result.matchingOption || 'flexible'; // Default to flexible if not set
      const allKeywords = new Set();

      // Flatten all keywords from all groups and add custom keywords
      Object.values(keywordGroups).forEach(group => {
        group.forEach(keyword => allKeywords.add(keyword.toLowerCase()));
      });
      customKeywords.forEach(keyword => allKeywords.add(keyword.toLowerCase()));

      if (matchingOption === 'fuzzy') {
        // Initialize FuzzySet for fuzzy matching
        fuzzySet = FuzzySet(Array.from(allKeywords));
      } else {
        // Use regex for exact or flexible matching
        BLOCKED_REGEX = generateBlockedRegex(allKeywords, matchingOption);
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
