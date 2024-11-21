import { startNewDetectionCycle } from '../../contentDetectionModule.js';
import { ContentObserver } from '../ContentObserver.js';
import { FilterProcessor } from './FilterProcessor.js';
import { nodeHider } from '../../nodeHidingModule.js';

export class FilteringMutationObserver extends ContentObserver {
    constructor() {
        super();
        this.timeoutId = null;
        this.memoryManagementInterval = null;
        this.pendingMutations = new Map(); // Track unique mutations by node
        this.filterProcessor = new FilterProcessor(this.history);
        this.setupMemoryManagement();
    }

    setupMemoryManagement() {
        // Clear any existing interval
        if (this.memoryManagementInterval) {
            clearInterval(this.memoryManagementInterval);
        }

        // Set up memory management interval
        this.memoryManagementInterval = setInterval(() => {
            try {
                if (this.history.size > 50000) {
                    // Clear entries older than 1 hour
                    const oneHourAgo = Date.now() - (60 * 60 * 1000);
                    let entriesRemoved = 0;

                    // Use for...of for better performance with Set
                    for (const entry of this.history) {
                        if (entry.timestamp && entry.timestamp < oneHourAgo) {
                            this.history.delete(entry);
                            entriesRemoved++;
                        }
                    }

                    // If still too large after removing old entries, perform full cleanup
                    if (this.history.size > 50000) {
                        console.debug('Performing full history cleanup');
                        this.history.clear();
                        nodeHider.reset();
                    } else if (entriesRemoved > 0) {
                        console.debug(`Removed ${entriesRemoved} old entries from history`);
                    }
                }
            } catch (error) {
                console.debug('Error in memory management:', error);
            }
        }, 600000); // Run every 10 minutes
    }

    setupObserver() {
        try {
            this.cleanup();

            this.observer = new MutationObserver((mutations) => {
                try {
                    if (this.timeoutId) {
                        clearTimeout(this.timeoutId);
                    }

                    // Store mutations for batched processing
                    mutations.forEach(mutation => {
                        try {
                            if (mutation.addedNodes.length > 0 ||
                                (mutation.type === 'characterData' && mutation.target.textContent?.trim())) {
                                this.pendingMutations.set(
                                    mutation.target || mutation.addedNodes[0],
                                    mutation
                                );
                            }
                        } catch (error) {
                            console.debug('Error storing mutation:', error);
                        }
                    });

                    // Debounce processing to batch mutations
                    this.timeoutId = setTimeout(() => {
                        try {
                            if (this.pendingMutations.size > 0) {
                                const batchedMutations = Array.from(this.pendingMutations.values());
                                this.pendingMutations.clear();
                                this.processMutationBatch(batchedMutations);
                            }
                        } catch (error) {
                            console.debug('Error processing mutation batch:', error);
                        }
                    }, 250); // Reduced debounce time for better responsiveness
                } catch (error) {
                    console.debug('Error in observer callback:', error);
                }
            });

            // Start observing with optimized configuration
            this.observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
                characterDataOldValue: false // Disable old value tracking to reduce memory usage
            });

            // Set up event listeners from parent class
            this.eventManager.setupEventListeners();
        } catch (error) {
            console.debug('Error setting up filtering observer:', error);
        }
    }

    cleanup() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        if (this.memoryManagementInterval) {
            clearInterval(this.memoryManagementInterval);
            this.memoryManagementInterval = null;
        }
        this.pendingMutations.clear();
        super.cleanup();
    }

    processMutationBatch(mutations) {
        const elementNodes = new Set();
        const textNodes = new Set();

        // Efficiently categorize mutations
        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        elementNodes.add(node);
                    } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
                        textNodes.add(node);
                    }
                }
            } else if (mutation.type === 'characterData' &&
                mutation.target.nodeType === Node.TEXT_NODE &&
                mutation.target.textContent?.trim()) {
                textNodes.add(mutation.target);
            }
        }

        // Process elements first as they might contain text nodes
        if (elementNodes.size > 0) {
            requestAnimationFrame(() => {
                startNewDetectionCycle();
                this.filterProcessor.processContent(Array.from(elementNodes));
            });
        }

        // Then process text nodes
        if (textNodes.size > 0) {
            requestAnimationFrame(() => {
                this.filterProcessor.processContent(Array.from(textNodes));
            });
        }
    }
}

// Create singleton instance
const filteringObserver = new FilteringMutationObserver();

// Export what the rest of the application needs
export const setupFilteringObserver = () => filteringObserver.setupObserver();
export const cleanupFilteringObserver = () => filteringObserver.cleanup();
export const filteringHistory = filteringObserver.history;