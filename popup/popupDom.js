// popupDom.js

export function updateVisibility(isEnabled) {
  const statsAndKeywords = document.getElementById('statsAndKeywords');
  if (statsAndKeywords) {
    statsAndKeywords.style.display = isEnabled ? 'block' : 'none';
  }
}

export function toTitleCase(str) {
  if (str.replace(/\s/g, '').length === 3) {
    return str.toUpperCase();
  }
  return str.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.substr(1).toLowerCase()
  ).join(' ');
}

export function updateStatsDisplay(pageStats, totalStats) {
  const statsElements = document.querySelectorAll('.stat-number');
  if (statsElements.length >= 2) {
    // Use the total occurrences count
    const totalOccurrences = pageStats.pageBlocked || 0;
    statsElements[0].textContent = `${totalOccurrences}`;
    statsElements[1].textContent = `${totalStats.totalBlocked}`;

    // Update badge text to match
    chrome.action.setBadgeText({
      text: totalOccurrences > 0 ? totalOccurrences.toString() : ''
    });
  }
}

export function updateKeywordDisplay(keywordCounts, keywordsTitleElement, blockedKeywordsElement, toTitleCase) {
  const sortedKeywords = Object.entries(keywordCounts).sort(([a], [b]) => a.localeCompare(b));
  keywordsTitleElement.style.display = sortedKeywords.length > 0 ? 'block' : 'none';

  // Calculate total occurrences for verification
  const totalOccurrences = sortedKeywords.reduce((sum, [_, count]) => sum + count, 0);

  blockedKeywordsElement.innerHTML = sortedKeywords
    .map(([keyword, count]) => `
      <span class="keyword-pill">
        ${toTitleCase(keyword)}
        <span class="keyword-count">${count}</span>
      </span>
    `)
    .join('');

  // Update the stats display with the total occurrences
  const statsElements = document.querySelectorAll('.stat-number');
  if (statsElements.length >= 1) {
    statsElements[0].textContent = `${totalOccurrences}`;
    // Update badge to match
    chrome.action.setBadgeText({
      text: totalOccurrences > 0 ? totalOccurrences.toString() : ''
    });
  }
}
