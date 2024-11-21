// handleInstagram.js

import { BaseHandler } from '../core/handlers/baseHandler.js';

class InstagramHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = {
            // Target both types of posts
            posts: [
                'article[role="presentation"]',
                '[data-testid="post-container"]',
                'div[role="button"] span[dir="auto"]'
            ].join(', '),

            // Target post content including images
            postContent: [
                'div._aagv', // Image container
                'img.x5yr21d', // Image element
                'video.x5yr21d' // Video element
            ].join(', '),

            // Target comments in both structures
            comments: [
                // List-based comments
                'ul > div[role="button"]',
                // Div-based comments
                'div[role="button"] span[dir="auto"][style*="line-height"]',
                // Additional comment text containers
                'span._ap3a._aaco',
                'div._a9zr'
            ].join(', '),

            // Target specific text content
            commentText: [
                // Main comment text
                'span[dir="auto"][style*="line-height"]',
                // Additional text patterns
                'span._ap3a._aaco',
                'span[class*="_aad7"]',
                'div._a9zs'
            ].join(', ')
        };
    }

    handlePreconfigured() {
        // Handle Instagram posts
        this.processSelectors([this.selectors.posts], (post) => {
            // First check the post container itself
            this.checkAndHideElement(post);

            // Then check post content (images, videos) and hide the entire article if matched
            const contentElements = post.querySelectorAll(this.selectors.postContent);
            this.processElements(contentElements, (element) => {
                // Use the closest article as the hide target
                const article = element.closest('article[role="presentation"]');
                if (article) {
                    this.checkAndHideElement(element, article);
                }
            }, 'Instagram post content');
        }, 'Instagram post');

        // Handle Instagram comments
        this.processSelectors([this.selectors.comments], (comment) => {
            // Check the comment container
            this.checkAndHideElement(comment);

            // Also check the specific text content
            const textElements = comment.querySelectorAll(this.selectors.commentText);
            this.processElements(textElements, (textElement) => {
                // Use the parent comment container as the hide target
                this.checkAndHideElement(textElement, comment);
            }, 'Instagram comment text');
        }, 'Instagram comment');
    }
}

const handler = new InstagramHandler();
export const handleInstagram = (nodesToHide) => handler.handle(nodesToHide);
