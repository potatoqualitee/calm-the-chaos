# Bluesky Content Filtering

## Overview
This document explains how content filtering works on Bluesky (bsky.app) and how our handler implements it effectively.

## Post Structure
A typical Bluesky post has this DOM structure:
```html
<div data-testid="postThreadItem-by-[username].bsky.social">
   <!-- Avatar, username, timestamp -->
   <div class="css-175oi2r">
      <!-- The crucial content div -->
      <div dir="auto" data-word-wrap="1">
         [Post content goes here]
      </div>
   </div>
</div>
```

## How Bluesky Handles Content
When content is hidden on Bluesky:
1. The platform adds `display: none` to certain container elements
2. Metadata (avatar, username, timestamp) remains visible
3. The content div stays in the DOM but becomes hidden

## Our Filtering Solution
Instead of fighting against Bluesky's behavior, we work with it:

1. Target posts using multiple selectors:
```javascript
// Thread posts
'div[data-testid^="postThreadItem-by-"]'
// Profile feed posts
'div[data-testid^="feedItem-"]'
```

2. Target content using multiple selectors to catch all variations:
```javascript
'div[dir="auto"][data-word-wrap="1"]'           // Standard post content
'article[data-testid="postContent"] div[dir]'   // Profile feed post content
'div[data-testid="postContent"] div[dir]'       // Alternative post content
```

3. Replace content with styled filtered message:
```javascript
'<span style="color: #999; font-style: italic; opacity: 0.7;">-- content filtered --</span>'
```

4. Handle dynamic content loading through observers on:
- Feed content: '[data-testid="feedContent"]'
- Thread view: '[data-testid="threadMain"]'
- Profile posts: '[data-testid="profilePosts"]'

## Implementation Features
- Preserves original content in data attributes for potential restoration
- Skips empty divs and already processed content
- Excludes metadata divs from content replacement
- Implements processing flags to avoid duplicate processing
- Uses mutation observers for dynamically loaded content
- Works across different post types and views (feed, thread, profile)

## Why This Works
- Maintains Bluesky's component structure
- Doesn't interfere with platform's display logic
- Preserves metadata visibility
- Simple and robust approach
- Resistant to UI updates due to generic selectors

## Implementation Notes
- No need for complex CSS overrides
- No need to create placeholder elements
- Works with Bluesky's dynamic content loading
- Handles both feed and thread views
- Uses attribute selectors instead of class names for better maintainability
- Implements graceful error handling and debug logging

## Key Insight
The simpler approach of just replacing content and letting Bluesky handle display logic works better than trying to override the platform's behavior. Using generic attribute selectors instead of specific classes makes the solution more robust and maintainable. The implementation is further strengthened by comprehensive dynamic content handling and careful processing checks.

## You can't run browser extensions
NOTE: YOU CAN'T RUN EXTENSIONS so when you are asked to look at bluesky, you're being asked to evaluate the HTML. If you make any changes, you can't confirm they work by revisiting the website, unless you are checking your own work with your own logic.

Also, dont worry about logging in, you scan scroll down without logging in.