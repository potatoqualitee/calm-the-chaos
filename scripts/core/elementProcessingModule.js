// elementProcessingModule.js

import { DEFAULT_ELEMENT_GROUPS } from './config/elements.js';
import { chromeStorageGet } from '../utils/chromeApi.js';
import { containsBlockedContent } from './contentDetectionModule.js';
import { getBlockedRegex } from './managers/regexManager.js';

class ElementProcessor {
    constructor() {
        this.containerSelectors = null;
        this.MAX_DEPTH = 100;
    }

    /**
     * Find the smallest container that contains blocked content
     * @param {Node} node - Starting node to search from
     * @returns {Element|null} - The minimal container or null if none found
     */
    findMinimalContentContainer(node) {
        let element = node;
        let depth = 0;

        while (element && element !== document.body && depth < this.MAX_DEPTH) {
            depth++;
            if (element.nodeType === Node.ELEMENT_NODE) {
                try {
                    // Check href attributes
                    if (this.checkHrefContent(element)) {
                        return element;
                    }

                    // Check shadow DOM
                    if (this.checkShadowContent(element)) {
                        return element;
                    }

                    // Check container content
                    if (this.checkContainerContent(element)) {
                        return element;
                    }
                } catch (e) {
                    console.debug('Matching failed:', e);
                }
            }
            element = element.parentElement;
        }
        return null;
    }

    /**
     * Check href attribute for blocked content
     * @param {Element} element - Element to check
     * @returns {boolean} - Whether blocked content was found
     */
    checkHrefContent(element) {
        return element.hasAttribute('href') &&
               containsBlockedContent(element.getAttribute('href')).length > 0;
    }

    /**
     * Check shadow DOM for blocked content
     * @param {Element} element - Element to check
     * @returns {boolean} - Whether blocked content was found
     */
    checkShadowContent(element) {
        if (element.shadowRoot) {
            const shadowContent = element.shadowRoot.textContent;
            return containsBlockedContent(shadowContent).length > 0;
        }
        return false;
    }

    /**
     * Check container content for blocked content
     * @param {Element} element - Element to check
     * @returns {boolean} - Whether blocked content was found
     */
    async checkContainerContent(element) {
        const selectors = await this.getContainerSelectors();
        if (selectors.some(selector => element.matches(selector))) {
            const hasContent = element.textContent.trim().length > 0 ||
                             element.querySelector('img, video, iframe');
            return hasContent && containsBlockedContent(element.textContent).length > 0;
        }
        return false;
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

    /**
     * Handle generic media elements
     * @param {Set} nodesToHide - Set to collect nodes that should be hidden
     */
    async handleGenericMedia(nodesToHide) {
        try {
            // Skip for Reddit since it has its own image handling
            if (window.location.hostname.includes('reddit.com')) {
                return;
            }

            // Get all image elements
            const images = [
                ...document.getElementsByTagName('img'),
                ...document.getElementsByTagName('picture'),
                ...document.getElementsByTagName('source')
            ];

            // Process each image
            for (const img of images) {
                try {
                    // Skip if image is already hidden
                    if (img.style.display === 'none' ||
                        img.style.visibility === 'hidden' ||
                        img.closest('[style*="display: none"]') ||
                        img.closest('[style*="visibility: hidden"]')) {
                        continue;
                    }

                    // Check alt text
                    if (img.alt && containsBlockedContent(img.alt).length > 0) {
                        nodesToHide.add(img);
                        continue;
                    }

                    // Check src URL
                    const src = img.src || img.srcset || img.getAttribute('data-src');
                    if (src && containsBlockedContent(src).length > 0) {
                        nodesToHide.add(img);
                        continue;
                    }

                    // Check aria-label
                    if (img.getAttribute('aria-label') &&
                        containsBlockedContent(img.getAttribute('aria-label')).length > 0) {
                        nodesToHide.add(img);
                        continue;
                    }

                    // Check title
                    if (img.title && containsBlockedContent(img.title).length > 0) {
                        nodesToHide.add(img);
                        continue;
                    }

                    // Check parent text content
                    const parent = img.parentElement;
                    if (parent) {
                        // Check for figure caption
                        if (parent.tagName === 'FIGURE') {
                            const caption = parent.querySelector('figcaption');
                            if (caption && containsBlockedContent(caption.textContent).length > 0) {
                                nodesToHide.add(img);
                                continue;
                            }
                        }

                        // Check immediate text content
                        const textNodes = Array.from(parent.childNodes)
                            .filter(node => node.nodeType === Node.TEXT_NODE)
                            .map(node => node.textContent.trim())
                            .filter(text => text.length > 0);

                        if (textNodes.some(text => containsBlockedContent(text).length > 0)) {
                            nodesToHide.add(img);
                            continue;
                        }
                    }
                } catch (error) {
                    console.debug('Error processing image:', error);
                }
            }
        } catch (error) {
            console.debug('Error in handleGenericMedia:', error);
        }
    }
}

const processor = new ElementProcessor();

export const findMinimalContentContainer = node => processor.findMinimalContentContainer(node);
export const getContainerSelectors = () => processor.getContainerSelectors();
export const handleGenericMedia = nodesToHide => processor.handleGenericMedia(nodesToHide);
