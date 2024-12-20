// nodeHidingModule.js

import { chromeStorageGet, chromeRuntimeSendMessage } from '../utils.js';
import { containsBlockedContent } from './contentDetectionModule.js';

// Create singleton instance
const nodeHider = new class NodeHider {
    constructor() {
        this.processedNodes = new WeakSet();
        this.processedContent = new Set(); // Track unique content
        this.currentTabId = null;
        this.blockedKeywords = new Map(); // Track keyword counts for current tab
        this.totalOccurrences = 0;

        // Get current tab ID
        chrome.runtime.sendMessage({ type: 'getCurrentTab' }, (response) => {
            if (response && response.tabId) {
                this.currentTabId = response.tabId;
                // Load existing count for this tab
                chrome.storage.local.get(`pageStats_${response.tabId}`, (result) => {
                    const stats = result[`pageStats_${response.tabId}`];
                    if (stats) {
                        this.totalOccurrences = stats.pageBlocked;
                    }
                });
            }
        });
    }

    /**
     * Track blocked keywords for current tab, avoiding duplicates
     * @param {string[]} keywords - Array of matched keywords
     * @param {string} content - The content being processed
     */
    trackKeywords(keywords, content) {
        if (!this.currentTabId || !Array.isArray(keywords)) return;

        // Skip if we've already processed this exact content
        const contentHash = content.trim().toLowerCase();
        if (this.processedContent.has(contentHash)) {
            return;
        }
        this.processedContent.add(contentHash);

        // Ensure keywords are properly stringified and unique
        const validKeywords = [...new Set(
            keywords.map(k => String(k).trim()).filter(Boolean)
        )];

        let newKeywordsFound = false;
        validKeywords.forEach(keyword => {
            if (!this.blockedKeywords.has(keyword)) {
                this.blockedKeywords.set(keyword, 1);
                newKeywordsFound = true;
            }
        });

        // Only update if new keywords were found
        if (newKeywordsFound) {
            // Convert Map to array of objects with keyword and count
            const keywordArray = Array.from(this.blockedKeywords.entries())
                .map(([keyword, count]) => ({
                    blockedKeywords: [keyword],
                    count: 1 // Set count to 1 since we're now tracking unique occurrences
                }));

            // Update total occurrences to match unique keywords
            this.totalOccurrences = this.blockedKeywords.size;

            if (keywordArray.length > 0) {
                // Store in tab-specific storage
                chrome.storage.local.set({
                    [`blockedKeywords_${this.currentTabId}`]: keywordArray
                });
            }

            // Update badge and stats with total occurrences
            if (this.currentTabId) {
                chrome.runtime.sendMessage({
                    type: 'updateBlockCount',
                    tabId: this.currentTabId,
                    count: this.totalOccurrences,
                    total: document.body.getElementsByTagName('*').length
                });
            }
        }
    }

    /**
     * Process a single container element
     * @param {Element} container - The container element to process
     * @param {string} collapseStyle - The style to use when hiding elements
     */
    processContainer(container, collapseStyle) {
        try {
            if (!(container instanceof Element)) {
                return;
            }

            // Skip already processed nodes
            if (this.processedNodes.has(container)) {
                return;
            }

            // Check for blocked content and track keywords
            const content = container.textContent || '';
            const matches = containsBlockedContent(content);
            if (matches.length > 0) {
                // Track this node
                this.processedNodes.add(container);

                // Track keywords with content for deduplication
                this.trackKeywords(matches, content);

                // Only apply hiding if the node isn't already hidden
                if (window.getComputedStyle(container).display !== 'none') {
                    this.applyHidingStyle(container, collapseStyle);
                    this.handleParentContainers(container, collapseStyle);
                }
            }

        } catch (error) {
            console.debug('Error processing container:', error);
        }
    }

    /**
     * Apply the appropriate hiding style to the container
     * @param {Element} container - The container element
     * @param {string} collapseStyle - The style to use when hiding elements
     */
    applyHidingStyle(container, collapseStyle) {
        if (window.getComputedStyle(container).display === 'none') {
            return;
        }

        if (collapseStyle === 'hideCompletely') {
            container.style.cssText = 'display: none !important;';
        } else {
            this.applyPartialHiding(container);
        }
    }

    /**
     * Apply partial hiding style to maintain layout
     * @param {Element} container - The container element
     */
    applyPartialHiding(container) {
        Array.from(container.children).forEach(child => {
            child.style.visibility = 'hidden';
        });

        const textNodes = Array.from(container.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE);
        if (textNodes.length > 0) {
            container.style.visibility = 'hidden';
        }

        const computedStyle = window.getComputedStyle(container);
        const minHeight = computedStyle.height;
        if (minHeight !== 'auto' && minHeight !== '0px') {
            container.style.minHeight = minHeight;
        }
    }

    /**
     * Handle parent containers for consistent layout
     * @param {Element} container - The container element
     * @param {string} collapseStyle - The style to use when hiding elements
     */
    handleParentContainers(container, collapseStyle) {
        let parent = container.parentElement;
        while (parent && parent !== document.body) {
            if (parent.tagName === 'SHREDDIT-POST') break;

            const style = window.getComputedStyle(parent);
            if (style.display.includes('grid') || style.display.includes('flex')) {
                parent.style.gap = '0.5rem';
            }

            const hasVisibleContent = Array.from(parent.children).some(child =>
                window.getComputedStyle(child).display !== 'none'
            );

            if (!hasVisibleContent && collapseStyle === 'hideCompletely') {
                parent.style.display = 'none';
            }
            parent = parent.parentElement;
        }
    }

    /**
     * Reset the node hider state
     */
    reset() {
        this.processedNodes = new WeakSet();
        this.processedContent = new Set();
        this.totalOccurrences = 0;
        this.blockedKeywords.clear();

        if (this.currentTabId) {
            chrome.runtime.sendMessage({
                type: 'updateBlockCount',
                tabId: this.currentTabId,
                count: 0,
                total: document.body.getElementsByTagName('*').length
            });

            chrome.storage.local.set({
                [`blockedKeywords_${this.currentTabId}`]: []
            });
        }
    }
}();

/**
 * Main function to hide nodes
 * @param {Set} nodesToHide - Set of nodes to hide
 */
function hideNodes(nodesToHide) {
    try {
        chromeStorageGet(['collapseStyle'], function(result) {
            const collapseStyle = result.collapseStyle || 'hideCompletely';

            nodesToHide.forEach(container => {
                nodeHider.processContainer(container, collapseStyle);
            });
        });
    } catch (error) {
        console.debug('Error in hideNodes:', error);
    }
}

export { hideNodes, nodeHider };
