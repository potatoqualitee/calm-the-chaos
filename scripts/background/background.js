// Import event handlers initialization
import { initializeEventHandlers } from './eventHandlers.js';
import { PRECONFIGURED_DOMAINS } from '../core/config/preconfiguredDomains.js';

import { needsImmediateBlur } from '../core/config/blurSites.js';

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
        const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
        return PRECONFIGURED_DOMAINS.some(domain =>
            hostname === domain || hostname.endsWith(`.${domain}`)
        );
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
        // Default sites use the manifest's document_start content script.
        if (isDefaultSite(tab.url)) return;

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

            if (hasPermission) {
                await injectContentScripts(tab.id, tab.url);
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
                await injectContentScripts(tab.id, tab.url);
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

// Fetch and update new developments
async function updateNewDevelopments() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(
            'https://gist.githubusercontent.com/potatoqualitee/3488593dcc622acc736055fa00a9745e/raw/new-development.json',
            { signal: controller.signal }
        );
        if (!response.ok) throw new Error('Failed to fetch new developments');

        const newDevelopments = await response.json();
        const { keywordGroups = {} } = await chrome.storage.local.get('keywordGroups');
        const remoteKeywords = Object.entries(newDevelopments['New Developments']?.keywords || {})
            .filter(([, metadata]) => Number(metadata?.weight ?? 1) > 0)
            .map(([keyword]) => keyword)
            .sort((a, b) => a.localeCompare(b));
        const currentKeywords = [...(keywordGroups['New Developments'] || [])]
            .sort((a, b) => a.localeCompare(b));

        if (JSON.stringify(remoteKeywords) === JSON.stringify(currentKeywords)) return;

        // Update the new developments category
        keywordGroups['New Developments'] = remoteKeywords;
        await chrome.storage.local.set({ keywordGroups });

        // Send message to all tabs to update their regex
        const tabs = await chrome.tabs.query({});
        await Promise.allSettled(tabs.map(tab =>
            chrome.tabs.sendMessage(tab.id, { type: 'updateKeywords' })
        ));
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error updating new developments:', error);
        }
    } finally {
        clearTimeout(timeoutId);
    }
}

// Handle alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'updateNewDevelopments') {
        const { autoUpdateNewDevelopments = true } = await chrome.storage.local.get('autoUpdateNewDevelopments');
        if (autoUpdateNewDevelopments) {
            await updateNewDevelopments();
        }
    }
});

// Initialize alarm and event handlers
async function initialize() {
    // Initialize event handlers
    initializeEventHandlers();

    // Create alarm for new developments updates
    const { autoUpdateNewDevelopments = true } = await chrome.storage.local.get('autoUpdateNewDevelopments');
    const existingAlarm = await new Promise(resolve =>
        chrome.alarms.get('updateNewDevelopments', resolve)
    );

    if (autoUpdateNewDevelopments) {
        if (!existingAlarm || existingAlarm.periodInMinutes !== 360) {
            if (existingAlarm) {
                await new Promise(resolve =>
                    chrome.alarms.clear('updateNewDevelopments', resolve)
                );
            }
            chrome.alarms.create('updateNewDevelopments', {
                periodInMinutes: 360,
                delayInMinutes: 5
            });
        }
    } else if (existingAlarm) {
        await new Promise(resolve =>
            chrome.alarms.clear('updateNewDevelopments', resolve)
        );
    }
}

// Start initialization
initialize();
