// handleCNN.js

import { BaseHandler } from '../core/handlers/baseHandler.js';
import { elementContainsBlockedContent } from '../core/contentDetectionModule.js';
import { handleGenericMedia } from '../core/elementProcessingModule.js';
import { removeImmediateBlur } from '../core/config/immediateBlur.js';

class CNNHandler extends BaseHandler {
    constructor() {
        super();

        // Use the most basic content patterns possible
        // Why?
        // 1. Content is fundamentally just text in headlines, articles, or stories
        // 2. Sites may structure differently but text patterns remain consistent
        // 3. Fewer, simpler selectors are more maintainable and reliable
        this.selectors = {
            content: [
                // Basic content patterns - these are fundamental across all news sites
                '[class*="headline"]',     // Any headline element
                '[class*="text"]',         // Any text element
                '[data-editable]',         // Any editable content

                // Basic content containers - these are standard across sites
                '[class*="article"]',
                '[class*="story"]',

                // Generic structure patterns
                '[class*="layout"]',
                '[class*="zone"]',
                '[class*="container"]'
            ]
        };

        // UI elements to ignore
        this.ignoreSelectors = [
            // Header and navigation structure
            '[class*="header__"]',         // All header elements
            '[class*="nav"]',              // All navigation elements
            '[class*="menu"]',             // All menu elements
            '[class*="subnav"]',           // All subnav elements
            '[class*="sub-nav"]',          // Alternative subnav format
            '[class*="navigation"]',        // Full navigation word
            '[class*="-nav-"]',            // Nav with prefixes/suffixes
            '.nav-menu',
            '.nav-menu-links',
            '.nav-menu-link',
            '.sub-nav',
            '.sub-nav-item',
            '.sub-nav-item-active',

            // Brand and logo elements
            '[class*="brand-logo"]',       // All brand/logo elements
            '[class*="brand"]',
            '[class*="logo"]',

            // User account elements
            '[class*="user-account"]',     // All user account elements
            '[class*="account"]',
            '[class*="user"]',

            // Search functionality
            '[class*="search"]',           // All search elements
            '.search-bar',
            '.search-button',

            // Utility elements
            '[class*="utility"]',          // All utility elements
            '[class*="subscribe"]',
            '.utility-links',
            '.utility-link',

            // Mobile navigation
            '[class*="mobile"]',           // All mobile elements
            '.mobile-nav',
            '.mobile-nav-toggle',
            '.mobile-nav-menu',

            // Edition selector
            '[class*="editionizer"]',      // All edition selector elements

            // Social links
            '[class*="social-links"]',     // All social media elements

            // Advertisement elements
            '[class*="ad-"]',              // All ad-related elements
            '[class*="advertisement"]',

            // Media elements
            '[class*="media"]',
            '[class*="image"]',
            '[class*="photo"]',
            '[class*="picture"]',
            '[class*="video"]',
            '[class*="audio"]',

            // Footer elements
            '#pageFooter',
            '[class*="footer"]'
        ];
    }

    /**
     * Override the base elementContainsBlockedContent to ignore data attributes in navigation
     */
    async elementContainsBlockedContent(element) {
        // If element is part of navigation, only check visible text content
        if (this.hasNavigationParent(element)) {
            const visibleText = element.innerText || element.textContent || '';
            return (await elementContainsBlockedContent(visibleText));
        }

        // Otherwise use default behavior
        return (await elementContainsBlockedContent(element));
    }

    async handlePreconfigured() {
        // Target the most relevant content containers first
        const mainContent = document.querySelector('main, [role="main"], #main-content');
        if (!mainContent) return;

        // Get all headline and article elements within main content
        const headlines = mainContent.querySelectorAll('[class*="headline"], [class*="title"], h1, h2, h3');
        const articles = mainContent.querySelectorAll('[class*="article"], [class*="story"]');

        // Process headlines first - they're most important
        const headlinePromises = Array.from(headlines).map(async headline => {
            try {
                const text = headline.innerText || headline.textContent;
                if (!text?.trim()) return;

                if (await this.elementContainsBlockedContent(text)) {
                    this.nodesToHide.add(headline);
                }
            } catch (error) {
                console.debug('Error processing headline:', error);
            }
        });

        // Process headlines immediately
        await Promise.all(headlinePromises);

        // Then process articles
        const articlePromises = Array.from(articles).map(async article => {
            try {
                // Skip if already processed as part of a headline
                if (this.nodesToHide.has(article)) return;

                const text = article.innerText || article.textContent;
                if (!text?.trim()) return;

                if (await this.elementContainsBlockedContent(text)) {
                    // Find the most specific container
                    const container = this.findTextContainer(article);
                    if (container) {
                        this.nodesToHide.add(container);
                    }
                }
            } catch (error) {
                console.debug('Error processing article:', error);
            }
        });

        // Process articles
        await Promise.all(articlePromises);

        // Finally, check for any remaining content containers
        const containers = mainContent.querySelectorAll('[class*="container"]');
        const containerPromises = Array.from(containers).map(async container => {
            try {
                // Skip if already processed
                if (this.nodesToHide.has(container)) return;

                // Skip navigation/header/footer containers
                if (container.closest('header, footer, nav')) return;

                const text = container.innerText || container.textContent;
                if (!text?.trim()) return;

                if (await this.elementContainsBlockedContent(text)) {
                    const textContainer = this.findTextContainer(container);
                    if (textContainer) {
                        this.nodesToHide.add(textContainer);
                    }
                }
            } catch (error) {
                console.debug('Error processing container:', error);
            }
        });

        // Process remaining containers
        await Promise.all(containerPromises);
    }

