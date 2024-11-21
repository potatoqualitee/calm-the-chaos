// popupHelpers.js

export function toTitleCase(str) {
  if (str.replace(/\s/g, '').length === 3) {
    return str.toUpperCase();
  }
  return str.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.substr(1).toLowerCase()
  ).join(' ');
}

export function updateVisibility(isEnabled) {
  const statsAndKeywords = document.getElementById('statsAndKeywords');
  if (statsAndKeywords) {
    statsAndKeywords.style.display = isEnabled ? 'block' : 'none';
  }
}

// Helper function to check if a URL matches any patterns
export function urlMatchesPatterns(url, patterns) {
  const urlObj = new URL(url);
  const domain = urlObj.hostname;
  const path = urlObj.pathname;

  return patterns.some(pattern => {
    // Handle path patterns (starting with /)
    if (pattern.startsWith('/')) {
      const pathPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      return new RegExp(`^${pathPattern}`, 'i').test(path);
    }
    // Handle .domain.com patterns - match both exact and subdomains
    if (pattern.startsWith('.')) {
      const baseDomain = pattern.substring(1);
      return domain === baseDomain || domain.endsWith(pattern);
    }
    // Handle prefix patterns ending with . (e.g., 'mail.')
    if (pattern.endsWith('.')) {
      return domain.startsWith(pattern);
    }
    // Handle patterns with * wildcards
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      return new RegExp(`^${regexPattern}$`, 'i').test(domain);
    }
    // Handle exact matches
    return domain === pattern;
  });
}

// Function to get all ignored domain patterns
export function getIgnoredDomainsPatterns(ignoredDomains, disabledDomainGroups) {
  const patterns = [];
  Object.entries(ignoredDomains).forEach(([groupName, domains]) => {
    if (!disabledDomainGroups.includes(groupName)) {
      patterns.push(...domains);
    }
  });
  return patterns;
}

// Function to determine if the extension is enabled on the URL
export function isExtensionEnabledOnUrl(url, ignoredDomains, disabledDomainGroups, filteringEnabled) {
  // First check for non-http/https URLs
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return false;
  }

  const ignoredDomainsPatterns = getIgnoredDomainsPatterns(ignoredDomains, disabledDomainGroups);
  const matches = urlMatchesPatterns(url, ignoredDomainsPatterns);

  // If filtering is enabled globally:
  //   - matches = true means URL is in ignored list, so DON'T filter (return false)
  //   - matches = false means URL is not in ignored list, so DO filter (return true)
  // If filtering is disabled globally:
  //   - matches = true means URL is in ignored list, so DON'T filter (return false)
  //   - matches = false means URL is not in ignored list, so DON'T filter (return false)
  return filteringEnabled ? !matches : false;
}

export function normalizeKeyword(keyword) {
  return keyword.toLowerCase().replace(/^[\s.,:;!?]+|[\s.,:;!?]+$/g, '').trim();
}

export async function fetchBlockedKeywords(tabId, toTitleCase) {
  const result = await chrome.storage.local.get([
    `blockedKeywords_${tabId}`,
    'originalKeywords',
    `pageStats_${tabId}`,
    'stats'
  ]);

  const blockedKeywords = result[`blockedKeywords_${tabId}`] || [];
  const originalKeywords = result.originalKeywords || {};
  const pageStats = result[`pageStats_${tabId}`] || { pageBlocked: 0, pageTotal: 0 };
  const stats = result.stats || { totalBlocked: 0, totalScanned: 0 };

  const statsElements = document.querySelectorAll('.stat-number');
  if (statsElements.length >= 2) {
    statsElements[0].textContent = `${pageStats.pageBlocked}`;
    statsElements[1].textContent = `${stats.totalBlocked}`;
  }

  const blockedKeywordsElement = document.getElementById('blockedKeywords');
  const keywordsTitleElement = document.querySelector('.keywords-title');

  if (blockedKeywordsElement && keywordsTitleElement) {
    const keywordCounts = blockedKeywords.reduce((acc, keyword) => {
      const normalizedKeyword = normalizeKeyword(keyword);
      const displayKeyword = originalKeywords[normalizedKeyword] || normalizedKeyword;
      acc[displayKeyword] = (acc[displayKeyword] || 0) + 1;
      return acc;
    }, {});

    const sortedKeywords = Object.entries(keywordCounts).sort(([a], [b]) => a.localeCompare(b));
    keywordsTitleElement.style.display = sortedKeywords.length > 0 ? 'block' : 'none';

    blockedKeywordsElement.innerHTML = sortedKeywords
      .map(([keyword, count]) => `
        <span class="keyword-pill">
          ${toTitleCase(keyword)}
          <span class="keyword-count">${count}</span>
        </span>
      `)
      .join('');
  }
}
