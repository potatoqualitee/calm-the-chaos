// handleStackOverflow.js

import { containsBlockedContent } from '../contentFilter.js';

function handleStackOverflow(nodesToHide) {
  try {
    // First, remove any container elements from nodesToHide
    nodesToHide.forEach(node => {
      if (node.classList?.contains('container')) {
        nodesToHide.delete(node);
      }
    });

    // Now process actual content
    document.querySelectorAll('.js-post-body, .comment-copy').forEach(element => {
      try {
        const content = element.textContent || '';
        if (containsBlockedContent(content).length > 0) {
          nodesToHide.add(element);
        }
      } catch (error) {
        console.debug('Error processing Stack Overflow element:', error);
      }
    });
  } catch (error) {
    console.debug('Error in handleStackOverflow:', error);
  }
}

export { handleStackOverflow };