import { initializeRegex } from './core/managers/regexManager.js';
import { containsBlockedContent, startNewDetectionCycle, isSpeedReader } from './core/contentDetectionModule.js';
import { setupFilteringObserver, cleanupFilteringObserver, filteringHistory } from './core/observer/mutations/FilteringMutationObserver.js';
import { FilterProcessor } from './core/observer/mutations/FilterProcessor.js';
import { nodeHider } from './core/nodeHidingModule.js';
import { isExtensionEnabledOnUrl } from './core/urlModule.js';
import { chromeStorageGet, isExtensionContextValid } from './utils/chromeApi.js';
import { needsImmediateBlur, showImmediateBlur } from './core/config/immediateBlur.js';

// Function to clean up all observers
function cleanup() {
    cleanupFilteringObserver();
    nodeHider.reset();
    filteringHistory.clear();

    // Do not remove blur during cleanup - let initialization handle it
}

// Function to initialize extension features
function initializeExtension() {
    // Initialize the regex pattern
    initializeRegex(() => {
        // Initial filtering
        try {
            const processor = new FilterProcessor(filteringHistory);
            processor.processContent();
        } catch (error) {
            console.debug('Error in initial filtering:', error);
        }
    });

    // Initialize the filtering observer
    setupFilteringObserver();
}

// Check if extension should be enabled before initializing
async function checkAndInitialize() {
    try {
        const result = await new Promise(resolve => {
            chromeStorageGet(['ignoredDomains', 'disabledDomainGroups', 'filteringEnabled', 'enabledDomains'], resolve);
        });

        const {
            ignoredDomains = {},
            disabledDomainGroups = [],
            filteringEnabled = true,
            enabledDomains = []
        } = result;

        const currentUrl = window.location.href;
        const hostname = window.location.hostname.replace(/^www\./, '');

        // Check if extension is enabled for this URL
        if (!isExtensionEnabledOnUrl(currentUrl, ignoredDomains, disabledDomainGroups, filteringEnabled, enabledDomains)) {
            console.log('Extension disabled for this URL, skipping initialization');
            // Force remove any blur since filtering is disabled
            const { removeImmediateBlur } = await import('./core/config/immediateBlur.js');
            removeImmediateBlur(true);
            cleanup(); // Ensure everything is cleaned up
            return;
        }

        // Skip all processing if SpeedReader is detected
        if (isSpeedReader()) {
            console.log('SpeedReader detected - skipping all processing');
            cleanup(); // Ensure everything is cleaned up
            return;
        }

        // Only proceed with blur and filtering if not in SpeedReader mode
        if (needsImmediateBlur(hostname)) {
            console.debug('Applying immediate blur for:', hostname);
            await showImmediateBlur();
        }

        // Initialize extension features
        initializeExtension();
    } catch (error) {
        console.debug('Error checking extension enabled status:', error);
    }
}

// Main initialization function
(async function initializeContentScript() {
    // Bail out immediately if extension context is invalid
    if (!isExtensionContextValid()) {
        console.debug('Extension context invalid - skipping all operations');
        return;
    }

    // Set initial state
    document.documentElement.setAttribute('data-calm-chaos-state', 'loading');

    // If SpeedReader is detected immediately, prevent blur
    if (isSpeedReader()) {
        document.documentElement.classList.add('blur-removed');
    }

    // Handle visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // Only remove blur-removed class if SpeedReader is not active and content isn't filtered
            if (!isSpeedReader() && document.documentElement.getAttribute('data-calm-chaos-state') !== 'filtered') {
                document.documentElement.classList.remove('blur-removed');
                document.documentElement.setAttribute('data-calm-chaos-state', 'loading');
                // Re-run initialization
                cleanup();
                checkAndInitialize();
            }
        } else {
            // When tab becomes hidden, only set sleeping state if not already filtered
            if (document.documentElement.getAttribute('data-calm-chaos-state') !== 'filtered') {
                document.documentElement.setAttribute('data-calm-chaos-state', 'sleeping');
            }
        }
    });

    // Initial check and setup
    await checkAndInitialize();

    // Add message listener for extension reload, settings updates, and tab wake-up
    if (isExtensionContextValid()) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'extensionReloaded' || message.type === 'updateKeywords') {
                console.log('Reinitializing due to:', message.reason || message.type);

                // Clean up existing state
                cleanup();

                // If SpeedReader is detected, skip reinitialization
                if (isSpeedReader()) {
                    console.log('SpeedReader detected - skipping reinitialization');
                    return;
                }

                // For tab wake-up, apply immediate blur first if needed
                if (message.reason?.includes('tab_wake_up')) {
                    const hostname = window.location.hostname.replace(/^www\./, '');
                    if (needsImmediateBlur(hostname)) {
                        showImmediateBlur();
                    }
                }

                // Then proceed with initialization
                if (document.readyState === 'complete') {
                    checkAndInitialize();
                } else {
                    window.addEventListener('load', () => {
                        checkAndInitialize();
                    }, { once: true });
                }
            }
        });
    }
})();
