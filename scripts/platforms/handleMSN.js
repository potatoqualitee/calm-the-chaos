// handleMSN.js

import { BaseHandler } from '../core/handlers/baseHandler.js';

class MSNHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = [
            // Main content containers
            '.content-card-container',

            // Text and heading elements
            '.heading',
            '.body .text',
            'a[role="heading"]',
            '.attribution-text',

            // Media elements
            '.media',
            'img.media',

            // Article containers
            'article',
            '.article-content',

            // Story elements
            '.story-card',
            '.story-heading',
            '.story-summary',

            // Feed items
            '.feed-card',
            '.feed-layout',

            // News specific elements
            '.news-card',
            '.news-title',
            '.news-body',

            // Link containers
            '.destination-link',
            'a[data-t]',

            // Additional containers
            '.card-container',
            '.card-content',
            '.card-body',

            // Hidden elements
            '[style*="display: none"]',
            '[aria-hidden="true"]',

            // Attribution sections
            '.attribution',
            '.source-attribution',

            // Action elements
            '.action-row',
            '.card-actions-button-container'
        ];
    }

    handlePreconfigured() {
        // Target the entry-point elements
        this.processSelectors(['.entry-point, entry-point'], (entryPoint) => {
            // Process regular elements within entry point
            this.processEntryPoint(entryPoint);

            // Handle iframes within the entry-point
            this.processIframes(entryPoint);
        }, 'MSN entry point');
    }

    processEntryPoint(entryPoint) {
        this.selectors.forEach(selector => {
            try {
                const elements = entryPoint.querySelectorAll(selector);
                this.processElements(elements, (element) => {
                    if (this.checkAndHideElement(element) ||
                        window.getComputedStyle(element).display === 'none') {
                        const container = element.closest('.content-card-container') || element;
                        this.nodesToHide.add(container);
                    }
                }, `MSN selector: ${selector}`);
            } catch (error) {
                console.debug(`Error processing MSN selector ${selector}:`, error);
            }
        });
    }

    processIframes(entryPoint) {
        const iframes = entryPoint.querySelectorAll('iframe');
        this.processElements(iframes, (iframe) => {
            try {
                const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
                this.selectors.forEach(selector => {
                    const elements = iframeDocument.querySelectorAll(selector);
                    this.processElements(elements, (element) => {
                        if (this.checkAndHideElement(element) ||
                            window.getComputedStyle(element).display === 'none') {
                            const container = element.closest('.content-card-container') || element;
                            this.nodesToHide.add(container);
                        }
                    }, `MSN iframe selector: ${selector}`);
                });
            } catch (error) {
                console.debug('Error processing iframe in MSN:', error);
            }
        }, 'MSN iframe');
    }

    /**
     * Override checkAndHideElement to not immediately add to nodesToHide
     * as we want to handle container selection first
     */
    checkAndHideElement(element) {
        return super.elementContainsBlockedContent(element);
    }
}

const handler = new MSNHandler();
export const handleMSN = (nodesToHide) => handler.handle(nodesToHide);
