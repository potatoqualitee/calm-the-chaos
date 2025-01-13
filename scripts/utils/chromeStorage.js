// chromeStorage.js - Shared storage utility for both background and options contexts

export async function getStorageData(keys) {
    try {
        console.debug('Getting storage data for keys:', keys);
        const result = await chrome.storage.local.get(keys);
        console.debug('Storage data result:', result);
        return result;
    } catch (error) {
        console.error('Error getting storage data:', error);
        return {};
    }
}

export async function setStorageData(data) {
    try {
        console.log('Setting storage data:', data);
        await chrome.storage.local.set(data);
        console.log('Storage data set successfully');
    } catch (error) {
        console.error('Error setting storage data:', error);
    }
}