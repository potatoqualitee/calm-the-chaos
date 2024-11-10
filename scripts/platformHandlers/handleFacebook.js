// handleFacebook.js

import { containsBlockedContent } from '../contentFilter.js';

function handleFacebook(nodesToHide) {
  try {
    // Handle Facebook posts
    const posts = document.querySelectorAll('[role="article"]:not(footer *), [data-ad-comet-preview="message"]:not(footer *)');
    posts.forEach(post => {
      try {
        const content = post.textContent || '';
        if (containsBlockedContent(content).length > 0) {
          nodesToHide.add(post);
        }
      } catch (error) {
        console.debug('Error processing Facebook post:', error);
      }
    });
  } catch (error) {
    console.debug('Error in handleFacebook:', error);
  }
}

export { handleFacebook };
