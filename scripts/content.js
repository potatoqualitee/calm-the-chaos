import { initializeRegex } from './core/managers/regexManager.js';
import { filterContent } from './contentFilter.js';
import { containsBlockedContent, startNewDetectionCycle, isSpeedReader } from './core/contentDetectionModule.js';
import { history } from './core/observerModule.js';
import { nodeHider } from './core/nodeHidingModule.js';
import { isExtensionEnabledOnUrl } from './core/urlModule.js';
import { chromeStorageGet } from './utils/chromeApi.js';
import { needsImmediateBlur, showImmediateBlur } from './core/config/immediateBlur.js';

let observer = null;
let memoryManagementInterval = null;

// Function to clean up all observers and intervals
function cleanup() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    if (memoryManagementInterval) {
        clearInterval(memoryManagementInterval);
        memoryManagementInterval = null;
    }
    nodeHider.reset();
    history.clear();

    // Only remove blur if we're not in a loading or sleeping state
    const state = document.documentElement.getAttribute('data-calm-chaos-state');
    if (state !== 'loading' && state !== 'sleeping') {
        document.documentElement.classList.add('blur-removed');
    }
}

// Function to initialize extension features
function initializeExtension() {
    // Initialize the regex pattern
    initializeRegex(() => {
        // Initial filtering
        try {
            filterContent();
        } catch (error) {
            console.debug('Error in initial filtering:', error);
        }
    });

    // Memory management - clear history less frequently and more selectively
    memoryManagementInterval = setInterval(() => {
        try {
            if (history.size > 50000) { // Increased threshold
                // Only clear history entries older than 1 hour
                const oneHourAgo = Date.now() - (60 * 60 * 1000);
                const oldEntries = Array.from(history).filter(entry => {
                    return entry.timestamp && entry.timestamp < oneHourAgo;
                });

                oldEntries.forEach(entry => history.delete(entry));

                // Only reset nodeHider if absolutely necessary
                if (history.size > 50000) {
                    history.clear();
                    nodeHider.reset();
                }
            }
        } catch (error) {
            console.debug('Error in memory management:', error);
        }
    }, 600000); // Increased interval to 10 minutes

    // Debounce and batch DOM updates with improved deduplication
    let timeoutId = null;
    let pendingMutations = new Map(); // Use Map to track unique mutations by node

    observer = new MutationObserver((mutations) => {
        try {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            // Process and deduplicate mutations
            mutations.forEach(mutation => {
                try {
                    if (mutation.addedNodes.length > 0) {
                        // Store only the most recent mutation for each added node
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                pendingMutations.set(node, mutation);
                            }
                        });
                    } else if (mutation.type === 'characterData' && mutation.target.textContent) {
                        pendingMutations.set(mutation.target, mutation);
                    }
                } catch (error) {
                    console.debug('Error processing mutation:', error);
                }
            });

            timeoutId = setTimeout(() => {
                try {
                    if (pendingMutations.size > 0) {
                        const mutations = Array.from(pendingMutations.values());
                        pendingMutations.clear();

                        if (mutations.length > 0) {
                            requestAnimationFrame(() => {
                                startNewDetectionCycle();
                                filterContent(mutations);
                            });
                        }
                    }
                } catch (error) {
                    console.debug('Error in observer timeout callback:', error);
                }
            }, 500); // Increased debounce timeout for better batching
        } catch (error) {
            console.debug('Error in observer callback:', error);
        }
    });

    // Start observing with optimized configuration
    try {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: false // Disable old value tracking to reduce memory usage
        });
    } catch (error) {
        console.debug('Error starting observer:', error);
    }
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

// Set initial state
document.documentElement.setAttribute('data-calm-chaos-state', 'loading');

// Handle visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Remove any existing blur-removed class when tab becomes visible
        document.documentElement.classList.remove('blur-removed');
        document.documentElement.setAttribute('data-calm-chaos-state', 'loading');
        // Re-run initialization
        cleanup();
        checkAndInitialize();
    } else {
        // When tab becomes hidden, prepare for potential sleep
        document.documentElement.setAttribute('data-calm-chaos-state', 'sleeping');
    }
});

// Initial check and setup
checkAndInitialize();

// Add message listener for extension reload, settings updates, and tab wake-up
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

        // Force immediate reinitialization for tab wake-up
        if (message.reason?.includes('tab_wake_up')) {
            // Ensure the page is fully loaded before reinitializing
            if (document.readyState === 'complete') {
                checkAndInitialize();
            } else {
                window.addEventListener('load', () => {
                    checkAndInitialize();
                }, { once: true });
            }
        } else {
            // Normal reinitialization for other cases
            checkAndInitialize();
        }
    }
});
