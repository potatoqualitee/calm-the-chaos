// Function to escape special regex characters in keywords
export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Normalize typographic variants commonly found in headlines and social posts.
export function normalizeForMatching(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const WORD_CHARACTER = /[\p{L}\p{N}_]/u;
const FLEXIBLE_SUFFIXES = ['ing', 'ed', 'es', 's'];

function isWordCharacter(character) {
  return Boolean(character) && WORD_CHARACTER.test(character);
}

export class KeywordMatcher {
  constructor(keywords, matchingOption) {
    this.matchingOption = matchingOption === 'exact' ? 'exact' : 'flexible';
    this.entries = [...new Set(
      Array.from(keywords || []).map(normalizeForMatching).filter(Boolean)
    )]
      .map(keyword => ({
        keyword,
        searchValue: this.matchingOption === 'flexible'
          ? keyword.replace(/[\s-]+/g, ' ')
          : keyword,
        startsWithWord: isWordCharacter(keyword[0]),
        allowSuffix: this.matchingOption === 'flexible' &&
          keyword.length > 3 &&
          /[\p{L}]$/u.test(keyword)
      }))
      .sort((a, b) => b.searchValue.length - a.searchValue.length ||
        a.searchValue.localeCompare(b.searchValue));

    this.cacheKey = `${this.matchingOption}:${this.entries.map(entry => entry.keyword).join('\u0000')}`;
  }

  getMatchEnd(text, entry, start) {
    const end = start + entry.searchValue.length;
    if (!isWordCharacter(text[end])) return end;
    if (!entry.allowSuffix) return -1;

    for (const suffix of FLEXIBLE_SUFFIXES) {
      if (text.startsWith(suffix, end) && !isWordCharacter(text[end + suffix.length])) {
        return end + suffix.length;
      }
    }
    return -1;
  }

  findMatches(value) {
    return this.findMatchesNormalized(normalizeForMatching(value));
  }

  findMatchesNormalized(normalized) {
    const text = this.matchingOption === 'flexible'
      ? normalized.replace(/[\s-]+/g, ' ')
      : normalized;
    const matches = [];
    const occupiedRanges = [];

    for (const entry of this.entries) {
      let fromIndex = 0;
      let start;
      while ((start = text.indexOf(entry.searchValue, fromIndex)) !== -1) {
        fromIndex = start + Math.max(1, entry.searchValue.length);
        if (entry.startsWithWord && isWordCharacter(text[start - 1])) continue;

        const end = this.getMatchEnd(text, entry, start);
        if (end === -1) continue;
        if (occupiedRanges.some(range => start < range.end && end > range.start)) continue;

        occupiedRanges.push({ start, end });
        matches.push(entry.keyword);
      }
    }

    return matches;
  }

  test(value) {
    return this.findMatches(value).length > 0;
  }
}

// Kept under the existing API name for storage/configuration compatibility.
export function generateBlockedRegex(keywords, matchingOption) {
  const matcher = new KeywordMatcher(keywords, matchingOption);
  return matcher.entries.length > 0 ? matcher : null;
}
