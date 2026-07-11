const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve('keywords');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'catalog-migrations.json'), 'utf8'));
const allowedLifecycles = new Set(['evergreen', 'cyclical', 'tenure', 'event']);

function loadCatalog() {
  const entries = new Map();
  const reviewableEvents = [];
  const reviewableTenure = [];
  const files = fs.readdirSync(path.join(root, 'categories'))
    .filter(file => file.endsWith('.json'))
    .sort();
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(root, 'categories', file), 'utf8'));
    const names = Object.keys(data);
    assert.equal(names.length, 1, file + ' must contain exactly one category');
    const category = data[names[0]];
    assert.equal(typeof category.description, 'string');
    assert(category.keywords && typeof category.keywords === 'object');
    if (category.lifecycle) assert(allowedLifecycles.has(category.lifecycle));
    if (category.reviewCadenceDays !== undefined) {
      assert(Number.isInteger(category.reviewCadenceDays) && category.reviewCadenceDays > 0,
        file + ': invalid category reviewCadenceDays');
    }
    if (category.reviewedAt !== undefined) {
      assert.equal(typeof category.reviewedAt, 'string');
      assert.match(category.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
    }
    for (const [keyword, metadata] of Object.entries(category.keywords)) {
      assert(keyword.trim(), file + ' contains an empty keyword');
      assert(Number.isInteger(metadata.weight) && metadata.weight >= 0 && metadata.weight <= 3,
        file + ': invalid weight for ' + keyword);
      assert.equal(typeof metadata.description, 'string', file + ': missing description for ' + keyword);
      if (metadata.lifecycle) assert(allowedLifecycles.has(metadata.lifecycle));
      const effectiveLifecycle = metadata.lifecycle || category.lifecycle || 'evergreen';
      if (metadata.reviewAfter !== undefined) {
        assert.equal(typeof metadata.reviewAfter, 'string');
        assert.match(metadata.reviewAfter, /^\d{4}-\d{2}-\d{2}$/);
        assert.equal(effectiveLifecycle, 'event',
          file + ': reviewAfter is only valid for event entry ' + keyword);
      }
      if (effectiveLifecycle === 'event') {
        assert.equal(typeof metadata.reviewAfter, 'string',
          file + ': event entry requires reviewAfter: ' + keyword);
        reviewableEvents.push({ category: names[0], keyword, reviewAfter: metadata.reviewAfter });
      }
      if (effectiveLifecycle === 'tenure') {
        const reviewedAt = metadata.reviewedAt || category.reviewedAt;
        const reviewCadenceDays = metadata.reviewCadenceDays
          || category.reviewCadenceDays
          || 90;
        assert.equal(typeof reviewedAt, 'string',
          file + ': tenure entry requires reviewedAt: ' + keyword);
        assert.match(reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
        assert(Number.isInteger(reviewCadenceDays) && reviewCadenceDays > 0,
          file + ': invalid tenure reviewCadenceDays: ' + keyword);
        reviewableTenure.push({
          category: names[0], keyword, reviewedAt, reviewCadenceDays
        });
      }
      const identity = keyword.normalize('NFKC').trim().toLowerCase();
      if (!entries.has(identity)) entries.set(identity, []);
      entries.get(identity).push({ keyword, category: names[0] });
    }
  }
  return { entries, files, reviewableEvents, reviewableTenure };
}

test('catalog files match the versioned manifest and satisfy the schema', () => {
  const { files } = loadCatalog();
  assert.deepEqual(files, [...manifest.categoryFiles].sort());
  assert.equal(manifest.schemaVersion, 1);
  assert.match(manifest.catalogVersion, /^\d{4}\.\d{2}\.\d+$/);
  assert.match(manifest.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
});

test('manifest renames resolve and explicit retirements do not remain active', () => {
  const { entries } = loadCatalog();
  const seen = new Set();
  for (const migration of manifest.migrations) {
    for (const change of migration.changes) {
      const source = (change.keyword || change.from).toLowerCase();
      const key = change.type + ':' + source;
      assert(!seen.has(key), 'duplicate manifest change: ' + key);
      seen.add(key);
      if (change.type === 'retire') assert(!entries.has(source), 'retired keyword is still active: ' + source);
      if (change.type === 'rename') assert(entries.has(change.to.toLowerCase()), 'rename target missing: ' + change.to);
      if (change.type === 'move') {
        const locations = entries.get(source) || [];
        assert(locations.some(({ category }) => category === change.toCategory),
          'move target missing: ' + change.keyword + ' -> ' + change.toCategory);
        assert(!locations.some(({ category }) => category === change.fromCategory),
          'move source still active: ' + change.keyword + ' in ' + change.fromCategory);
      }
    }
  }
});


test('background loader category list stays aligned with the manifest', () => {
  const loader = fs.readFileSync(
    path.resolve('scripts/background/defaultKeywordLoader.js'),
    'utf8'
  );
  const block = loader.match(/export const CATEGORY_FILES = \[([\s\S]*?)\];/);
  assert(block, 'CATEGORY_FILES declaration not found');
  const loaderFiles = [...block[1].matchAll(/'([^']+\.json)'/g)]
    .map(match => match[1])
    .sort();
  assert.deepEqual(loaderFiles, [...manifest.categoryFiles].sort());
});

test('catalog has no duplicate identities and no overdue lifecycle reviews', () => {
  const { entries, reviewableEvents, reviewableTenure } = loadCatalog();
  const duplicates = [...entries.entries()]
    .filter(([, locations]) => locations.length > 1)
    .map(([identity, locations]) => ({ identity, locations }));
  assert.deepEqual(duplicates, []);

  const asOf = manifest.reviewedAt;
  for (const event of reviewableEvents) {
    assert(event.reviewAfter >= asOf,
      'overdue event review: ' + event.category + ' / ' + event.keyword + ' (' + event.reviewAfter + ')');
  }
  const asOfTime = Date.parse(asOf + 'T00:00:00Z');
  for (const tenure of reviewableTenure) {
    const earliest = new Date(asOfTime - tenure.reviewCadenceDays * 86400000)
      .toISOString().slice(0, 10);
    assert(tenure.reviewedAt <= asOf,
      'future tenure review: ' + tenure.category + ' / ' + tenure.keyword);
    assert(tenure.reviewedAt >= earliest,
      'overdue tenure review: ' + tenure.category + ' / ' + tenure.keyword
        + ' (' + tenure.reviewedAt + ', cadence ' + tenure.reviewCadenceDays + ' days)');
  }
});
