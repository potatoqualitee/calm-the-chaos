// contentDetectionModule.js

import { getBlockedRegex } from './managers/regexManager.js';
import { chromeStorageGet } from '../utils/chromeApi.js';
import { LINKEDIN_EXCEPTIONS } from './config/keywords.js';
import { storageManager } from './managers/storageManager.js';

class ContentDetector {
    constructor() {
        this.regex = null;
        this.regexPattern = null;
        this.matchCache = new Map();
        this.processedContent = new Set(); // Track all processed content
        this.imageSettings = null;
        this.isLinkedIn = window.location.hostname.includes('linkedin.com');
        this.isLinkedInProfile = this.isLinkedIn && window.location.pathname.startsWith('/in/');

        // Initialize SpeedReader detection
        this.isSpeedReader = false;
        this.initSpeedReader();

        // Set up mutation observer for SpeedReader detection
        this.setupSpeedReaderObserver();
    }

    /**
     * Initialize SpeedReader detection
     */
    initSpeedReader() {
        const detected = this.detectSpeedReader();
        if (detected) {
            console.log('SpeedReader detected on initial load');
            this.isSpeedReader = true;
        }
    }

    /**
     * Set up mutation observer to detect SpeedReader after dynamic changes
     */
    setupSpeedReaderObserver() {
        const observer = new MutationObserver(() => {
            if (!this.isSpeedReader && this.detectSpeedReader()) {
                console.log('SpeedReader detected after page update');
                this.isSpeedReader = true;
                this.clearCache(); // Clear cache to prevent filtered content from staying hidden
            }
        });

        observer.observe(document.documentElement, {
            attributes: true,
            childList: true,
            subtree: true
        });
    }

