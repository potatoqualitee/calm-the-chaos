import { getEnabledCategoryKeywords } from './keywordMetadata.js';

// Import all JSON files from the categories directory
function importAll(r) {
  const files = {};
  r.keys().forEach(key => {
    files[key] = r(key);
  });
  return files;
}

// Get all category files
const categoryFiles = importAll(require.context('../../../keywords/categories/', true, /\.json$/));

// Convert each file from new format to old format and combine
const combinedKeywords = Object.values(categoryFiles).reduce((acc, categoryData) => {
  const categoryName = Object.keys(categoryData)[0];
  acc[categoryName] = getEnabledCategoryKeywords(categoryData[categoryName]);
  return acc;
}, {});

export const DEFAULT_KEYWORD_GROUPS = combinedKeywords;

export function getMatchingOption(keyword) {
  return keyword.length <= 3 ? 'exact' : 'flexible';
}
