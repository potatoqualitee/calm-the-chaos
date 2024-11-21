// Check if extension context is valid
export function isExtensionContextValid() {
  try {
    // Access chrome.runtime.id to check if context is valid
    // This will throw if context is invalidated
    return typeof chrome.runtime.id === 'string';
  } catch (error) {
    console.debug('Extension context invalid:', error.message);
    return false;
  }
}

// Wrapper for chrome storage get API
export function chromeStorageGet(keys, callback) {
  if (!isExtensionContextValid()) {
    console.debug('Skipping storage get - extension context invalid');
    return;
  }
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
  if (!isExtensionContextValid()) {
    console.debug('Skipping message send - extension context invalid');
    return;
  }
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
