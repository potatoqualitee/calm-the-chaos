import { BaseHandler } from '../core/handlers/baseHandler.js';
import { containsBlockedContent } from '../core/contentDetectionModule.js';

const CARD_SELECTOR = '[data-testid$="-article"], [data-testid$="-live"]';
const TEXT_SELECTOR = '[data-testid="card-headline"], [data-testid="card-description"], [data-testid="card-relatedUrls"] h4';
const getRenderedText = element => element?.innerText || element?.textContent || '';

class BBCHandler extends BaseHandler {
    getScopes(roots) {
        if (roots) {
            return Array.from(roots)
                .map(root => root?.nodeType === Node.TEXT_NODE ? root.parentElement : root)
                .filter(root => root instanceof Element);
        }

        const main = document.querySelector('main, [role="main"]');
        return main ? [main] : [];
    }

    findCard(element) {
        return element.closest(CARD_SELECTOR) ||
            element.closest('article') ||
            element.closest('[data-testid="anchor-inner-wrapper"]') ||
            element;
    }

    async handlePreconfigured(roots = null) {
        for (const scope of this.getScopes(roots)) {
            const cards = new Set();
            if (scope.matches(CARD_SELECTOR)) cards.add(scope);
            scope.querySelectorAll(CARD_SELECTOR).forEach(card => cards.add(card));

            cards.forEach(card => {
                if (containsBlockedContent(getRenderedText(card)).length > 0) {
                    this.nodesToHide.add(card);
                }
            });

            const textElements = scope.matches(TEXT_SELECTOR) ? [scope] : [];
            scope.querySelectorAll(TEXT_SELECTOR).forEach(element => textElements.push(element));
            textElements.forEach(element => {
                if (containsBlockedContent(getRenderedText(element)).length > 0) {
                    this.nodesToHide.add(this.findCard(element));
                }
            });
        }
    }
}

const handler = new BBCHandler();
export const handleBBC = (nodesToHide, roots = null) => handler.handle(nodesToHide, roots);
