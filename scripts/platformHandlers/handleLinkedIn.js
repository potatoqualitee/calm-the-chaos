// handleLinkedIn.js

import { containsBlockedContent } from '../contentFilter.js';

function handleLinkedIn(nodesToHide) {
  try {
    // Handle LinkedIn posts
    const posts = document.querySelectorAll('.feed-shared-update-v2:not(footer *), .update-components-actor__meta:not(footer *)');
    posts.forEach(post => {
      try {
        const content = post.textContent || '';
        if (containsBlockedContent(content).length > 0) {
          nodesToHide.add(post);
        }
      } catch (error) {
        console.debug('Error processing LinkedIn post:', error);
      }
    });

    // Handle LinkedIn comments
    const comments = document.querySelectorAll('.comments-comment-item:not(footer *)');
    comments.forEach(comment => {
      try {
        const content = comment.textContent || '';
        if (containsBlockedContent(content).length > 0) {
          nodesToHide.add(comment);
        }
      } catch (error) {
        console.debug('Error processing LinkedIn comment:', error);
      }
    });
  } catch (error) {
    console.debug('Error in handleLinkedIn:', error);
  }
}

export { handleLinkedIn };
