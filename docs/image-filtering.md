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

### Implementation Strategy
- Filter images based on their descriptive text (alt text, captions)
- Consider the context around images (headlines, article text)
- Maintain a balance between thorough filtering and performance

### Performance Considerations
- Only process images when the global setting is enabled
- Use efficient methods to check image content
- Consider lazy loading impact on filter timing

## Platform-Specific Image Filtering

Some platforms (like Reddit) may benefit from custom image filtering regardless of global settings. Here's what to consider:

### When to Use Platform-Specific Filtering
- Sites with unique content structures
- Platforms where images are core to the user experience
- Cases where standard filtering isn't effective enough

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
- Consider multiple sources of text associated with images
- Look at both direct (alt text) and indirect (captions, titles) content
- Balance accuracy with performance

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
- Optimize detection methods
- Handle dynamic content efficiently
- Monitor memory and CPU usage

### Maintenance
- Document platform-specific approaches
- Monitor for site layout changes
- Plan for platform updates

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

### Mixed Content Containers
Be cautious with containers that mix text and media:

1. Identification:
   - Look for containers with both text and image content
   - Check for nested media elements
   - Consider platform-specific container patterns

2. Handling:
   - Prefer targeting specific text elements over entire containers
   - Use precise selectors to avoid affecting media
   - Consider the DOM hierarchy when selecting elements to hide

## Testing Guidelines

### Content Scenarios
- Images with obvious blocked content
- Images with subtle or contextual references
- Images without descriptive text
- Dynamic and lazy-loaded images
- Mixed content containers (text + images)
- Various text container structures

### User Experience
- Smooth scrolling behavior
- Consistent layout
- Clear feedback on filtered content
- Proper preservation of images when filtering text

### Technical Aspects
- Load time impact
- Scrolling performance
- Memory usage
- Dynamic content handling
- Container selection accuracy

## Future Considerations

### Scalability
- Plan for new platforms
- Consider content type variations
- Prepare for increased filtering complexity

### Flexibility
- Allow for easy updates to filtering logic
- Support platform-specific customizations
- Enable quick responses to platform changes

### User Feedback
- Monitor effectiveness
- Gather usage patterns
- Adjust based on user needs
