// contentMatcher.js

import { getBlockedRegex } from '../managers/regexManager.js';
import { LINKEDIN_EXCEPTIONS } from '../config/keywords.js';
import { storageManager } from '../managers/storageManager.js';

class ContentMatcher {
    constructor() {
        this.regex = null;
        this.regexPattern = null;
        this.matchCache = new Map();
        this.processedContent = new Set();
        this.isLinkedIn = window.location.hostname.includes('linkedin.com');
        this.isLinkedInProfile = this.isLinkedIn && window.location.pathname.startsWith('/in/');
    }

    /**
     * Initialize or update the regex pattern
     * @returns {RegExp|null} - Compiled regex or null if no pattern available
     */
    initializeRegex() {
        const pattern = getBlockedRegex();
        if (!pattern) {
            this.regex = null;
            this.regexPattern = null;
            return null;
        }

        // Only create new regex if pattern has changed
        if (pattern !== this.regexPattern) {
            this.regex = new RegExp(pattern, 'gi');
            this.regexPattern = pattern;
        }

        return this.regex;
    }

    /**
     * Fast string hashing function
     */
    fastHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash;
    }

    /**
     * Cache results with size management
     */
    cacheResult(hash, result) {
        this.matchCache.set(hash, result);
        this.processedContent.add(hash);

        // Use a more efficient cache size management
        if (this.matchCache.size > 10000) {
            const deleteCount = 1000;
            const keys = Array.from(this.matchCache.keys()).slice(0, deleteCount);
            for (const key of keys) {
                this.matchCache.delete(key);
                this.processedContent.delete(key);
            }
        }
    }

    /**
     * Check if match is in exceptions list
     */
    isExceptionMatch(match) {
        return LINKEDIN_EXCEPTIONS.some(exception =>
            match.toLowerCase().includes(exception.toLowerCase())
        );
    }

    /**
     * Update stats for matched keywords
     * @param {string[]} matches - Array of matched keywords
     * @private
     */
    updateStats(matches) {
        if (matches.length > 0) {
            chrome.storage.local.get('allTimeKeywordStats', (storage) => {
                const stats = storage.allTimeKeywordStats || {};
                const normalizedStats = {};

                // First, normalize existing stats
                Object.entries(stats).forEach(([key, count]) => {
                    const normalized = storageManager.normalizeKeyword(key);
                    if (normalized) { // Skip empty strings
                        normalizedStats[normalized] = (normalizedStats[normalized] || 0) + count;
                    }
                });

                // Add new matches
                matches.forEach(match => {
                    const normalized = storageManager.normalizeKeyword(match);
                    if (normalized) { // Skip empty strings
                        normalizedStats[normalized] = (normalizedStats[normalized] || 0) + 1;
                    }
                });

                // Convert back to title case for display
                const finalStats = {};
                Object.entries(normalizedStats).forEach(([key, count]) => {
                    // Convert to title case
                    const displayKey = key.length <= 3 ?
                        key.toUpperCase() : // Keep short words (like CIA) uppercase
                        key.split(' ').map(word =>
                            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                        ).join(' ');
                    finalStats[displayKey] = count;
                });

                chrome.storage.local.set({ allTimeKeywordStats: finalStats });
            });
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
            if (this.isLinkedInProfile || isSpeedReader) {
                console.log('Skipping content filtering: ' + (this.isLinkedInProfile ? 'LinkedIn Profile' : 'SpeedReader'));
                return [];
            }

            // Return empty array for empty text
            if (!text) return [];

            // Normalize text for consistent matching
            const normalizedText = text.trim().toLowerCase();
            if (!normalizedText) return [];

            // Check if we've already processed this exact content
            if (this.processedContent.has(normalizedText)) {
                return this.matchCache.get(normalizedText) || [];
            }

            const regex = this.initializeRegex();
            if (!regex) return [];

            const matches = [];
            let match;

            // Reset regex lastIndex to ensure consistent matching
            regex.lastIndex = 0;

            // Store all matches to maintain count
            while ((match = regex.exec(text)) !== null) {
                const matchedText = match[0];
                // If on LinkedIn (but not profile), check if the match is in the exceptions list
                if (!this.isLinkedIn || !this.isExceptionMatch(matchedText)) {
                    matches.push(match[0]); // Keep original case and count duplicates
                }
            }

            // Update stats asynchronously
            this.updateStats(matches);

            // Cache the result and mark content as processed
            this.matchCache.set(normalizedText, matches);
            this.processedContent.add(normalizedText);

            // Prevent cache from growing too large
            if (this.matchCache.size > 10000) {
                const oldestKey = this.matchCache.keys().next().value;
                this.matchCache.delete(oldestKey);
            }

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
        this.processedContent.clear();
    }
}

export default ContentMatcher;