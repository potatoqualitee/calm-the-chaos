// filterManager.js

import { chromeStorageGet } from '../utils/chromeApi.js';
import { getBlockedRegex } from './managers/regexManager.js';
import { isExtensionEnabledOnUrl } from './urlModule.js';
import { findMinimalContentContainer, handleGenericMedia } from './elementProcessingModule.js';
import { hideNodes } from './nodeHidingModule.js';
import { history } from './observerModule.js';
import { containsBlockedContent, startNewDetectionCycle } from './contentDetectionModule.js';
import { handlerRegistry } from './handlers/handlerRegistry.js';

function handleGenericSites(nodesToHide) {
    try {
        const BLOCKED_REGEX = getBlockedRegex();

        // If no pattern (all keywords disabled), skip filtering
        if (!BLOCKED_REGEX) {
            console.log('Content filtering is disabled - all keywords are disabled');
            return;
        }

        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    try {
                        if (containsBlockedContent(node.textContent).length > 0) {
                            return NodeFilter.FILTER_ACCEPT;
                        }
                        return NodeFilter.FILTER_REJECT;
                    } catch (error) {
                        console.debug('Error in walker acceptNode:', error);
                        return NodeFilter.FILTER_REJECT;
                    }
                }
            }
        );

        let node;
        while ((node = walker.nextNode())) {
            try {
                if (!history.has(node)) {
                    const container = findMinimalContentContainer(node);
                    if (container) {
                        nodesToHide.add(container);
                        history.add(node);
                    }
                }
            } catch (error) {
                console.debug('Error processing node in handleGenericSites:', error);
            }
        }

        handleGenericMedia(nodesToHide);
    } catch (error) {
        console.debug('Error in handleGenericSites:', error);
    }
}

function filterContent() {
    const currentUrl = window.location.href;

    chromeStorageGet(['ignoredDomains', 'disabledDomainGroups', 'filteringEnabled'], function(result) {
        try {
            const {
                ignoredDomains = {},
                disabledDomainGroups = [],
                filteringEnabled = true
            } = result;

            // Check if extension is enabled for this URL
            if (!isExtensionEnabledOnUrl(currentUrl, ignoredDomains, disabledDomainGroups, filteringEnabled)) {
                console.log('Content filtering is disabled for this URL:', currentUrl);
                return;
            }

            const BLOCKED_REGEX = getBlockedRegex();

            // If no pattern (all keywords disabled), skip filtering
            if (!BLOCKED_REGEX) {
                console.log('Content filtering is disabled - all keywords are disabled');
                return;
            }

            // Start a new detection cycle for this filtering run
            startNewDetectionCycle();

            const nodesToHide = new Set();
            const hostname = window.location.hostname;

            try {
                // Handle generic content first
                handleGenericSites(nodesToHide);

                // Execute platform-specific handler if available
                handlerRegistry.executePlatformHandler(hostname, nodesToHide);

                // Hide all collected nodes
                hideNodes(nodesToHide);
            } catch (error) {
                console.error('Error during content filtering:', error);
            }
        } catch (error) {
            console.debug('Error checking extension enabled status:', error);
        }
    });
}

export { filterContent };
