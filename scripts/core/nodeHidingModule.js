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
                // Avoid layout thrashing by not counting all elements
                chrome.runtime.sendMessage({
                    type: 'updateBlockCount',
                    tabId: this.currentTabId,
                    count: this.totalOccurrences,
                    total: 0 // Remove expensive DOM query
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

        // Skip Bluesky posts - they're handled by handleBluesky.js
        if (container.closest('[data-testid^="postThreadItem-by-"], [data-testid^="feedItem-"]')) {
            return;
        }

        // For Reddit, apply click-to-show
        const isReddit = container.closest('shreddit-post, shreddit-comment');
        if (!isReddit) {
            // Hide without click-to-show for other platforms
            container.style.display = 'none';
            return;
        }

        // Reddit-specific handling
        container.dataset.originalContent = container.innerHTML;
        container.dataset.originalStyle = container.style.cssText;

        // Create wrapper to maintain layout
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'min-height: 2em; padding: 0.5rem;';

        // Create clickable message
        const hiddenMessage = document.createElement('div');
        hiddenMessage.className = 'filtered-content';
        hiddenMessage.style.cssText = 'color: #999; font-style: italic; opacity: 0.7; cursor: pointer;';
        hiddenMessage.textContent = '-- content hidden --';

        // Add click handler
        hiddenMessage.addEventListener('click', (e) => {
            e.stopPropagation();
            if (container.dataset.originalContent) {
                container.innerHTML = container.dataset.originalContent;
                container.style.cssText = container.dataset.originalStyle || '';
                delete container.dataset.originalContent;
                delete container.dataset.originalStyle;
            }
        });

        // Replace content
        wrapper.appendChild(hiddenMessage);
        container.textContent = '';
        container.appendChild(wrapper);

        // Maintain minimum height if specified
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
        // Cache computed styles to avoid layout thrashing
        const computedStyles = new Map();
        const getComputedStyleCached = (element) => {
            if (!computedStyles.has(element)) {
                computedStyles.set(element, window.getComputedStyle(element));
            }
            return computedStyles.get(element);
        };

        // Batch style reads and writes
        const styleUpdates = [];
        let parent = container.parentElement;

        // First pass: gather all style reads
        while (parent && parent !== document.body) {
            if (parent.tagName === 'SHREDDIT-POST') break;

            const style = getComputedStyleCached(parent);
            const isFlexOrGrid = style.display.includes('grid') || style.display.includes('flex');

            if (collapseStyle === 'hideCompletely') {
                const hasVisibleContent = Array.from(parent.children).some(child => {
                    const childStyle = getComputedStyleCached(child);
                    return childStyle.display !== 'none';
                });

                styleUpdates.push({
                    element: parent,
                    updates: {
                        gap: isFlexOrGrid ? '0.5rem' : null,
                        display: !hasVisibleContent ? 'none' : null
                    }
                });
            } else if (isFlexOrGrid) {
                styleUpdates.push({
                    element: parent,
                    updates: { gap: '0.5rem' }
                });
            }

            parent = parent.parentElement;
        }

        // Second pass: batch all style writes
        requestAnimationFrame(() => {
            styleUpdates.forEach(({ element, updates }) => {
                Object.entries(updates).forEach(([prop, value]) => {
                    if (value !== null) {
                        element.style[prop] = value;
                    }
                });
            });
        });
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
