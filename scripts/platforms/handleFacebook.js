// handleFacebook.js

import { BaseHandler } from '../core/handlers/baseHandler.js';
import { containsBlockedContent, elementContainsBlockedContent } from '../core/contentDetectionModule.js';
import { chromeRuntimeSendMessage } from '../utils/chromeApi.js';

class FacebookHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = {
            posts: '[role="article"]:not(footer *), [data-ad-comet-preview="message"]:not(footer *)',
            comments: '[role="article"] [role="presentation"] div[dir="auto"]:not(footer *)',
            articles: '[role="article"]',
            communityHighlights: '[role="main"] [role="feed"]'
        };

        // Add CSS for complete post hiding
        const style = document.createElement('style');
        style.textContent = `
            [role="article"].hidden-post,
            [data-ad-comet-preview="message"].hidden-post,
            [role="presentation"].hidden-comment {
                display: none !important;
            }
        `;
        document.head.appendChild(style);

        // Initialize setting with Promise
        this.settingInitialized = new Promise((resolve) => {
            chrome.storage.local.get(['filterFacebookCommentThreads'], (result) => {
                this.filterCommentsEnabled = result.filterFacebookCommentThreads !== false;
                resolve();
            });
        });

        // Listen for changes to the setting
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.filterFacebookCommentThreads) {
                this.filterCommentsEnabled = changes.filterFacebookCommentThreads.newValue !== false;
                // Re-run handler to update UI
                this.handlePreconfigured();
            }
        });

        this.setupInfiniteScrollObserver();
    }

    // Debounce helper to prevent rapid-fire execution
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    setupInfiniteScrollObserver() {
        try {
            const feedContainer = document.querySelector('[role="feed"]');
            if (!feedContainer) return;

            // Debounced handler for content updates
            const debouncedHandler = this.debounce(() => {
                requestAnimationFrame(() => {
                    this.handlePreconfigured();
                });
            }, 250); // 250ms debounce

            // Use a single mutation observer for all changes
            const observer = new MutationObserver((mutations) => {
                let shouldUpdate = false;
                for (const mutation of mutations) {
                    if (mutation.addedNodes.length) {
                        shouldUpdate = true;
                        break;
                    }
                }
                if (shouldUpdate) {
                    debouncedHandler();
                }
            });

            // Observe feed container with optimized config
            observer.observe(feedContainer, {
                childList: true,
                subtree: true,
                attributes: false,
                characterData: false
            });
        } catch (error) {
            console.debug('Error setting up infinite scroll observer:', error);
        }
    }

    async hideElement(element) {
        if (!element || element.dataset.processing) return;
        element.dataset.processing = 'true';

        requestAnimationFrame(() => {
            element.classList.add('hidden-post');
            element.style.setProperty('display', 'none', 'important');
            this.nodesToHide.add(element);
            delete element.dataset.processing;
        });
    }

    async hideComment(comment) {
        if (!comment || comment.dataset.processing) return;
        comment.dataset.processing = 'true';

        const presentation = comment.closest('[role="presentation"]');
        if (presentation) {
            requestAnimationFrame(() => {
                presentation.classList.add('hidden-comment');
                presentation.style.setProperty('display', 'none', 'important');
                this.nodesToHide.add(presentation);
                delete comment.dataset.processing;
            });
        } else {
            delete comment.dataset.processing;
        }
    }

    async hideCommentContent(comment) {
        if (!comment || comment.dataset.processing) return;
        comment.dataset.processing = 'true';

        const contentDiv = comment.querySelector('div[dir="auto"]');
        if (contentDiv) {
            // Create fragment to minimize reflows
            const fragment = document.createDocumentFragment();
            const hiddenMessage = document.createElement('p');
            hiddenMessage.className = 'text-neutral-content-weak';
            hiddenMessage.textContent = '--comment hidden--';
            fragment.appendChild(hiddenMessage);

            // Keep action buttons and metadata
            const actionButtons = contentDiv.querySelectorAll('.comment-actions, .comment-metadata');
            actionButtons.forEach(button => fragment.appendChild(button.cloneNode(true)));

            requestAnimationFrame(() => {
                contentDiv.textContent = '';
                contentDiv.appendChild(fragment);
                comment.dataset.filtered = 'true';
                this.nodesToHide.add(comment);
                delete comment.dataset.processing;
            });
        } else {
            delete comment.dataset.processing;
        }
    }

    getCommentContent(comment) {
        const contentDiv = comment.querySelector('div[dir="auto"]');
        if (!contentDiv) return '';

        // Create a clone to avoid modifying the actual DOM
        const clone = contentDiv.cloneNode(true);

        // Remove action buttons and metadata to get only the comment text
        const actions = clone.querySelector('.comment-actions');
        const metadata = clone.querySelector('.comment-metadata');
        if (actions) actions.remove();
        if (metadata) metadata.remove();

        return clone.textContent || '';
    }

    async handlePreconfigured() {
        try {
            // Wait for setting to be initialized
            await this.settingInitialized;

            const isPostPage = window.location.href.includes('/posts/');
            const isPhotoPage = window.location.href.includes('/photo/');

            // Skip processing on photo pages to allow navigation
            if (isPhotoPage) return;

            // Process elements in chunks to prevent UI blocking
            const processInChunks = async (elements, processor, chunkSize = 5) => {
                const chunks = [];
                for (let i = 0; i < elements.length; i += chunkSize) {
                    chunks.push(Array.from(elements).slice(i, i + chunkSize));
                }

                for (const chunk of chunks) {
                    await Promise.all(chunk.map(processor));
                    // Small delay between chunks to allow UI to breathe
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            };

            if (isPostPage && this.filterCommentsEnabled) {
                this.nodesToHide.clear();

                const comments = document.querySelectorAll(this.selectors.comments);
                const processComment = async (comment) => {
                    if (comment.dataset.processed) return;
                    comment.dataset.processed = 'true';

                    const content = this.getCommentContent(comment);
                    if (!content) return;

                    const matches = containsBlockedContent(content);
                    if (matches.length > 0) {
                        const parentComment = comment.closest('[role="presentation"]');
                        if (parentComment?.classList.contains('hidden-comment')) return;

                        if (parentComment) {
                            await this.hideComment(comment);
                        } else {
                            await this.hideCommentContent(comment);
                        }
                    }
                };

                await processInChunks(comments, processComment);
            } else {
                const processContent = async (element) => {
                    if (element.dataset.processed) return;
                    element.dataset.processed = 'true';

                    const title = element.getAttribute('aria-label') || '';
                    const content = element.textContent || '';

                    const titleMatches = containsBlockedContent(title);
                    const contentMatches = containsBlockedContent(content);

                    if (titleMatches.length > 0 || contentMatches.length > 0) {
                        await this.hideElement(element);
                    }
                };

                // Process all content types concurrently but in chunks
                const elements = [
                    ...document.querySelectorAll(this.selectors.posts),
                    ...document.querySelectorAll(this.selectors.articles),
                    ...document.querySelectorAll(this.selectors.communityHighlights)
                ];

                await processInChunks(elements, processContent);
            }
        } catch (error) {
            console.debug('Error in handlePreconfigured:', error);
        }
    }
}

const handler = new FacebookHandler();
export const handleFacebook = (nodesToHide) => handler.handle(nodesToHide);
