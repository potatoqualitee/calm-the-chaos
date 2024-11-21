// storageManager.js

class StorageManager {
    constructor() {
        this.updateQueue = [];
        this.isProcessing = false;
        this.CLEANUP_INTERVAL = 1000 * 60 * 30; // 30 minutes

        // Start cleanup interval
        setInterval(() => this.cleanupOldData(), this.CLEANUP_INTERVAL);
    }

    // Queue updates to prevent race conditions
    async queueUpdate(key, updateFn) {
        return new Promise((resolve, reject) => {
            this.updateQueue.push({ key, updateFn, resolve, reject });
            this.processQueue();
        });
    }

    // Process the update queue
    async processQueue() {
        if (this.isProcessing || this.updateQueue.length === 0) return;

        this.isProcessing = true;
        const { key, updateFn, resolve, reject } = this.updateQueue.shift();

        try {
            const result = await chrome.storage.local.get(key);
            const updatedValue = await updateFn(result[key]);
            await chrome.storage.local.set({ [key]: updatedValue });
            resolve(updatedValue);
        } catch (error) {
            reject(error);
        } finally {
            this.isProcessing = false;
            this.processQueue();
        }
    }

    // Enhanced keyword normalization
    normalizeKeyword(keyword) {
        if (!keyword) return '';

        // Convert to string in case of non-string input
        keyword = String(keyword);

        // Normalize unicode characters
        keyword = keyword.normalize('NFKC');

        // Remove leading/trailing punctuation and whitespace
        keyword = keyword.replace(/^[\s.,:;!?'"[\]{}()\\/<>+=_-]+|[\s.,:;!?'"[\]{}()\\/<>+=_-]+$/g, '');

        // Convert to lowercase
        keyword = keyword.toLowerCase();

        // Trim and limit length if needed
        keyword = keyword.trim();
        const MAX_KEYWORD_LENGTH = 100;
        if (keyword.length > MAX_KEYWORD_LENGTH) {
            keyword = keyword.substring(0, MAX_KEYWORD_LENGTH);
        }

        return keyword;
    }

    // Update blocked keywords
    async updateBlockedKeywords(tabId, keywords) {
        const key = `blockedKeywords_${tabId}`;
        return this.queueUpdate(key, (currentKeywords = []) => {
            const normalizedKeywords = keywords.map(k => this.normalizeKeyword(k));
            return [...new Set([...currentKeywords, ...normalizedKeywords])];
        });
    }

    // Update page stats
    async updatePageStats(tabId, increment = 1) {
        const key = `pageStats_${tabId}`;
        return this.queueUpdate(key, (currentStats = { pageBlocked: 0, pageTotal: 0 }) => ({
            pageBlocked: (currentStats.pageBlocked || 0) + increment,
            pageTotal: (currentStats.pageTotal || 0) + increment
        }));
    }

    // Update global stats
    async updateGlobalStats(increment = 1) {
        return this.queueUpdate('stats', (currentStats = { totalBlocked: 0, totalScanned: 0 }) => ({
            totalBlocked: (currentStats.totalBlocked || 0) + increment,
            totalScanned: (currentStats.totalScanned || 0) + increment
        }));
    }

    // Cleanup old data
    async cleanupOldData() {
        try {
            // First verify chrome.tabs exists
            if (!chrome?.tabs?.query) {
                console.debug('Chrome tabs API unavailable, skipping cleanup');
                return;
            }

            const storage = await chrome.storage.local.get(null);
            const keysToRemove = [];

            // Get all tab IDs from chrome.tabs API
            const tabs = await chrome.tabs.query({});
            const activeTabIds = new Set(tabs.map(tab => tab.id));

            // Find keys that belong to non-existent tabs
            for (const key of Object.keys(storage)) {
                if (key.startsWith('blockedKeywords_') || key.startsWith('pageStats_')) {
                    const tabId = parseInt(key.split('_')[1]);
                    if (!activeTabIds.has(tabId)) {
                        keysToRemove.push(key);
                    }
                }
            }

            if (keysToRemove.length > 0) {
                await chrome.storage.local.remove(keysToRemove);
            }
        } catch (error) {
            console.debug('Cleanup error:', error);
        }
    }

    // Handle tab removal
    async cleanupTabData(tabId) {
        const keysToRemove = [
            `blockedKeywords_${tabId}`,
            `pageStats_${tabId}`
        ];

        await chrome.storage.local.remove(keysToRemove);
    }
}

export const storageManager = new StorageManager();
