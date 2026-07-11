// handleLinkedIn.js

import { BaseHandler } from '../core/handlers/baseHandler.js';

class LinkedInHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = {
            posts: '.feed-shared-update-v2:not(footer *), [data-urn^="urn:li:activity"]:not(footer *), [data-view-name="feed-full-update"]:not(footer *)',
            comments: '.comments-comment-item:not(footer *)'
        };
    }

    async handlePreconfigured(roots = null) {
        // Handle LinkedIn posts
        await this.processSelectors([this.selectors.posts], post =>
            this.checkAndHideElement(post), 'LinkedIn post', roots);

        // Handle LinkedIn comments
        await this.processSelectors([this.selectors.comments], comment =>
            this.checkAndHideElement(comment), 'LinkedIn comment', roots);
    }
}

const handler = new LinkedInHandler();
export const handleLinkedIn = (nodesToHide, roots = null) => handler.handle(nodesToHide, roots);
