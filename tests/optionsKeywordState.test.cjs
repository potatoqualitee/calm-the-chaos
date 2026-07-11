const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

let nonce = 0;

async function loadModule(state, defaults = {}) {
  globalThis.__DEFAULT_KEYWORD_GROUPS__ = defaults;
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          const names = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(names
            .filter(key => Object.prototype.hasOwnProperty.call(state, key))
            .map(key => [key, structuredClone(state[key])]));
        },
        async set(values) {
          Object.assign(state, structuredClone(values));
        }
      }
    },
    tabs: {
      async query() { return []; },
      async sendMessage() {}
    }
  };

  let source = fs.readFileSync(path.resolve('options/optionsStorage.js'), 'utf8');
  source = source.replace(
    "import { DEFAULT_KEYWORD_GROUPS } from '../scripts/core/config/keywords.js';",
    'const DEFAULT_KEYWORD_GROUPS = globalThis.__DEFAULT_KEYWORD_GROUPS__;'
  );
  source += '\n// test module ' + (++nonce);
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

test('only a re-enabled bundled default becomes a catalog pin', async () => {
  const state = {
    keywordGroups: { Bundled: ['default'], User: ['group extra'] },
    keywordCatalogSnapshot: { Bundled: ['default'] },
    customKeywords: ['custom', 'kept'],
    customKeywordMeta: {
      custom: { origin: 'user' },
      kept: { origin: 'user-kept-retired' }
    },
    disabledKeywords: ['default', 'group extra', 'custom', 'kept'],
    disabledGroups: [],
    pinnedKeywords: ['custom', 'kept']
  };
  const storage = await loadModule(state);
  await storage.toggleKeyword('default');
  await storage.toggleKeyword('group extra');
  await storage.toggleKeyword('custom');
  await storage.toggleKeyword('kept');
  assert.deepEqual(state.pinnedKeywords, ['default']);
});

test('removing Custom and keeping Retired Curated both clear legacy pins', async () => {
  const removeState = {
    customKeywords: ['kept'],
    customKeywordMeta: { kept: { origin: 'user-kept-retired' } },
    pinnedKeywords: ['kept']
  };
  let storage = await loadModule(removeState);
  await storage.removeCustomKeyword('kept');
  assert.deepEqual(removeState.customKeywords, []);
  assert.deepEqual(removeState.pinnedKeywords, []);

  const keepState = {
    retiredDefaultKeywords: [{ keyword: 'old default', category: 'Policy' }],
    customKeywords: [],
    customKeywordMeta: {},
    pinnedKeywords: ['old default']
  };
  storage = await loadModule(keepState);
  await storage.keepRetiredKeyword('old default');
  assert.deepEqual(keepState.customKeywords, ['old default']);
  assert.equal(keepState.customKeywordMeta['old default'].origin, 'user-kept-retired');
  assert.deepEqual(keepState.pinnedKeywords, []);
});

test('releasing a disabled group first captures newly added members', async () => {
  const state = {
    keywordGroups: { Policy: ['old one', 'old two', 'new member'] },
    keywordCatalogSnapshot: { Policy: ['old one', 'old two', 'new member'] },
    customKeywords: [],
    customKeywordMeta: {},
    disabledGroups: ['Policy'],
    disabledKeywords: ['old one', 'old two'],
    pinnedKeywords: []
  };
  const storage = await loadModule(state);
  await storage.toggleKeyword('old one');
  assert.deepEqual(state.disabledGroups, []);
  assert.deepEqual(state.disabledKeywords, ['new member', 'old two']);
  assert.deepEqual(state.pinnedKeywords, ['old one']);
});


test('group toggles apply to full catalog pins while preserving other categories', async () => {
  const state = {
    keywordGroups: { Policy: ['default'], Other: ['other default'] },
    keywordCatalogSnapshot: {
      Policy: ['default', 'reference only'],
      Other: ['other default', 'other reference']
    },
    disabledGroups: [],
    disabledKeywords: [],
    pinnedKeywords: ['reference only', 'other reference']
  };
  const storage = await loadModule(state);

  await storage.toggleGroup('Policy');
  assert.deepEqual(state.disabledGroups, ['Policy']);
  assert.deepEqual(state.disabledKeywords, ['default', 'reference only']);
  assert.deepEqual(state.pinnedKeywords, ['other reference']);

  await storage.toggleGroup('Policy');
  assert.deepEqual(state.disabledGroups, []);
  assert.deepEqual(state.disabledKeywords, []);
  assert.deepEqual(state.pinnedKeywords, ['other reference']);
});
