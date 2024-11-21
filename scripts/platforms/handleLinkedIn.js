// handleLinkedIn.js

import { BaseHandler } from '../core/handlers/baseHandler.js';

class LinkedInHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = {
            posts: '.feed-shared-update-v2:not(footer *), .update-components-actor__meta:not(footer *)',
            comments: '.comments-comment-item:not(footer *)'
        };
    }

    handlePreconfigured() {
        // Handle LinkedIn posts
        this.processSelectors([this.selectors.posts], (post) => {
            this.checkAndHideElement(post);
        }, 'LinkedIn post');

        // Handle LinkedIn comments
        this.processSelectors([this.selectors.comments], (comment) => {
            this.checkAndHideElement(comment);
        }, 'LinkedIn comment');
    }
}

const handler = new LinkedInHandler();
export const handleLinkedIn = (nodesToHide) => handler.handle(nodesToHide);
