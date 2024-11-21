// handleStackOverflow.js

import { BaseHandler } from '../core/handlers/baseHandler.js';
import { elementContainsBlockedContent } from '../core/contentDetectionModule.js';

class StackOverflowHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = {
            answers: '.answer',
            comments: '.comment-body',
            sidebarRelated: '#sidebar > div.module.sidebar-related',
            hotNetworkItems: '#hot-network-questions li'
        };

        // Add CSS for hiding filtered elements
        const style = document.createElement('style');
        style.textContent = `
            .hidden-post,
            .hidden-post * {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Override the base handler's generic methods to do nothing
    processElements() {}
    processSelectors() {}

    async handlePreconfigured() {
        // Only check these specific elements
        const elements = [
            ...document.querySelectorAll(this.selectors.answers),
            ...document.querySelectorAll(this.selectors.comments),
            ...document.querySelectorAll(this.selectors.sidebarRelated),
            ...document.querySelectorAll(this.selectors.hotNetworkItems)
        ];

        for (const element of elements) {
            const hasBlockedContent = await elementContainsBlockedContent(element);
            if (hasBlockedContent) {
                element.classList.add('hidden-post');
                this.nodesToHide.add(element);
            }
        }
    }
}

const handler = new StackOverflowHandler();
export const handleStackOverflow = (nodesToHide) => handler.handle(nodesToHide);
