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

    async handlePreconfigured(roots = null) {
        await this.processSelectors([this.selectors.posts], post =>
            this.checkAndHideElement(post), 'Instagram post', roots);
    }
}

const handler = new InstagramHandler();
export const handleInstagram = (nodesToHide, roots = null) => handler.handle(nodesToHide, roots);
