// Check for new keywords from URLs
export async function checkForNewKeywords(urls) {
  // Handle legacy single URL input
  if (typeof urls === 'string') {
    urls = [urls];
  }

  // If no URLs provided, exit early
  if (!Array.isArray(urls) || urls.length === 0) {
    return;
  }

  try {
    let newKeywords = [];

    // Process each URL
    for (const url of urls) {
      try {
        const response = await fetch(url);
        const contentType = response.headers.get('content-type');

        if (contentType.includes('application/json')) {
          const settings = await response.json();
          if (settings.customKeywords && Array.isArray(settings.customKeywords)) {
            newKeywords = [...newKeywords, ...settings.customKeywords];
          }
        } else if (contentType.includes('text/plain')) {
          const text = await response.text();
          const urlKeywords = text.split('\n')
            .map(line => line.trim())
            .filter(line => line);
          newKeywords = [...newKeywords, ...urlKeywords];
        }
      } catch (error) {
        console.error(`Failed to fetch keywords from ${url}:`, error);
        // Continue with other URLs even if one fails
        continue;
      }
    }

    // If we found any new keywords, update storage
    if (newKeywords.length > 0) {
      chrome.storage.local.get('customKeywords', (result) => {
        const existingKeywords = result.customKeywords || [];
        const uniqueNewKeywords = newKeywords.filter(
          keyword => !existingKeywords.includes(keyword)
        );
        if (uniqueNewKeywords.length > 0) {
          const updatedKeywords = [...existingKeywords, ...uniqueNewKeywords].sort();
          chrome.storage.local.set({ customKeywords: updatedKeywords });
        }
      });
    }
  } catch (error) {
    console.error('Failed to check for new keywords:', error);
  }
}

// Function to inject content scripts into existing tabs
export async function injectContentScripts() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      console.debug(`Injected content script into tab ${tab.id}`);
    } catch (error) {
      console.debug(`Failed to inject script into tab ${tab.id}:`, error);
    }
  }
}
