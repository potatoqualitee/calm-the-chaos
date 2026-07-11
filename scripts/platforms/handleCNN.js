import { BaseHandler } from '../core/handlers/baseHandler.js';
import { containsBlockedContent } from '../core/contentDetectionModule.js';

const MAIN_SELECTOR = 'main, [role="main"], #main-content';
const CARD_SELECTOR = [
    '[data-component-name="card"]',
    '[data-uri*="/card/instances/"]',
    'li.card',
    'article.card'
].join(', ');
const getRenderedText = element => element?.innerText || element?.textContent || '';

class CNNHandler extends BaseHandler {
    getScopes(roots) {
        if (roots) {
            return Array.from(roots)
                .map(root => root?.nodeType === Node.TEXT_NODE ? root.parentElement : root)
                .filter(root => root instanceof Element);
        }

        const main = document.querySelector(MAIN_SELECTOR);
        return main ? [main] : [];
    }

    isArticlePage(scope) {
        return scope.matches('article, .article') ||
            (scope.tagName === 'ARTICLE' && scope.classList.contains('article'));
    }

    async processArticle(scope) {
        // CNN currently renders the headline immediately before the article
        // region, so it is intentionally queried from the document.
        const headline = document.querySelector('h1.headline__text, h1[class*="headline"], h1');
        if (headline && containsBlockedContent(getRenderedText(headline)).length > 0) {
            this.nodesToHide.add(headline);
            this.nodesToHide.add(scope);
            return;
        }

        const paragraphs = scope.querySelectorAll('.paragraph-elevate, [class*="paragraph"]');
        for (const paragraph of paragraphs) {
            if (containsBlockedContent(getRenderedText(paragraph)).length > 0) {
                this.nodesToHide.add(paragraph);
            }
        }
    }

    processStoryCards(scope) {
        scope.querySelectorAll(CARD_SELECTOR).forEach(card => {
            if (containsBlockedContent(getRenderedText(card)).length > 0) {
                this.nodesToHide.add(card);
            }
        });
    }

    processStandaloneLinks(scope) {
        scope.querySelectorAll('a[href]').forEach(link => {
            if (link.closest('header, footer, nav, [role="navigation"]')) return;
            if (link.closest(CARD_SELECTOR)) return;

            const text = getRenderedText(link).trim();
            const href = link.getAttribute('href') || '';
            if (!text && !href) return;

            if (containsBlockedContent(`${text} ${href}`).length > 0) {
                this.nodesToHide.add(link);
            }
        });
    }

    async handlePreconfigured(roots = null) {
        for (const scope of this.getScopes(roots)) {
            if (this.isArticlePage(scope)) {
                await this.processArticle(scope);
                continue;
            }

            this.processStoryCards(scope);
            this.processStandaloneLinks(scope);
        }
    }
}

const handler = new CNNHandler();
export const handleCNN = (nodesToHide, roots = null) => handler.handle(nodesToHide, roots);
