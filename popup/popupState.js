// popupState.js
import { isPreconfiguredDomain, isInHostPermissions } from '../scripts/core/config/preconfiguredDomains.js';

// Helper function to check if a URL matches any patterns
export function urlMatchesPatterns(url, patterns) {
  const urlObj = new URL(url);
  const domain = urlObj.hostname;
  const path = urlObj.pathname;

  return patterns.some(pattern => {
    // Handle path patterns (starting with /)
    if (pattern.startsWith('/')) {
      const pathPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      return new RegExp(`^${pathPattern}`, 'i').test(path);
    }
    // Handle .domain.com patterns - match both exact and subdomains
    if (pattern.startsWith('.')) {
      const baseDomain = pattern.substring(1);
      return domain === baseDomain || domain.endsWith(pattern);
    }
    // Handle prefix patterns ending with . (e.g., 'mail.')
    if (pattern.endsWith('.')) {
      return domain.startsWith(pattern);
    }
    // Handle patterns with * wildcards
    if (pattern.includes('*')) {
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      return new RegExp(`^${regexPattern}$`, 'i').test(domain);
    }
    // Handle exact matches
    return domain === pattern;
  });
}

// Function to get all ignored domain patterns
export function getIgnoredDomainsPatterns(ignoredDomains, disabledDomainGroups) {
  const patterns = [];
  Object.entries(ignoredDomains).forEach(([groupName, domains]) => {
    if (!disabledDomainGroups.includes(groupName)) {
      patterns.push(...domains);
    }
  });
  return patterns;
}

// Function to determine if the extension is enabled on the URL
export async function isExtensionEnabledOnUrl(url, ignoredDomains, disabledDomainGroups, filteringEnabled, enabledDomains = [], filterAllSites = false) {
  // First check for non-http/https URLs
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return false;
  }

  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    // Get ignored domains patterns
    const ignoredDomainsPatterns = getIgnoredDomainsPatterns(ignoredDomains, disabledDomainGroups);

    // Check if domain is ignored
    const isIgnored = urlMatchesPatterns(url, ignoredDomainsPatterns);

    // Check if it's a preconfigured domain
    const isPreconfigured = await isPreconfiguredDomain(domain);

    // If filter all sites is enabled, only check if the domain is ignored
    if (filterAllSites) {
      return !isIgnored;
    }

    if (isPreconfigured) {
      // Preconfigured domains are enabled by default unless explicitly ignored
      return !isIgnored;
    }

    // For non-preconfigured domains:
    if (!filteringEnabled) {
      // In site-specific mode, domain must be explicitly enabled
      return urlMatchesPatterns(url, enabledDomains);
    }

    // In global filtering mode, domain is enabled if not ignored or explicitly enabled
    return !isIgnored || urlMatchesPatterns(url, enabledDomains);
  } catch (e) {
    console.error('Error checking URL:', e);
    return false;
  }
}

// Function to determine initial state for domain toggle
export async function getInitialDomainState(url, storage) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    const {
      ignoredDomains = { Other: [] },
      disabledDomainGroups = [],
      filteringEnabled = true,
      enabledDomains = [],
      filterAllSites = false
    } = storage;

    // Use isExtensionEnabledOnUrl for consistent state determination
    const isEnabled = await isExtensionEnabledOnUrl(
      url,
      ignoredDomains,
      disabledDomainGroups,
      filteringEnabled,
      enabledDomains,
      filterAllSites
    );

    return {
      enabled: isEnabled,
      canToggle: true
    };
  } catch (e) {
    console.error('Error getting initial domain state:', e);
    return {
      enabled: false,
      canToggle: false,
      reason: "Invalid URL"
    };
  }
}
