// handleYahoo.js

import { elementContainsBlockedContent } from '../contentFilter.js';

function handleYahoo(nodesToHide) {
    try {
        // Stream items (news articles)
        const streamItems = document.querySelectorAll('li.stream-item');
        streamItems.forEach(item => {
            try {
                const title = item.querySelector('[data-test-locator="stream-item-title"]')?.textContent || '';
                const summary = item.querySelector('[data-test-locator="stream-item-summary"]')?.textContent || '';
                const category = item.querySelector('[data-test-locator="stream-item-category-label"]')?.textContent || '';

                if (elementContainsBlockedContent(item)) {
                    nodesToHide.add(item);
                }
            } catch (error) {
                console.debug('Error processing Yahoo stream item:', error);
            }
        });

        // Need To Know / Lead Stories sections
        const leadStories = document.querySelectorAll('.ntk-lead, .ntk-wrap');
        leadStories.forEach(story => {
            try {
                const title = story.querySelector('.js-stream-item-title, #ntk-title')?.textContent || '';
                const summary = story.querySelector('[data-test-locator="lead-summary"]')?.textContent || '';

                if (elementContainsBlockedContent(story)) {
                    nodesToHide.add(story);
                }
            } catch (error) {
                console.debug('Error processing Yahoo lead story:', error);
            }
        });

        // Get all article containers and headlines
        const yahooSelectors = [
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

        yahooSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    if (elementContainsBlockedContent(element)) {
                        // Try to find the most appropriate container to hide
                        const container = element.closest('.ntk-lead, .ntk-wrap, li.stream-item') || element;
                        nodesToHide.add(container);
                    }
                });
            } catch (error) {
                console.debug('Error processing Yahoo selector:', selector, error);
            }
        });

    } catch (error) {
        console.debug('Error in handleYahoo:', error);
    }
}

export { handleYahoo };