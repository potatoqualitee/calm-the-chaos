const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

async function importSource(relativePath) {
  const source = fs.readFileSync(path.resolve(relativePath), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('preconfigured domains require an exact host or real subdomain', async () => {
  const { isPreconfiguredDomain } = await importSource('scripts/core/config/preconfiguredDomains.js');

  assert.equal(isPreconfiguredDomain('cnn.com'), true);
  assert.equal(isPreconfiguredDomain('edition.cnn.com'), true);
  assert.equal(isPreconfiguredDomain('evilcnn.com'), false);
  assert.equal(isPreconfiguredDomain('bbc.co.uk'), true);
  assert.equal(isPreconfiguredDomain('news.bbc.co.uk'), true);
});

test('immediate blur uses the same safe host boundaries', async () => {
  const { needsImmediateBlur } = await importSource('scripts/core/config/blurSites.js');

  assert.equal(needsImmediateBlur('https://www.cnn.com/world'), true);
  assert.equal(needsImmediateBlur('edition.cnn.com'), true);
  assert.equal(needsImmediateBlur('https://evilcnn.com/'), false);
  assert.equal(needsImmediateBlur('bbc.in'), true);
});
