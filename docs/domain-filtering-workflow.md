# Domain Filtering Workflow

## Overview

This document details how domain filtering works in the extension, including pre-configured domains, global filtering, and domain group management.

## Core Concepts

### Domain Types

1. **Pre-configured Domains**
   - Built-in domains like Twitter, Facebook, Reddit, etc.
   - Filtering enabled by default
   - Configured in `scripts/core/config/preconfiguredDomains.js`
   - Special handling for consistent filtering behavior
   - Examples: cnn.com, facebook.com, reddit.com
   - Grouped by category (Social Media, News, etc.)
   - Permission handling:
     - Host permissions defined in manifest.json
     - Optional permissions requested as needed
     - Automatic permission checks before enabling filtering
   - Subdomain handling:
     - Matches exact domain (e.g., cnn.com)
     - Matches all subdomains (e.g., edition.cnn.com, live.cnn.com)
     - Ensures consistent filtering across all variations of the domain

2. **Custom Domains**
   - Any other website the user wants to filter
   - Filtering disabled by default unless explicitly enabled
   - Can be individually enabled/disabled
   - Examples: github.manning.com, news.example.com

### Storage Keys

- `ignoredDomains`: Domains where filtering is disabled when global filtering is on
  - Structure: `{ "Other": ["domain1.com", "domain2.com"] }`
  - Used for both pre-configured and custom domains when global filtering is on
- `enabledDomains`: Domains where filtering is enabled when global filtering is off
  - Structure: `["domain1.com", "domain2.com"]`
  - Only used for custom domains when global filtering is off
- `previouslyEnabled`: Tracks domains that were explicitly enabled
  - Used for state restoration and history tracking
- `manuallyEnabled`: Tracks domains that were manually enabled
  - Persists through global filtering changes
  - Critical for maintaining user preferences
- `disabledDomainGroups`: Groups of pre-configured domains that are disabled
  - Used for bulk management of domain categories

## User Interface Controls

### Popup Controls

1. **Filter All Sites Toggle**
   - Top-level switch for global filtering
   - When ON: All domains filtered unless explicitly ignored
   - When OFF: Only enabled domains and pre-configured domains are filtered
   - Automatically enables current site if it's http/https

2. **Domain Toggle**
   - Per-domain switch for current site
   - Shows current filtering state for the domain
   - Allows enabling/disabling filtering for specific domain
   - State persists through global filtering changes

### Options Page Controls

1. **Domain Groups**
   - Lists pre-configured domains grouped by category
   - Allows enabling/disabling entire groups
   - Individual domains within groups can be managed
   - Changes affect both global ON and OFF states

2. **Custom Domains**
   - Lists manually added domains
   - Shows enabled/disabled state
   - Allows adding new domains to filter
   - States properly persist through global filtering changes

## Filtering Modes

### Global Filtering OFF

1. **Pre-configured Domains**
   - Enabled by default unless in `ignoredDomains['Other']`
   - Can be disabled by adding to `ignoredDomains['Other']`
   - State tracked in `manuallyEnabled` when explicitly enabled
   - Uses `ignoredDomains` for state management

2. **Custom Domains**
   - Disabled by default
   - Must be explicitly added to `enabledDomains`
   - State tracked in `manuallyEnabled` when enabled
   - Uses `enabledDomains` for state management

### Global Filtering ON

1. **Pre-configured Domains**
   - Enabled by default unless in `ignoredDomains['Other']`
   - Can be disabled by adding to `ignoredDomains['Other']`
   - `manuallyEnabled` state preserved

2. **Custom Domains**
   - Enabled by default unless in `ignoredDomains['Other']`
   - Can be disabled by adding to `ignoredDomains['Other']`
   - `manuallyEnabled` state preserved
   - `enabledDomains` not used in this mode

### Filter All Sites Mode

1. **Behavior**
   - Controlled by `filterAllSites` parameter
   - When enabled, all domains are filtered by default
   - Only checks if domain is in `ignoredDomains`
   - Overrides normal global filtering behavior
   - Simplifies domain filtering logic

2. **State Management**
   - Uses `ignoredDomains` for tracking disabled sites
   - Ignores `enabledDomains` list completely
   - Maintains compatibility with domain groups
   - Preserves `manuallyEnabled` state for future use

## State Transitions

### Toggling Individual Domains

1. **When Global Filtering is OFF:**
   ```javascript
   if (isPreconfigured) {
     // Pre-configured domains use ignoredDomains
     if (enabling) {
       remove from ignoredDomains['Other']
       add to manuallyEnabled
     } else {
       add to ignoredDomains['Other']
       remove from manuallyEnabled
     }
   } else {
     // Custom domains use enabledDomains
     if (enabling) {
       add to enabledDomains
       add to manuallyEnabled
     } else {
       remove from enabledDomains
       remove from manuallyEnabled
     }
   }
   ```

2. **When Global Filtering is ON:**
   ```javascript
   if (enabling) {
     remove from ignoredDomains['Other']
     add to manuallyEnabled
   } else {
     add to ignoredDomains['Other']
     remove from manuallyEnabled
   }
   ```

### Toggling Global Filtering

1. **Turning ON:**
   ```javascript
   // Convert manually enabled domains
   manuallyEnabled.forEach(domain => {
     remove from ignoredDomains['Other']
   })

   // Handle current domain if it's http/https
   if (isHttps) {
     remove from ignoredDomains['Other']
     add to manuallyEnabled
   }

   // Clear enabledDomains as we're using ignoredDomains
   enabledDomains = []
   ```

