// Utility Functions

// Function to escape special regex characters in keywords
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Generate the regex pattern for keywords
function generateBlockedRegex(keywords, matchingOption) {
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
            // Allow for plural forms, initials with optional periods, and common suffixes
            keywordPattern = '\\b' + escapedKeyword + '(s|ed|ing)?[\\s\\.,;:!?]*\\b|\\b' + escapedKeyword.replace(/(\w)\./g, '$1\\.?') + '\\b';
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

// Wrapper for chrome API calls
function chromeStorageGet(keys, callback) {
  try {
    chrome.storage.local.get(keys, callback);
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
      console.debug('Extension context invalidated - reloading extension');
      return;
    }
    console.debug('Chrome storage get error:', error);
  }
}

function chromeRuntimeSendMessage(message) {
  try {
    chrome.runtime.sendMessage(message);
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
      console.debug('Extension context invalidated - reloading extension');
      return;
    }
    console.debug('Chrome runtime sendMessage error:', error);
  }
}

export { escapeRegExp, generateBlockedRegex, chromeStorageGet, chromeRuntimeSendMessage };