    /**
     * Detect if the current page is using Brave's SpeedReader
     * @returns {boolean} - Whether SpeedReader is detected
     */
    detectSpeedReader() {
        try {
            // Check for SpeedReader-specific attributes and elements
            const html = document.documentElement;
            const hasSpeedReaderAttrs = html.hasAttribute('data-font-family') ||
                html.hasAttribute('data-font-size') ||
                html.hasAttribute('data-column-width');

            // Check for SpeedReader-specific styles and scripts
            const hasSpeedReaderElements = document.getElementById('brave_speedreader_style') !== null ||
                document.getElementById('atkinson_hyperligible_font') !== null;

            // Check for SpeedReader-specific classes
            const hasSpeedReaderClasses = document.querySelector('.tts-paragraph-player, .tts-highlighted, .tts-circle') !== null;

            // Check for Brave's CSP meta tag
            const hasSpeedReaderCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"][content*="default-src \'none\'"]') !== null;

            const result = hasSpeedReaderAttrs || hasSpeedReaderElements || hasSpeedReaderClasses || hasSpeedReaderCSP;

            if (result) {
                console.log('SpeedReader detected on page');
            }

            return result;
        } catch (error) {
            console.log('Error checking for SpeedReader: ' + error.message);
            return false;
        }
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
            // Don't clear caches here, as pattern changes shouldn't invalidate existing matches
        }

        return this.regex;
    }

    /**
     * Start a new detection cycle
     */
    startNewCycle() {
        // Don't clear processedContent to maintain global uniqueness
        // Only clear cycle-specific caches if needed
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
     * @returns {string[]} - Array of matched blocked content
     */
    containsBlockedContent(text) {
        try {
            // Skip filtering for LinkedIn profile pages and SpeedReader
            if (this.isLinkedInProfile || this.isSpeedReader) {
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
                const matchedText = match[0].toLowerCase();
                // If on LinkedIn (but not profile), check if the match is in the exceptions list
                if (!this.isLinkedIn || !LINKEDIN_EXCEPTIONS.some(exception =>
                    matchedText.includes(exception.toLowerCase())
                )) {
                    matches.push(match[0]); // Keep original case and count duplicates
                }
            }

            const result = matches; // Keep all matches including duplicates

            // Update stats asynchronously
            this.updateStats(result);

            // Cache the result and mark content as processed
            this.matchCache.set(normalizedText, result);
            this.processedContent.add(normalizedText);

            // Prevent cache from growing too large by removing oldest entries
            // but keep processed content tracking intact
            if (this.matchCache.size > 10000) { // Increased cache size
                const oldestKey = this.matchCache.keys().next().value;
                this.matchCache.delete(oldestKey);
            }

            return result;

        } catch (error) {
            console.debug('Error in containsBlockedContent:', error);
            return [];
        }
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
            match.includes(exception.toLowerCase())
        );
    }

    /**
     * Get image filtering settings from storage
     * @returns {Promise<Object>} - Image filtering settings
     */
    async getImageSettings() {
        if (this.imageSettings) return this.imageSettings;

        try {
            const result = await new Promise(resolve => {
                chromeStorageGet(
                    ['imageFilteringEnabled', 'imageContext', 'imageContainerStyle'],
                    resolve
                );
            });

            this.imageSettings = {
                enabled: result.imageFilteringEnabled !== undefined ? result.imageFilteringEnabled : true,
                context: result.imageContext || {
                    altText: true,
                    captions: true,
                    nearbyText: true,
                    srcUrl: true
                },
                containerStyle: result.imageContainerStyle || 'hideImage'
            };

            return this.imageSettings;
        } catch (error) {
            console.debug('Error getting image settings:', error);
            return {
                enabled: true,
                context: {
                    altText: true,
                    captions: true,
                    nearbyText: true,
                    srcUrl: true
                },
                containerStyle: 'hideImage'
            };
        }
    }

    /**
     * Check if element contains blocked content in its text or attributes
     * @param {Element} element - Element to check
     * @returns {boolean} - Whether element contains blocked content
     */
    elementContainsBlockedContent(element) {
        try {
            // Skip filtering for LinkedIn profile pages and SpeedReader
            if (this.isLinkedInProfile || this.isSpeedReader) {
                console.log('Skipping element filtering: ' + (this.isLinkedInProfile ? 'LinkedIn Profile' : 'SpeedReader'));
                return false;
            }

            // Quick check if no regex pattern is available
            if (!this.initializeRegex()) return false;

            const settings = this.imageSettings || {
                enabled: true,
                context: {
                    altText: true,
                    captions: true,
                    nearbyText: true,
                    srcUrl: true
                }
            };

            // Handle image elements based on settings
            if (element.tagName === 'IMG' || element.tagName === 'PICTURE' || element.tagName === 'SVG') {
                if (!settings.enabled) return false;

                const contentToCheck = new Set(); // Use Set to deduplicate content

                if (settings.context.altText && element.alt) {
                    contentToCheck.add(element.alt);
                }
                if (settings.context.srcUrl && element.src) {
                    contentToCheck.add(element.src);
                }
                if (settings.context.captions) {
                    const caption = element.closest('figure')?.querySelector('figcaption')?.textContent;
                    if (caption) contentToCheck.add(caption);
                }
                if (settings.context.nearbyText) {
                    const parent = element.parentElement;
                    if (parent) {
                        const nearbyText = Array.from(parent.childNodes)
                            .filter(node => node.nodeType === Node.TEXT_NODE ||
                                         (node.nodeType === Node.ELEMENT_NODE &&
                                          !['IMG', 'PICTURE', 'SVG'].includes(node.tagName)))
                            .map(node => node.textContent)
                            .join(' ');
                        if (nearbyText.trim()) contentToCheck.add(nearbyText);
                    }
                }

                // Check each unique piece of content
                return Array.from(contentToCheck).some(content => {
                    const matches = this.containsBlockedContent(content);
                    return matches.length > 0;
                });
            }

            // For non-image elements, check if it's an image container
            const hasOnlyImages = Array.from(element.children).every(child =>
                child.tagName === 'IMG' ||
                child.tagName === 'PICTURE' ||
                child.tagName === 'SVG' ||
                (child.children.length === 0 && !child.textContent.trim())
            );

            if (hasOnlyImages) {
                if (!settings.enabled) return false;
                // For image containers, check all child images
                return Array.from(element.querySelectorAll('img, picture, svg'))
                    .some(img => this.elementContainsBlockedContent(img));
            }

            // For regular elements, check text content
            const textContent = element.textContent ? element.textContent.trim() : '';
            if (textContent) {
                const matches = this.containsBlockedContent(textContent);
                return matches.length > 0;
            }

            return false;
        } catch (error) {
            console.log('Error checking element content: ' + error.message);
            return false;
        }
    }

    /**
     * Clear all caches
     */
    clearCache() {
        this.matchCache.clear();
        this.processedContent.clear();
        this.imageSettings = null;
    }
}

// Create singleton instance
const detector = new ContentDetector();

// Export functions and state that use the singleton
export const containsBlockedContent = text => detector.containsBlockedContent(text);
export const elementContainsBlockedContent = element => detector.elementContainsBlockedContent(element);
export const clearContentDetectionCache = () => detector.clearCache();
export const startNewDetectionCycle = () => detector.startNewCycle();
export const isSpeedReader = () => detector.isSpeedReader;