2. **Turning OFF:**
   ```javascript
   // Restore manually enabled domains
   enabledDomains = [...manuallyEnabled]

   if (isPreconfigured) {
     if (manuallyEnabled.includes(currentDomain)) {
       remove from ignoredDomains['Other']
     }
   } else {
     if (manuallyEnabled.includes(currentDomain)) {
       add to enabledDomains
     }
   }
   ```

## Domain Groups in Options

### Group Toggle Behavior

```javascript
if (disabling) {
  // Add all domains in group to ignoredDomains
  groupDomains.forEach(domain => {
    add to ignoredDomains['Other']
  })
  add groupName to disabledDomainGroups
} else {
  // Remove all domains in group from ignoredDomains
  groupDomains.forEach(domain => {
    remove from ignoredDomains['Other']
  })
  remove groupName from disabledDomainGroups
}
```

## Special Cases

1. **HTTP/HTTPS Auto-Enable:**
   - When turning on global filtering on an http/https site
   - Site is automatically enabled and added to manuallyEnabled
   - Ensures intuitive behavior when enabling filtering
   - Only applies to web pages, not special protocols

2. **Domain State Persistence:**
   - manuallyEnabled list persists through global filtering changes
   - Ensures domains stay enabled/disabled as user intended
   - Prevents unexpected state changes when toggling global filtering
   - Critical for maintaining user preferences

3. **Pre-configured Domain Groups:**
   - Can be toggled as a group in options
   - All domains in group are enabled/disabled together
   - State properly persists through global filtering changes
   - Uses disabledDomainGroups for tracking

4. **URL Pattern Matching:**
   - Implemented in both urlModule.js and urlMatcher.js
   - Supports multiple pattern types:
     - Path patterns (e.g., "/blog/*")
     - Extension patterns (e.g., ".ai", "*.ai")
     - Domain patterns with wildcards (e.g., "*.example.com")
     - Prefix patterns (e.g., "mail.")
     - Exact domain matches
   - Handles both hostname and full URL path matching
   - Ensures consistent filtering across different URL formats

5. **Subdomain Handling:**
   - Pre-configured domains automatically match all subdomains
   - Example: cnn.com configuration matches:
     - cnn.com (exact match)
     - edition.cnn.com (subdomain)
     - live.cnn.com (subdomain)
   - Ensures consistent filtering across all variations of a domain
   - Implemented using proper domain matching logic

## Common Workflows

1. **Enabling a Custom Domain:**
   ```
   1. Global filtering off
   2. Visit domain (e.g., github.manning.com)
   3. Enable in popup
   4. Domain added to:
      - enabledDomains (if global filtering off)
      - manuallyEnabled (persists through changes)
   5. State persists through global filtering changes
   ```

2. **Disabling a Pre-configured Domain:**
   ```
   1. Visit pre-configured domain (e.g., cnn.com)
   2. Disable in popup
   3. Domain added to ignoredDomains['Other']
   4. Removed from manuallyEnabled
   5. State persists through global filtering changes
   ```

3. **Toggling Domain Groups:**
   ```
   1. Open options
   2. Toggle domain group (e.g., Social Media)
   3. All domains in group added/removed from ignoredDomains['Other']
   4. Group added/removed from disabledDomainGroups
   5. Changes affect both global ON and OFF states
   ```

4. **Toggling Global Filtering:**
   ```
   1. Click "Filter all sites" in popup
   2. If on http/https site:
      - Site automatically enabled
      - Added to manuallyEnabled
   3. All manuallyEnabled domains preserved
   4. enabledDomains cleared (using ignoredDomains instead)
   5. Previously enabled domains remain enabled
   6. State properly transitions between modes
   ```

## Implementation Files

Core Files:
- `scripts/core/config/preconfiguredDomains.js`:
  - Defines pre-configured domains
  - Handles domain permissions management
  - Provides helper functions for domain validation
- `scripts/core/urlModule.js`:
  - Core domain filtering logic
  - URL pattern matching implementation
  - State management for filtering modes
- `scripts/background/urlMatcher.js`:
  - Domain matching and filtering decisions
  - Alternative URL pattern matching implementation
  - Used primarily in background context

UI Integration:
- `popup/popupEvents.js`:
  - Handles popup UI interactions
  - Manages domain toggling
  - Updates filtering states
- `options/optionsStorage.js`:
  - Manages storage operations
  - Handles domain group toggling
  - Persists user preferences

Permission Management:
- `manifest.json`:
  - Defines host permissions
  - Specifies optional permissions
  - Controls domain access patterns

## Storage State Examples

### Global Filtering OFF
```javascript
{
  filteringEnabled: false,
  ignoredDomains: {
    "Other": ["bsky.app"] // Disabled pre-configured domains
  },
  enabledDomains: ["git.manning.com"], // Enabled custom domains
  manuallyEnabled: ["git.manning.com"], // Persists through changes
  disabledDomainGroups: ["Social Media"] // Disabled groups
}
```

### Global Filtering ON
```javascript
{
  filteringEnabled: true,
  ignoredDomains: {
    "Other": ["bsky.app", "example.com"] // All disabled domains
  },
  enabledDomains: [], // Not used in this mode
  manuallyEnabled: ["github.manning.com"], // Persists through changes
  disabledDomainGroups: ["Social Media"] // Disabled groups
}
