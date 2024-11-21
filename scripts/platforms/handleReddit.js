// handleReddit.js

import { BaseHandler } from '../core/handlers/baseHandler.js';
import { containsBlockedContent, elementContainsBlockedContent } from '../core/contentDetectionModule.js';
import { chromeRuntimeSendMessage } from '../utils/chromeApi.js';

class RedditHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = {
            posts: 'shreddit-post:not(footer *)',
            comments: 'shreddit-comment:not(footer *), details[role="article"]',
            articles: 'article[data-ks-item]:not(footer *)',
            communityHighlights: 'community-highlight-carousel',
            faceplateArticles: 'faceplate-batch article.w-full'
        };

        // Add CSS for complete post hiding
        const style = document.createElement('style');
        style.textContent = `
            shreddit-post.hidden-post,
            article.hidden-post,
            faceplate-batch article.hidden-post,
            hr.hidden-post {
                display: none !important;
            }

            shreddit-comment.hidden-comment {
                display: none !important;
            }
        `;
        document.head.appendChild(style);

        // Initialize setting with Promise
        this.settingInitialized = new Promise((resolve) => {
            chrome.storage.local.get(['filterRedditCommentThreads'], (result) => {
                this.filterCommentsEnabled = result.filterRedditCommentThreads !== false;
                resolve();
            });
        });

        // Listen for changes to the setting
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.filterRedditCommentThreads) {
                this.filterCommentsEnabled = changes.filterRedditCommentThreads.newValue !== false;
                // Re-run handler to update UI
                this.handlePreconfigured();
            }
        });

        this.setupInfiniteScrollObserver();
    }

    setupInfiniteScrollObserver() {
        try {
            const feedContainer = document.querySelector('[data-testid="posts-list"]') ||
                                document.querySelector('[data-testid="feed-container"]');

            if (feedContainer) {
                const mutationObserver = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.addedNodes.length) {
                            this.handlePreconfigured();
                        }
                    });
                });

                const intersectionObserver = new IntersectionObserver((entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            this.handlePreconfigured();
                        }
                    });
                }, {
                    root: null,
                    rootMargin: '200px'
                });

                const updateIntersectionObserver = () => {
                    const posts = feedContainer.querySelectorAll(this.selectors.posts);
                    if (posts.length) {
                        Array.from(posts).slice(-5).forEach(post => {
                            intersectionObserver.observe(post);
                        });
                    }
                };

                updateIntersectionObserver();
                mutationObserver.observe(feedContainer, {
                    childList: true,
                    subtree: true
                });
            }
        } catch (error) {
            console.debug('Error setting up infinite scroll observer:', error);
        }
    }

    hideElement(element) {
        element.classList.add('hidden-post');
        element.style.display = 'none !important';
        this.nodesToHide.add(element);

        const nextHr = element.nextElementSibling;
        if (nextHr && nextHr.tagName === 'HR') {
            nextHr.classList.add('hidden-post');
            nextHr.style.display = 'none !important';
        }
    }

    hideComment(comment) {
        comment.classList.add('hidden-comment');
        comment.style.display = 'none !important';
        this.nodesToHide.add(comment);
    }

    hideCommentContent(comment) {
        // Find the comment content div and replace its text
        const contentDiv = comment.querySelector('div[slot="comment"]');
        if (contentDiv) {
            // Skip if content was manually revealed
            if (comment.dataset.contentRevealed === 'true') {
                return;
            }

            // Store original content elements
            const originalContent = Array.from(contentDiv.children);

            // Store non-action content for restoration
            const contentToRestore = originalContent.filter(child =>
                !child.classList.contains('comment-actions-bar') &&
                !child.classList.contains('comment-metadata')
            );

            // Store original content in dataset
            contentDiv.dataset.originalContent = contentToRestore.map(el => el.outerHTML).join('');

            // Clear the content div and add the hidden comment message with styling
            const hiddenMessage = document.createElement('p');
            hiddenMessage.className = 'text-neutral-content-weak';
            hiddenMessage.textContent = '--comment hidden--';
            hiddenMessage.style.cursor = 'pointer';

            // Add click handler to restore content
            hiddenMessage.addEventListener('click', (e) => {
                e.stopPropagation();
                if (contentDiv.dataset.originalContent) {
                    // Create a temporary container
                    const temp = document.createElement('div');
                    temp.innerHTML = contentDiv.dataset.originalContent;

                    // Clear existing content except action buttons/metadata
                    const actionsAndMetadata = originalContent.filter(child =>
                        child.classList.contains('comment-actions-bar') ||
                        child.classList.contains('comment-metadata')
                    );
                    contentDiv.textContent = '';

                    // Add restored content
                    Array.from(temp.children).forEach(child => {
                        contentDiv.appendChild(child);
                    });

                    // Re-add action buttons and metadata
                    actionsAndMetadata.forEach(child => {
                        contentDiv.appendChild(child);
                    });

                    // Mark as revealed to prevent re-processing
                    comment.dataset.contentRevealed = 'true';

                    // Clean up
                    delete contentDiv.dataset.originalContent;
                }
            });

            contentDiv.textContent = ''; // Clear existing content
            contentDiv.appendChild(hiddenMessage);

            // Re-add any action buttons or metadata that was at the bottom of the comment
            originalContent.forEach(child => {
                if (child.classList.contains('comment-actions-bar') ||
                    child.classList.contains('comment-metadata')) {
                    contentDiv.appendChild(child);
                }
            });

            // Mark this comment as filtered for counting
            comment.dataset.filtered = 'true';
            this.nodesToHide.add(comment);
        }
    }

    getCommentContent(comment) {
        const contentDiv = comment.querySelector('div[slot="comment"]');
        if (!contentDiv) return '';

        // Create a clone to avoid modifying the actual DOM
        const clone = contentDiv.cloneNode(true);

        // Remove action buttons and metadata to get only the comment text
        const actionsBar = clone.querySelector('.comment-actions-bar');
        const metadata = clone.querySelector('.comment-metadata');
        if (actionsBar) actionsBar.remove();
        if (metadata) metadata.remove();

        return clone.textContent || '';
    }

    async handlePreconfigured() {
        try {
            // Wait for setting to be initialized
            await this.settingInitialized;

            const isPostPage = window.location.href.includes('/comments/');

            if (isPostPage) {
                // Reset nodesToHide for accurate counting
                this.nodesToHide.clear();

                // Check the class property
                if (!this.filterCommentsEnabled) {
                    chromeRuntimeSendMessage({ type: 'setGrayIcon' });
                    return;
                }

                chromeRuntimeSendMessage({ type: 'setColorIcon' });

                // First pass: Process direct comments (depth=0)
                await this.processSelectors([this.selectors.comments], async (comment) => {
                    // Skip if it's not a shreddit-comment element
                    if (comment.tagName.toLowerCase() !== 'shreddit-comment') return;

                    const depth = parseInt(comment.getAttribute('depth') || '0');
                    if (depth === 0) {
                        // Only check the content of this specific comment, not its replies
                        const content = this.getCommentContent(comment);
                        if (containsBlockedContent(content).length > 0) {
                            this.hideComment(comment);
                        }
                    }
                }, 'Reddit direct comment');

                // Second pass: Process reply comments (depth>0)
                await this.processSelectors([this.selectors.comments], async (comment) => {
                    // Skip if it's not a shreddit-comment element
                    if (comment.tagName.toLowerCase() !== 'shreddit-comment') return;

                    const depth = parseInt(comment.getAttribute('depth') || '0');
                    if (depth > 0) {
                        // Skip if the parent comment is hidden
                        const parentComment = comment.closest('shreddit-comment[depth="0"]');
                        if (parentComment && parentComment.classList.contains('hidden-comment')) {
                            return;
                        }

                        const content = this.getCommentContent(comment);
                        if (containsBlockedContent(content).length > 0) {
                            this.hideCommentContent(comment);
                        }
                    }
                }, 'Reddit reply comment');

                const postElements = document.querySelectorAll(`
                    h1[id^="post-title"],
                    shreddit-post,
                    .post-title,
                    [slot="title"],
                    [slot="post-content"],
                    [slot="post-media-container"],
                    article.Post
                `);

                postElements.forEach(element => {
                    if (element) {
                        element.style.removeProperty('display');
                        element.classList.remove('hidden-post');
                        element.setAttribute('style', (element.getAttribute('style') || '').replace(/display\s*:\s*none\s*!important\s*;?/g, ''));
                    }
                });
            } else {
                const processContent = async (element, title = '', content = '') => {
                    const titleMatches = containsBlockedContent(title);
                    const contentMatches = containsBlockedContent(content);

                    if (titleMatches.length > 0 || contentMatches.length > 0) {
                        this.hideElement(element);
                    }
                };

                await this.processSelectors([this.selectors.faceplateArticles], async (article) => {
                    await processContent(
                        article,
                        article.getAttribute('aria-label') || '',
                        article.textContent || ''
                    );
                }, 'Faceplate article');

                await this.processSelectors([this.selectors.posts], async (post) => {
                    await processContent(
                        post,
                        post.getAttribute('post-title') || '',
                        post.textContent || ''
                    );
                }, 'Reddit post');

                await this.processSelectors([this.selectors.articles], async (article) => {
                    await processContent(
                        article,
                        '',
                        article.textContent || ''
                    );
                }, 'Reddit article');

                await this.processSelectors([this.selectors.communityHighlights], async (highlight) => {
                    const content = highlight.textContent || '';
                    if (containsBlockedContent(content).length > 0) {
                        this.hideElement(highlight);
                    }
                }, 'Reddit community highlights');
            }

            const mainContent = document.getElementById('main-content');
            if (mainContent && this.nodesToHide.has(mainContent)) {
                this.nodesToHide.delete(mainContent);
            }
        } catch (error) {
            console.debug('Error in handlePreconfigured:', error);
        }
    }
}

const handler = new RedditHandler();
export const handleReddit = (nodesToHide) => handler.handle(nodesToHide);
