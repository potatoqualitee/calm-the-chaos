// contentMatcher.js

import { getBlockedRegex } from '../managers/regexManager.js';
import { LINKEDIN_EXCEPTIONS } from '../config/linkedinExceptions.js';
import { normalizeForMatching } from '../../utils/regex.js';
import { normalizeKeyword } from '../../utils/keywordNormalization.js';

const MAX_CACHE_ENTRIES = 5000;
const MAX_CACHE_TEXT_LENGTH = 4000;
const STATS_FLUSH_DELAY = 500;

class ContentMatcher {
    constructor() {
        this.regex = null;
        this.regexPattern = null;
        this.matchCache = new Map();
        this.isLinkedIn = typeof window !== 'undefined' && window.location.hostname.includes('linkedin.com');
        this.linkedinExceptions = new Set(LINKEDIN_EXCEPTIONS.map(normalizeForMatching));
        this.pendingStats = new Map();
        this.statsFlushTimer = null;
        this.statsWriteInProgress = false;
    }

    /**
     * Initialize or update the regex pattern
     * @returns {RegExp|null} - Compiled regex or null if no pattern available
     */
    initializeRegex() {
        const pattern = getBlockedRegex();
        if (!pattern) {
            if (this.regexPattern !== null) {
                this.matchCache.clear();
            }
            this.regex = null;
            this.regexPattern = null;
            return null;
        }

        const isKeywordMatcher = typeof pattern.findMatches === 'function';
        const source = pattern instanceof RegExp ? pattern.source : String(pattern);
        const sourceFlags = pattern instanceof RegExp ? pattern.flags : 'iu';
        const flags = [...new Set(`${sourceFlags.replace(/g/g, '')}g`.split(''))].join('');
        const patternKey = isKeywordMatcher ? pattern.cacheKey : `${source}/${flags}`;

        // Cache entries are valid only for the exact matcher configuration.
        if (patternKey !== this.regexPattern) {
            this.regex = isKeywordMatcher ? pattern : new RegExp(source, flags);
            this.regexPattern = patternKey;
            this.matchCache.clear();
        }

        return this.regex;
    }

    getCachedResult(key) {
        if (!this.matchCache.has(key)) return null;

        const result = this.matchCache.get(key);
        // Refresh insertion order to make the bounded Map an LRU cache.
        this.matchCache.delete(key);
        this.matchCache.set(key, result);
        return result;
    }

    cacheResult(key, result) {
        if (key.length > MAX_CACHE_TEXT_LENGTH) return;

        this.matchCache.set(key, result);
        while (this.matchCache.size > MAX_CACHE_ENTRIES) {
            this.matchCache.delete(this.matchCache.keys().next().value);
        }
    }

    /**
     * Check if match is in exceptions list
     */
    isExceptionMatch(match) {
        const normalizedMatch = normalizeForMatching(match);
        if (this.linkedinExceptions.has(normalizedMatch)) return true;

        return [...this.linkedinExceptions].some(exception =>
            normalizedMatch === `${exception}s` ||
            normalizedMatch === `${exception}es` ||
            normalizedMatch === `${exception}ed` ||
            normalizedMatch === `${exception}ing` ||
            normalizedMatch === `${exception}'s`
        );
    }

    /**
     * Update stats for matched keywords
     * @param {string[]} matches - Array of matched keywords
     * @private
     */
    updateStats(matches) {
        if (matches.length === 0) return;

        matches.forEach(match => {
            const normalized = normalizeKeyword(match);
            if (normalized) {
                this.pendingStats.set(normalized, (this.pendingStats.get(normalized) || 0) + 1);
            }
        });

        this.scheduleStatsFlush();
    }

    scheduleStatsFlush() {
        if (this.statsFlushTimer || this.statsWriteInProgress || this.pendingStats.size === 0) {
            return;
        }

        this.statsFlushTimer = setTimeout(() => {
            this.statsFlushTimer = null;
            this.flushStats();
        }, STATS_FLUSH_DELAY);
    }

    flushStats() {
        if (this.statsWriteInProgress || this.pendingStats.size === 0) return;
        if (typeof chrome === 'undefined' || !chrome.storage?.local) {
            this.pendingStats.clear();
            return;
        }

        const batch = new Map(this.pendingStats);
        this.pendingStats.clear();
        this.statsWriteInProgress = true;

        const finish = () => {
            this.statsWriteInProgress = false;
            this.scheduleStatsFlush();
        };

        try {
            chrome.storage.local.get('allTimeKeywordStats', (storage) => {
                const normalizedStats = {};

                Object.entries(storage.allTimeKeywordStats || {}).forEach(([key, count]) => {
                    const normalized = normalizeKeyword(key);
                    if (normalized) {
                        normalizedStats[normalized] = (normalizedStats[normalized] || 0) + Number(count || 0);
                    }
                });

                batch.forEach((count, keyword) => {
                    normalizedStats[keyword] = (normalizedStats[keyword] || 0) + count;
                });

                const finalStats = {};
                Object.entries(normalizedStats).forEach(([key, count]) => {
                    const displayKey = key.length <= 3
                        ? key.toUpperCase()
                        : key.split(' ').map(word =>
                            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                        ).join(' ');
                    finalStats[displayKey] = count;
                });

                chrome.storage.local.set({ allTimeKeywordStats: finalStats }, finish);
            });
        } catch (error) {
            console.debug('Error updating keyword stats:', error);
            batch.forEach((count, keyword) => {
                this.pendingStats.set(keyword, (this.pendingStats.get(keyword) || 0) + count);
            });
            finish();
        }
    }

    /**
     * Check if text contains blocked content
     * @param {string} text - Text to check
     * @param {boolean} isSpeedReader - Whether SpeedReader is active
     * @returns {string[]} - Array of matched blocked content
     */
    containsBlockedContent(text, isSpeedReader) {
        try {
            // Skip filtering for LinkedIn profile pages and SpeedReader
            const isLinkedInProfile = this.isLinkedIn && window.location.pathname.startsWith('/in/');
            if (isLinkedInProfile || isSpeedReader) {
                return [];
            }

            // Return empty array for empty text
            if (!text) return [];

            // Initialize before cache lookup so settings changes invalidate old results.
            const regex = this.initializeRegex();
            if (!regex) return [];

            const normalizedText = normalizeForMatching(text);
            if (!normalizedText) return [];

            const cachedResult = this.getCachedResult(normalizedText);
            if (cachedResult !== null) return cachedResult;

            const rawMatches = typeof regex.findMatchesNormalized === 'function'
                ? regex.findMatchesNormalized(normalizedText)
                : typeof regex.findMatches === 'function'
                ? regex.findMatches(normalizedText)
                : (() => {
                    const fallbackMatches = [];
                    let match;
                    regex.lastIndex = 0;
                    while ((match = regex.exec(normalizedText)) !== null) {
                        fallbackMatches.push(match[0]);
                    }
                    return fallbackMatches;
                })();
            const matches = [];

            rawMatches.forEach(matchedText => {
                // If on LinkedIn (but not profile), check if the match is in the exceptions list
                if (!this.isLinkedIn || !this.isExceptionMatch(matchedText)) {
                    matches.push(matchedText);
                }
            });

            // Update stats asynchronously
            this.updateStats(matches);

            this.cacheResult(normalizedText, matches);

            return matches;

        } catch (error) {
            console.debug('Error in containsBlockedContent:', error);
            return [];
        }
    }

    /**
     * Clear all caches
     */
    clearCache() {
        this.matchCache.clear();
    }
}

export default ContentMatcher;
