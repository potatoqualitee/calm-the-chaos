// Refactored contentFilter.js with elementContainsBlockedContent exported

import { chromeStorageGet, chromeRuntimeSendMessage } from './utils.js';
import { getBlockedRegex } from './regexManager.js';
import { DEFAULT_ELEMENT_GROUPS } from './elements.js';
import { handleReddit } from './platformHandlers/handleReddit.js';
import { handleFacebook } from './platformHandlers/handleFacebook.js';
import { handleTwitter } from './platformHandlers/handleTwitter.js';
import { handleInstagram } from './platformHandlers/handleInstagram.js';
import { handleLinkedIn } from './platformHandlers/handleLinkedIn.js';
import { handleYouTube } from './platformHandlers/handleYouTube.js';
import { handleCNN } from './platformHandlers/handleCNN.js';
import { handleMSN } from './platformHandlers/handleMSN.js';
import { handleBBC } from './platformHandlers/handleBBC.js';
import { handleGoogleNews } from './platformHandlers/handleGoogleNews.js'
import { handleStackOverflow } from './platformHandlers/handleStackOverflow.js';
import { handleBluesky } from './platformHandlers/handleBluesky.js';
import { handleYahoo } from './platformHandlers/handleYahoo.js';

const history = new Set();
let currentPageBlockedCount = 0;  // Track current page's blocked items only

// Reset counter when page loads
document.addEventListener('DOMContentLoaded', () => {
  currentPageBlockedCount = 0;
  history.clear();
});

// Reset counter on navigation
window.addEventListener('beforeunload', () => {
  currentPageBlockedCount = 0;
  history.clear();
});

// Helper function to check if a domain matches any patterns
function domainMatchesPatterns(domain, patterns) {
  return patterns.some(pattern => {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(domain);
  });
}

// Function to get all ignored domain patterns
function getIgnoredDomainsPatterns(ignoredDomains, disabledDomainGroups) {
  const patterns = [];
  Object.entries(ignoredDomains).forEach(([groupName, domains]) => {
    if (!disabledDomainGroups.includes(groupName)) {
      patterns.push(...domains);
    }
  });
  return patterns;
}

// Function to determine if the extension is enabled on the URL
function isExtensionEnabledOnUrl(url, ignoredDomains, disabledDomainGroups, globalEnabled) {
  if (!globalEnabled || !url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return false;
  }
  const domain = new URL(url).hostname;
  const ignoredDomainsPatterns = getIgnoredDomainsPatterns(ignoredDomains, disabledDomainGroups);
  return !domainMatchesPatterns(domain, ignoredDomainsPatterns);
}

function containsBlockedContent(text) {
  try {
    const BLOCKED_REGEX = getBlockedRegex();
    const matches = new Set();

    // Return empty array if no text
    if (!text) return [];

    // Use regex matching if BLOCKED_REGEX is available
    if (BLOCKED_REGEX) {
      let match;
      const regex = new RegExp(BLOCKED_REGEX, 'gi');
      while ((match = regex.exec(text.toLowerCase())) !== null) {
        matches.add(match[0]);
      }
    }

    return Array.from(matches);
  } catch (error) {
    console.debug('Error in containsBlockedContent:', error);
    return [];
  }
}

function findMinimalContentContainer(node) {
  const containerSelectors = getContainerSelectors();

  let element = node;
  let depth = 0;
  const MAX_DEPTH = 100;

  while (element && element !== document.body && depth < MAX_DEPTH) {
    depth++;
    if (element.nodeType === Node.ELEMENT_NODE) {
      try {
        if (element.hasAttribute('href') && containsBlockedContent(element.getAttribute('href')).length > 0) {
          return element;
        }

        if (element.shadowRoot) {
          const shadowContent = element.shadowRoot.textContent;
          if (containsBlockedContent(shadowContent).length > 0) {
            return element;
          }
        }

        if (containerSelectors.some(selector => element.matches(selector))) {
          const hasContent = element.textContent.trim().length > 0 ||
            element.querySelector('img, video, iframe');
          if (hasContent && containsBlockedContent(element.textContent).length > 0) {
            return element;
          }
        }
      } catch (e) {
        console.debug('Matching failed:', e);
      }
    }
    element = element.parentElement;
  }
  return null;
}

