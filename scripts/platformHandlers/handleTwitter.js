// handleTwitter.js

import { containsBlockedContent } from '../contentFilter.js';

function handleTwitter(nodesToHide) {
  try {
    // Handle Twitter tweets
    const tweets = document.querySelectorAll('div[data-testid="tweet"]:not(footer *), [data-testid="tweetText"]:not(footer *)');
    tweets.forEach(tweet => {
      try {
        const content = tweet.textContent || '';
        if (containsBlockedContent(content).length > 0) {
          nodesToHide.add(tweet);
        }
      } catch (error) {
        console.debug('Error processing Twitter tweet:', error);
      }
    });

    // Handle Twitter comments
    const comments = document.querySelectorAll('div[data-testid="reply"]:not(footer *)');
    comments.forEach(comment => {
      try {
        const content = comment.textContent || '';
        if (containsBlockedContent(content).length > 0) {
          nodesToHide.add(comment);
        }
      } catch (error) {
        console.debug('Error processing Twitter comment:', error);
      }
    });
  } catch (error) {
    console.debug('Error in handleTwitter:', error);
  }
}

export { handleTwitter };