    // Optimized navigation check using pre-computed Set
    isInNavigationArea(element, navElements) {
        let current = element;
        while (current) {
            if (navElements.has(current)) return true;
            current = current.parentElement;
        }
        return false;
    }

    /**
     * Check if element has any navigation-related parents
     */
    hasNavigationParent(element) {
        let current = element;
        while (current) {
            // Check data attributes
            if (current.getAttribute('data-zjs-navigation-type') ||
                current.getAttribute('data-zjs-container_type') === 'navigation' ||
                current.getAttribute('data-zjs-navigation-location') === 'header' ||
                current.getAttribute('data-zjs-navigation-location') === 'footer') {
                return true;
            }

            // Check classes
            const classList = current.classList ? Array.from(current.classList) : [];
            if (classList.some(cls =>
                cls.includes('nav') ||
                cls.includes('subnav') ||
                cls.includes('header') ||
                cls.includes('footer'))) {
                return true;
            }

            current = current.parentElement;
        }
        return false;
    }

    /**
     * Check element and its descendants for blocked content
     */
    checkElementAndDescendants(element) {
        // Skip media elements entirely
        if (element.tagName === 'IMG' || element.tagName === 'PICTURE' || element.tagName === 'SVG' ||
            element.classList.toString().toLowerCase().includes('media') ||
            element.classList.toString().toLowerCase().includes('image')) {
            return false;
        }

        // Skip navigation elements entirely
        if (this.hasNavigationParent(element)) {
            return false;
        }

        // Check the element itself
        if (this.elementContainsBlockedContent(element)) {
            return true;
        }

        // Check descendants but skip UI elements and media
        const textNodes = Array.from(element.querySelectorAll('*'))
            .filter(el => !this.shouldIgnoreElement(el) && !this.hasNavigationParent(el));

        return textNodes.some(node => this.elementContainsBlockedContent(node));
    }

    /**
     * Check if element should be ignored
     */
    shouldIgnoreElement(element) {
        // Check navigation attributes first
        if (this.hasNavigationParent(element)) {
            return true;
        }

        return this.ignoreSelectors.some(selector => {
            const matches = element.matches(selector) || element.closest(selector);
            return matches;
        });
    }

    /**
     * Find the specific text container instead of the entire content container
     */
    findTextContainer(element) {
        // Skip if element is in navigation
        if (this.hasNavigationParent(element)) {
            return null;
        }

        // If element is already a text container, return it
        if (element.classList.toString().toLowerCase().includes('text') ||
            element.classList.toString().toLowerCase().includes('headline') ||
            element.getAttribute('data-editable') !== null) {
            return element;
        }

        // Look for text containers up the tree, but stop at article boundaries
        let current = element;
        while (current && !current.classList.toString().toLowerCase().includes('article')) {
            if (current.classList.toString().toLowerCase().includes('text') ||
                current.classList.toString().toLowerCase().includes('headline') ||
                current.getAttribute('data-editable') !== null) {
                return current;
            }
            current = current.parentElement;
        }

        // If no specific text container found, return the original element
        return element;
    }

    /**
     * Override handle method to manage content processing and blur removal
     */
    async handle(nodesToHide) {
        try {
            // Process content using parent's handle method and await its completion
            await super.handle(nodesToHide);

            // Only remove blur after filtering is complete and successful
            removeImmediateBlur();
        } catch (error) {
            console.error('Error in CNN handler:', error);
        // Don't remove blur if there was an error
        // This prevents flashing of unfiltered content
        }
    }
}

const handler = new CNNHandler();
export const handleCNN = (nodesToHide) => handler.handle(nodesToHide);
