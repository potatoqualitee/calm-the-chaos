// keywordNav.js
// The category jump list is derived from the groups that actually render, so
// it cannot drift away from the bundled catalog the way a hand-written list did.

export function keywordGroupId(groupName) {
  return String(groupName)
    .replace(/[^a-zA-Z0-9\s-()]/g, '')
    .replace(/\s+/g, '-')
    .replace(/\(|\)/g, '')
    .replace(/-+/g, '-')
    .trim();
}

// "US Political Figures - Full Name" reads better as "... (Full Name)".
export function keywordGroupNavLabel(groupName) {
  return String(groupName).replace(/\s+-\s+(.+)$/, ' ($1)');
}

export function keywordNavItems(groupNames = []) {
  return [...groupNames].sort().map(groupName => ({
    id: keywordGroupId(groupName),
    label: keywordGroupNavLabel(groupName)
  }));
}
