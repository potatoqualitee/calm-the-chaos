// baseHandler.js

import { elementContainsBlockedContent } from '../contentDetectionModule.js';

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
    async processElements(elements, processElement, errorContext) {
        for (const element of Array.from(elements)) {
            try {
                await processElement(element);
            } catch (error) {
                console.debug(`Error processing ${errorContext}:`, error);
            }
        }
    }

    /**
     * Process elements matching selectors with common error handling
     * @param {Array<string>} selectors - Array of CSS selectors
     * @param {Function} processElement - Function to process each element
     * @param {string} errorContext - Context for error logging
     */
    async processSelectors(selectors, processElement, errorContext, roots = null) {
        const scopes = roots ? Array.from(roots) : [document];

        for (const selector of selectors) {
            try {
                const elements = new Set();
                scopes.forEach(scope => {
                    const root = scope?.nodeType === Node.TEXT_NODE ? scope.parentElement : scope;
                    if (!root) return;
                    if (root.nodeType === Node.ELEMENT_NODE && root.matches(selector)) {
                        elements.add(root);
                    }
                    root.querySelectorAll?.(selector).forEach(element => elements.add(element));
                });
                await this.processElements(elements, processElement, `${errorContext} selector: ${selector}`);
            } catch (error) {
                console.debug(`Error processing ${errorContext} selector: ${selector}`, error);
            }
        }
    }

    async elementContainsBlockedContent(element) {
        return elementContainsBlockedContent(element);
    }

    /**
     * Check if element contains blocked content and add to nodesToHide if it does
     * @param {Element} element - Element to check
     * @param {Element|null} container - Optional container to hide instead of element
     */
    async checkAndHideElement(element, container = null) {
        try {
            const hasBlockedContent = await this.elementContainsBlockedContent(element);
            if (hasBlockedContent) {
                this.nodesToHide.add(container || element);
                return true;
            }
            return false;
        } catch (error) {
            console.debug('Error in checkAndHideElement:', error);
            return false;
        }
    }

    /**
     * Main handler method to be implemented by platform-specific handlers
     * @param {Set} nodesToHide - Set to collect nodes that should be hidden
     */
    async handle(nodesToHide, roots = null) {
        this.nodesToHide = nodesToHide;
        this.roots = roots;

        try {
            await this.handlePreconfigured(roots);
        } catch (error) {
            console.debug(`Error in ${this.constructor.name}:`, error);
        }
    }

    async handlePreconfigured() {
        throw new Error('handlePreconfigured must be implemented by subclass');
    }
}

export { BaseHandler };
