// Function to escape special regex characters in keywords
export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Generate the regex pattern for keywords
export function generateBlockedRegex(keywords, matchingOption) {
  return new RegExp(
    '(?:' +
    Array.from(keywords)
      .map(keyword => {
        const escapedKeyword = escapeRegExp(keyword.trim());
        let keywordPattern;

        if (matchingOption === 'exact') {
          // Exact matching with word boundaries
          keywordPattern = '\\b' + escapedKeyword + '\\b';
        } else if (matchingOption === 'flexible') {
          // "Flexible" matching allowing suffixes, handling punctuation, and common variations
          if (escapedKeyword.length > 3) {
            // Allow for plural forms, possessives, initials with optional periods, and common suffixes
            keywordPattern = '\\b' + escapedKeyword + '(s|ed|ing)?[\\s\\.,;:!?\']*s?\\b|\\b' + escapedKeyword.replace(/(\w)\./g, '$1\\.?') + '\\b';
          } else {
            keywordPattern = '\\b' + escapedKeyword + '\\b';
          }
        } else {
          // Default to current behavior (flexible)
          keywordPattern = '\\b' + escapedKeyword + '\\b';
        }

        return keywordPattern;
      })
      .join('|') +
    ')',
    'i'
  );
}
