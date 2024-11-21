// Import keyword data from JSON files
import keywordGroups from '../../../keywords/keyword-groups.json';
import linkedinExceptions from '../../../keywords/linkedin-exceptions.json';

// Export the imported data with the same names as before
export const DEFAULT_KEYWORD_GROUPS = keywordGroups;
export const LINKEDIN_EXCEPTIONS = linkedinExceptions;

// Function to determine matching option based on keyword length
export function getMatchingOption(keyword) {
  return keyword.length <= 3 ? 'exact' : 'flexible';
}
