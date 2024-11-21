// handleYahoo.js

import { BaseHandler } from '../core/handlers/baseHandler.js';

class YahooHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = [
            'li.stream-item',
            '[data-test-locator="stream-item-title"]',
            '[data-test-locator="stream-item-summary"]',
            '[data-test-locator="lead-item-image"]',
            '[data-test-locator="lead-content-link"]',
            '[data-test-locator="lead-summary"]',
            '.js-content-viewer',
            '.stream-title',
            '.story-title',
            '.article-content',
            '.category-links',
            '.trending-list li',
            '.modal-content',
            '.stream-item-category-label',
            '.js-stream-content',
            '.ntk-lead',
            '.ntk-link-filter',
            '.ntk-wrap',
            '.js-stream-item-title',
            '#ntk-title',
            '.need-to-know-section'
        ];
    }

    handlePreconfigured() {
        // Handle stream items (news articles)
        this.processSelectors(['li.stream-item'], (item) => {
            const container = item;
            this.checkAndHideElement(item, container);
        }, 'Yahoo stream item');

        // Handle Need To Know / Lead Stories sections
        this.processSelectors(['.ntk-lead, .ntk-wrap'], (story) => {
            const container = story;
            this.checkAndHideElement(story, container);
        }, 'Yahoo lead story');

        // Handle all other selectors
        this.processSelectors(this.selectors, (element) => {
            const container = element.closest('.ntk-lead, .ntk-wrap, li.stream-item') || element;
            this.checkAndHideElement(element, container);
        }, 'Yahoo element');
    }
}

const handler = new YahooHandler();
export const handleYahoo = (nodesToHide) => handler.handle(nodesToHide);
