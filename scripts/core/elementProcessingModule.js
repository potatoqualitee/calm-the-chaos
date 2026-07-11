// elementProcessingModule.js

import { DEFAULT_ELEMENT_GROUPS } from './config/elements.js';
import { chromeStorageGet } from '../utils/chromeApi.js';
import { containsBlockedContent, getImageFilteringSettings } from './contentDetectionModule.js';

class ElementProcessor {
    constructor() {
        this.containerSelectors = null;
        this.MAX_DEPTH = 30;
    }

    /**
     * Find the smallest container that contains blocked content
     * @param {Node} node - Starting node to search from
     * @returns {Element|null} - The minimal container or null if none found
     */
    async findMinimalContentContainer(node) {
        let element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
        let depth = 0;
        let configuredCandidate = null;
        let semanticFallback = null;
        const selectors = await this.getContainerSelectors();

        while (element && element !== document.body && depth < this.MAX_DEPTH) {
            depth++;
            if (element.closest('header, footer, nav, [role="navigation"]')) {
                return null;
            }

            if (this.isStrongContentContainer(element)) {
                return element;
            }

            if (!configuredCandidate && this.matchesAnySelector(element, selectors)) {
                configuredCandidate = element;
            }

            if (!semanticFallback && element.matches('h1, h2, h3, h4, p, a[href], [role="listitem"]')) {
                semanticFallback = element;
            }

            element = element.parentElement;
        }

        return configuredCandidate || semanticFallback;
    }

    matchesAnySelector(element, selectors) {
        return selectors.some(selector => {
            try {
                return element.matches(selector);
            } catch (_error) {
                return false;
            }
        });
    }

    isStrongContentContainer(element) {
        if (element.matches('article, [role="article"], shreddit-post, shreddit-comment')) {
            return true;
        }

        if (element.matches('[data-component-name="card"], [data-testid="post-container"], [data-testid$="-article"], [data-testid$="-live"]')) {
            return true;
        }

        const tagName = element.tagName.toLowerCase();
        if (tagName.startsWith('ytd-') && (tagName.endsWith('-renderer') || tagName === 'ytd-rich-grid-media')) {
            return true;
        }

        return ['card', 'post', 'story', 'news-item', 'feed-item', 'stream-item']
            .some(className => element.classList.contains(className));
    }

    /**
     * Get container selectors from storage or defaults
     * @returns {Promise<string[]>} - Array of selectors
     */
    async getContainerSelectors() {
        if (this.containerSelectors) {
            return this.containerSelectors;
        }

        try {
            const result = await new Promise((resolve, reject) => {
                chromeStorageGet(
                    ['elementGroups', 'disabledElementGroups', 'disabledElements'],
                    result => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(result);
                        }
                    }
                );
            });

            const elementGroups = result.elementGroups || DEFAULT_ELEMENT_GROUPS;
            const disabledElementGroups = result.disabledElementGroups || [];
            const disabledElements = result.disabledElements || [];

            this.containerSelectors = this.buildEnabledSelectors(
                elementGroups,
                disabledElementGroups,
                disabledElements
            );

            return this.containerSelectors;
        } catch (error) {
            console.debug('Error in getContainerSelectors:', error);
            return Object.values(DEFAULT_ELEMENT_GROUPS).flat();
        }
    }

    /**
     * Build list of enabled selectors
     * @param {Object} elementGroups - All element groups
     * @param {string[]} disabledElementGroups - Disabled group names
     * @param {string[]} disabledElements - Disabled individual selectors
     * @returns {string[]} - Array of enabled selectors
     */
    buildEnabledSelectors(elementGroups, disabledElementGroups, disabledElements) {
        const enabledSelectors = [];

        Object.entries(elementGroups).forEach(([groupName, selectors]) => {
            if (!disabledElementGroups.includes(groupName)) {
                selectors.forEach(selector => {
                    if (!disabledElements.includes(selector)) {
                        enabledSelectors.push(selector);
                    }
                });
            }
        });

        enabledSelectors.push('[data-contentid]');
        return enabledSelectors;
    }

    collectMediaElements(roots = null) {
        const mediaElements = new Set();
        const selector = 'img, picture, source, video[poster], svg[aria-label]';
        const scopes = roots
            ? Array.from(roots)
            : [document];

        scopes.forEach(scope => {
            const root = scope?.nodeType === Node.TEXT_NODE ? scope.parentElement : scope;
            if (!root) return;

            if (root.nodeType === Node.ELEMENT_NODE && root.matches(selector)) {
                mediaElements.add(root);
            }

            if (root.querySelectorAll) {
                root.querySelectorAll(selector).forEach(element => mediaElements.add(element));
            }
        });

        return mediaElements;
    }

    getMediaContent(media, settings) {
        const content = new Set();
        const relatedElements = [media];

        if (media.matches('picture, video')) {
            media.querySelectorAll('img, source').forEach(element => relatedElements.push(element));
        }

        relatedElements.forEach(element => {
            if (settings.context.altText) {
                [element.alt, element.getAttribute('aria-label'), element.title]
                    .filter(Boolean)
                    .forEach(value => content.add(value));
            }

            if (settings.context.srcUrl) {
                [element.currentSrc, element.src, element.srcset, element.getAttribute('data-src')]
                    .filter(Boolean)
                    .forEach(value => content.add(value));
            }
        });

        if (settings.context.captions) {
            const caption = media.closest('figure')?.querySelector('figcaption')?.textContent;
            if (caption?.trim()) content.add(caption);
        }

        if (settings.context.nearbyText) {
            const parent = media.parentElement;
            if (parent) {
                const nearbyText = Array.from(parent.childNodes)
                    .filter(node => node.nodeType === Node.TEXT_NODE)
                    .map(node => node.textContent)
                    .join(' ')
                    .trim();
                if (nearbyText) content.add(nearbyText);
            }
        }

        return content;
    }

    /**
     * Handle media only inside the supplied mutation roots. A null scope is the
     * one intentional full-page pass used during initial filtering.
     */
    async handleGenericMedia(nodesToHide, roots = null) {
        if (window.location.hostname.includes('reddit.com')) return;

        const settings = await getImageFilteringSettings();
        if (!settings.enabled) return;

        for (const media of this.collectMediaElements(roots)) {
            try {
                const target = media.tagName === 'SOURCE'
                    ? media.closest('picture, video') || media
                    : media;

                if (target.style.display === 'none' || target.style.visibility === 'hidden') {
                    continue;
                }

                const hasBlockedContent = [...this.getMediaContent(media, settings)]
                    .some(content => containsBlockedContent(content).length > 0);

                if (hasBlockedContent) {
                    nodesToHide.add(target);
                }
            } catch (error) {
                console.debug('Error processing media:', error);
            }
        }
    }

}

const processor = new ElementProcessor();

export const findMinimalContentContainer = node => processor.findMinimalContentContainer(node);
export const getContainerSelectors = () => processor.getContainerSelectors();
export const clearElementProcessingCache = () => { processor.containerSelectors = null; };
export const handleGenericMedia = (nodesToHide, roots = null) => processor.handleGenericMedia(nodesToHide, roots);
