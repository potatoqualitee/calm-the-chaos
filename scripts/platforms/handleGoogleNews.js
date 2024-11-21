// handleGoogleNews.js

import { BaseHandler } from '../core/handlers/baseHandler.js';

class GoogleNewsHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = [
            '[data-test-locator="stream-item-title"]',
            '[data-test-locator="lead-content-link"]',
            '[data-test-locator="lead-summary"]',
            '[data-test-locator="stream-item-summary"]'
        ];
        this.observer = null;
    }

    handlePreconfigured() {
        // Initial processing
        this.processGoogleNews();

        // Setup mutation observer for dynamic content
        this.setupObserver();
    }

    processGoogleNews() {
        // Check the Local News container
        this.processSelectors(['.eDrqsc'], (localNewsSection) => {
            if (this.checkAndHideElement(localNewsSection)) {
                this.nodesToHide.add(localNewsSection);
            }
        }, 'Google News local section');

        // Check individual elements
        this.processSelectors(this.selectors, (element) => {
            if (this.checkAndHideElement(element)) {
                let container = element;
                let parent = element.parentElement;

                // Walk up to find article container
                while (parent && parent !== document.body) {
                    if (parent.tagName === 'ARTICLE' ||
                        parent.classList.contains('eDrqsc')) {
                        container = parent;
                        break;
                    }
                    parent = parent.parentElement;
                }

                this.nodesToHide.add(container);
            }
        }, 'Google News element');
    }

    setupObserver() {
        // Cleanup any existing observer
        if (this.observer) {
            this.observer.disconnect();
        }

        // Setup a mutation observer specifically looking for the local news container load
        this.observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' &&
                    (mutation.target.classList.contains('eDrqsc') ||
                        mutation.target.querySelector('.eDrqsc'))) {
                    // Small delay to ensure content is fully loaded
                    setTimeout(() => this.processGoogleNews(), 100);
                }
            });
        });

        // Start observing, focusing on the areas where local news appears
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Override checkAndHideElement to not immediately add to nodesToHide
     * as we want to handle container selection first
     */
    checkAndHideElement(element) {
        return super.elementContainsBlockedContent(element);
    }
}

const handler = new GoogleNewsHandler();
export const handleGoogleNews = (nodesToHide) => handler.handle(nodesToHide);
