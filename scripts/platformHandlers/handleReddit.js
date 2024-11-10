// handleReddit.js

import { containsBlockedContent } from '../contentFilter.js';

function handleReddit(nodesToHide) {
  try {
    // Handle Reddit posts
    const posts = document.querySelectorAll('shreddit-post:not(footer *)');
    posts.forEach(post => {
      try {
        // Skip processing this post if "comments" is in the URL
        if (window.location.href.includes('comments')) {
          return;
        }

        const title = post.getAttribute('post-title') || '';
        const content = post.textContent || '';

        if (containsBlockedContent(title).length > 0 || containsBlockedContent(content).length > 0) {
          nodesToHide.add(post);
        }
      } catch (error) {
        console.debug('Error processing Reddit post:', error);
      }
    });

    // Handle Reddit comments
    const comments = document.querySelectorAll('shreddit-comment:not(footer *), details[role="article"]');
    comments.forEach(comment => {
      try {
        const commentContent = comment.textContent || '';
        if (containsBlockedContent(commentContent).length > 0) {
          nodesToHide.add(comment);
        }
      } catch (error) {
        console.debug('Error processing Reddit comment:', error);
      }
    });

    const articles = document.querySelectorAll('article[data-ks-item]:not(footer *)');
    articles.forEach(article => {
      try {
        if (containsBlockedContent(article.textContent).length > 0) {
          nodesToHide.add(article);
        }
      } catch (error) {
        console.debug('Error processing Reddit article:', error);
      }
    });

    // Ensure main content is not blocked
    const mainContent = document.getElementById('main-content');
    if (mainContent && nodesToHide.has(mainContent)) {
      nodesToHide.delete(mainContent);
    }
  } catch (error) {
    console.debug('Error in handleReddit:', error);
  }
}

export { handleReddit };
