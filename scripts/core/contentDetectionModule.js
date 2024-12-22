// contentDetectionModule.js

import SpeedReaderDetector from './detection/speedReaderDetector.js';
import ContentMatcher from './detection/contentMatcher.js';
import ImageDetector from './detection/imageDetector.js';

class ContentDetector {
    constructor() {
        // Initialize components
        this.speedReaderDetector = new SpeedReaderDetector();
        this.contentMatcher = new ContentMatcher();
        this.imageDetector = new ImageDetector(this.contentMatcher);
    }

    /**
     * Check if text contains blocked content
     * @param {string} text - Text to check
     * @returns {string[]} - Array of matched blocked content
     */
    containsBlockedContent(text) {
        return this.contentMatcher.containsBlockedContent(text, this.speedReaderDetector.getStatus());
    }

    /**
     * Check if element contains blocked content in its text or attributes
     * @param {Element} element - Element to check
     * @returns {Promise<boolean>} - Whether element contains blocked content
     */
    async elementContainsBlockedContent(element) {
        return this.imageDetector.elementContainsBlockedContent(element, this.speedReaderDetector.getStatus());
    }

    /**
     * Start a new detection cycle
     */
    startNewCycle() {
    // Currently a no-op, but kept for API compatibility
    // Could be used for cycle-specific optimizations in the future
    }

    /**
     * Clear all caches
     */
    clearCache() {
        this.contentMatcher.clearCache();
        this.imageDetector.clearCache();
    }

    /**
     * Get current SpeedReader status
     * @returns {boolean}
     */
    isSpeedReader() {
        return this.speedReaderDetector.getStatus();
    }
}

// Create singleton instance
const detector = new ContentDetector();

// Export functions that use the singleton
export const containsBlockedContent = text => detector.containsBlockedContent(text);
export const elementContainsBlockedContent = element => detector.elementContainsBlockedContent(element);
export const clearContentDetectionCache = () => detector.clearCache();
export const startNewDetectionCycle = () => detector.startNewCycle();
export const isSpeedReader = () => detector.isSpeedReader();
