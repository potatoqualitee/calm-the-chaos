import { PRECONFIGURED_DOMAINS } from './config/preconfiguredDomains.js';

// Helper function to check if a URL matches any patterns
function domainOrPathMatchesPatterns(url, patterns) {
  const { hostname, pathname } = new URL(url);
  return patterns.some(pattern => {
    // Handle path patterns (starting with /)
    if (pattern.startsWith('/')) {
      const pathPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      return new RegExp(`^${pathPattern}`, 'i').test(pathname);
    }

    // Handle extension-like patterns (e.g. ".ai", "*.ai")
    if (/^\*?\.[a-z0-9]+$/i.test(pattern)) {
      const extensionPattern = pattern.replace(/^\*?\./, '');
      // Check both hostname and full URL path for the extension
      const fullPath = pathname.toLowerCase();
      return hostname.endsWith(`.${extensionPattern}`) ||
             fullPath.includes(`.${extensionPattern}`);
    }

    // Handle .domain.com patterns - match both exact and subdomains
    if (pattern.startsWith('.')) {
      const baseDomain = pattern.substring(1);
      return hostname === baseDomain || hostname.endsWith(pattern);
    }

    // Handle prefix patterns ending with . (e.g., 'mail.')
    if (pattern.endsWith('.')) {
      return hostname.startsWith(pattern);
    }

    // Handle patterns with * wildcards
    if (pattern.includes('*')) {
      // If pattern contains a path component, match against full URL
      if (pattern.includes('/')) {
        const fullUrl = hostname + pathname;
        const regexPattern = pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*');
        return new RegExp(regexPattern, 'i').test(fullUrl);
      }
      // Otherwise just match against hostname
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      return new RegExp(`^${regexPattern}$`, 'i').test(hostname);
    }

    // Handle exact matches - check both hostname and path patterns
    if (pattern.includes('/')) {
      const fullUrl = hostname + pathname;
      return fullUrl.includes(pattern);
    }
    return hostname === pattern;
  });
}

// Function to get all ignored domain patterns
function getIgnoredDomainsPatterns(ignoredDomains, disabledDomainGroups) {
  const patterns = [];
  Object.entries(ignoredDomains).forEach(([groupName, domains]) => {
    if (!disabledDomainGroups.includes(groupName)) {
      patterns.push(...domains);
    }
  });
  return patterns;
}

// Function to check if URL is a pre-configured domain
function isPreconfiguredDomain(url) {
  try {
    const { hostname } = new URL(url);
    return PRECONFIGURED_DOMAINS.some(preconfiguredDomain => hostname.includes(preconfiguredDomain));
  } catch (e) {
    console.error('Error parsing URL:', e);
    return false;
  }
}

// Function to determine if the extension is enabled on the URL
function isExtensionEnabledOnUrl(url, ignoredDomains, disabledDomainGroups, filteringEnabled, enabledDomains = [], filterAllSites = false) {
  // First check for non-http/https URLs
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return false;
  }

  // Get ignored domains patterns
  const ignoredDomainsPatterns = getIgnoredDomainsPatterns(ignoredDomains, disabledDomainGroups);

  // Check if it's a pre-configured domain
  if (isPreconfiguredDomain(url)) {
    return !domainOrPathMatchesPatterns(url, ignoredDomainsPatterns);
  }

  // If filter all sites is enabled, only check if the domain is ignored
  if (filterAllSites) {
    return !domainOrPathMatchesPatterns(url, ignoredDomainsPatterns);
  }

  // For non-pre-configured domains:
  // If global filtering is disabled, check if domain is explicitly enabled
  if (!filteringEnabled) {
    return domainOrPathMatchesPatterns(url, enabledDomains);
  }

  // If global filtering is enabled, check if domain is ignored or explicitly enabled
  return !domainOrPathMatchesPatterns(url, ignoredDomainsPatterns) || domainOrPathMatchesPatterns(url, enabledDomains);
}

export { isExtensionEnabledOnUrl };
