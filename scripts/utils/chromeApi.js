// Wrapper for chrome storage get API
export function chromeStorageGet(keys, callback) {
  try {
    chrome.storage.local.get(keys, callback);
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
      console.debug('Extension context invalidated - reloading extension');
      return;
    }
    console.debug('Chrome storage get error:', error);
  }
}

// Wrapper for chrome runtime sendMessage API
export function chromeRuntimeSendMessage(message) {
  try {
    chrome.runtime.sendMessage(message);
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
      console.debug('Extension context invalidated - reloading extension');
      return;
    }
    console.debug('Chrome runtime sendMessage error:', error);
  }
}
