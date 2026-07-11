// nodeHidingModule.js

import { containsBlockedContent } from './contentDetectionModule.js';

// Create singleton instance
const nodeHider = new class NodeHider {
    constructor() {
        this.processedNodes = new WeakSet();
        this.processedContent = new Set(); // Track unique content
        this.currentTabId = null;
        this.blockedKeywords = new Map(); // Track keyword counts for current tab
        this.totalOccurrences = 0;
        this.collapseStyle = 'hideCompletely';

        chrome.storage.local.get('collapseStyle', result => {
            this.collapseStyle = result.collapseStyle || 'hideCompletely';
        });
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes.collapseStyle) {
                this.collapseStyle = changes.collapseStyle.newValue || 'hideCompletely';
            }
        });

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
     */
    processContainer(container) {
        try {
            if (!(container instanceof Element)) {
                return;
            }

            // Skip already processed nodes
            if (this.processedNodes.has(container)) {
                return;
            }

            // Every candidate has already passed a handler/detector match. Recheck
            // only to collect per-tab keyword details; never discard a trusted
            // match because a selected ancestor has a narrower text surface.
            const content = this.getMatchableContent(container);
            const matches = containsBlockedContent(content);
            this.processedNodes.add(container);
            if (matches.length > 0) {
                // Track keywords with content for deduplication
                this.trackKeywords(matches, content);
            }

            // Only apply hiding if the node isn't already hidden.
            if (container.style.display !== 'none') {
                this.applyHidingStyle(container);
            }

        } catch (error) {
            console.debug('Error processing container:', error);
        }
    }

    getMatchableContent(container) {
        const parts = new Set();
        // innerText preserves the visual separation between nested headline
        // spans and adjacent card fields. textContent can concatenate those
        // nodes and make an otherwise exact headline impossible to match.
        const visibleText = container.innerText || container.textContent;
        if (visibleText?.trim()) parts.add(visibleText);
        [
            container.getAttribute?.('href'),
            container.getAttribute?.('aria-label'),
            container.title
        ].filter(Boolean).forEach(value => parts.add(value));

        const mediaElements = [];
        if (container.matches('img, picture, source, video, svg')) {
            mediaElements.push(container);
        }
        container.querySelectorAll?.('img, picture, source, video, svg').forEach(element =>
            mediaElements.push(element)
        );

        mediaElements.forEach(element => {
            [
                element.alt,
                element.getAttribute('aria-label'),
                element.title,
                element.currentSrc,
                element.src,
                element.srcset,
                element.getAttribute('data-src'),
                element.getAttribute('poster')
            ].filter(Boolean).forEach(value => parts.add(value));
        });

        return [...parts].join(' ');
    }

    /**
     * Apply the appropriate hiding style to the container
     * @param {Element} container - The container element
     */
    applyHidingStyle(container) {
        if (window.getComputedStyle(container).display === 'none') {
            return;
        }

        // Skip Bluesky posts - they're handled by handleBluesky.js
        if (container.closest('[data-testid^="postThreadItem-by-"], [data-testid^="feedItem-"]')) {
            return;
        }

        // For Reddit, apply click-to-show
        const isReddit = container.closest('shreddit-post, shreddit-comment');
        if (!isReddit && this.collapseStyle === 'keepContainer') {
            container.style.visibility = 'hidden';
            container.style.pointerEvents = 'none';
            container.setAttribute('aria-hidden', 'true');
            return;
        }

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
                total: 0
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
        const candidates = Array.from(nodesToHide)
            .filter(container => container instanceof Element && container.isConnected);
        const candidateSet = new Set(candidates);
        const topLevelCandidates = candidates.filter(container => {
            let ancestor = container.parentElement;
            while (ancestor) {
                if (candidateSet.has(ancestor)) return false;
                ancestor = ancestor.parentElement;
            }
            return true;
        });

        topLevelCandidates.forEach(container => nodeHider.processContainer(container));
    } catch (error) {
        console.debug('Error in hideNodes:', error);
    }

    return Promise.resolve();
}

export { hideNodes, nodeHider };