function handleGenericSites(nodesToHide) {
  try {
    const BLOCKED_REGEX = getBlockedRegex();

    // If no pattern (all keywords disabled), skip filtering
    if (!BLOCKED_REGEX) {
      console.log('Content filtering is disabled - all keywords are disabled');
      return;
    }

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          try {
            if (containsBlockedContent(node.textContent).length > 0) {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_REJECT;
          } catch (error) {
            console.debug('Error in walker acceptNode:', error);
            return NodeFilter.FILTER_REJECT;
          }
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      try {
        if (!history.has(node)) {
          const container = findMinimalContentContainer(node);
          if (container) {
            nodesToHide.add(container);
            history.add(node);
          }
        }
      } catch (error) {
        console.debug('Error processing node in handleGenericSites:', error);
      }
    }

    handleGenericMedia(nodesToHide);
  } catch (error) {
    console.debug('Error in handleGenericSites:', error);
  }
}

function handleGenericMedia(nodesToHide) {
  const BLOCKED_REGEX = getBlockedRegex();

  // If no pattern (all keywords disabled), skip filtering
  if (!BLOCKED_REGEX) return;

  chromeStorageGet(['keywordGroups', 'customKeywords', 'disabledKeywords', 'disabledGroups'], function (result) {
    try {
      const keywordGroups = result.keywordGroups || {};
      const customKeywords = result.customKeywords || [];
      const disabledKeywords = result.disabledKeywords || [];
      const disabledGroups = result.disabledGroups || [];
      const allKeywords = new Set();

      // Only include enabled keywords
      Object.entries(keywordGroups).forEach(([groupName, keywords]) => {
        if (!disabledGroups.includes(groupName)) {
          keywords.forEach(keyword => {
            if (!disabledKeywords.includes(keyword)) {
              allKeywords.add(keyword.toLowerCase());
            }
          });
        }
      });

      customKeywords.forEach(keyword => {
        if (!disabledKeywords.includes(keyword)) {
          allKeywords.add(keyword.toLowerCase());
        }
      });

      // If no enabled keywords, skip filtering
      if (allKeywords.size === 0) return;

      const imgSelector = Array.from(allKeywords)
        .map(keyword => `
                img[src*="${keyword}" i],
                img[alt*="${keyword}" i],
                video[src*="${keyword}" i],
                [aria-label*="${keyword}" i],
                [title*="${keyword}" i]
            `)
        .join(',');

      const adjustedImgSelector = imgSelector.split(',')
        .map(selector => `${selector.trim()}:not(footer *)`)
        .join(',');

      document.querySelectorAll(adjustedImgSelector).forEach(media => {
        try {
          if (media instanceof Element) {
            const container = media.closest('figure, .image-container, article, .media-wrapper') || media;
            nodesToHide.add(container);
          }
        } catch (error) {
          console.debug('Error processing media element:', error);
        }
      });
    } catch (error) {
      console.debug('Error handling generic images:', error);
    }
  });
}

function elementContainsBlockedContent(element) {
  try {
    const BLOCKED_REGEX = getBlockedRegex();

    // If no pattern (all keywords disabled), return false
    if (!BLOCKED_REGEX) return false;

    const textsToCheck = [
      element.textContent || '',
      element.getAttribute('alt') || '',
      element.getAttribute('title') || '',
      element.getAttribute('aria-label') || '',
    ];

    return textsToCheck.some(text => containsBlockedContent(text).length > 0);
  } catch (error) {
    console.debug('Error in elementContainsBlockedContent:', error);
    return false;
  }
}

function hideNodes(nodesToHide) {
  try {
    let newBlockedCount = 0;
    const processedNodes = new Set();
    const blockedItems = [];

    nodesToHide.forEach(container => {
      try {
        if (!(container instanceof Element)) {
          return;
        }

        if (processedNodes.has(container)) {
          return;
        }
        processedNodes.add(container);

        const blockedKeywords = containsBlockedContent(container.textContent);
        if (blockedKeywords.length > 0) {
          const itemInfo = {
            id: container.id || null,
            classList: Array.from(container.classList).join(' ') || null,
            textContent: container.textContent.trim().substring(0, 200) || null,
            blockedKeywords: blockedKeywords
          };

          console.log('Blocked Element:', itemInfo);
          blockedItems.push(itemInfo);
        }

        if (window.getComputedStyle(container).display !== 'none') {
          container.style.cssText = 'display: none !important;';
          newBlockedCount++;
        }

        let parent = container.parentElement;
        while (parent && parent !== document.body) {
          if (parent.tagName === 'SHREDDIT-POST') break;

          const style = window.getComputedStyle(parent);
          if (style.display.includes('grid') || style.display.includes('flex')) {
            parent.style.gap = '0.5rem';
          }

          const hasVisibleContent = Array.from(parent.children).some(child =>
            window.getComputedStyle(child).display !== 'none'
          );

          if (!hasVisibleContent) {
            parent.style.display = 'none';
          }
          parent = parent.parentElement;
        }
      } catch (error) {
        console.debug('Error processing container in hideNodes:', error);
      }
    });

    if (newBlockedCount > 0) {
      currentPageBlockedCount += newBlockedCount;
      const totalElements = document.body.getElementsByTagName('*').length;

      chromeRuntimeSendMessage({
        type: 'updateBlockCount',
        count: currentPageBlockedCount,
        total: totalElements
      });

      chromeRuntimeSendMessage({
        type: 'blockedItems',
        items: blockedItems
      });

      // Store blocked keywords in chrome.storage.local
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs && tabs[0]) {
          const currentTab = tabs[0];
          const storageKey = `blockedKeywords_${currentTab.id}`;
          console.log('Storing blocked keywords:', blockedItems.map(item => item.blockedKeywords).flat());
          chrome.storage.local.set({ [storageKey]: blockedItems.map(item => item.blockedKeywords).flat() });
        }
      });
    }
  } catch (error) {
    console.debug('Error in hideNodes:', error);
  }
}

