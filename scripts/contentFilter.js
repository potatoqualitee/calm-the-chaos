// contentFilter.js

import { chromeStorageGet } from './utils/chromeApi.js';
import { getBlockedRegex } from './core/managers/regexManager.js';
import { isExtensionEnabledOnUrl } from './core/urlModule.js';
import { findMinimalContentContainer, handleGenericMedia } from './core/elementProcessingModule.js';
import { hideNodes } from './core/nodeHidingModule.js';
import { history } from './core/observerModule.js';
import { containsBlockedContent, startNewDetectionCycle } from './core/contentDetectionModule.js';
import { handlerRegistry } from './core/handlers/handlerRegistry.js';

// Domains that should skip generic filtering
const SKIP_GENERIC_DOMAINS = ['stackoverflow.com'];

async function handleGenericSites(nodesToHide) {
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
    } catch (error) {
        console.debug('Error in handleGenericSites:', error);
    }
}

async function filterContent(nodes = null) {
    const currentUrl = window.location.href;
    console.debug('Current URL:', currentUrl);

    // Skip non-http(s) URLs immediately
    if (!currentUrl || (!currentUrl.startsWith('http://') && !currentUrl.startsWith('https://'))) {
        return;
    }

    try {
        const result = await new Promise(resolve => {
            chromeStorageGet([
                'ignoredDomains',
                'disabledDomainGroups',
                'filteringEnabled',
                'enabledDomains',
                'filterAllSites'
            ], resolve);
        });

        const {
            ignoredDomains = {},
            disabledDomainGroups = [],
            filteringEnabled = true,
            enabledDomains = [],
            filterAllSites = false
        } = result;

        // Check if extension is enabled for this URL before doing any setup work
        if (!isExtensionEnabledOnUrl(
            currentUrl,
            ignoredDomains,
            disabledDomainGroups,
            filteringEnabled,
            enabledDomains,
            filterAllSites
        )) {
            console.log('Content filtering is disabled for this URL:', currentUrl);
            return;
        }

        // Only get regex patterns if extension is enabled for this URL
        const BLOCKED_REGEX = getBlockedRegex();

        // If no pattern (all keywords disabled), skip filtering
        if (!BLOCKED_REGEX) {
            console.log('Content filtering is disabled - all keywords are disabled');
            return;
        }

        // Start a new detection cycle for this filtering run
        startNewDetectionCycle();

        const nodesToHide = new Set();

        // Get hostname without 'www.' prefix
        const hostname = window.location.hostname.replace(/^www\./, '');
        console.debug('Normalized hostname:', hostname);

        try {
            // Check if there's a platform-specific handler
            const hasHandler = handlerRegistry.getHandler(hostname);

            if (hasHandler) {
                // Execute platform handler
                await handlerRegistry.executePlatformHandler(hostname, nodesToHide);

                // Skip generic filtering for Reddit to avoid interference
                if (!hostname.includes('reddit.com') && !SKIP_GENERIC_DOMAINS.includes(hostname)) {
                    await handleGenericSites(nodesToHide);
                }
            } else {
                // For sites without handlers, do generic filtering
                await handleGenericSites(nodesToHide);
            }

            // Handle images
            await handleGenericMedia(nodesToHide);

            // If specific nodes were passed, process them
            if (nodes) {
                for (const node of nodes) {
                    if (node instanceof Element) {
                        // Check for images in the node
                        const images = node.getElementsByTagName('img');
                        if (images.length > 0) {
                            await handleGenericMedia(nodesToHide);
                        }
                    }
                }
            }

            // Hide all collected nodes
            if (nodesToHide.size > 0) {
                hideNodes(nodesToHide);
            }
        } catch (error) {
            console.error('Error during content filtering:', error);
        }
    } catch (error) {
        console.debug('Error checking extension enabled status:', error);
    }
}

export { filterContent };
