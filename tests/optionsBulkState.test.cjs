const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

let nonce = 0;

async function loadModule(state) {
  const listeners = {};
  const elements = {
    filterInput: { value: '', addEventListener() {}, dispatchEvent() {} },
    enableAll: {
      addEventListener(type, handler) { listeners['enableAll:' + type] = handler; }
    },
    disableAll: {
      addEventListener(type, handler) { listeners['disableAll:' + type] = handler; }
    }
  };
  globalThis.document = {
    getElementById(id) { return elements[id] || null; },
    querySelectorAll() { return []; }
  };
  globalThis.Event = class Event { constructor(type) { this.type = type; } };
  globalThis.__bulkStorage = {
    async getStorageData(keys) {
      return Object.fromEntries(keys
        .filter(key => Object.prototype.hasOwnProperty.call(state, key))
        .map(key => [key, structuredClone(state[key])]));
    },
    async setStorageData(values) { Object.assign(state, structuredClone(values)); }
  };
  globalThis.__initializeSettings = async () => {};

  let source = fs.readFileSync(path.resolve('options/optionsEvents.js'), 'utf8')
    .replace(/\r\n/g, '\n');
  source = source
    .replace(
      "import { showStatus, updateStats } from './optionsUI.js';",
      'const showStatus = () => {}; const updateStats = () => {};'
    )
    .replace(
      "import * as storage from './optionsStorage.js';",
      'const storage = globalThis.__bulkStorage;'
    )
    .replace(
      "import { exportSettings, importSettings } from '../scripts/core/managers/settingsManager.js';",
      'const exportSettings = async () => {}; const importSettings = async () => {};'
    )
    .replace(
      "import { initializeSettings } from './options.js';",
      'const initializeSettings = globalThis.__initializeSettings;'
    );
  source += '\n// bulk test module ' + (++nonce);
  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );
  return { module, listeners };
}

test('Enable All preserves metadata-only catalog pins', async () => {
  const state = {
    keywordGroups: { Policy: ['default'] },
    keywordCatalogSnapshot: { Policy: ['default', 'reference only'] },
    customKeywords: [],
    disabledGroups: ['Policy'],
    disabledKeywords: ['default', 'reference only'],
    pinnedKeywords: ['reference only']
  };
  const { module, listeners } = await loadModule(state);
  module.setupFilter();
  await listeners['enableAll:click']();
  assert.deepEqual(state.disabledGroups, []);
  assert.deepEqual(state.disabledKeywords, []);
  assert.deepEqual(state.pinnedKeywords, ['reference only']);
});
