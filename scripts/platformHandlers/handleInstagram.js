// handleInstagram.js

import { containsBlockedContent } from '../contentFilter.js';

function handleInstagram(nodesToHide) {
  try {
    // Handle Instagram posts
    const posts = document.querySelectorAll('article[role="presentation"]:not(footer *), [data-testid="post-container"]:not(footer *)');
    posts.forEach(post => {
      try {
        const content = post.textContent || '';
        if (containsBlockedContent(content).length > 0) {
          nodesToHide.add(post);
        }
      } catch (error) {
        console.debug('Error processing Instagram post:', error);
      }
    });

    // Handle Instagram comments
    const comments = document.querySelectorAll('li._a9zj:not(footer *)');
    comments.forEach(comment => {
      try {
        const content = comment.textContent || '';
        if (containsBlockedContent(content).length > 0) {
          nodesToHide.add(comment);
        }
      } catch (error) {
        console.debug('Error processing Instagram comment:', error);
      }
    });
  } catch (error) {
    console.debug('Error in handleInstagram:', error);
  }
}

export { handleInstagram };
