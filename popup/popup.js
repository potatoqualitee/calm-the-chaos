// popup.js
import { updateVisibility, toTitleCase, updateStatsDisplay, updateKeywordDisplay } from './popupDom.js';
import { isExtensionEnabledOnUrl } from './popupState.js';
import { fetchBlockedKeywords, setupStorageListener, getStorageData } from './popupStorage.js';
import { setupDomainToggle, setupFilterAllSitesToggle } from './popupEvents.js';
import { isPreconfiguredDomain } from '../scripts/core/config/preconfiguredDomains.js';

// Check if all sites permission has been granted
async function hasAllSitesPermission() {
    try {
        return await chrome.permissions.contains({
            origins: ["http://*/*", "https://*/*"]
        });
    } catch (error) {
        console.error('Error checking all sites permission:', error);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const currentTab = tabs[0];

        if (!currentTab?.url) {
            console.error('Cannot access current tab URL.');
            return;
        }

        const currentUrl = currentTab.url;
        const currentDomain = new URL(currentTab.url).hostname;
        const isDefault = await isPreconfiguredDomain(currentDomain);

        // Update domain info display
        const currentDomainElement = document.getElementById('currentDomain');
        if (currentDomainElement) {
            currentDomainElement.textContent = `Current Domain: ${currentDomain}`;
        }

        // Get storage data
        const result = await getStorageData([
            'ignoredDomains',
            'disabledDomainGroups',
            'stats',
            `pageStats_${currentTab.id}`,
            'filteringEnabled',
            'enabledDomains',
            'filterAllSites',
            'manuallyEnabled'
        ]);

        const {
            ignoredDomains = { Other: [] },
            disabledDomainGroups = [],
            filteringEnabled = true,
            enabledDomains = [],
            filterAllSites = false
        } = result;

        // Check if we have all sites permission
        const hasPermission = await hasAllSitesPermission();

        // Set up filter all sites toggle
        const filterAllSitesToggle = document.getElementById('filterAllSites');
        if (filterAllSitesToggle) {
            // Only show as checked if we have both the permission and the setting enabled
            filterAllSitesToggle.checked = filterAllSites && hasPermission;

            // If we have the setting enabled but lost permission, update storage
            if (filterAllSites && !hasPermission) {
                await chrome.storage.local.set({ filterAllSites: false });
            }
        }

        // Use isExtensionEnabledOnUrl to determine if filtering is enabled
        const isEnabled = await isExtensionEnabledOnUrl(
            currentUrl,
            ignoredDomains,
            disabledDomainGroups,
            filteringEnabled,
            enabledDomains,
            filterAllSites && hasPermission // Only consider filter all sites if we have permission
        );

        // Set up domain toggle
        const toggle = document.getElementById('domainToggle');
        if (toggle) {
            toggle.checked = isEnabled;

            // Set up toggle event handler
            setupDomainToggle(toggle, currentDomain, updateVisibility, currentTab);
        }

        // Set up filter all sites toggle handler
        if (filterAllSitesToggle) {
            setupFilterAllSitesToggle(filterAllSitesToggle, toggle, updateVisibility, currentTab);
        }

        // Update UI visibility based on current state
        updateVisibility(isEnabled);

        // Set icon based on filtering state
        chrome.runtime.sendMessage({
            type: isEnabled ? 'setColorIcon' : 'setGrayIcon'
        });

        // Update stats display
        const stats = result.stats || { totalBlocked: 0, totalScanned: 0 };
        const pageStats = result[`pageStats_${currentTab.id}`] || { pageBlocked: 0, pageTotal: 0 };
        updateStatsDisplay(pageStats, stats);

        // Initial fetch of blocked keywords
        const fetchAndUpdateKeywords = () => fetchBlockedKeywords(
            currentTab.id,
            updateStatsDisplay,
            updateKeywordDisplay,
            toTitleCase
        );

        await fetchAndUpdateKeywords();

        // Setup storage listener
        setupStorageListener(currentTab.id, fetchAndUpdateKeywords);

    } catch (error) {
        console.error('Error in popup initialization:', error);
    }
});
