// handleBBC.js

import { containsBlockedContent } from '../contentFilter.js';

function handleBBC(nodesToHide) {
    try {
        // Specific selectors targeting both text and images in BBC articles
        const bbcSelectors = [
            '[data-testid="edinburgh-article"]',            // Specific article container
            '[data-testid="card-headline"]',               // Headline of each card
            '[data-testid="card-description"]',            // Article description
            '[data-testid="card-relatedUrls"] h4'          // Related article titles
        ];

        bbcSelectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(element => {
                    const content = element.textContent || '';
                    if (containsBlockedContent(content).length > 0) {
                        // Hide the entire wrapper that contains both image and text
                        const container = element.closest('[data-testid="anchor-inner-wrapper"]') || element;
                        nodesToHide.add(container);
                    }
                });
            } catch (elementError) {
                console.debug('Error processing BBC element:', elementError);
            }
        });
    } catch (error) {
        console.debug('Error in handleBBC:', error);
    }
}

export { handleBBC };
