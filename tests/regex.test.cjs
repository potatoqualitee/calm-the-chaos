const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

async function importSource(relativePath) {
  const source = fs.readFileSync(path.resolve(relativePath), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('exact matching respects Unicode word boundaries and punctuation', async () => {
  const { generateBlockedRegex } = await importSource('scripts/utils/regex.js');
  const matcher = generateBlockedRegex(['president', 'Donald Trump Jr.'], 'exact');

  assert.deepEqual(matcher.findMatches('The presidential library opened.'), []);
  assert.deepEqual(matcher.findMatches('The president spoke.'), ['president']);
  assert.deepEqual(matcher.findMatches('Donald Trump Jr., arrived.'), ['donald trump jr.']);
});

test('normalization handles curly punctuation, zero-width text, and flexible hyphens', async () => {
  const { generateBlockedRegex } = await importSource('scripts/utils/regex.js');
  const matcher = generateBlockedRegex(["women's", 'far right', 'government'], 'flexible');

  assert.deepEqual(matcher.findMatches('Women’s rights'), ["women's"]);
  assert.deepEqual(matcher.findMatches('A far‑right government'), ['government', 'far right']);
  assert.deepEqual(matcher.findMatches('governments'), ['government']);
  assert.deepEqual(matcher.findMatches('far\u200B right'), ['far right']);
});

test('longer phrases win over overlapping shorter keywords', async () => {
  const { generateBlockedRegex } = await importSource('scripts/utils/regex.js');
  const matcher = generateBlockedRegex(['trump', 'donald trump'], 'flexible');

  assert.deepEqual(matcher.findMatches('Donald Trump spoke'), ['donald trump']);
});

test('weight-zero metadata is excluded from default filtering', async () => {
  const { getEnabledCategoryKeywords } = await importSource('scripts/core/config/keywordMetadata.js');
  const enabled = getEnabledCategoryKeywords({
    keywords: {
      excluded: { weight: 0 },
      included: { weight: 1 },
      defaulted: {}
    }
  });

  assert.deepEqual(enabled, ['included', 'defaulted']);
});
