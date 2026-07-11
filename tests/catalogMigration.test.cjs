const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

async function loadModule() {
  const source = fs.readFileSync(path.resolve('scripts/background/keywordCatalogMigration.js'), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

test('enabled inherited removals enter a review bucket, not Custom Keywords', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const result = reconcileKeywordCatalog({
    previousCatalogGroups: { Politics: ['old term', 'still here'] },
    nextCatalogGroups: { Politics: ['still here'] },
    manifest: { catalogVersion: '2' }
  });
  assert.deepEqual(result.customKeywords, []);
  assert.equal(result.retiredDefaultKeywords[0].keyword, 'old term');
});

test('disabled removals are allowed to retire', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const result = reconcileKeywordCatalog({
    previousCatalogGroups: { Politics: ['old term'] },
    nextCatalogGroups: { Politics: [] },
    disabledKeywords: ['old term']
  });
  assert.deepEqual(result.retiredDefaultKeywords, []);
});

test('explicitly pinned removals become provenance-tagged custom keywords', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const result = reconcileKeywordCatalog({
    previousCatalogGroups: { Politics: ['old term'] },
    nextCatalogGroups: { Politics: [] },
    pinnedKeywords: ['old term'],
    manifest: { catalogVersion: '2' }
  });
  assert.deepEqual(result.customKeywords, ['old term']);
  assert.equal(result.customKeywordMeta['old term'].origin, 'pinned-retired-default');
});

test('moves and weight-only changes are not retirements', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const result = reconcileKeywordCatalog({
    previousCatalogGroups: { Old: ['same term'] },
    nextCatalogGroups: { New: ['same term'] }
  });
  assert.deepEqual(result.retiredDefaultKeywords, []);
});

test('explicit renames carry disabled preference without creating an orphan', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const result = reconcileKeywordCatalog({
    previousCatalogGroups: { Policy: ['old spelling'] },
    nextCatalogGroups: { Policy: ['new spelling'] },
    disabledKeywords: ['old spelling'],
    manifest: { changes: [{ type: 'rename', from: 'old spelling', to: 'new spelling' }] }
  });
  assert.deepEqual(result.disabledKeywords, ['new spelling']);
  assert.deepEqual(result.retiredDefaultKeywords, []);
});

test('reconciliation is idempotent and user custom provenance wins', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const input = {
    previousCatalogGroups: { Politics: ['old term'] },
    nextCatalogGroups: { Politics: [] },
    customKeywords: ['old term'],
    customKeywordMeta: { 'old term': { origin: 'user' } }
  };
  const first = reconcileKeywordCatalog(input);
  const second = reconcileKeywordCatalog({ ...input, ...first });
  assert.deepEqual(second, first);
  assert.equal(second.customKeywordMeta['old term'].origin, 'user');
});


test('removing weight-zero metadata never turns it into an active retired filter', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const result = reconcileKeywordCatalog({
    previousCatalogGroups: { Reference: ['metadata only'] },
    previousEnabledGroups: { Reference: [] },
    nextCatalogGroups: { Reference: [] }
  });
  assert.deepEqual(result.retiredDefaultKeywords, []);
});

test('skipped-version rename chains carry disabled and pinned intent to the terminal spelling', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const manifest = {
    migrations: [
      { version: '2', changes: [{ type: 'rename', from: 'old', to: 'middle' }] },
      { version: '3', changes: [{ type: 'rename', from: 'middle', to: 'current' }] }
    ]
  };
  const disabled = reconcileKeywordCatalog({
    previousCatalogGroups: { Policy: ['old'] },
    nextCatalogGroups: { Policy: ['current'] },
    disabledKeywords: ['old'],
    manifest
  });
  assert.deepEqual(disabled.disabledKeywords, ['current']);

  const pinned = reconcileKeywordCatalog({
    previousCatalogGroups: { Policy: ['old'] },
    nextCatalogGroups: { Policy: ['current'] },
    pinnedKeywords: ['old'],
    manifest
  });
  assert.deepEqual(pinned.pinnedKeywords, ['current']);
});

test('a rename followed by retirement still preserves an enabled old spelling for review', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const result = reconcileKeywordCatalog({
    previousCatalogGroups: { Policy: ['old'] },
    previousEnabledGroups: { Policy: ['old'] },
    nextCatalogGroups: { Policy: [] },
    manifest: {
      migrations: [
        { version: '2', changes: [{ type: 'rename', from: 'old', to: 'middle' }] },
        { version: '3', changes: [{
          type: 'retire', keyword: 'middle', reason: 'terminal retirement'
        }] }
      ]
    }
  });
  assert.equal(result.retiredDefaultKeywords[0].keyword, 'old');
  assert.equal(result.retiredDefaultKeywords[0].reason, 'terminal retirement');
});

test('explicitly kept retired custom ownership survives catalog reintroduction', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const result = reconcileKeywordCatalog({
    previousCatalogGroups: { Policy: [] },
    nextCatalogGroups: { Policy: ['old'] },
    customKeywords: ['old'],
    customKeywordMeta: { old: { origin: 'user-kept-retired' } },
    retiredDefaultKeywords: [{ keyword: 'old' }],
    pinnedKeywords: ['old']
  });
  assert.deepEqual(result.customKeywords, ['old']);
  assert.equal(result.customKeywordMeta.old.origin, 'user-kept-retired');
  assert.deepEqual(result.retiredDefaultKeywords, []);
  assert.deepEqual(result.pinnedKeywords, []);
});

