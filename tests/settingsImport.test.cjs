const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

let nonce = 0;

async function loadMigrationModule() {
  const source = fs.readFileSync(
    path.resolve('scripts/background/keywordCatalogMigration.js'),
    'utf8'
  );
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

async function loadSettingsModule(state) {
  const writes = [];
  globalThis.__settingsStorage = {
    async getStorageData(keys) {
      return Object.fromEntries(keys
        .filter(key => Object.prototype.hasOwnProperty.call(state, key))
        .map(key => [key, structuredClone(state[key])]));
    },
    async setStorageData(values) {
      writes.push(structuredClone(values));
      Object.assign(state, structuredClone(values));
    }
  };
  globalThis.__catalogManifest = JSON.parse(
    fs.readFileSync(path.resolve('keywords/catalog-migrations.json'), 'utf8')
  );
  globalThis.__catalogMigration = await loadMigrationModule();

  let source = fs.readFileSync(
    path.resolve('scripts/core/managers/settingsManager.js'),
    'utf8'
  ).replace(/\r\n/g, '\n');
  source = source.replace(
    "import * as storage from '../../../options/optionsStorage.js';",
    'const storage = globalThis.__settingsStorage;'
  );
  source = source.replace(
    "import catalogManifest from '../../../keywords/catalog-migrations.json';",
    'const catalogManifest = globalThis.__catalogManifest;'
  );
  source = source.replace(
    [
      'import {',
      '  inferLegacyCatalogGroups,',
      '  migrateManagedGroupExtras,',
      '  reconcileKeywordCatalog',
      "} from '../../background/keywordCatalogMigration.js';"
    ].join('\n'),
    'const { inferLegacyCatalogGroups, migrateManagedGroupExtras, reconcileKeywordCatalog } = globalThis.__catalogMigration;'
  );
  source += '\n// settings test module ' + (++nonce);
  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );
  return { module, writes };
}

function baseState(overrides = {}) {
  return {
    keywordGroups: {
      'World Leaders': ['Karol Nawrocki'],
      'Media Personalities': ['Timcast'],
      'Political Organizations': ['Project Veritas'],
      'Political Rhetoric': ['Trumponomics']
    },
    keywordCatalogSnapshot: {
      'World Leaders': ['Karol Nawrocki'],
      'Media Personalities': ['Timcast'],
      'Political Organizations': ['Project Veritas'],
      'Political Rhetoric': ['Trumponomics']
    },
    keywordCatalogEnabledSnapshot: {
      'World Leaders': ['Karol Nawrocki'],
      'Media Personalities': ['Timcast'],
      'Political Organizations': ['Project Veritas'],
      'Political Rhetoric': ['Trumponomics']
    },
    customKeywords: [],
    customKeywordMeta: {},
    retiredDefaultKeywords: [],
    pinnedKeywords: [],
    disabledGroups: [],
    disabledKeywords: [],
    ...overrides
  };
}

test('legacy bundled imports reconcile retirements, moves, and rename preferences globally', async () => {
  const state = baseState();
  const { module } = await loadSettingsModule(state);
  await module.importSettings({
    keywordGroups: {
      'World Leaders': ['Andrzej Duda'],
      'Media Personalities': ['Project Veritas', 'Tim Cast'],
      'Political Rhetoric': ['Trumponomicsr']
    },
    disabledKeywords: ['Tim Cast'],
    pinnedKeywords: ['Trumponomicsr']
  });

  assert.deepEqual(state.customKeywords, []);
  assert(state.retiredDefaultKeywords.some(record => record.keyword === 'Andrzej Duda'));
  assert(!state.retiredDefaultKeywords.some(record => record.keyword === 'Project Veritas'));
  assert.deepEqual(state.disabledKeywords, ['Timcast']);
  assert.deepEqual(state.pinnedKeywords, ['Trumponomics']);
  assert.deepEqual(state.keywordGroups['Political Organizations'], ['Project Veritas']);
  assert.equal(state.keywordGroups['Media Personalities'].includes('Project Veritas'), false);
});

test('an imported snapshot proves a same-category user extra without importing the old catalog', async () => {
  const state = baseState({
    keywordGroups: { Politics: ['default'] },
    keywordCatalogSnapshot: { Politics: ['default'] },
    keywordCatalogEnabledSnapshot: { Politics: ['default'] }
  });
  const { module } = await loadSettingsModule(state);
  await module.importSettings({
    keywordGroups: { Politics: ['default', 'personal term'] },
    keywordCatalogSnapshot: { Politics: ['default'] }
  });

  assert.deepEqual(state.keywordGroups, { Politics: ['default'] });
  assert.deepEqual(state.customKeywords, ['personal term']);
  assert.equal(state.customKeywordMeta['personal term'].origin, 'imported-group');
});

test('settings import rejects invalid option enum values', async () => {
  for (const [key, value] of [
    ['matchingOption', 'substring'],
    ['collapseStyle', 'vanish'],
    ['imageContainerStyle', 'collapseImage']
  ]) {
    const state = baseState();
    const { module, writes } = await loadSettingsModule(state);
    await assert.rejects(
      module.importSettings({ [key]: value }),
      new RegExp('Invalid value for ' + key)
    );
    assert.deepEqual(writes, []);
  }
});


test('legacy same-category extras require explicit provenance when no snapshot exists', async () => {
  const state = baseState({
    keywordGroups: { Politics: ['default'] },
    keywordCatalogSnapshot: { Politics: ['default'] },
    keywordCatalogEnabledSnapshot: { Politics: ['default'] }
  });
  const { module } = await loadSettingsModule(state);
  await module.importSettings({
    keywordGroups: {
      Politics: ['default', 'provenance term', 'ambiguous term']
    },
    customKeywordMeta: {
      'provenance term': { origin: 'user' }
    }
  });

  assert.deepEqual(state.keywordGroups, { Politics: ['default'] });
  assert.deepEqual(state.customKeywords, ['provenance term']);
  assert.equal(state.customKeywordMeta['provenance term'].origin, 'user');
});
