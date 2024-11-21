// baseHandler.js

import { elementContainsBlockedContent } from '../contentDetectionModule.js';
import { handleGenericMedia } from '../elementProcessingModule.js';

class BaseHandler {
    constructor() {
        this.nodesToHide = null;
    }

    /**
     * Process a collection of elements using a common error handling pattern
     * @param {NodeList|Array} elements - Elements to process
     * @param {Function} processElement - Function to process each element
     * @param {string} errorContext - Context for error logging
     */
    processElements(elements, processElement, errorContext) {
        elements.forEach(element => {
            try {
                processElement(element);
            } catch (error) {
                console.debug(`Error processing ${errorContext}:`, error);
            }
        });
    }

    /**
     * Process elements matching selectors with common error handling
     * @param {Array<string>} selectors - Array of CSS selectors
     * @param {Function} processElement - Function to process each element
     * @param {string} errorContext - Context for error logging
     */
    processSelectors(selectors, processElement, errorContext) {
        selectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                this.processElements(elements, processElement, `${errorContext} selector: ${selector}`);
            } catch (error) {
                console.debug(`Error processing ${errorContext} selector: ${selector}`, error);
            }
        });
    }

    /**
     * Check if element contains blocked content and add to nodesToHide if it does
     * @param {Element} element - Element to check
     * @param {Element|null} container - Optional container to hide instead of element
     */
    async checkAndHideElement(element, container = null) {
        try {
            const hasBlockedContent = await elementContainsBlockedContent(element);
            if (hasBlockedContent) {
                this.nodesToHide.add(container || element);
            }
        } catch (error) {
            console.debug('Error in checkAndHideElement:', error);
        }
    }

    /**
     * Main handler method to be implemented by platform-specific handlers
     * @param {Set} nodesToHide - Set to collect nodes that should be hidden
     */
    async handle(nodesToHide) {
        this.nodesToHide = nodesToHide;

        try {
            await this.handlePreconfigured();
            // Handle images after platform-specific content
            await handleGenericMedia(nodesToHide);
        } catch (error) {
            console.debug(`Error in ${this.constructor.name}:`, error);
        }
    }

    async handlePreconfigured() {
        throw new Error('handlePreconfigured must be implemented by subclass');
    }
}

export { BaseHandler };
