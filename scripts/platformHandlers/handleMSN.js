// handleMSN.js

import { elementContainsBlockedContent } from '../contentFilter.js';

function handleMSN(nodesToHide) {
    try {
        const msnSelectors = getMsnSelectors();

        // Target the entry-point element, whether it's a class or a tag
        const entryPoints = document.querySelectorAll('.entry-point, entry-point');
        entryPoints.forEach(entryPoint => {
            msnSelectors.forEach(selector => {
                try {
                    entryPoint.querySelectorAll(selector).forEach(element => {
                        try {
                            if (elementContainsBlockedContent(element) || window.getComputedStyle(element).display === 'none') {
                                const container = element.closest('.content-card-container') || element;
                                nodesToHide.add(container);
                            }
                        } catch (elementError) {
                            console.debug('Error processing MSN element:', elementError);
                        }
                    });
                } catch (selectorError) {
                    console.debug('Error with MSN selector:', selector, selectorError);
                }
            });

            // Handle iframes within the entry-point
            entryPoint.querySelectorAll('iframe').forEach(iframe => {
                try {
                    const iframeDocument = iframe.contentDocument || iframe.contentWindow.document;
                    msnSelectors.forEach(selector => {
                        iframeDocument.querySelectorAll(selector).forEach(element => {
                            if (elementContainsBlockedContent(element) || window.getComputedStyle(element).display === 'none') {
                                const container = element.closest('.content-card-container') || element;
                                nodesToHide.add(container);
                            }
                        });
                    });
                } catch (iframeError) {
                    console.debug('Error processing iframe in MSN:', iframeError);
                }
            });
        });
    } catch (error) {
        console.debug('Error in handleMSN:', error);
    }
}

function getMsnSelectors() {
    return [
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

export { handleMSN };
