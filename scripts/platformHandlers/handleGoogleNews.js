// handleGoogleNews.js

import { containsBlockedContent } from '../contentFilter.js';

function handleGoogleNews(nodesToHide) {
    try {
        // Focus only on data-test-locator selectors
        const googleNewsSelectors = [
            '[data-test-locator="stream-item-title"]',
            '[data-test-locator="lead-content-link"]',
            '[data-test-locator="lead-summary"]',
            '[data-test-locator="stream-item-summary"]'
        ];

        const processGoogleNews = () => {
            // First check the Local News container
            const localNewsSection = document.querySelector('.eDrqsc');
            if (localNewsSection && containsBlockedContent(localNewsSection.textContent || '').length > 0) {
                nodesToHide.add(localNewsSection);
            }

            // Then check individual elements
            googleNewsSelectors.forEach(selector => {
                try {
                    document.querySelectorAll(selector).forEach(element => {
                        if (containsBlockedContent(element.textContent || '').length > 0) {
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

                            nodesToHide.add(container);
                        }
                    });
                } catch (selectorError) {
                    console.debug('Error processing Google News selector:', selector, selectorError);
                }
            });
        };

        // Initial processing
        processGoogleNews();

        // Setup a mutation observer specifically looking for the local news container load
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' &&
                    (mutation.target.classList.contains('eDrqsc') ||
                        mutation.target.querySelector('.eDrqsc'))) {
                    // Small delay to ensure content is fully loaded
                    setTimeout(processGoogleNews, 100);
                }
            });
        });

        // Start observing, focusing on the areas where local news appears
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

    } catch (error) {
        console.debug('Error in handleGoogleNews:', error);
    }
}

export { handleGoogleNews };