export function normalizeKeywordIdentity(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function catalogEntries(groups = {}) {
  const entries = new Map();
  for (const [category, keywords] of Object.entries(groups || {})) {
    for (const keyword of Array.isArray(keywords) ? keywords : []) {
      const identity = normalizeKeywordIdentity(keyword);
      if (identity && !entries.has(identity)) entries.set(identity, { keyword, category });
    }
  }
  return entries;
}

function manifestChanges(manifest = {}) {
  const changes = [];
  for (const migration of manifest.migrations || []) {
    for (const change of migration.changes || []) {
      changes.push({ ...change, version: change.version || migration.version });
    }
  }
  for (const change of manifest.changes || []) {
    changes.push({ ...change, version: change.version || manifest.catalogVersion });
  }
  return changes;
}

const recordFor = value => typeof value === 'string' ? { keyword: value } : { ...value };

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveRename(identity, renameBySource) {
  const seen = new Set();
  let current = identity;

  while (renameBySource.has(current) && !seen.has(current)) {
    seen.add(current);
    current = normalizeKeywordIdentity(renameBySource.get(current).to);
  }

  return { identity: current, cyclic: seen.has(current) };
}

function sortedValues(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function inferLegacyCatalogGroups({
  storedGroups = {},
  currentCatalogGroups = {},
  manifest = {}
} = {}) {
  const knownIdentities = new Set(catalogEntries(currentCatalogGroups).keys());
  const managedCategories = new Set(Object.keys(currentCatalogGroups || {}));

  for (const change of manifestChanges(manifest)) {
    for (const value of [change.keyword, change.from, change.to]) {
      const identity = normalizeKeywordIdentity(value);
      if (identity) knownIdentities.add(identity);
    }
    for (const category of [change.category, change.fromCategory, change.toCategory]) {
      if (typeof category === 'string' && category) managedCategories.add(category);
    }
  }

  const inferred = {};
  for (const [category, keywords] of Object.entries(storedGroups || {})) {
    if (!managedCategories.has(category)) continue;
    inferred[category] = (Array.isArray(keywords) ? keywords : [])
      .filter(keyword => knownIdentities.has(normalizeKeywordIdentity(keyword)));
  }
  return inferred;
}

export function migrateManagedGroupExtras({
  storedGroups = {},
  previousCatalogGroups = {},
  nextCatalogGroups = {},
  customKeywords = [],
  customKeywordMeta = {},
  disabledGroups = [],
  disabledKeywords = [],
  manifest = {},
  hadSnapshot = false,
  dynamicCategories = [],
  requireProvenanceWithoutSnapshot = false
} = {}) {
  const customByIdentity = new Map();
  for (const keyword of Array.isArray(customKeywords) ? customKeywords : []) {
    const identity = normalizeKeywordIdentity(keyword);
    if (identity && !customByIdentity.has(identity)) customByIdentity.set(identity, keyword);
  }

  const meta = {};
  if (isPlainObject(customKeywordMeta)) {
    for (const [key, value] of Object.entries(customKeywordMeta)) {
      const identity = normalizeKeywordIdentity(key);
      if (identity && isPlainObject(value)) meta[identity] = { ...value };
    }
  }

  const previousIdentities = new Set(catalogEntries(previousCatalogGroups).keys());
  const nextIdentities = new Set(catalogEntries(nextCatalogGroups).keys());
  const knownCatalog = hadSnapshot ? previousIdentities : nextIdentities;
  if (!hadSnapshot) {
    for (const change of manifestChanges(manifest)) {
      const value = change.keyword || change.from;
      const identity = normalizeKeywordIdentity(value);
      if (identity) knownCatalog.add(identity);
    }
  }

  const managedCategories = new Set([
    ...Object.keys(previousCatalogGroups || {}),
    ...Object.keys(nextCatalogGroups || {})
  ]);
  const dynamic = new Set(dynamicCategories || []);
  const disabledGroupSet = new Set(Array.isArray(disabledGroups) ? disabledGroups : []);
  const disabledByIdentity = new Map();
  for (const keyword of Array.isArray(disabledKeywords) ? disabledKeywords : []) {
    const identity = normalizeKeywordIdentity(keyword);
    if (identity && !disabledByIdentity.has(identity)) disabledByIdentity.set(identity, keyword);
  }

  for (const [category, keywords] of Object.entries(storedGroups || {})) {
    if (!managedCategories.has(category) || dynamic.has(category)) continue;
    for (const keyword of Array.isArray(keywords) ? keywords : []) {
      const identity = normalizeKeywordIdentity(keyword);
      if (!identity || knownCatalog.has(identity) || customByIdentity.has(identity)) continue;
      // Existing extension state is preserved conservatively. Imported legacy
      // groups can opt into a stricter mode where only a snapshot or explicit
      // metadata proves that an unknown same-category term was user-owned.
      if (!hadSnapshot && requireProvenanceWithoutSnapshot && !meta[identity]) continue;
      customByIdentity.set(identity, keyword);
      if (meta[identity]?.origin !== 'user') {
        meta[identity] = {
          origin: 'imported-group',
          previousCategory: category,
          reason: 'Preserved from a user-modified bundled keyword group'
        };
      }
      if (disabledGroupSet.has(category) && !disabledByIdentity.has(identity)) {
        disabledByIdentity.set(identity, keyword);
      }
    }
  }

  return {
    customKeywords: sortedValues(customByIdentity.values()),
    customKeywordMeta: meta,
    disabledKeywords: sortedValues(disabledByIdentity.values())
  };
}

export function reconcileKeywordCatalog({
  previousCatalogGroups = {},
  previousEnabledGroups,
  nextCatalogGroups = {},
  nextEnabledGroups,
  customKeywords = [],
  customKeywordMeta = {},
  retiredDefaultKeywords = [],
  pinnedKeywords = [],
  disabledGroups = [],
  disabledKeywords = [],
  manifest = {}
} = {}) {
  const previous = catalogEntries(previousCatalogGroups);
  const previousEnabled = catalogEntries(previousEnabledGroups ?? previousCatalogGroups);
  const next = catalogEntries(nextCatalogGroups);
  const nextEnabled = catalogEntries(nextEnabledGroups ?? nextCatalogGroups);
  const disabledGroupSet = new Set(Array.isArray(disabledGroups) ? disabledGroups : []);

  const customByIdentity = new Map();
  for (const keyword of Array.isArray(customKeywords) ? customKeywords : []) {
    const identity = normalizeKeywordIdentity(keyword);
    if (identity && !customByIdentity.has(identity)) customByIdentity.set(identity, keyword);
  }

  const meta = {};
  if (isPlainObject(customKeywordMeta)) {
    for (const [key, value] of Object.entries(customKeywordMeta)) {
      const identity = normalizeKeywordIdentity(key);
      if (identity && isPlainObject(value)) meta[identity] = { ...value };
    }
  }

  const retiredByIdentity = new Map();
  for (const value of Array.isArray(retiredDefaultKeywords) ? retiredDefaultKeywords : []) {
    const record = recordFor(value);
    const identity = normalizeKeywordIdentity(record.keyword);
    if (identity) retiredByIdentity.set(identity, record);
  }

  const renameBySource = new Map();
  const retireByIdentity = new Map();
  for (const change of manifestChanges(manifest)) {
    if (change.type === 'rename' && change.from && change.to && change.preservePreference !== false) {
      renameBySource.set(normalizeKeywordIdentity(change.from), change);
    } else if (change.type === 'retire' && change.keyword) {
      retireByIdentity.set(normalizeKeywordIdentity(change.keyword), change);
    }
  }

  // Canonicalize stored opt-outs across the complete append-only rename chain.
  const disabledByIdentity = new Map();
  for (const keyword of Array.isArray(disabledKeywords) ? disabledKeywords : []) {
    const identity = normalizeKeywordIdentity(keyword);
    if (identity && !disabledByIdentity.has(identity)) disabledByIdentity.set(identity, keyword);
  }

  // Group opt-outs must be materialized before the coarse group flag can be
  // released. Include both prior members and newly added enabled defaults.
  const enabledGroupSources = [
    previousEnabledGroups ?? previousCatalogGroups,
    nextEnabledGroups ?? nextCatalogGroups
  ];
  for (const group of disabledGroupSet) {
    for (const groups of enabledGroupSources) {
      for (const keyword of Array.isArray(groups?.[group]) ? groups[group] : []) {
        const identity = normalizeKeywordIdentity(keyword);
        if (identity && !disabledByIdentity.has(identity)) disabledByIdentity.set(identity, keyword);
      }
    }
  }

  for (const [identity, keyword] of [...disabledByIdentity]) {
    // Explicit Custom ownership keeps the old spelling independent from the
    // bundled rename. Moving its opt-out would reactivate the Custom term.
    if (customByIdentity.has(identity)) {
      disabledByIdentity.set(identity, keyword);
      continue;
    }
    const resolved = resolveRename(identity, renameBySource);
    if (!resolved.cyclic && resolved.identity !== identity && next.has(resolved.identity)) {
      disabledByIdentity.delete(identity);
      disabledByIdentity.set(resolved.identity, next.get(resolved.identity).keyword);
    } else {
      disabledByIdentity.set(identity, keyword);
    }
  }

  const pinnedSet = new Set();
  for (const keyword of Array.isArray(pinnedKeywords) ? pinnedKeywords : []) {
    const identity = normalizeKeywordIdentity(keyword);
    if (!identity) continue;
    // Legacy Custom pins are discarded below. Do not first transfer them to
    // a replacement bundled spelling, where Custom cleanup cannot find them.
    if (customByIdentity.has(identity)) {
      pinnedSet.add(identity);
      continue;
    }
    const resolved = resolveRename(identity, renameBySource);
    pinnedSet.add(!resolved.cyclic && next.has(resolved.identity) ? resolved.identity : identity);
  }

  // A stored disabled state is the latest explicit action and wins over a stale
  // pin imported from an older backup.
  for (const identity of disabledByIdentity.keys()) pinnedSet.delete(identity);

  // Custom ownership is self-contained and must never depend on an invisible
  // catalog pin, even if the same identity is later reintroduced as a default.
  for (const identity of customByIdentity.keys()) pinnedSet.delete(identity);

  // A weight downgrade changes a bundled default into reference metadata. Keep
  // previously enabled, non-disabled terms active through an explicit pin.
  for (const [identity, previousEntry] of previousEnabled) {
    const resolved = resolveRename(identity, renameBySource);
    const targetIdentity = !resolved.cyclic && next.has(resolved.identity)
      ? resolved.identity
      : identity;
    const nextEntry = next.get(targetIdentity);
    if (!nextEntry
        || nextEnabled.has(targetIdentity)
        || customByIdentity.has(identity)
        || customByIdentity.has(targetIdentity)) continue;
    if (disabledByIdentity.has(targetIdentity)
        || disabledGroupSet.has(previousEntry.category)
        || disabledGroupSet.has(nextEntry.category)) continue;
    pinnedSet.add(targetIdentity);
  }

  // Explicit user custom provenance always wins over a review-bucket record.
  for (const identity of customByIdentity.keys()) retiredByIdentity.delete(identity);

  for (const identity of previous.keys()) {
    const resolved = resolveRename(identity, renameBySource);
    if (!resolved.cyclic && resolved.identity !== identity && next.has(resolved.identity)) {
      retiredByIdentity.delete(identity);
    }
  }

  for (const [identity, entry] of previous) {
    if (next.has(identity)) continue;

    const resolved = resolveRename(identity, renameBySource);
    if (!resolved.cyclic && resolved.identity !== identity && next.has(resolved.identity)) continue;

    // A catalog pin makes a weight-zero entry active. If that entry is later
    // removed, it must follow the same preservation path as an enabled default.
    if (!previousEnabled.has(identity) && !pinnedSet.has(identity)) continue;
    if (disabledGroupSet.has(entry.category) || disabledByIdentity.has(identity)) continue;

    if (customByIdentity.has(identity)) {
      retiredByIdentity.delete(identity);
      continue;
    }
    if (retiredByIdentity.has(identity)) continue;

    const change = retireByIdentity.get(resolved.identity)
      || retireByIdentity.get(identity)
      || {};
    if (change.preserveExistingMute === false) continue;

    if (pinnedSet.has(identity)) {
      customByIdentity.set(identity, entry.keyword);
      meta[identity] = {
        origin: 'pinned-retired-default',
        retiredIn: change.version || manifest.catalogVersion || null,
        lifecycle: change.lifecycle || 'unknown',
        previousCategory: change.category || entry.category,
        reason: change.reason || 'Removed from the curated catalog'
      };
      // Custom ownership now preserves the mute; the catalog pin must not
      // outlive the bundled default.
      pinnedSet.delete(identity);
      pinnedSet.delete(resolved.identity);
    } else {
      retiredByIdentity.set(identity, {
        keyword: entry.keyword,
        category: change.category || entry.category,
        retiredIn: change.version || manifest.catalogVersion || null,
        lifecycle: change.lifecycle || 'unknown',
        reason: change.reason || 'Removed from the curated catalog'
      });
    }
  }

  // Reintroduced defaults clear untouched migration-created compatibility
  // entries, never explicit user/imported/pinned/kept ownership.
  for (const identity of next.keys()) {
    retiredByIdentity.delete(identity);
    if (meta[identity]?.origin === 'retired-default') {
      customByIdentity.delete(identity);
      delete meta[identity];
      pinnedSet.delete(identity);
    }
  }

  for (const identity of Object.keys(meta)) {
    if (!customByIdentity.has(identity)) delete meta[identity];
  }

  const pinned = [];
  for (const identity of pinnedSet) {
    // Pins are catalog preference overrides, never hidden ownership for
    // Custom or kept-retired keywords.
    const display = next.get(identity)?.keyword;
    if (display) pinned.push(display);
  }

  return {
    customKeywords: sortedValues(customByIdentity.values()),
    customKeywordMeta: meta,
    retiredDefaultKeywords: [...retiredByIdentity.values()]
      .sort((a, b) => a.keyword.localeCompare(b.keyword)),
    pinnedKeywords: sortedValues(pinned),
    disabledKeywords: sortedValues(disabledByIdentity.values())
  };
}
