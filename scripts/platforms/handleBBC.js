// handleBBC.js

import { BaseHandler } from '../core/handlers/baseHandler.js';
import { removeImmediateBlur } from '../core/config/immediateBlur.js';

class BBCHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = [
            '[data-testid="edinburgh-article"]',            // Specific article container
            '[data-testid="card-headline"]',               // Headline of each card
            '[data-testid="card-description"]',            // Article description
            '[data-testid="card-relatedUrls"] h4'          // Related article titles
        ];
    }

    handlePreconfigured() {
        this.processSelectors(this.selectors, (element) => {
            if (this.checkAndHideElement(element)) {
                // Hide the entire wrapper that contains both image and text
                const container = element.closest('[data-testid="anchor-inner-wrapper"]') || element;
                this.nodesToHide.add(container);
            }
        }, 'BBC element');
    }

    /**
     * Override checkAndHideElement to not immediately add to nodesToHide
     * as we want to handle container selection first
     */
    checkAndHideElement(element) {
        return super.elementContainsBlockedContent(element);
    }
}

const handler = new BBCHandler();
export const handleBBC = async (nodesToHide) => {
    await handler.handle(nodesToHide);
    // Mark content as filtered and remove blur
    document.documentElement.setAttribute('data-calm-chaos-state', 'filtered');
    removeImmediateBlur();
};
