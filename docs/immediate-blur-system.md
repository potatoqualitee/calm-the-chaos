# Immediate Blur System

The immediate blur system provides instant content protection for sensitive sites by applying a blur overlay before any content is processed or displayed. This ensures that no sensitive content is ever visible to the user before being filtered.

## How It Works

1. When a page loads, an immediate CSS-based blur is applied to matching sites
2. The system then checks if SpeedReader is active:
   - If SpeedReader is detected, the blur is immediately removed
   - If not, the system proceeds with content processing
3. For normal processing:
   - The initial blur remains while checking site configuration
   - If the site needs filtering, the emoji overlay replaces the initial blur
   - Content processing proceeds normally under the overlay
   - Once filtering is successfully complete, all blurs are removed
4. If any error occurs during filtering, the blur remains in place to prevent exposure to unfiltered content

## Adding a New Site

To add a new site to the immediate blur system:

1. Open `scripts/core/config/immediateBlur.js`
2. Add your site to the `IMMEDIATE_BLUR_SITES` configuration:

```javascript
export const IMMEDIATE_BLUR_SITES = {
    'cnn.com': {
        enabled: true
    },
    'vanityfair.com': {  // Add your new site
        enabled: true
    }
};
```

3. Add CSS injection to `manifest.json` for your site:

```json
"content_scripts": [
    {
      "matches": ["*://*.cnn.com/*", "*://*.vanityfair.com/*"],  // Add your site
      "css": ["styles/immediate-site-blur.css"],
      "run_at": "document_start"
    }
]
```

4. Create a handler for your site (if not already exists) in `scripts/platforms/`
5. In your handler's `handle()` method, call `removeImmediateBlur()` after content processing:

```javascript
import { removeImmediateBlur } from '../core/config/immediateBlur.js';

class YourSiteHandler extends BaseHandler {
    async handle(nodesToHide) {
        try {
            // Process and filter content
            await super.handle(nodesToHide);

            // Only remove blur after filtering is complete and successful
            removeImmediateBlur();
        } catch (error) {
            console.error('Error in handler:', error);
            // Don't remove blur if there was an error
            // This prevents exposure to unfiltered content
        }
    }
}
```

That's it! Your site will now have immediate content protection with no flash of unfiltered content.

## How It's Implemented

The system consists of four main parts:

1. **Immediate CSS Injection** (`immediate-site-blur.css`):
   - Injected at document_start via manifest.json
   - Uses backdrop-filter for consistent blur style
   - Prevents any content from being visible before processing

2. **Configuration** (`immediateBlur.js`):
   - Defines which sites need immediate blur
   - Provides functions to show/remove the blur overlay
   - Makes it easy to add new sites

3. **Early Detection** (`content.js`):
   - Checks for immediate blur sites as early as possible
   - Transitions from CSS blur to emoji overlay
   - Ensures no content is visible before filtering

4. **Handler Integration** (e.g., `handleCNN.js`):
   - Focuses purely on content processing
   - Removes all blurs after processing is complete
   - Keeps blur-related code separate from content handling

The system uses a two-phase blur approach:
1. First, an immediate CSS-based blur is injected before any content loads
2. Then, it transitions to the emoji overlay once the extension is ready
3. Finally, all blurs are removed once content is filtered

This approach ensures:
- No content is ever visible before being filtered
- Consistent blur styling throughout the process
- Smooth transition to the friendly emoji message
- Clean separation of concerns for maintainability