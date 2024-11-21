// handleFacebook.js

import { BaseHandler } from '../core/handlers/baseHandler.js';

class FacebookHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = {
            posts: '[role="article"]:not(footer *), [data-ad-comet-preview="message"]:not(footer *)'
        };
    }

    handlePreconfigured() {
        // Handle Facebook posts
        this.processSelectors([this.selectors.posts], (post) => {
            this.checkAndHideElement(post);
        }, 'Facebook post');
    }
}

const handler = new FacebookHandler();
export const handleFacebook = (nodesToHide) => handler.handle(nodesToHide);
