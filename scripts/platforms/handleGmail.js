// handleGmail.js

import { BaseHandler } from '../core/handlers/baseHandler.js';
import { elementContainsBlockedContent } from '../core/contentDetectionModule.js';

class GmailHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = [
            // Email list items
            'tr.zA',
            // Open email content
            'div.a3s',
            // Email thread items
            'div.adn'
        ];

        // Gmail-specific optimization settings
        this.observerThrottleTime = 1000; // 1 second throttle for Gmail
        this.lastObserverUpdate = 0;
        this.pendingUpdate = false;
    }

    replaceEmailContent(element) {
        try {
            // Skip already processed elements
            if (element.dataset.calmChaosProcessed === 'true') {
                return false;
            }

            // Find the content container
            const contentContainer = element.matches('div.a3s')
                ? element
                : element.querySelector('div.a3s, span.y2');

            if (!contentContainer) {
                return false;
            }

            // Store original content
            contentContainer.dataset.originalContent = contentContainer.innerHTML;

            // Replace with filtered message
            contentContainer.innerHTML = '<span class="filtered-content" style="color: #999; font-style: italic; opacity: 0.7; cursor: pointer;">-- content hidden --</span>';

            // Add click handler to restore content
            const span = contentContainer.querySelector('.filtered-content');
            if (span) {
                span.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (contentContainer.dataset.originalContent) {
                        contentContainer.innerHTML = contentContainer.dataset.originalContent;
                        delete contentContainer.dataset.originalContent;
                    }
                });
            }

            return true;
        } catch (error) {
            console.debug('Error replacing Gmail content:', error);
            return false;
        }
    }

    /**
     * Special handling for Gmail compose area to prevent performance issues
     */
    setupComposeProtection() {
        try {
            // Find all compose areas
            const composeAreas = document.querySelectorAll('div[role="textbox"][aria-label*="Message Body"]');

            composeAreas.forEach(compose => {
                // Skip already protected areas
                if (compose.dataset.calmChaosProtected) {
                    return;
                }

                // Mark as protected
                compose.dataset.calmChaosProtected = 'true';

                // Add a class that our InputProtector can recognize
                compose.classList.add('calm-chaos-compose-area');

                console.debug('Protected Gmail compose area from mutation processing');
            });
        } catch (error) {
            console.debug('Error setting up compose protection:', error);
        }
    }

    async handlePreconfigured() {
        // First, protect compose areas
        this.setupComposeProtection();

        // Process email content
        for (const selector of this.selectors) {
            try {
                const elements = document.querySelectorAll(selector);

                for (const element of elements) {
                    // Skip if already processed
                    if (element.dataset.calmChaosProcessed === 'true') {
                        continue;
                    }

                    if (await elementContainsBlockedContent(element)) {
                        if (this.replaceEmailContent(element)) {
                            element.dataset.calmChaosProcessed = 'true';
                            this.nodesToHide.add(element);
                        }
                    }
                }
            } catch (error) {
                console.debug(`Error processing Gmail ${selector}:`, error);
            }
        }

        // Set up observers for dynamically loaded content
        this.setupObservers();
    }

    setupObservers() {
        // Only set up observers if not already done
        if (document.body.dataset.calmChaosGmailObserved) {
            return;
        }

        // Main content areas to observe
        const containerSelectors = [
            'div.AO', // Main content area
            'div.nH', // Email list container
            'div.a3s'  // Email content
        ];

        containerSelectors.forEach(selector => {
            const containers = document.querySelectorAll(selector);

            containers.forEach(container => {
                if (!container.dataset.calmChaosObserved) {
                    const observer = new MutationObserver((mutations) => {
                        // Throttle updates to prevent performance issues
                        const now = Date.now();
                        if (now - this.lastObserverUpdate < this.observerThrottleTime) {
                            if (!this.pendingUpdate) {
                                this.pendingUpdate = true;
                                setTimeout(() => {
                                    this.pendingUpdate = false;
                                    this.lastObserverUpdate = Date.now();
                                    this.handlePreconfigured();
                                }, this.observerThrottleTime);
                            }
                            return;
                        }

                        this.lastObserverUpdate = now;
                        this.handlePreconfigured();
                    });

                    observer.observe(container, {
                        childList: true,
                        subtree: true,
                        characterData: false // Don't need character data for Gmail
                    });

                    container.dataset.calmChaosObserved = 'true';
                }
            });
        });

        document.body.dataset.calmChaosGmailObserved = 'true';
    }
}

const handler = new GmailHandler();
export const handleGmail = (nodesToHide) => handler.handle(nodesToHide);