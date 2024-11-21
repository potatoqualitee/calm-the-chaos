// popupStorage.js
import { storageManager } from '../scripts/core/managers/storageManager.js';

export async function getStorageData(keys) {
    return await chrome.storage.local.get(keys);
}

export async function updateIgnoredDomains(ignoredDomains) {
    await chrome.storage.local.set({ ignoredDomains });
}

export async function updateFilteringEnabled(filteringEnabled) {
    await chrome.storage.local.set({ filteringEnabled });
}

export async function fetchBlockedKeywords(tabId, updateStatsDisplay, updateKeywordDisplay, toTitleCase) {
    const result = await getStorageData([
        `blockedKeywords_${tabId}`,
        'originalKeywords',
        `pageStats_${tabId}`,
        'stats'
    ]);

    const blockedKeywordsData = result[`blockedKeywords_${tabId}`] || [];
    const originalKeywords = result.originalKeywords || {};
    const pageStats = result[`pageStats_${tabId}`] || { pageBlocked: 0, pageTotal: 0 };
    const stats = result.stats || { totalBlocked: 0, totalScanned: 0 };

    // Update the display with the current stats
    updateStatsDisplay(pageStats, stats);

    const blockedKeywordsElement = document.getElementById('blockedKeywords');
    const keywordsTitleElement = document.querySelector('.keywords-title');

    if (blockedKeywordsElement && keywordsTitleElement) {
        // Process keywords and count occurrences
        const keywordCounts = {};

        // Handle both array of strings and array of objects formats
        blockedKeywordsData.forEach(item => {
            if (typeof item === 'string') {
                // Handle simple string format
                const normalizedKeyword = storageManager.normalizeKeyword(item);
                const displayKeyword = originalKeywords[normalizedKeyword] || normalizedKeyword;
                keywordCounts[displayKeyword] = (keywordCounts[displayKeyword] || 0) + 1;
            } else if (item && item.blockedKeywords) {
                // Handle object format with blockedKeywords array
                item.blockedKeywords.forEach(keyword => {
                    const normalizedKeyword = storageManager.normalizeKeyword(keyword);
                    const displayKeyword = originalKeywords[normalizedKeyword] || normalizedKeyword;
                    keywordCounts[displayKeyword] = (keywordCounts[displayKeyword] || 0) + (item.count || 1);
                });
            }
        });

        updateKeywordDisplay(keywordCounts, keywordsTitleElement, blockedKeywordsElement, toTitleCase);
    }
}

export function setupStorageListener(tabId, fetchBlockedKeywords) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
            const relevantKeys = [
                `blockedKeywords_${tabId}`,
                `pageStats_${tabId}`,
                'stats'
            ];

            if (relevantKeys.some(key => changes[key])) {
                fetchBlockedKeywords();
            }
        }
    });
}
