# Keyword Tracking System Documentation

This document explains how the keyword tracking and counting system works in Calm the Chaos.

## Overview

The system tracks two main things:
1. Which keywords were blocked on the current page
2. How many blocks occurred (both per-page and total)

## Storage

The system uses Chrome's local storage with these key patterns:

```javascript
{
    // Keywords blocked on current page
    blockedKeywords_${tabId}: [
        "keyword1",                    // Simple string format
        {                             // Object format with count
            blockedKeywords: ["keyword2"],
            count: 2
        }
    ],

    // Stats for current page
    pageStats_${tabId}: {
        pageBlocked: 0,  // Total blocks on this page
        pageTotal: 0     // Total items scanned on this page
    },

    // Global stats
    stats: {
        totalBlocked: 0,   // Total blocks across all pages
        totalScanned: 0    // Total items scanned across all pages
    }
}
```

## Display

The popup UI shows:
1. Keyword pills - each blocked keyword with its count
2. Page stats - number of blocks on current page
3. Total stats - number of blocks across all pages

### Keyword Formatting
- 3-letter words are uppercase (e.g., "CIA")
- Other words use title case (e.g., "Climate Change")

## Implementation

### Storage Updates
- Keywords and counts are stored per-tab
- Stats update in real-time as content is filtered
- Storage listeners keep UI in sync with changes

### UI Updates
- Shows/hides sections based on if keywords are found
- Updates badge with current page block count
- Sorts keywords alphabetically in display
