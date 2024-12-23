# Immediate Blur System

The immediate blur system provides instant content protection for sensitive sites by applying a blur overlay before any content is processed or displayed. This ensures that no sensitive content is ever visible to the user before being filtered.

## How It Works

1. When a page loads, the system first checks for SpeedReader:
   ```javascript
   // Prevent blur if SpeedReader is detected immediately
   if (isSpeedReader()) {
       document.documentElement.classList.add('blur-removed');
   }
   ```

2. For normal page loads:
   - If SpeedReader is not active, check if the site needs immediate blur
   - If blur is needed, apply it before any content processing
   ```javascript
   if (needsImmediateBlur(hostname)) {
       await showImmediateBlur();
   }
   ```

3. SpeedReader Detection:
   - Checks for Brave's SpeedReader markers:
     * SpeedReader-specific attributes (data-font-family, data-font-size, data-column-width)
     * SpeedReader elements (brave_speedreader_style, atkinson_hyperligible_font)
     * SpeedReader classes (tts-paragraph-player, tts-highlighted, tts-circle)
     * Brave's CSP meta tag
   - If detected, prevents or removes blur immediately
   - Maintains unblurred state during tab visibility changes
   - Continuously monitors for SpeedReader activation via MutationObserver
   - Skips all content processing when SpeedReader is active

4. For normal processing:
   - The initial blur remains while checking site configuration
   - A friendly message with floating emojis appears to indicate content filtering is in progress
   - Content processing proceeds normally under the overlay
   - The blur will automatically remove after 10 seconds as a failsafe
   - Once filtering is successfully complete, all blurs are removed

5. The blur persists through tab state changes:
   - Reapplied when tab becomes visible if SpeedReader is not active
   - Maintained during "sleeping" state when tab is hidden
   - Removed if SpeedReader becomes active
   - Removed when content is successfully filtered
   - State tracked via data-calm-chaos-state attribute

6. If any error occurs during filtering, the blur remains in place to prevent exposure to unfiltered content

## SpeedReader Integration

The system integrates with Brave's SpeedReader mode in several ways:

1. **Early Detection**:
   - Checks for SpeedReader before any blur is applied
   - Uses multiple detection methods:
     * SpeedReader-specific attributes (data-font-family, data-font-size, data-column-width)
     * SpeedReader elements (brave_speedreader_style, atkinson_hyperligible_font)
     * SpeedReader classes (tts-paragraph-player, tts-highlighted, tts-circle)
     * Brave's CSP meta tag

2. **Continuous Detection**:
   - MutationObserver watches for SpeedReader activation
   - Updates state immediately when detected
   - Prevents unnecessary processing

3. **Blur Prevention**:
   - Adds 'blur-removed' class immediately when SpeedReader is detected
   - Prevents blur from being applied during page load
   - Maintains unblurred state during tab state changes

4. **Performance**:
   - Skips all content processing when SpeedReader is active
   - No unnecessary blur/unblur operations
   - Lightweight detection system

## Adding a New Site

To add a new site to the immediate blur system:

1. Open `scripts/core/config/immediateBlur.js`
2. Add your site to the `IMMEDIATE_BLUR_SITES` configuration. You can use exact domains or partial matches:

```javascript
export const IMMEDIATE_BLUR_SITES = {
    'cnn.com': {
        enabled: true
    },
    'bbc': {  // This will match any domain containing 'bbc' (e.g., bbc.com, bbc.co.uk)
        enabled: true
    }
};
```

The hostname matching is done using `includes()`, so:
- `'cnn.com'` matches exactly cnn.com
- `'bbc'` matches any domain containing 'bbc' (bbc.com, bbc.co.uk, etc.)

3. Create a handler for your site (if not already exists) in `scripts/platforms/`
4. In your handler's `handle()` method, call `removeImmediateBlur()` after content processing:

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

1. **Base CSS Styling** (`immediate-site-blur.css`):
   - Defines the blur overlay styles (10px blur)
   - Uses rgba(255, 255, 255, 0.5) background
   - Handles state transitions through CSS classes
   - Ensures smooth transitions and proper z-indexing
   - Maintains blur during tab state changes

2. **Configuration & Core Logic** (`immediateBlur.js`):
   - Defines which sites need immediate blur
   - Provides functions to show/remove the blur overlay
   - Handles SpeedReader detection and bypass
   - Implements 10-second automatic blur removal
   - Manages blur message visibility settings

3. **Content Script Integration** (`content.js`):
   - Checks for SpeedReader before any blur operations
   - Initializes blur system during page load
   - Manages blur state through tab lifecycle:
     * Initial page load
     * Tab visibility changes
     * Extension reloads
     * Settings updates
     * Tab wake-up events
   - Ensures proper cleanup and reinitialization
   - Coordinates with SpeedReader detection
   - Handles extension reload events
   - Manages keyword updates

4. **Handler Integration** (e.g., `handleCNN.js`):
   - Focuses purely on content processing
   - Removes blur after successful filtering
   - Maintains blur on processing errors
   - Keeps blur-related code separate from content handling

The system uses a multi-phase approach:
1. First, an immediate CSS-based blur is injected before any content loads (unless SpeedReader is detected)
2. A friendly message with floating emojis appears to indicate filtering is in progress
3. A 10-second timeout ensures the blur doesn't get stuck
4. Finally, all blurs are removed once content is filtered

This approach ensures:
- No content is ever visible before being filtered (except in SpeedReader mode)
- Users get feedback about the filtering process
- Blur never gets permanently stuck
- Clean separation of concerns for maintainability
- Proper handling of special modes like SpeedReader
- Robust error handling and state management