const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

async function loadModule() {
  const source = fs.readFileSync(path.resolve('scripts/background/defaultDisabledGroups.js'), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

const CATALOG = { Technology: ['Apple', 'ChatGPT'], Education: ['school board'] };

test('every ship-disabled category exists in the bundled catalog', async () => {
  const { DEFAULT_DISABLED_GROUPS } = await loadModule();
  const dir = path.resolve('keywords/categories');
  const categories = new Set(fs.readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .map(file => Object.keys(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))[0]));

  assert.deepEqual(DEFAULT_DISABLED_GROUPS, ['Technology']);
  for (const group of DEFAULT_DISABLED_GROUPS) {
    assert(categories.has(group), 'unknown ship-disabled category: ' + group);
  }
});

test('a first install mutes the category and each of its keywords', async () => {
  const { seedDefaultDisabledGroups } = await loadModule();
  const seeded = seedDefaultDisabledGroups({
    catalogGroups: CATALOG,
    enabledGroups: CATALOG
  });

  assert.deepEqual(seeded.disabledGroups, ['Technology']);
  assert.deepEqual(seeded.disabledKeywords, ['Apple', 'ChatGPT']);
  assert.deepEqual(seeded.appliedDefaultDisabledGroups, ['Technology']);
});

test('a later update never re-mutes a category the user turned back on', async () => {
  const { seedDefaultDisabledGroups } = await loadModule();
  const seeded = seedDefaultDisabledGroups({
    catalogGroups: CATALOG,
    enabledGroups: CATALOG,
    disabledGroups: [],
    disabledKeywords: [],
    appliedDefaultDisabledGroups: ['Technology']
  });

  assert.deepEqual(seeded.disabledGroups, []);
  assert.deepEqual(seeded.disabledKeywords, []);
  assert.deepEqual(seeded.appliedDefaultDisabledGroups, ['Technology']);
});

test('seeding preserves unrelated opt-outs', async () => {
  const { seedDefaultDisabledGroups } = await loadModule();
  const seeded = seedDefaultDisabledGroups({
    catalogGroups: CATALOG,
    enabledGroups: CATALOG,
    disabledGroups: ['Education'],
    disabledKeywords: ['school board']
  });

  assert.deepEqual(seeded.disabledGroups, ['Education', 'Technology']);
  assert.deepEqual(seeded.disabledKeywords, ['Apple', 'ChatGPT', 'school board']);
});

test('a category missing from the catalog is not seeded or marked applied', async () => {
  const { seedDefaultDisabledGroups } = await loadModule();
  const seeded = seedDefaultDisabledGroups({
    catalogGroups: { Education: ['school board'] },
    enabledGroups: { Education: ['school board'] }
  });

  assert.deepEqual(seeded.disabledGroups, []);
  assert.deepEqual(seeded.appliedDefaultDisabledGroups, []);
});
