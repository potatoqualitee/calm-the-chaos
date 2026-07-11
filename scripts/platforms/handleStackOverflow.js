// handleStackOverflow.js

import { BaseHandler } from '../core/handlers/baseHandler.js';
import { elementContainsBlockedContent } from '../core/contentDetectionModule.js';

class StackOverflowHandler extends BaseHandler {
    constructor() {
        super();
        this.selectors = {
            questionHeader: '#question-header',
            question: '#question, .question',
            questionSummary: '.s-post-summary, .question-summary',
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
            ...document.querySelectorAll(this.selectors.questionHeader),
            ...document.querySelectorAll(this.selectors.question),
            ...document.querySelectorAll(this.selectors.questionSummary),
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
                if (element.matches(this.selectors.questionHeader)) {
                    const question = document.querySelector('#question, .question');
                    if (question) this.nodesToHide.add(question);
                }
            }
        }
    }
}

let handler = null;
export const handleStackOverflow = (nodesToHide, roots = null) => {
    if (!handler) handler = new StackOverflowHandler();
    return handler.handle(nodesToHide, roots);
};
