// handleBluesky.js

import { BaseHandler } from '../core/handlers/baseHandler.js';
import { elementContainsBlockedContent } from '../core/contentDetectionModule.js';

class BlueskyHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = [
            // Thread posts
            'div[data-testid^="postThreadItem-by-"]',
            // Profile feed posts
            'div[data-testid^="feedItem-"]'
        ];
    }

    replacePostContent(post) {
        try {
            // Find all possible content divs using multiple selectors to catch all variations
            const contentSelectors = [
                // Text content
                'div[dir="auto"][data-word-wrap="1"]',           // Standard post content
                'article[data-testid="postContent"] div[dir]',   // Profile feed post content
                'div[data-testid="postContent"] div[dir]',       // Alternative post content

                // Embedded content
                'div[data-testid="postContent"] div[data-testid="embeds"]',  // Embed container
                'div[data-testid="quote-post"]',                             // Quote posts
                'div[data-testid="embed-external"]',                         // External links

                // Image containers - using generic selectors
                'div[data-expoimage]',                          // Direct image containers
                'div[class^="css-"][style*="margin-top"]',      // Image wrapper containers
                'div[style*="overflow: hidden"]',               // Image aspect ratio containers

                // Quote posts and nested content
                'div[class^="css-"][style*="border-radius"][style*="padding"]',  // Quote containers
                'div[data-testid="contentHider-post"]',        // Content hider containers
                'div[data-word-wrap="1"]',                     // Post text content
                'div[style*="display: none"]',                 // Hidden content
                'div[class^="css-"][style*="overflow: hidden"][style*="padding-top"]', // Image containers
                'div[data-expoimage="true"]'                   // Image elements
            ];

            const contentDivs = post.querySelectorAll(contentSelectors.join(','));
            if (!contentDivs.length) return false;

            let success = false;
            contentDivs.forEach(contentDiv => {
                // Skip already processed divs or metadata divs
                if (contentDiv.dataset.originalContent ||
                    contentDiv.closest('[data-testid="postMeta"]')) return;

                // For embedded content and images, we want to process even if there's no text
                const isEmbed = contentDiv.matches([
                    'div[data-testid="embeds"]',
                    'div[data-testid="quote-post"]',
                    'div[data-testid="embed-external"]',
                    'div[data-expoimage="true"]',
                    'div.css-175oi2r[style*="margin-top: 8px"]',
                    'div[style*="overflow: hidden"][style*="padding-top"]'
                ].join(','));

                // Skip empty divs unless they're embed/image containers
                if (!isEmbed && !contentDiv.textContent.trim() && !contentDiv.querySelector('img')) return;

                // For quote posts, preserve the container structure
                if (contentDiv.matches('div[class^="css-"][style*="border-radius"][style*="padding"]')) {
                    var container = contentDiv.cloneNode(true);  // Clone with children to preserve structure
                    // Find and replace all content within the quote
                    ['div[data-word-wrap="1"]', 'div[data-expoimage="true"]', 'div[style*="overflow: hidden"][style*="padding-top"]', 'div[style*="display: none"]'].forEach(function (selector) {
                        container.querySelectorAll(selector).forEach(function (div) {
                            // Store original content
                            div.dataset.originalContent = div.innerHTML;
                            div.innerHTML = '<span class="filtered-content" style="color: #999; font-style: italic; opacity: 0.7; cursor: pointer;">-- content hidden --</span>';
                            // Add click handler
                            const span = div.querySelector('.filtered-content');
                            if (span) {
                                span.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    if (div.dataset.originalContent) {
                                        div.innerHTML = div.dataset.originalContent;
                                        delete div.dataset.originalContent;
                                    }
                                });
                            }
                            if (div.style && div.style.display === 'none') {
                                div.style.display = '';
                            }
                        });
                    });
                    contentDiv.replaceWith(container);
                    success = true;
                    return;
                }

                // For image containers, preserve the basic container structure
                if (contentDiv.matches('div[class^="css-"][style*="margin-top"]')) {
                    var container = contentDiv.cloneNode(false);
                    var innerDiv = document.createElement('div');
                    innerDiv.className = contentDiv.className;
                    innerDiv.style.cssText = 'width: 100%;';

                    var contentWrapper = document.createElement('div');
                    contentWrapper.className = contentDiv.className;
                    contentWrapper.style.cssText = 'overflow: hidden; padding-top: 45%;';
                    // Store original content
                    contentWrapper.dataset.originalContent = contentDiv.innerHTML;
                    contentWrapper.innerHTML = '<span class="filtered-content" style="color: #999; font-style: italic; opacity: 0.7; cursor: pointer;">-- content hidden --</span>';
                    // Add click handler
                    const span = contentWrapper.querySelector('.filtered-content');
                    if (span) {
                        span.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (contentWrapper.dataset.originalContent) {
                                contentWrapper.innerHTML = contentWrapper.dataset.originalContent;
                                delete contentWrapper.dataset.originalContent;
                            }
                        });
                    }

                    innerDiv.appendChild(contentWrapper);
                    container.appendChild(innerDiv);
                    contentDiv.replaceWith(container);
                    success = true;
                    return;
                }

                // For hidden content or text content, replace and ensure it's visible
                if (contentDiv.matches('div[data-word-wrap="1"], div[style*="display: none"]')) {
                    // Store original content
                    contentDiv.dataset.originalContent = contentDiv.innerHTML;
                    contentDiv.innerHTML = '<span class="filtered-content" style="color: #999; font-style: italic; opacity: 0.7; cursor: pointer;">-- content hidden --</span>';
                    // Add click handler
                    const span = contentDiv.querySelector('.filtered-content');
                    if (span) {
                        span.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (contentDiv.dataset.originalContent) {
                                contentDiv.innerHTML = contentDiv.dataset.originalContent;
                                delete contentDiv.dataset.originalContent;
                            }
                        });
                    }
                    // Remove any display:none styling
                    if (contentDiv.style && contentDiv.style.display === 'none') {
                        contentDiv.style.display = '';
                    }
                    success = true;
                    return;
                }

                // Store original content
                contentDiv.dataset.originalContent = contentDiv.innerHTML;

                // Replace with styled filtered message
                contentDiv.innerHTML = '<span class="filtered-content" style="color: #999; font-style: italic; opacity: 0.7; cursor: pointer;">-- content hidden --</span>';
                // Add click handler to restore content
                const span = contentDiv.querySelector('.filtered-content');
                if (span) {
                    span.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent post click events
                        if (contentDiv.dataset.originalContent) {
                            contentDiv.innerHTML = contentDiv.dataset.originalContent;
                            delete contentDiv.dataset.originalContent;
                        }
                    });
                }
                success = true;
            });

            return success;
        } catch (error) {
            console.debug('Error replacing post content:', error);
            return false;
        }
    }

    async handlePreconfigured() {
        for (const selector of this.selectors) {
            try {
                const posts = document.querySelectorAll(selector);

                for (const post of posts) {
                    // Skip if already processed
                    if (post.dataset.calmChaosProcessed === 'true') continue;

                    if (await elementContainsBlockedContent(post)) {
                        if (this.replacePostContent(post)) {
                            post.dataset.calmChaosProcessed = 'true';
                            this.nodesToHide.add(post);
                        }
                    }
                }
            } catch (error) {
                console.debug(`Error processing Bluesky ${selector}:`, error);
            }
        }

        // Set up observers for dynamically loaded content
        const containerSelectors = [
            '[data-testid="feedContent"]',      // Profile feed
            '[data-testid="threadMain"]',       // Thread view
            '[data-testid="profilePosts"]'      // Profile posts
        ];

        containerSelectors.forEach(selector => {
            const container = document.querySelector(selector);
            if (container && !container.dataset.calmChaosObserved) {
                const observer = new MutationObserver((mutations) => {
                    let shouldProcess = false;
                    mutations.forEach((mutation) => {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                // Check if the added node is a post or contains posts
                                if (node.matches(this.selectors.join(',')) ||
                                    node.querySelector(this.selectors.join(','))) {
                                    shouldProcess = true;
                                }
                            }
                        });
                    });

                    // Only process if we found relevant nodes
                    if (shouldProcess) {
                        this.handlePreconfigured();
                    }
                });

                observer.observe(container, {
                    childList: true,
                    subtree: true
                });

                container.dataset.calmChaosObserved = 'true';
            }
        });
    }
}

const handler = new BlueskyHandler();
export const handleBluesky = (nodesToHide) => handler.handle(nodesToHide);