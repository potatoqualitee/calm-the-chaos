// observerModule.js

import { filterContent } from '../contentFilter.js';
import { nodeHider, hideNodes } from './nodeHidingModule.js';
import { handleGenericMedia } from './elementProcessingModule.js';

class ContentObserver {
    constructor() {
        this.observer = null;
        this.timeout = null;
        this.history = new Set();
        this.mutationQueue = new Map();
        this.isProcessing = false;
        this.disconnectTimeout = null;
        this.reconnectDelay = 1000; // 1 second
        this.isInitialized = false;

        // Enhanced observer config for better performance
        this.observerConfig = {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        };

        // Optimized constants for heavy sites like CNN
        this.DEBOUNCE_DELAY = 50; // Faster initial response
        this.BATCH_SIZE = 50; // Larger batches for better throughput
        this.MAX_QUEUE_SIZE = 2000; // Larger queue for heavy sites
        this.HEAVY_MUTATION_THRESHOLD = 100; // Higher threshold for disconnect

        // Site-specific optimizations
        this.isCNN = window.location.hostname.includes('cnn.com');
        if (this.isCNN) {
            // CNN-specific settings
            this.BATCH_SIZE = 100; // Even larger batches for CNN
            this.observerConfig.attributeFilter = ['class', 'style']; // Only watch relevant attributes
        }

        // Bind methods to maintain context
        this.handleMutations = this.handleMutations.bind(this);
        this.handleDOMContentLoaded = this.handleDOMContentLoaded.bind(this);
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
        this.processMutationQueue = this.processMutationQueue.bind(this);
    }

    /**
     * Set up event listeners for page lifecycle events
     */
    setupEventListeners() {
        if (!this.isInitialized) {
            document.addEventListener('DOMContentLoaded', this.handleDOMContentLoaded);
            window.addEventListener('beforeunload', this.handleBeforeUnload);
            // Also handle load event for images that load after DOMContentLoaded
            window.addEventListener('load', () => this.initialFilter());
            this.isInitialized = true;
        }
    }

    /**
     * Remove event listeners
     */
    removeEventListeners() {
        document.removeEventListener('DOMContentLoaded', this.handleDOMContentLoaded);
        window.removeEventListener('beforeunload', this.handleBeforeUnload);
        window.removeEventListener('load', () => this.initialFilter());
        this.isInitialized = false;
    }

    /**
     * Handle DOMContentLoaded event
     */
    async handleDOMContentLoaded() {
        try {
            this.reset();
            this.setupObserver();
            // Initial content and image filtering
            await this.initialFilter();
        } catch (error) {
            console.debug('Error in DOMContentLoaded handler:', error);
        }
    }

    /**
     * Handle beforeunload event
     */
    handleBeforeUnload() {
        try {
            this.cleanup();
        } catch (error) {
            console.debug('Error in beforeunload handler:', error);
        }
    }

    /**
     * Reset observer state
     */
    reset() {
        this.history.clear();
        this.mutationQueue.clear();
        this.isProcessing = false;
        nodeHider.reset();
        this.cleanup();
    }