function filterContent() {
  const currentUrl = window.location.href;

  // Check if extension is enabled for this URL first
  chromeStorageGet(['ignoredDomains', 'disabledDomainGroups', 'globalEnabled'], function (result) {
    try {
      const ignoredDomains = result.ignoredDomains || {};
      const disabledDomainGroups = result.disabledDomainGroups || [];
      const globalEnabled = result.globalEnabled ?? true;

      // Check if extension is enabled globally and for this URL
      if (!isExtensionEnabledOnUrl(currentUrl, ignoredDomains, disabledDomainGroups, globalEnabled)) {
        console.log('Content filtering is disabled for this URL:', currentUrl);
        return;
      }

      const BLOCKED_REGEX = getBlockedRegex();

      // If no pattern (all keywords disabled), skip filtering
      if (!BLOCKED_REGEX) {
        console.log('Content filtering is disabled - all keywords are disabled');
        return;
      }

      const nodesToHide = new Set();
      const hostname = window.location.hostname;

      try {
        handleGenericSites(nodesToHide);

        if (hostname.includes('reddit.com')) {
          handleReddit(nodesToHide);
        }
        if (hostname.includes('news.google.com')) {
          handleGoogleNews(nodesToHide);
        }
        if (hostname.includes('cnn.com')) {
          handleCNN(nodesToHide);
        }
        if (hostname.includes('msn.com')) {
          handleMSN(nodesToHide);
        }
        if (hostname.includes('bbc.')) {
          handleBBC(nodesToHide);
        }
        if (hostname.includes('facebook.com')) {
          handleFacebook(nodesToHide);
        }
        if (hostname.includes('twitter.com')) {
          handleTwitter(nodesToHide);
        }
        if (hostname.includes('instagram.com')) {
          handleInstagram(nodesToHide);
        }
        if (hostname.includes('linkedin.com')) {
          handleLinkedIn(nodesToHide);
        }
        if (hostname.includes('youtube.com')) {
          handleYouTube(nodesToHide);
        }
        if (hostname.includes('stackoverflow.com')) {
          handleStackOverflow(nodesToHide);
        }
        if (hostname.includes('bsky.app')) {
          handleBluesky(nodesToHide);
        }
        if (hostname.includes('yahoo.com')) {
          handleYahoo(nodesToHide);
        }

        hideNodes(nodesToHide);
      } catch (error) {
        console.error('Error during content filtering:', error);
      }
    } catch (error) {
      console.debug('Error checking extension enabled status:', error);
    }
  });
}

async function getContainerSelectors() {
  try {
    const result = await new Promise((resolve, reject) => {
      chromeStorageGet(['elementGroups', 'disabledElementGroups', 'disabledElements'], function (result) {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });

    const elementGroups = result.elementGroups || DEFAULT_ELEMENT_GROUPS;
    const disabledElementGroups = result.disabledElementGroups || [];
    const disabledElements = result.disabledElements || [];

    const enabledSelectors = [];

    // Only include selectors from enabled groups and that aren't individually disabled
    Object.entries(elementGroups).forEach(([groupName, selectors]) => {
      if (!disabledElementGroups.includes(groupName)) {
        selectors.forEach(selector => {
          if (!disabledElements.includes(selector)) {
            enabledSelectors.push(selector);
          }
        });
      }
    });

    return enabledSelectors;
  } catch (error) {
    console.debug('Error in getContainerSelectors:', error);
    return Object.values(DEFAULT_ELEMENT_GROUPS).flat(); // Fallback to all selectors if storage get fails
  }
}

export { filterContent, containsBlockedContent, elementContainsBlockedContent };
