// imageDetector.js

import { chromeStorageGet } from '../../utils/chromeApi.js';

class ImageDetector {
    constructor(contentMatcher) {
        this.contentMatcher = contentMatcher;
        this.imageSettings = null;
    }

    /**
     * Get image filtering settings from storage
     * @returns {Promise<Object>} - Image filtering settings
     */
    async getImageSettings() {
        if (this.imageSettings) return this.imageSettings;

        try {
            const result = await new Promise(resolve => {
                chromeStorageGet(
                    ['imageFilteringEnabled', 'imageContext', 'imageContainerStyle'],
                    resolve
                );
            });

            this.imageSettings = {
                enabled: result.imageFilteringEnabled !== undefined ? result.imageFilteringEnabled : true,
                context: result.imageContext || {
                    altText: true,
                    captions: true,
                    nearbyText: true,
                    srcUrl: true
                },
                containerStyle: result.imageContainerStyle || 'hideImage'
            };

            return this.imageSettings;
        } catch (error) {
            console.debug('Error getting image settings:', error);
            return {
                enabled: true,
                context: {
                    altText: true,
                    captions: true,
                    nearbyText: true,
                    srcUrl: true
                },
                containerStyle: 'hideImage'
            };
        }
    }

    /**
     * Check if element contains blocked content in its text or attributes
     * @param {Element} element - Element to check
     * @param {boolean} isSpeedReader - Whether SpeedReader is active
     * @returns {boolean} - Whether element contains blocked content
     */
    async elementContainsBlockedContent(element, isSpeedReader) {
        try {
            if (isSpeedReader) {
                console.log('Skipping element filtering: SpeedReader');
                return false;
            }

            const settings = await this.getImageSettings();

            // Handle image elements based on settings
            if (element.tagName === 'IMG' || element.tagName === 'PICTURE' || element.tagName === 'SVG') {
                if (!settings.enabled) return false;

                const contentToCheck = new Set(); // Use Set to deduplicate content

                if (settings.context.altText && element.alt) {
                    contentToCheck.add(element.alt);
                }
                if (settings.context.srcUrl && element.src) {
                    contentToCheck.add(element.src);
                }
                if (settings.context.captions) {
                    const caption = element.closest('figure')?.querySelector('figcaption')?.textContent;
                    if (caption) contentToCheck.add(caption);
                }
                if (settings.context.nearbyText) {
                    const parent = element.parentElement;
                    if (parent) {
                        const nearbyText = Array.from(parent.childNodes)
                            .filter(node => node.nodeType === Node.TEXT_NODE ||
                                (node.nodeType === Node.ELEMENT_NODE &&
                                    !['IMG', 'PICTURE', 'SVG'].includes(node.tagName)))
                            .map(node => node.textContent)
                            .join(' ');
                        if (nearbyText.trim()) contentToCheck.add(nearbyText);
                    }
                }

                // Check each unique piece of content
                return Array.from(contentToCheck).some(content => {
                    const matches = this.contentMatcher.containsBlockedContent(content, isSpeedReader);
                    return matches.length > 0;
                });
            }

            // For non-image elements, check if it's an image container
            const hasOnlyImages = Array.from(element.children).every(child =>
                child.tagName === 'IMG' ||
                child.tagName === 'PICTURE' ||
                child.tagName === 'SVG' ||
                (child.children.length === 0 && !child.textContent.trim())
            );

            if (hasOnlyImages) {
                if (!settings.enabled) return false;
                // For image containers, check all child images
                const imageElements = Array.from(element.querySelectorAll('img, picture, svg'));
                for (const img of imageElements) {
                    if (await this.elementContainsBlockedContent(img, isSpeedReader)) {
                        return true;
                    }
                }
                return false;
            }

            // For regular elements, check text content
            const textContent = element.textContent ? element.textContent.trim() : '';
            if (textContent) {
                const matches = this.contentMatcher.containsBlockedContent(textContent, isSpeedReader);
                return matches.length > 0;
            }

            return false;
        } catch (error) {
            console.log('Error checking element content: ' + error.message);
            return false;
        }
    }

    /**
     * Clear settings cache
     */
    clearCache() {
        this.imageSettings = null;
    }
}

export default ImageDetector;