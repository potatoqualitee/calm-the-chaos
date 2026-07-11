export const DEFAULT_ELEMENT_GROUPS = {
  'Social Media Posts': [
    '[role="article"]',
    'article',
    '[data-ad-comet-preview="message"]',
    'div[data-testid="tweet"]',
    '.feed-shared-update-v2',
    '[data-testid="post-container"]',
    '[data-urn^="urn:li:activity"]',
    'shreddit-post',
    '.feed-item'
  ],
  'Comments & Replies': [
    '[data-testid="reply"]',
    '[data-testid="comment"]',
    'shreddit-comment',
    'ytd-comment-thread-renderer',
    'li:has(span[dir="auto"])'
  ],
  'Video Content': [
    'ytd-rich-grid-media',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-reel-item-renderer',
    'yt-lockup-view-model'
  ],
  'News & Articles': [
    'article',
    'article[role="presentation"]',
    '.article',
    '.story',
    '.news-item',
    '.entry',
    '[data-component-name="card"]',
    '[data-testid$="-article"]',
    '[data-testid$="-live"]',
    '[data-testid="anchor-inner-wrapper"]'
  ],
  'Generic Content': [
    '.post',
    '[data-ks-item]'
  ],
  'Media & Lists': [
    '.card',
    '.media',
    '.image-container',
    '[class*="grid-item"]',
    '[class*="list-item"]',
    '[class~="card"]'
  ]
};

export const DEFAULT_ELEMENT_SETTINGS = {
  filterRedditCommentThreads: true,
  filterFacebookCommentThreads: true,
  showBlurMessage: true
};