    /**
     * Clean up observer and timeouts
     */
    cleanup() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        if (this.disconnectTimeout) {
            clearTimeout(this.disconnectTimeout);
            this.disconnectTimeout = null;
        }
        this.removeEventListeners();
    }

    /**
     * Set up mutation observer
     */
    setupObserver() {
        try {
            this.cleanup();
            this.observer = new MutationObserver(this.handleMutations);
            this.observer.observe(document.body, this.observerConfig);
            this.setupEventListeners();
        } catch (error) {
            console.debug('Error setting up observer:', error);
        }
    }

    /**
     * Perform initial content and image filtering
     */
    async initialFilter() {
        try {
            const nodesToHide = new Set();
            const isCNN = window.location.hostname.includes('cnn.com');

            if (isCNN) {
                // For CNN, prioritize main content area first
                const mainContent = document.querySelector('main, [role="main"], #main-content');
                if (mainContent) {
                    // Process main content immediately
                    await filterContent([mainContent]);

                    // Then process the rest of the page
                    const otherContent = Array.from(document.body.children).filter(el =>
                        el !== mainContent &&
                        !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)
                    );
                    if (otherContent.length > 0) {
                        await filterContent(otherContent);
                    }
                } else {
                    // Fallback to normal filtering if main content not found
                    await filterContent();
                }
            } else {
                // For other sites, use normal filtering
                await filterContent();
            }

            // Handle images after content is filtered
            await handleGenericMedia(nodesToHide);

            // Hide any found images
            if (nodesToHide.size > 0) {
                hideNodes(nodesToHide);
            }
        } catch (error) {
            console.debug('Error in initial filter:', error);
        }
    }

    /**
     * Check if node is relevant for content filtering
     * @param {Node} node - DOM node to check
     * @returns {boolean} - Whether node is relevant
     */
    isRelevantNode(node) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }

        // Skip invisible elements
        if (node instanceof HTMLElement &&
            (node.offsetWidth === 0 ||
             node.offsetHeight === 0 ||
             window.getComputedStyle(node).display === 'none')) {
            return false;
        }

        // Skip script, style, and other non-content elements
        const ignoredTags = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'BR', 'HR']);
        if (ignoredTags.has(node.tagName)) {
            return false;
        }

        return true;
    }

    /**
     * Handle mutation records with efficient batching
     * @param {MutationRecord[]} mutations - Array of mutation records
     */
    async handleMutations(mutations) {
        try {
            // Filter and group relevant mutations
            const relevantMutations = mutations.filter(mutation => {
                if (mutation.addedNodes.length === 0) {
                    return false;
                }

                return Array.from(mutation.addedNodes).some(node => this.isRelevantNode(node));
            });

            if (relevantMutations.length === 0) {
                return;
            }

            // Group mutations by parent to reduce processing overhead
            relevantMutations.forEach(mutation => {
                const parent = mutation.target.parentElement;
                if (!parent) return;

                if (!this.mutationQueue.has(parent)) {
                    this.mutationQueue.set(parent, new Set());
                }

                Array.from(mutation.addedNodes)
                    .filter(node => this.isRelevantNode(node))
                    .forEach(node => this.mutationQueue.get(parent).add(node));
            });

            // Handle mutations
            if (this.mutationQueue.size > this.HEAVY_MUTATION_THRESHOLD) {
                this.handleHeavyMutations();
            } else {
                this.debouncedProcessQueue();
            }
        } catch (error) {
            console.debug('Error handling mutations:', error);
        }
    }

    /**
     * Handle heavy mutation loads with temporary disconnect
     */
    handleHeavyMutations() {
        if (this.observer) {
            this.observer.disconnect();

            if (this.disconnectTimeout) {
                clearTimeout(this.disconnectTimeout);
            }

            this.disconnectTimeout = setTimeout(() => {
                if (this.observer) {
                    this.observer.observe(document.body, this.observerConfig);
                }
            }, this.reconnectDelay);
        }

        this.debouncedProcessQueue();
    }

    /**
     * Process mutation queue efficiently
     */
    async processMutationQueue() {
        if (this.isProcessing || this.mutationQueue.size === 0) {
            return;
        }

        this.isProcessing = true;

        try {
            const nodesToHide = new Set();
            const processPromises = [];

            // Group all nodes from the queue
            const allNodes = new Set();
            for (const [parent, nodes] of this.mutationQueue) {
                if (document.contains(parent)) {
                    nodes.forEach(node => allNodes.add(node));
                }
                this.mutationQueue.delete(parent);
            }

            // Convert to array for processing
            const nodesArray = Array.from(allNodes);

            // For CNN, process in larger chunks
            if (this.isCNN) {
                const chunkSize = 200; // Process more nodes at once for CNN
                for (let i = 0; i < nodesArray.length; i += chunkSize) {
                    const chunk = nodesArray.slice(i, i + chunkSize);

                    // Process content in parallel
                    processPromises.push(
                        filterContent(chunk).catch(error => {
                            console.debug('Error filtering chunk:', error);
                            return null;
                        })
                    );

                    // Handle images separately to prevent blocking
                    const images = chunk
                        .filter(node => node instanceof Element)
                        .flatMap(node => [...node.getElementsByTagName('img')]);

                    if (images.length > 0) {
                        processPromises.push(
                            handleGenericMedia(nodesToHide).catch(error => {
                                console.debug('Error handling media:', error);
                                return null;
                            })
                        );
                    }

                    // Small delay between chunks to prevent blocking
                    if (i + chunkSize < nodesArray.length) {
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }
                }
            } else {
                // For other sites, use standard processing
                if (nodesArray.length > 0) {
                    processPromises.push(filterContent(nodesArray));

                    const images = nodesArray
                        .filter(node => node instanceof Element)
                        .flatMap(node => [...node.getElementsByTagName('img')]);

                    if (images.length > 0) {
                        processPromises.push(handleGenericMedia(nodesToHide));
                    }
                }
            }

            // Wait for all processing to complete
            await Promise.all(processPromises);

            // Hide any found images
            if (nodesToHide.size > 0) {
                hideNodes(nodesToHide);
            }
        } catch (error) {
            console.debug('Error processing mutation queue:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Debounced queue processing
     */
    debouncedProcessQueue() {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(async () => {
            await this.processMutationQueue();
        }, this.DEBOUNCE_DELAY);
    }
}

// Create singleton instance
const contentObserver = new ContentObserver();

// Export what the rest of the application needs
export const setupObserver = () => contentObserver.setupObserver();
export const cleanup = () => contentObserver.cleanup();
export const history = contentObserver.history; // Export the history property directly instead of its getter
