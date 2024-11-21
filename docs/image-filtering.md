# Image Filtering Guide

This guide explains two approaches to implementing image filtering in the extension:
1. Global image filtering for all sites
2. Platform-specific image filtering

## Global Image Filtering

To implement image filtering as a global option across all sites, consider these key aspects:

### User Control
- Add a simple toggle in the extension options
- Let users decide whether they want image filtering enabled
- Make the setting easily accessible and clearly labeled
- Configure which context elements to check (alt text, captions, nearby text, src URLs)

### Implementation Strategy
- Filter images based on multiple sources:
  * Alt text
  * Image source URLs and srcset
  * ARIA labels and title attributes
  * Captions (especially in figure elements)
  * Context around images (parent text content)
- Handle different image element types:
  * Standard img elements
  * Picture elements
  * Source elements
- Platform-specific exceptions (e.g., LinkedIn profiles, Reddit)
- Special handling for Brave's SpeedReader mode

### Performance Considerations
- Only process images when the global setting is enabled
- Cache processed content and matches
- Skip already hidden images
- Efficient attribute checking order
- Handle dynamic and lazy-loaded images
- Memory management for large caches

## Platform-Specific Image Filtering

Some platforms (like Reddit) may benefit from custom image filtering regardless of global settings. Here's what to consider:

### When to Use Platform-Specific Filtering
- Sites with unique content structures
- Platforms where images are core to the user experience
- Cases where standard filtering isn't effective enough
- Special cases requiring custom handling (e.g., LinkedIn profiles)

### Key Considerations for Reddit-like Platforms
- Post Structure: Consider how images relate to post content
- Context: Look at post titles, descriptions, and comments
- User Experience: Hide entire posts rather than just images
- Dynamic Loading: Account for infinite scroll and lazy loading

### Implementation Focus Areas
1. Content Structure
   - Understand how the platform organizes content
   - Identify key elements that contain images
   - Map relationships between images and text content

2. Context Awareness
   - Consider surrounding text when evaluating images
   - Look for patterns in how content is presented
   - Account for platform-specific content formatting

3. User Experience
   - Maintain smooth scrolling and navigation
   - Prevent layout shifts when hiding content
   - Keep interface elements functional

## Best Practices

### Content Detection
- Check multiple content sources in order:
  1. Alt text
  2. Source URLs (src, srcset, data-src)
  3. ARIA labels and titles
  4. Figure captions
  5. Parent element text content
- Balance accuracy with performance through caching
- Handle special cases (SpeedReader, platform-specific rules)

### Container Management
- Identify logical content groupings
- Maintain page layout when hiding elements
- Preserve navigation and functional elements
- IMPORTANT: When filtering text content, be careful not to accidentally hide images:
  * Add media-related classes to ignore lists (e.g., [class*="media"], [class*="image"])
  * Use targeted selectors to find specific text containers instead of hiding entire content blocks
  * Check for and skip media elements (IMG, PICTURE, SVG) during content detection
  * When hiding containers, prefer finding the nearest text-specific container over generic content containers
  * Consider the site's HTML structure to avoid hiding parent containers that contain both text and images

### Performance
- Cache processed content and matches
- Implement size limits on caches
- Skip already hidden elements
- Handle dynamic content efficiently
- Monitor memory and CPU usage

### Maintenance
- Document platform-specific approaches
- Monitor for site layout changes
- Plan for platform updates
- Keep track of special cases and exceptions

## Common Pitfalls

### Container-Based Filtering
When implementing container-based content filtering, be aware of these potential issues:

1. Over-aggressive Container Selection
   - Problem: Using broad selectors like [class*="container"] can accidentally hide entire sections including images
   - Solution: Use more specific selectors targeting text containers, or implement a method to find the nearest text-specific container

2. Mixed Content Containers
   - Problem: News sites often group related content (headlines, images, captions) in a single container
   - Solution: Instead of hiding the entire container when blocked content is found:
     * Identify and hide only the text portions
     * Add media-related classes to an ignore list
     * Implement specific checks to preserve image elements

3. Layout Preservation
   - Problem: Hiding parent containers can break page layouts or create visual gaps
   - Solution: Target the most specific text container possible while preserving media and structural elements

### Scroll-Based Refiltering
A critical issue discovered with news sites like CNN is scroll-based content refiltering:

1. The Problem:
   - Scrolling up and down can trigger unnecessary refiltering of content
   - This refiltering can cause previously visible images to disappear
   - The issue is particularly noticeable when scrolling back up through already-filtered content
   - Complex news site layouts with mixed text/image containers are most affected

2. Root Cause:
   - Scroll event listeners attempting to handle infinite scroll content
   - Refiltering already-processed content during scroll events
   - Container selection logic running multiple times on the same content

3. Solution:
   - Remove scroll event listeners entirely
   - Rely exclusively on MutationObserver for detecting new content
   - Only filter content in two scenarios:
     * Initial page load
     * When new content is dynamically added (caught by mutation observer)
   - Trust the mutation observer to handle infinite scroll content naturally

4. Benefits:
   - Images remain visible regardless of scroll behavior
   - Better performance by avoiding redundant filtering
   - More predictable and consistent behavior
   - Simplified content detection logic

### Special Cases

1. SpeedReader Mode
   - Problem: Brave's SpeedReader can affect content structure
   - Solution: Detect SpeedReader mode and adjust filtering accordingly
   - Clear caches when SpeedReader is detected to prevent stale results

2. Platform Exceptions
   - Problem: Some platforms need special handling (e.g., LinkedIn profiles)
   - Solution: Implement platform-specific checks and bypass filtering when needed

3. Dynamic Content
   - Problem: Images loaded through lazy loading or infinite scroll
   - Solution: Use mutation observers to detect and process new content

## Testing Guidelines

### Content Scenarios
- Images with obvious blocked content
- Images with subtle or contextual references
- Images without descriptive text
- Dynamic and lazy-loaded images
- Mixed content containers (text + images)
- Various text container structures
- Platform-specific cases (Reddit, LinkedIn)
- SpeedReader mode

### User Experience
- Smooth scrolling behavior
- Consistent layout
- Clear feedback on filtered content
- Proper preservation of images when filtering text
- Platform-specific behavior

### Technical Aspects
- Load time impact
- Scrolling performance
- Memory usage
- Dynamic content handling
- Container selection accuracy
- Cache effectiveness

## Future Considerations

### Scalability
- Plan for new platforms
- Consider content type variations
- Prepare for increased filtering complexity
- Handle growing cache sizes

### Flexibility
- Allow for easy updates to filtering logic
- Support platform-specific customizations
- Enable quick responses to platform changes
- Adapt to new content delivery methods

### User Feedback
- Monitor effectiveness
- Gather usage patterns
- Adjust based on user needs
- Track special cases and exceptions
