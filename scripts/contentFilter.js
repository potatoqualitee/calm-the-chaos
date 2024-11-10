// Refactored contentFilter.js with elementContainsBlockedContent exported

import { chromeStorageGet, chromeRuntimeSendMessage } from './utils.js';
import { getBlockedRegex, getFuzzySet } from './regexManager.js';
import { handleReddit } from './platformHandlers/handleReddit.js';
import { handleFacebook } from './platformHandlers/handleFacebook.js';
import { handleTwitter } from './platformHandlers/handleTwitter.js';
import { handleInstagram } from './platformHandlers/handleInstagram.js';
import { handleLinkedIn } from './platformHandlers/handleLinkedIn.js';
import { handleYouTube } from './platformHandlers/handleYouTube.js';
import { handleCNN } from './platformHandlers/handleCNN.js';
import { handleStackOverflow } from './platformHandlers/handleStackOverflow.js';
import { handleBluesky } from './platformHandlers/handleBluesky.js';

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

function containsBlockedContent(text) {
  try {
    const BLOCKED_REGEX = getBlockedRegex();
    const fuzzySet = getFuzzySet();
    const matches = new Set();

    // Return empty array if no text
    if (!text) return [];

    // Use fuzzy matching if fuzzySet is available
    if (fuzzySet) {
      const fuzzyMatches = fuzzySet.get(text.toLowerCase());
      if (fuzzyMatches) {
        fuzzyMatches.forEach(match => {
          if (match[0] > 0.5) { // Adjust threshold as needed
            matches.add(match[1]);
          }
        });
      }
    }

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
    // If no regex pattern (all keywords disabled), skip filtering
    if (!getBlockedRegex()) return;

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
  // If no regex pattern (all keywords disabled), skip filtering
  if (!getBlockedRegex()) return;

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
    // If no regex pattern (all keywords disabled), return false
    if (!getBlockedRegex()) return false;

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
    }
  } catch (error) {
    console.debug('Error in hideNodes:', error);
  }
}

function filterContent() {
  const nodesToHide = new Set();
  const hostname = window.location.hostname;

  chromeStorageGet(['disabledDomains'], function (result) {
    try {
      const disabledDomains = result.disabledDomains || [];
      if (disabledDomains.includes(hostname)) {
        console.log('Content filtering is disabled for this domain:', hostname);
        return;
      }

      // If no regex pattern (all keywords disabled), skip filtering
      if (!getBlockedRegex()) {
        console.log('Content filtering is disabled - all keywords are disabled');
        return;
      }

      try {
        handleGenericSites(nodesToHide);

        if (hostname.includes('reddit.com')) {
          handleReddit(nodesToHide);
        }
        if (hostname.includes('cnn.com')) {
          handleCNN(nodesToHide);
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

        hideNodes(nodesToHide);
      } catch (error) {
        console.error('Error during content filtering:', error);
      }
    } catch (error) {
      console.debug('Error checking disabled domains:', error);
    }
  });
}

function getContainerSelectors() {
  return [
    '[role="article"]', '[data-ad-comet-preview="message"]',
    'div[data-testid="tweet"]', '[data-testid="tweetText"]', '[data-testid="reply"]',
    'article[role="presentation"]', '[data-testid="post-container"]', 'li:has(span[dir="auto"])',
    '[data-testid="comment"]', '[data-testid="post-container"]', '[data-ks-item]',
    '.feed-shared-update-v2', '.update-components-actor__meta',
    'ytd-rich-grid-media', 'ytd-video-renderer', 'a#video-title',
    'yt-formatted-string.style-scope.ytd-video-renderer',
    'yt-formatted-string.metadata-snippet-text',
    'yt-formatted-string#description-text',
    'yt-formatted-string.video-description',
    'yt-formatted-string.content',
    'h3.title-and-badge.style-scope.ytd-video-renderer',
    'yt-formatted-string.title',
    'yt-formatted-string.caption',
    '.text-wrapper.style-scope.ytd-video-renderer',
    '.metadata-snippet-container-one-line.style-scope.ytd-video-renderer',
    '.article', '.post', '.card', '.content', '.media', '.image-container',
    '.story', '.news-item', '.entry', '[class*="grid-item"]', '[class*="list-item"]',
    '[class*="card"]', '[class*="article"]', '[class*="post"]', '.feed-item',
    '.item', '.wrapper'
  ];
}

export { filterContent, containsBlockedContent, elementContainsBlockedContent };
