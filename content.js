import { initializeRegex } from './scripts/regexManager.js';
import { filterContent } from './scripts/contentFilter.js';

// Initialize the regex pattern
initializeRegex(() => {
  // Initial filtering
  try {
    filterContent();
  } catch (error) {
    console.debug('Error in initial filtering:', error);
  }
});

// Memory management - clear history periodically
setInterval(() => {
  try {
    if (history.size > 10000) {
      history.clear();
      currentPageBlockedCount = 0;  // Reset count when clearing history
    }
  } catch (error) {
    console.debug('Error in memory management:', error);
  }
}, 300000);

// Debounce and batch DOM updates
let timeoutId = null;
let pendingMutations = new Set();

const observer = new MutationObserver((mutations) => {
  try {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Add new mutations to pending set
    mutations.forEach(mutation => {
      try {
        if (mutation.addedNodes.length > 0 ||
            (mutation.type === 'characterData' &&
             containsBlockedContent(mutation.target.textContent))) {
          pendingMutations.add(mutation);
        }
      } catch (error) {
        console.debug('Error processing mutation:', error);
      }
    });

    timeoutId = setTimeout(() => {
      try {
        if (pendingMutations.size > 0) {
          requestAnimationFrame(() => {
            filterContent();
            pendingMutations.clear(); // Clear processed mutations
          });
        }
      } catch (error) {
        console.debug('Error in observer timeout callback:', error);
      }
    }, 250); // Slightly increased debounce timeout for better batching
  } catch (error) {
    console.debug('Error in observer callback:', error);
  }
});

// Start observing
try {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
} catch (error) {
  console.debug('Error starting observer:', error);
}
