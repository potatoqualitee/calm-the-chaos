const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

(async () => {
  const source = fs.readFileSync('scripts/utils/regex.js', 'utf8');
  const { generateBlockedRegex } = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  );
  const keywords = [];

  for (const file of fs.readdirSync('keywords/categories').filter(file => file.endsWith('.json'))) {
    const data = JSON.parse(fs.readFileSync(path.join('keywords/categories', file), 'utf8'));
    const category = data[Object.keys(data)[0]];
    Object.entries(category.keywords).forEach(([keyword, metadata]) => {
      if (Number(metadata?.weight ?? 1) > 0) keywords.push(keyword);
    });
  }

  const generationStart = performance.now();
  const matcher = generateBlockedRegex(keywords, 'flexible');
  const generationMs = performance.now() - generationStart;
  const text = 'CNN breaking news coverage discusses the federal government, elections, war, and the economy. '.repeat(20);
  let totalMatches = 0;
  const scanStart = performance.now();
  for (let index = 0; index < 1000; index++) {
    totalMatches += matcher.findMatches(text).length;
  }
  const scanMs = performance.now() - scanStart;

  console.log(JSON.stringify({
    keywords: matcher.entries.length,
    indexCharacters: matcher.cacheKey.length,
    generationMs: Number(generationMs.toFixed(3)),
    scans: 1000,
    textCharacters: text.length,
    totalMatches,
    scanMs: Number(scanMs.toFixed(3)),
    microsecondsPerScan: Number((scanMs * 1000 / 1000).toFixed(3))
  }, null, 2));
})();
