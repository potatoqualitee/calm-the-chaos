export const DEFAULT_ELEMENT_GROUPS = {
  'Social Media Posts': [
    '[role="article"]',
    '[data-ad-comet-preview="message"]',
    'div[data-testid="tweet"]',
    '[data-testid="tweetText"]',
    '.feed-shared-update-v2',
    '.update-components-actor__meta',
    '[data-testid="post-container"]',
    '.feed-item'
  ],
  'Comments & Replies': [
    '[data-testid="reply"]',
    '[data-testid="comment"]',
    'li:has(span[dir="auto"])'
  ],
  'Video Content': [
    'ytd-rich-grid-media',
    'ytd-video-renderer',
    'a#video-title',
    'yt-formatted-string.style-scope.ytd-video-renderer',
    'yt-formatted-string.metadata-snippet-text',
    'yt-formatted-string#description-text',
    'yt-formatted-string.video-description',
    'yt-formatted-string.content',
    'h3.title-and-badge.style-scope.ytd-video-renderer',
    'yt-formatted-string.title',
    'yt-formatted-string.caption',
    '.text-wrapper.style-scope.ytd-video-renderer',
    '.metadata-snippet-container-one-line.style-scope.ytd-video-renderer'
  ],
  'News & Articles': [
    'article[role="presentation"]',
    '.article',
    '.story',
    '.news-item',
    '.entry'
  ],
  'Generic Content': [
    '.post',
    '.content',
    '.wrapper',
    '.item',
    '[data-ks-item]'
  ],
  'Media & Lists': [
    '.card',
    '.media',
    '.image-container',
    '[class*="grid-item"]',
    '[class*="list-item"]',
    '[class*="card"]',
    '[class*="article"]',
    '[class*="post"]'
  ]
};

export const DEFAULT_ELEMENT_SETTINGS = {
  filterRedditCommentThreads: true,
  filterFacebookCommentThreads: true,
  showBlurMessage: true
};
