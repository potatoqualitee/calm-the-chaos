// contentDetectionModule.js

import { getBlockedRegex } from './managers/regexManager.js';
import { chromeStorageGet } from '../utils/chromeApi.js';
import { LINKEDIN_EXCEPTIONS } from './config/keywords.js';

class ContentDetector {
    constructor() {
        this.regex = null;
        this.regexPattern = null;
        this.matchCache = new Map();
        this.processedContent = new Set(); // Track all processed content
        this.imageSettings = null;
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
     * Check if text contains blocked content
     * @param {string} text - Text to check
     * @returns {string[]} - Array of matched blocked content
     */
    containsBlockedContent(text) {
        try {
            // Skip filtering for LinkedIn profile pages
            if (this.isLinkedInProfile) {
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

            const matches = new Set();
            let match;

            // Reset regex lastIndex to ensure consistent matching
            regex.lastIndex = 0;

            // Store original matches to maintain case
            while ((match = regex.exec(text)) !== null) {
                const matchedText = match[0].toLowerCase();
                // If on LinkedIn (but not profile), check if the match is in the exceptions list
                if (!this.isLinkedIn || !LINKEDIN_EXCEPTIONS.some(exception =>
                    matchedText.includes(exception.toLowerCase())
                )) {
                    matches.add(match[0]); // Keep original case
                }
            }

            const result = Array.from(matches);

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
     * @returns {Promise<boolean>} - Whether element contains blocked content
     */
    async elementContainsBlockedContent(element) {
        try {
            // Skip filtering for LinkedIn profile pages
            if (this.isLinkedInProfile) {
                return false;
            }

            // Quick check if no regex pattern is available
            if (!this.initializeRegex()) return false;

            const settings = await this.getImageSettings();

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
                return Array.from(contentToCheck).some(content =>
                    this.containsBlockedContent(content).length > 0
                );
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
                return this.containsBlockedContent(textContent).length > 0;
            }

            return false;
        } catch (error) {
            console.debug('Error in elementContainsBlockedContent:', error);
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

// Export functions that use the singleton
export const containsBlockedContent = text => detector.containsBlockedContent(text);
export const elementContainsBlockedContent = element => detector.elementContainsBlockedContent(element);
export const clearContentDetectionCache = () => detector.clearCache();
export const startNewDetectionCycle = () => detector.startNewCycle();
