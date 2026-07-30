// Categories that ship switched off: they stay visible and pickable in the
// options UI, but nothing in them filters until the user opts in.
export const DEFAULT_DISABLED_GROUPS = ['Technology'];

/**
 * Seed the ship-disabled categories into the stored opt-out state.
 *
 * Each category is seeded exactly once and the applied list records that, so a
 * later update cannot re-disable a category the user deliberately turned on.
 */
export function seedDefaultDisabledGroups({
  catalogGroups = {},
  enabledGroups = {},
  disabledGroups = [],
  disabledKeywords = [],
  appliedDefaultDisabledGroups = []
} = {}) {
  const applied = new Set(
    Array.isArray(appliedDefaultDisabledGroups) ? appliedDefaultDisabledGroups : []
  );
  const nextDisabledGroups = new Set(Array.isArray(disabledGroups) ? disabledGroups : []);
  const nextDisabledKeywords = new Set(Array.isArray(disabledKeywords) ? disabledKeywords : []);

  const pending = DEFAULT_DISABLED_GROUPS.filter(group =>
    !applied.has(group) && group in catalogGroups);

  for (const group of pending) {
    nextDisabledGroups.add(group);
    // Filtering reads disabledKeywords, so the coarse group flag alone is not
    // enough. The manifest path re-materializes these through the catalog
    // reconcile; seeding here covers the first install, which skips it.
    for (const keyword of enabledGroups[group] || []) nextDisabledKeywords.add(keyword);
    applied.add(group);
  }

  return {
    disabledGroups: [...nextDisabledGroups].sort(),
    disabledKeywords: [...nextDisabledKeywords].sort(),
    appliedDefaultDisabledGroups: [...applied].sort()
  };
}
