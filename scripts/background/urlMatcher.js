import { PRECONFIGURED_DOMAINS } from '../core/config/preconfiguredDomains.js';

// Function to check if a URL matches any patterns
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

// Function to check if URL is a pre-configured domain
function isPreconfiguredDomain(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    return PRECONFIGURED_DOMAINS.some(preconfiguredDomain => {
      // Check if domain exactly matches or is a subdomain of the preconfigured domain
      return domain === preconfiguredDomain || domain.endsWith('.' + preconfiguredDomain);
    });
  } catch (e) {
    console.error('Error parsing URL:', e);
    return false;
  }
}

// Function to determine if the extension is enabled on the URL
export function isExtensionEnabledOnUrl(url, ignoredDomains, disabledDomainGroups, filteringEnabled, enabledDomains = []) {
  // First check for non-http/https URLs
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return false;
  }

  // Check if it's a pre-configured domain
  if (isPreconfiguredDomain(url)) {
    // For pre-configured domains, check if they're in the ignored list
    const ignoredDomainsPatterns = getIgnoredDomainsPatterns(ignoredDomains, disabledDomainGroups);
    return !urlMatchesPatterns(url, ignoredDomainsPatterns);
  }

  // For non-pre-configured domains:
  // If global filtering is disabled, check if domain is explicitly enabled
  if (!filteringEnabled) {
    return urlMatchesPatterns(url, enabledDomains);
  }

  // If global filtering is enabled, check if domain is ignored
  const ignoredDomainsPatterns = getIgnoredDomainsPatterns(ignoredDomains, disabledDomainGroups);
  return !urlMatchesPatterns(url, ignoredDomainsPatterns);
}
