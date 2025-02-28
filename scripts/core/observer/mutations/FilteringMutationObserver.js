import { startNewDetectionCycle } from '../../contentDetectionModule.js';
import { ContentObserver } from '../ContentObserver.js';
import { FilterProcessor } from './FilterProcessor.js';
import { nodeHider } from '../../nodeHidingModule.js';
import inputProtector from '../../utils/InputProtector.js';

export class FilteringMutationObserver extends ContentObserver {
    constructor() {
        super();
        this.timeoutId = null;
        this.memoryManagementInterval = null;
        this.pendingMutations = new Map(); // Track unique mutations by node
        this.filterProcessor = new FilterProcessor(this.history);

        // Performance optimization settings
        this.debounceTime = 500; // Increased from 250ms to 500ms
        this.lastProcessTime = 0;
        this.throttleInterval = 1000; // Minimum time between processing in ms
        this.mutationCount = 0;
        this.maxMutationsPerBatch = 100; // Maximum mutations to process in one batch

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
                    // Skip processing if we're throttling
                    const now = Date.now();
                    if (now - this.lastProcessTime < this.throttleInterval && this.pendingMutations.size > 0) {
                        // If we're already throttling, just add to pending mutations
                        this.addMutationsToPending(mutations);
                        return;
                    }

                    // Clear any existing timeout
                    if (this.timeoutId) {
                        clearTimeout(this.timeoutId);
                    }

                    // Add new mutations to pending queue, filtering out input-related ones
                    this.addMutationsToPending(mutations);

                    // If we have too many mutations, increase debounce time dynamically
                    let currentDebounceTime = this.debounceTime;
                    if (this.mutationCount > 500) {
                        currentDebounceTime = Math.min(2000, this.debounceTime * 2);
                        console.debug(`High mutation rate detected (${this.mutationCount}), increasing debounce to ${currentDebounceTime}ms`);
                    }

                    // Debounce processing to batch mutations
                    this.timeoutId = setTimeout(() => {
                        try {
                            if (this.pendingMutations.size > 0) {
                                this.lastProcessTime = Date.now();
                                const batchedMutations = Array.from(this.pendingMutations.values());
                                this.pendingMutations.clear();
                                this.mutationCount = 0;
                                this.processMutationBatch(batchedMutations);
                            }
                        } catch (error) {
                            console.debug('Error processing mutation batch:', error);
                        }
                    }, currentDebounceTime);
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

    /**
     * Add mutations to the pending queue, filtering out input-related ones
     * @param {MutationRecord[]} mutations - The mutations to add
     */
    addMutationsToPending(mutations) {
        let inputRelatedCount = 0;
        let addedCount = 0;

        for (const mutation of mutations) {
            try {
                // Skip input-related mutations
                if (inputProtector.isMutationInputRelated(mutation)) {
                    inputRelatedCount++;
                    continue;
                }

                // Only add mutations with added nodes or character data changes
                if (mutation.addedNodes.length > 0 ||
                    (mutation.type === 'characterData' && mutation.target.textContent?.trim())) {

                    // Use a unique key for the mutation
                    const key = mutation.target || (mutation.addedNodes.length > 0 ? mutation.addedNodes[0] : null);
                    if (key) {
                        this.pendingMutations.set(key, mutation);
                        addedCount++;
                        this.mutationCount++;
                    }
                }
            } catch (error) {
                console.debug('Error storing mutation:', error);
            }
        }

        // Log stats if we filtered a significant number of mutations
        if (inputRelatedCount > 5) {
            console.debug(`Filtered ${inputRelatedCount} input-related mutations, added ${addedCount}`);
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
        this.mutationCount = 0;
        super.cleanup();
    }

    processMutationBatch(mutations) {
        // Limit batch size to prevent performance issues
        const limitedMutations = mutations.length > this.maxMutationsPerBatch
            ? mutations.slice(0, this.maxMutationsPerBatch)
            : mutations;

        if (mutations.length > this.maxMutationsPerBatch) {
            console.debug(`Limiting mutation batch from ${mutations.length} to ${this.maxMutationsPerBatch}`);
        }

        const elementNodes = new Set();
        const textNodes = new Set();

        // Efficiently categorize mutations
        for (const mutation of limitedMutations) {
            // Double-check for input-related mutations
            if (inputProtector.isMutationInputRelated(mutation)) {
                continue;
            }

            if (mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    // Skip input-related nodes
                    if (inputProtector.isInInputContext(node)) {
                        continue;
                    }

                    if (node.nodeType === Node.ELEMENT_NODE) {
                        elementNodes.add(node);
                    } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
                        textNodes.add(node);
                    }
                }
            } else if (mutation.type === 'characterData' &&
                mutation.target.nodeType === Node.TEXT_NODE &&
                mutation.target.textContent?.trim() &&
                !inputProtector.isInInputContext(mutation.target)) {
                textNodes.add(mutation.target);
            }
        }

        // Use requestIdleCallback if available, otherwise fallback to requestAnimationFrame
        const scheduleTask = window.requestIdleCallback || window.requestAnimationFrame;

        // Process elements first as they might contain text nodes
        if (elementNodes.size > 0) {
            scheduleTask(() => {
                startNewDetectionCycle();
                this.filterProcessor.processContent(Array.from(elementNodes));
            });
        }

        // Then process text nodes
        if (textNodes.size > 0) {
            scheduleTask(() => {
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