test('explicit user custom provenance removes a duplicate retired review record', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const result = reconcileKeywordCatalog({
    previousCatalogGroups: { Policy: ['old'] },
    nextCatalogGroups: { Policy: [] },
    customKeywords: ['old'],
    customKeywordMeta: { old: { origin: 'user' } },
    retiredDefaultKeywords: [{ keyword: 'old' }]
  });
  assert.deepEqual(result.customKeywords, ['old']);
  assert.equal(result.customKeywordMeta.old.origin, 'user');
  assert.deepEqual(result.retiredDefaultKeywords, []);
});


test('same-category imported extras preserve disabled-group intent when moved to Custom', async () => {
  const { migrateManagedGroupExtras } = await loadModule();
  const result = migrateManagedGroupExtras({
    storedGroups: { Politics: ['default term', 'personal term'] },
    previousCatalogGroups: { Politics: ['default term'] },
    nextCatalogGroups: { Politics: ['default term'] },
    disabledGroups: ['Politics'],
    disabledKeywords: ['default term'],
    hadSnapshot: true
  });
  assert.deepEqual(result.customKeywords, ['personal term']);
  assert.equal(result.customKeywordMeta['personal term'].origin, 'imported-group');
  assert.deepEqual(result.disabledKeywords, ['default term', 'personal term']);
});


test('enabled defaults downgraded to weight zero are pinned unless disabled', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const active = reconcileKeywordCatalog({
    previousCatalogGroups: { Policy: ['formerly enabled'] },
    previousEnabledGroups: { Policy: ['formerly enabled'] },
    nextCatalogGroups: { Policy: ['formerly enabled'] },
    nextEnabledGroups: { Policy: [] }
  });
  assert.deepEqual(active.pinnedKeywords, ['formerly enabled']);

  const legacyUpgrade = reconcileKeywordCatalog({
    previousCatalogGroups: { Policy: ['formerly enabled'] },
    nextCatalogGroups: { Policy: ['formerly enabled'] },
    nextEnabledGroups: { Policy: [] }
  });
  assert.deepEqual(legacyUpgrade.pinnedKeywords, ['formerly enabled']);

  const disabled = reconcileKeywordCatalog({
    previousCatalogGroups: { Policy: ['formerly enabled'] },
    previousEnabledGroups: { Policy: ['formerly enabled'] },
    nextCatalogGroups: { Policy: ['formerly enabled'] },
    nextEnabledGroups: { Policy: [] },
    disabledGroups: ['Policy']
  });
  assert.deepEqual(disabled.pinnedKeywords, []);
  assert.deepEqual(disabled.disabledKeywords, ['formerly enabled']);
});

test('disabled groups materialize newly added enabled members', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const result = reconcileKeywordCatalog({
    previousCatalogGroups: { Policy: ['old member'] },
    previousEnabledGroups: { Policy: ['old member'] },
    nextCatalogGroups: { Policy: ['old member', 'new member'] },
    nextEnabledGroups: { Policy: ['old member', 'new member'] },
    disabledGroups: ['Policy'],
    disabledKeywords: ['old member']
  });
  assert.deepEqual(result.disabledKeywords, ['new member', 'old member']);
});


test('a pinned weight-zero term is preserved when a later catalog removes it', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const downgraded = reconcileKeywordCatalog({
    previousCatalogGroups: { Policy: ['term'] },
    previousEnabledGroups: { Policy: ['term'] },
    nextCatalogGroups: { Policy: ['term'] },
    nextEnabledGroups: { Policy: [] }
  });
  assert.deepEqual(downgraded.pinnedKeywords, ['term']);

  const removed = reconcileKeywordCatalog({
    previousCatalogGroups: { Policy: ['term'] },
    previousEnabledGroups: { Policy: [] },
    nextCatalogGroups: { Policy: [] },
    nextEnabledGroups: { Policy: [] },
    pinnedKeywords: downgraded.pinnedKeywords,
    manifest: { catalogVersion: '3' }
  });
  assert.deepEqual(removed.customKeywords, ['term']);
  assert.equal(removed.customKeywordMeta.term.origin, 'pinned-retired-default');
  assert.deepEqual(removed.pinnedKeywords, []);
});

test('a custom-owned rename keeps old disabled state isolated from the bundled target', async () => {
  const { reconcileKeywordCatalog } = await loadModule();
  const result = reconcileKeywordCatalog({
    previousCatalogGroups: { Policy: ['old spelling'] },
    previousEnabledGroups: { Policy: ['old spelling'] },
    nextCatalogGroups: { Policy: ['new spelling'] },
    nextEnabledGroups: { Policy: [] },
    customKeywords: ['old spelling'],
    customKeywordMeta: { 'old spelling': { origin: 'user' } },
    disabledKeywords: ['old spelling'],
    pinnedKeywords: ['old spelling'],
    manifest: {
      changes: [{ type: 'rename', from: 'old spelling', to: 'new spelling' }]
    }
  });
  assert.deepEqual(result.customKeywords, ['old spelling']);
  assert.deepEqual(result.disabledKeywords, ['old spelling']);
  assert.deepEqual(result.pinnedKeywords, []);
  assert.equal(result.disabledKeywords.includes('new spelling'), false);
});
