const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

async function loadModule() {
  const source = fs.readFileSync(path.resolve('options/keywordNav.js'), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}

function catalogCategories() {
  const dir = path.resolve('keywords/categories');
  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .map(file => Object.keys(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))[0]);
}

test('the category jump list is built at runtime, not hand-written', () => {
  const html = fs.readFileSync(path.resolve('options/options.html'), 'utf8');
  const list = html.match(/<ul class="category-nav-list"[^>]*>([\s\S]*?)<\/ul>/);
  assert(list, 'category-nav-list not found');
  assert.equal(list[1].trim(), '', 'category nav must not hardcode categories');
  assert.match(list[0], /id="categoryNav"/);
});

test('every bundled category gets a jump link', async () => {
  const { keywordNavItems } = await loadModule();
  const categories = catalogCategories();
  const labels = new Set(keywordNavItems(categories).map(item => item.label));

  assert(categories.length > 0);
  assert.equal(labels.size, categories.length);
  assert(labels.has('Technology'), 'Technology is missing from the jump list');
  assert(labels.has('Major Sports Events'), 'Major Sports Events is missing from the jump list');
});

test('jump link anchors match the ids the group renderer assigns', async () => {
  const { keywordNavItems, keywordGroupId } = await loadModule();
  const renderer = fs.readFileSync(path.resolve('options/optionsUI.js'), 'utf8');
  assert.match(renderer, /const groupId = keywordGroupId\(groupName\);/,
    'group ids must come from the same helper the nav uses');

  for (const item of keywordNavItems(catalogCategories())) {
    assert.match(item.id, /^[A-Za-z0-9-]+$/, 'unsafe anchor: ' + item.id);
  }
  assert.equal(keywordGroupId('US Political Figures - Full Name'), 'US-Political-Figures-Full-Name');
  assert.equal(keywordGroupId('LGBTQ+'), 'LGBTQ');
});

test('a dashed category label reads as a parenthetical', async () => {
  const { keywordGroupNavLabel } = await loadModule();
  assert.equal(
    keywordGroupNavLabel('US Political Figures - Single Name'),
    'US Political Figures (Single Name)'
  );
  assert.equal(keywordGroupNavLabel('Technology'), 'Technology');
});

test('jump links are sorted and include user-defined groups', async () => {
  const { keywordNavItems } = await loadModule();
  const items = keywordNavItems(['Technology', 'My Own Group', 'Education']);
  assert.deepEqual(items.map(item => item.label), ['Education', 'My Own Group', 'Technology']);
});
