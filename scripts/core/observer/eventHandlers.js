// Event handling and lifecycle management
import { handleGenericMedia } from '../elementProcessingModule.js';
import { hideNodes, nodeHider } from '../nodeHidingModule.js';
import { FilterProcessor } from './mutations/FilterProcessor.js';

export class EventManager {
    constructor(observer, mutationProcessor) {
        this.observer = observer;
        this.mutationProcessor = mutationProcessor;
        this.filterProcessor = new FilterProcessor(new Set()); // Empty history since FilterProcessor handles history internally
        this.isInitialized = false;

        // Bind methods to maintain context
        this.handleDOMContentLoaded = this.handleDOMContentLoaded.bind(this);
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
        this.initialFilter = this.initialFilter.bind(this);
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
     * Reset state
     */
    reset() {
        nodeHider.reset();
        this.mutationProcessor.cleanup();
        this.cleanup();
    }

    /**
     * Clean up resources
     */
    cleanup() {
        if (this.observer) {
            this.observer.disconnect();
        }
        this.removeEventListeners();
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
                    await this.filterProcessor.processContent([mainContent]);

                    // Then process the rest of the page
                    const otherContent = Array.from(document.body.children).filter(el =>
                        el !== mainContent &&
                        !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)
                    );
                    if (otherContent.length > 0) {
                        await this.filterProcessor.processContent(otherContent);
                    }
                } else {
                    // Fallback to normal filtering if main content not found
                    await this.filterProcessor.processContent();
                }
            } else {
                // For other sites, use normal filtering
                await this.filterProcessor.processContent();
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
}