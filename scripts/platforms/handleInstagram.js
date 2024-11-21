// handleInstagram.js

import { BaseHandler } from '../core/handlers/baseHandler.js';

class InstagramHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = {
            // Optimized post selectors - target containers directly
            posts: 'article[role="presentation"], [data-testid="post-container"]',

            // Optimized media selectors
            postContent: 'div._aagv, img.x5yr21d, video.x5yr21d, div._aabd',

            // Optimized comment selectors - reduced nesting
            comments: 'div._a9zr, ul._a9zj, div[role="button"]',

            // Optimized text content selector - more specific
            commentText: 'span._ap3a._aaco, div._a9zs, span[dir="auto"]'
        };
    }

    handlePreconfigured() {
        // Process posts and their content in a single pass
        const posts = document.querySelectorAll(this.selectors.posts);
        posts.forEach(post => {
            // Check post container first
            if (this.checkAndHideElement(post)) return;

            // Check media content
            const media = post.querySelector(this.selectors.postContent);
            if (media && this.checkAndHideElement(media, post)) return;

            // Check comments efficiently
            const comments = post.querySelectorAll(this.selectors.comments);
            comments.forEach(comment => {
                if (this.checkAndHideElement(comment)) return;

                // Quick text content check
                const text = comment.querySelector(this.selectors.commentText);
                if (text) this.checkAndHideElement(text, comment);
            });
        });
    }
}

const handler = new InstagramHandler();
export const handleInstagram = (nodesToHide) => handler.handle(nodesToHide);
