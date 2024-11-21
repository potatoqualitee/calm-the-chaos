// Import event handlers initialization
import { initializeEventHandlers } from './eventHandlers.js';
import { PRECONFIGURED_DOMAINS } from '../core/config/preconfiguredDomains.js';

import { needsImmediateBlur } from '../core/config/immediateBlur.js';

// Function to inject content scripts and CSS
async function injectContentScripts(tabId, url) {
    try {
        // First check if this site needs immediate blur
        const shouldBlur = needsImmediateBlur(url);

        // Only inject blur CSS for sites that need immediate blur
        if (shouldBlur) {
            await chrome.scripting.insertCSS({
                target: { tabId },
                files: ['styles/immediate-site-blur.css']
            });
        }

        // Then inject the content script
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        });
    } catch (err) {
        console.error('Failed to inject scripts:', err);
    }
}

// Check if a URL matches default sites
function isDefaultSite(url) {
    try {
        const hostname = new URL(url).hostname;
        return PRECONFIGURED_DOMAINS.some(domain => hostname.endsWith(domain));
    } catch (err) {
        console.error('Invalid URL:', err);
        return false;
    }
}

// Check if we have permission for a URL
async function hasPermissionForUrl(url) {
    try {
        const defaultSite = isDefaultSite(url);
        if (defaultSite) return true;

        // Check optional permissions
        const origin = new URL(url).origin;
        const permission = { origins: [`${origin}/*`] };
        return chrome.permissions.contains(permission);
    } catch (err) {
        console.error('Error checking permissions:', err);
        return false;
    }
}

// Check if we have all sites permission
async function hasAllSitesPermission() {
    try {
        const permission = { origins: ["http://*/*", "https://*/*"] };
        return await chrome.permissions.contains(permission);
    } catch (err) {
        console.error('Error checking all sites permission:', err);
        return false;
    }
}

// Handle tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Handle document_start for blur CSS
    if (changeInfo.status === 'loading' && tab.url) {
        // Check if this is a supported URL (http/https)
        if (!tab.url.match(/^https?:\/\//)) return;

        try {
            // Get the current filter all sites setting
            const { filterAllSites = false } = await chrome.storage.local.get('filterAllSites');

            // Check permissions based on filter all sites setting
            let hasPermission = false;
            if (filterAllSites) {
                hasPermission = await hasAllSitesPermission();
            } else {
                hasPermission = await hasPermissionForUrl(tab.url);
            }

            if (hasPermission || isDefaultSite(tab.url)) {
                await injectContentScripts(tabId, tab.url);
            }
        } catch (err) {
            console.error('Error in tab update handler:', err);
        }
    }
});

// Handle extension icon clicks for non-default sites
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.url) return;

    try {
        const hasPermission = await hasPermissionForUrl(tab.url);
        if (!hasPermission && !isDefaultSite(tab.url)) {
            const origin = new URL(tab.url).origin;
            const permission = { origins: [`${origin}/*`] };

            const granted = await chrome.permissions.request(permission);
            if (granted) {
                await injectContentScripts(tabId, tab.url);
            }
        }
    } catch (err) {
        console.error('Error handling icon click:', err);
    }
});

// Handle permission changes
chrome.permissions.onAdded.addListener(async (permissions) => {
    try {
        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url) return;

        const currentDomain = new URL(tab.url).hostname;

        // Check if this is an all sites permission
        if (permissions.origins?.includes("http://*/*") && permissions.origins?.includes("https://*/*")) {
            // Enable filter all sites
            await chrome.storage.local.set({
                filterAllSites: true,
                filteringEnabled: true
            });
        } else {
            // This is a single site permission
            // Get current enabled domains
            const { enabledDomains = [] } = await chrome.storage.local.get('enabledDomains');

            // Add current domain if not already enabled
            if (!enabledDomains.includes(currentDomain)) {
                const newEnabledDomains = [...enabledDomains, currentDomain];
                await chrome.storage.local.set({ enabledDomains: newEnabledDomains });
            }
        }

        // Reload the tab to apply changes
        chrome.tabs.reload(tab.id);
    } catch (err) {
        console.error('Error handling permission added:', err);
    }
});

// Handle permission removal
chrome.permissions.onRemoved.addListener(async (permissions) => {
    if (permissions.origins?.includes("http://*/*") && permissions.origins?.includes("https://*/*")) {
        // All sites permission was removed, update the setting
        await chrome.storage.local.set({ filterAllSites: false });
    }
});

// Initialize all event handlers when the background script loads
initializeEventHandlers();
