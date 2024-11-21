// Pre-configured domains that have specific content handling implementations
// These domains are enabled by default
export const PRECONFIGURED_DOMAINS = [
  'bbc.com',
  'bsky.app',
  'cnn.com',
  //'facebook.com',
  'news.google.com',
  'instagram.com',
  'linkedin.com',
  //'msn.com',
  'people.com',
  'reddit.com',
  'stackoverflow.com',
  'yahoo.com',
  'youtube.com'
];

// Helper function to check if a domain matches any preconfigured domain
export function isPreconfiguredDomain(domain) {
  return PRECONFIGURED_DOMAINS.some(preconfigured =>
    domain === preconfigured || domain.endsWith('.' + preconfigured)
  );
}

// Helper function to check if a domain is in manifest host permissions
// These domains are allowed but not enabled by default
export async function isInHostPermissions(domain) {
  const manifest = chrome.runtime.getManifest();
  const hostPermissions = manifest.host_permissions || [];

  // Convert domain to URL patterns that match manifest format
  const domainPatterns = [
    `https://*.${domain}/*`,
    `https://${domain}/*`
  ];

  return hostPermissions.some(permission => {
    return domainPatterns.some(pattern => {
      const permissionRegex = new RegExp(
        '^' + permission.replace(/\*/g, '.*') + '$'
      );
      return permissionRegex.test(pattern);
    });
  });
}

// Helper function to check if we need to request permissions
// Only request for domains not in host_permissions
export async function needsPermissionRequest(domain) {
  // If domain is in host_permissions, no need to request
  if (await isInHostPermissions(domain)) {
    return false;
  }

  // Check if we already have optional permission
  const permission = {
    origins: [`https://${domain}/*`]
  };
  return !(await chrome.permissions.contains(permission));
}

// Helper function to request permission for a domain
export async function requestDomainPermission(domain) {
  // If domain is in host_permissions, no need to request
  if (await isInHostPermissions(domain)) {
    return true;
  }

  const permission = {
    origins: [`https://${domain}/*`]
  };
  return await chrome.permissions.request(permission);
}
