# Performance Improvements

## Overview

This update addresses performance issues on sites with frequent DOM updates, particularly Gmail and Bluesky. The changes focus on optimizing mutation observation and processing to reduce CPU usage and improve responsiveness.

## Key Improvements

### 1. Input Protection System

- Added a new `InputProtector` utility that identifies and filters out input-related mutations
- Prevents processing of mutations from text inputs, textareas, and contentEditable elements
- Includes special handling for platform-specific input areas (Gmail compose, Bluesky composer)
- Significantly reduces CPU usage during typing

### 2. Smarter Mutation Processing

- Increased debounce time from 250ms to 500ms for better batching
- Added throttling to prevent excessive processing during high-frequency updates
- Implemented dynamic debounce time that adjusts based on mutation rate
- Limited batch sizes to prevent processing too many mutations at once
- Used `requestIdleCallback` when available for better performance

### 3. Gmail-Specific Optimizations

- Added a dedicated Gmail handler with specialized processing
- Implemented targeted observation of specific Gmail DOM elements
- Added special protection for Gmail compose areas
- Used a more efficient throttling mechanism for Gmail's unique DOM structure

## Technical Details

### InputProtector

The `InputProtector` utility uses multiple strategies to identify input-related elements:

- Tag name matching (input, textarea, select)
- Class name pattern matching (editor, compose, etc.)
- Attribute checking (contenteditable, role="textbox", etc.)
- Platform-specific patterns (Gmail compose, Bluesky composer)

### Mutation Observer Improvements

The `FilteringMutationObserver` now:

- Filters mutations before processing
- Batches mutations more efficiently
- Throttles processing during high update frequencies
- Limits the number of mutations processed in a single batch
- Uses more efficient scheduling via `requestIdleCallback`

### Gmail Handler

The Gmail handler:

- Targets specific Gmail DOM elements for filtering
- Implements its own throttling mechanism
- Protects compose areas from mutation processing
- Uses a more efficient observer setup

## Expected Results

- Significantly reduced CPU usage during typing
- Better handling of dynamic content
- Maintained functionality with improved performance
- Platform-specific optimizations for better user experience

## Future Improvements

Additional optimizations planned for future updates:

- Implement smart container targeting for other platforms
- Add advanced caching mechanisms
- Use IntersectionObserver for visible content only
- Further platform-specific optimizations