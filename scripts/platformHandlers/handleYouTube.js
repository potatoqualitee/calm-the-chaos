// handleYouTube.js

import { containsBlockedContent } from '../contentFilter.js';

function handleYouTube(nodesToHide) {
  try {
    // Handle YouTube videos
    const videos = document.querySelectorAll('ytd-rich-grid-media:not(footer *), ytd-video-renderer:not(footer *)');
    videos.forEach(video => {
      try {
        const content = video.textContent || '';
        if (containsBlockedContent(content).length > 0) {
          nodesToHide.add(video);
        }
      } catch (error) {
        console.debug('Error processing YouTube video:', error);
      }
    });

    // Handle YouTube comments
    const comments = document.querySelectorAll('ytd-comment-thread-renderer:not(footer *)');
    comments.forEach(comment => {
      try {
        const content = comment.textContent || '';
        if (containsBlockedContent(content).length > 0) {
          nodesToHide.add(comment);
        }
      } catch (error) {
        console.debug('Error processing YouTube comment:', error);
      }
    });
  } catch (error) {
    console.debug('Error in handleYouTube:', error);
  }
}

export { handleYouTube };
