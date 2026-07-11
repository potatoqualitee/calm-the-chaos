import { chromeStorageGet } from '../../../utils/chromeApi.js';
import { getBlockedRegex } from '../../managers/regexManager.js';
import { isExtensionEnabledOnUrl } from '../../urlModule.js';
import { findMinimalContentContainer, handleGenericMedia } from '../../elementProcessingModule.js';
import { hideNodes } from '../../nodeHidingModule.js';
import { containsBlockedContent, startNewDetectionCycle } from '../../contentDetectionModule.js';
import { handlerRegistry } from '../../handlers/handlerRegistry.js';
import { removeImmediateBlur } from '../../config/immediateBlur.js';

const SETTINGS_KEYS = [
    'ignoredDomains',
    'disabledDomainGroups',
    'filteringEnabled',
    'enabledDomains',
    'filterAllSites'
];

const SKIP_FULL_GENERIC_DOMAINS = ['cnn.com', 'reddit.com', 'stackoverflow.com', 'bsky.app'];
const IGNORED_TEXT_ANCESTORS = 'script, style, noscript, template, textarea, input, select, option, [contenteditable="true"]';
const SEMANTIC_CONTENT_SELECTOR = [
    '[data-testid="card-headline"]',
    'h1',
    'h2',
    'h3',
    'h4',
    'article a[href]',
    '[role="article"] a[href]'
].join(', ');

let cachedSettings = null;
let pendingSettingsRequest = null;

function getFilteringSettings() {
    if (cachedSettings) return Promise.resolve(cachedSettings);
    if (pendingSettingsRequest) return pendingSettingsRequest;

    pendingSettingsRequest = new Promise(resolve => {
        chromeStorageGet(SETTINGS_KEYS, result => {
            cachedSettings = {
                ignoredDomains: result.ignoredDomains || {},
                disabledDomainGroups: result.disabledDomainGroups || [],
                filteringEnabled: result.filteringEnabled !== undefined ? result.filteringEnabled : true,
                enabledDomains: result.enabledDomains || [],
                filterAllSites: result.filterAllSites || false
            };
            pendingSettingsRequest = null;
            resolve(cachedSettings);
        });
    });

    return pendingSettingsRequest;
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && SETTINGS_KEYS.some(key => key in changes)) {
            cachedSettings = null;
        }
    });
}

function hostnameMatches(hostname, domain) {
    return hostname === domain || hostname.endsWith(`.${domain}`);
}

export class FilterProcessor {
    constructor(history) {
        this.history = history;
    }

    getProcessingRoots(nodes) {
        if (!nodes) {
            const mainRegions = Array.from(document.querySelectorAll('main, [role="main"]'))
                .filter(region => !region.parentElement?.closest('main, [role="main"]'));
            return mainRegions.length > 0 ? mainRegions : [document.body];
        }

        const candidateNodes = [];
        for (const node of nodes) {
            if (!node?.isConnected) continue;
            if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) continue;

            const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
            if (!element || element.closest(IGNORED_TEXT_ANCESTORS)) continue;

            candidateNodes.push(node);
        }

        const candidateSet = new Set(candidateNodes);
        return candidateNodes.filter(node => {
            let ancestor = node.parentNode;
            while (ancestor && ancestor !== document) {
                if (candidateSet.has(ancestor)) return false;
                ancestor = ancestor.parentNode;
            }
            return true;
        });
    }

    shouldInspectTextNode(node) {
        if (this.history.has(node)) return false;
        if (!node.textContent?.trim()) return false;

        const parent = node.parentElement;
        if (!parent || parent.closest(IGNORED_TEXT_ANCESTORS)) return false;
        return containsBlockedContent(node.textContent).length > 0;
    }

    collectMatchingTextNodes(root) {
        if (root.nodeType === Node.TEXT_NODE) {
            return this.shouldInspectTextNode(root) ? [root] : [];
        }

        const matchingNodes = [];
        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: node => this.shouldInspectTextNode(node)
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_REJECT
            }
        );

        let node;
        while ((node = walker.nextNode())) matchingNodes.push(node);
        return matchingNodes;
    }

    collectSemanticContent(root) {
        if (root.nodeType !== Node.ELEMENT_NODE) return [];
        const elements = new Set();
        if (root.matches(SEMANTIC_CONTENT_SELECTOR)) elements.add(root);
        root.querySelectorAll(SEMANTIC_CONTENT_SELECTOR).forEach(element => elements.add(element));
        return [...elements].filter(element =>
            !this.history.has(element) &&
            !element.closest('header, footer, nav, [role="navigation"]') &&
            containsBlockedContent(element.innerText || element.textContent).length > 0
        );
    }

    async handleGenericSites(nodesToHide, roots) {
        if (!getBlockedRegex()) return;

        for (const root of roots) {
            for (const element of this.collectSemanticContent(root)) {
                try {
                    const container = await findMinimalContentContainer(element);
                    if (container) {
                        this.history.add(element);
                        nodesToHide.add(container);
                    }
                } catch (error) {
                    console.debug('Error selecting semantic content container:', error);
                }
            }

            for (const textNode of this.collectMatchingTextNodes(root)) {
                try {
                    const container = await findMinimalContentContainer(textNode);
                    if (container) {
                        this.history.add(textNode);
                        nodesToHide.add(container);
                    }
                } catch (error) {
                    console.debug('Error selecting content container:', error);
                }
            }
        }
    }

    shouldSkipFullGeneric(hostname) {
        return SKIP_FULL_GENERIC_DOMAINS.some(domain => hostnameMatches(hostname, domain));
    }

    finalizeInitialFiltering() {
        document.documentElement.setAttribute('data-calm-chaos-state', 'filtered');
        removeImmediateBlur();
    }

    async processContent(nodes = null) {
        const currentUrl = window.location.href;
        const isFullScan = nodes === null;

        if (!currentUrl || !/^https?:\/\//.test(currentUrl)) return;

        const settings = await getFilteringSettings();
        if (!isExtensionEnabledOnUrl(
            currentUrl,
            settings.ignoredDomains,
            settings.disabledDomainGroups,
            settings.filteringEnabled,
            settings.enabledDomains,
            settings.filterAllSites
        )) {
            return;
        }

        try {
            if (!getBlockedRegex()) return;

            startNewDetectionCycle();
            const nodesToHide = new Set();
            const roots = this.getProcessingRoots(nodes);
            if (roots.length === 0) return;

            const hostname = window.location.hostname.replace(/^www\./, '').toLowerCase();
            const handler = handlerRegistry.getHandler(hostname);

            if (isFullScan && handler) {
                await handlerRegistry.executePlatformHandler(hostname, nodesToHide);
            }

            if (!isFullScan || !this.shouldSkipFullGeneric(hostname)) {
                await this.handleGenericSites(nodesToHide, roots);
            }

            await handleGenericMedia(nodesToHide, roots);
            if (nodesToHide.size > 0) {
                await hideNodes(nodesToHide);
            }
        } catch (error) {
            console.error('Error during content filtering:', error);
        } finally {
            if (isFullScan) this.finalizeInitialFiltering();
        }
    }
}

export function clearFilteringSettingsCache() {
    cachedSettings = null;
}
