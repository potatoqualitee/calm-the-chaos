// Main observer class
import { getSiteConfig } from './config.js';
import { MutationHandler } from './mutationHandlers.js';
import { EventManager } from './eventHandlers.js';

export class ContentObserver {
    constructor() {
        this.observer = null;
        this.history = new Set();
        this.config = getSiteConfig();
        this.mutationHandler = new MutationHandler(this.config);
        this.eventManager = new EventManager(this.observer, this.mutationHandler);
    }

    /**
     * Set up mutation observer
     */
    setupObserver() {
        try {
            this.cleanup();
            this.observer = new MutationObserver((mutations) =>
                this.mutationHandler.handleMutations(mutations, this.observer)
            );
            this.observer.observe(document.body, this.config.observerConfig);
            this.eventManager = new EventManager(this.observer, this.mutationHandler);
            this.eventManager.setupEventListeners();
        } catch (error) {
            console.debug('Error setting up observer:', error);
        }
    }

    /**
     * Clean up resources
     */
    cleanup() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        this.mutationHandler.cleanup();
        this.eventManager.cleanup();
        this.history.clear();
    }
}

// Create singleton instance
const contentObserver = new ContentObserver();

// Export what the rest of the application needs
export const setupObserver = () => contentObserver.setupObserver();
export const cleanup = () => contentObserver.cleanup();
export const history = contentObserver.history;