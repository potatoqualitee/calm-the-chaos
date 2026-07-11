import { BaseHandler } from '../core/handlers/baseHandler.js';
import { containsBlockedContent } from '../core/contentDetectionModule.js';

const CARD_SELECTOR = 'article, [role="article"], [data-n-tid]';
const LEGACY_TEXT_SELECTOR = [
    '[data-test-locator="stream-item-title"]',
    '[data-test-locator="lead-content-link"]',
    '[data-test-locator="lead-summary"]',
    '[data-test-locator="stream-item-summary"]'
].join(', ');

class GoogleNewsHandler extends BaseHandler {
    async handlePreconfigured(roots = null) {
        await this.processSelectors([CARD_SELECTOR], card => {
            if (containsBlockedContent(card.textContent).length > 0) {
                this.nodesToHide.add(card);
            }
        }, 'Google News card', roots);

        await this.processSelectors([LEGACY_TEXT_SELECTOR], element => {
            if (containsBlockedContent(element.textContent).length > 0) {
                this.nodesToHide.add(element.closest(CARD_SELECTOR) || element);
            }
        }, 'Google News text', roots);
    }
}

const handler = new GoogleNewsHandler();
export const handleGoogleNews = (nodesToHide, roots = null) => handler.handle(nodesToHide, roots);
