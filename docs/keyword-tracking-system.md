# Keyword Tracking System Documentation

This document explains how the keyword tracking and counting system works in Calm the Chaos.

## Overview

The system tracks three main things:
1. Which keywords were blocked on the current page
2. How many blocks occurred (both per-page and total)
3. All-time statistics for each keyword across all pages

## Keyword Counting

Keywords are counted with the following rules:
1. Each occurrence of a keyword is counted, even multiple times in the same text
2. Keywords are normalized before counting:
   - Case variations (e.g., "Trump" and "trump") are combined
   - Punctuation and trailing characters are removed (e.g., "Trump's" → "Trump")
   - Short words (3 letters or less) are kept uppercase (e.g., "CIA")
   - Other words use Title Case for display

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

    // Original keywords mapping for display
    originalKeywords: {
        "normalized_keyword": "Original Keyword"  // Preserves original casing/format
    },

    // Stats for current page
    pageStats_${tabId}: {
        pageBlocked: 0,  // Total blocks on this page
        pageTotal: 0     // Total items scanned on this page
    },

    // Global stats
    stats: {
        totalBlocked: 0,   // Total blocks across all pages
        totalScanned: 0    // Total items scanned across all pages
    },

    // All-time keyword stats
    allTimeKeywordStats: {
        "Trump": 15,       // Each occurrence is counted
        "GOP": 5,         // Short words (≤3 chars) stay uppercase
        "Biden": 3,       // Title Case for display
        "Congress": 2     // Normalized and deduplicated across variations
    }

The allTimeKeywordStats storage key maintains persistent counts of how many times each keyword was blocked:
- Counts every occurrence of a keyword, even multiple times in the same text
- Uses storageManager.normalizeKeyword() to handle variations consistently
- Combines counts for different forms of the same word (e.g., "Trump's" → "Trump")
- Formats display consistently (Title Case or UPPERCASE for short words)
}
```

## Display

The extension provides statistics in two places:

### Popup UI
1. Keyword pills - shows keywords blocked on current page
2. Page stats - number of blocks on current page
3. Total stats - number of blocks across all pages
4. Badge text - updates with current page block count

### Options Page Statistics
1. All-time keyword stats - comprehensive list of all blocked keywords
2. Frequency counts - shows how many times each keyword was blocked
3. Sorted by count - most frequently blocked keywords appear first
4. Persistent storage - counts survive page loads and browser restarts

### Keyword Formatting
- 3-letter words are uppercase (e.g., "CIA", "GOP")
- Other words use Title Case (e.g., "Trump", "Climate Change")
- Variations are combined (e.g., "Trump's" → "Trump")
- Punctuation and trailing characters are removed

## Implementation

### Storage Updates
- Per-tab storage tracks current page keywords and counts
- All-time stats persist across browser sessions
- Stats update in real-time as content is filtered
- Storage listeners keep UI in sync with changes

### Keyword Processing
- Keywords are normalized using storageManager.normalizeKeyword()
- Counts every occurrence, including duplicates in same text
- Combines variations of the same word (e.g., with punctuation)
- Original keyword forms are preserved for display
- Supports both simple string and object formats

### UI Updates
- Popup shows current page stats and keyword pills
- Options page shows comprehensive all-time statistics
- Keywords are sorted by frequency (highest count first)
- Empty state message shown when no stats available
- Updates in real-time as new matches are found
