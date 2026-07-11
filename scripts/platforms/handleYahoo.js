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
            '.need-to-know-section',
            'article',
            '[role="article"]',
            '[data-testid*="story"]'
        ];
    }

    async handlePreconfigured(roots = null) {
        // Handle stream items (news articles)
        await this.processSelectors(['li.stream-item, article, [role="article"], [data-testid*="story"]'], item => {
            const container = item;
            return this.checkAndHideElement(item, container);
        }, 'Yahoo stream item', roots);

        // Handle Need To Know / Lead Stories sections
        await this.processSelectors(['.ntk-lead, .ntk-wrap'], story => {
            const container = story;
            return this.checkAndHideElement(story, container);
        }, 'Yahoo lead story', roots);

        // Handle all other selectors
        await this.processSelectors(this.selectors, element => {
            const container = element.closest('.ntk-lead, .ntk-wrap, li.stream-item, article, [role="article"], [data-testid*="story"]') || element;
            return this.checkAndHideElement(element, container);
        }, 'Yahoo element', roots);
    }
}

const handler = new YahooHandler();
export const handleYahoo = (nodesToHide, roots = null) => handler.handle(nodesToHide, roots);
