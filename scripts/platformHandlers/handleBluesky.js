// handleBluesky.js

import { containsBlockedContent } from '../contentFilter.js';

function handleBluesky(nodesToHide) {
  try {
    // Handle Bluesky posts
    const posts = document.querySelectorAll('[data-testid="contentHider-post"]');
    posts.forEach(post => {
      try {
        const content = post.textContent || '';

        if (containsBlockedContent(content).length > 0) {
          nodesToHide.add(post);
        }
      } catch (error) {
        console.debug('Error processing Bluesky post:', error);
      }
    });

    // Handle Bluesky comments and embedded comments
    const comments = document.querySelectorAll('[data-testid="replyBtn"]');
    comments.forEach(comment => {
      try {
        const content = comment.closest('.css-175oi2r').textContent || '';

        if (containsBlockedContent(content).length > 0) {
          nodesToHide.add(comment.closest('.css-175oi2r'));
        }
      } catch (error) {
        console.debug('Error processing Bluesky comment:', error);
      }
    });
  } catch (error) {
    console.debug('Error in handleBluesky:', error);
  }
}

export { handleBluesky };
