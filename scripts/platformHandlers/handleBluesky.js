// handleBluesky.js

import { containsBlockedContent } from '../contentFilter.js';

function handleBluesky(nodesToHide) {
  try {
    // Handle all post content using semantic selectors
    const posts = document.querySelectorAll([
      '[data-testid="postText"]',
      '[data-testid="contentHider-post"]',
      '[data-testid="quote-post"]',
      'div[role="article"]',
      'article'
    ].join(','));

    posts.forEach(post => {
      try {
        const content = post.textContent || '';
        if (containsBlockedContent(content).length > 0) {
          // Find the closest container that represents the full post
          const postContainer = post.closest('[role="link"]') ||
                              post.closest('article') ||
                              post.closest('[data-testid="contentHider-post"]') ||
                              post;
          nodesToHide.add(postContainer);
        }
      } catch (error) {
        console.debug('Error processing Bluesky post:', error);
      }
    });

    // Handle comments and replies
    const comments = document.querySelectorAll([
      '[data-testid="replyBtn"]',
      '[data-testid="quote-content"]',
      '[role="article"] [role="link"]'
    ].join(','));

    comments.forEach(comment => {
      try {
        // Get the parent container's content
        const container = comment.closest('[role="article"]') ||
                         comment.closest('[role="link"]');
        const content = container ? container.textContent || '' : '';

        if (containsBlockedContent(content).length > 0) {
          nodesToHide.add(container || comment);
        }
      } catch (error) {
        console.debug('Error processing Bluesky comment:', error);
      }
    });

    // Handle embedded content
    const embedded = document.querySelectorAll([
      '[data-testid="embedView"]',
      '[data-testid="card.compact"]',
      '[data-testid="card.full"]'
    ].join(','));

    embedded.forEach(content => {
      try {
        const text = content.textContent || '';
        if (containsBlockedContent(text).length > 0) {
          const container = content.closest('[role="link"]') ||
                           content.closest('[role="article"]') ||
                           content;
          nodesToHide.add(container);
        }
      } catch (error) {
        console.debug('Error processing embedded content:', error);
      }
    });
  } catch (error) {
    console.debug('Error in handleBluesky:', error);
  }
}

export { handleBluesky };
