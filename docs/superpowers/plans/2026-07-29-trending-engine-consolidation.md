# Trending Engine Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move mutesky's trending-controversy engine into calm-the-chaos so its permanent-exclusion list is a local file read, and fix the churn defects that make the published mute list rewrite itself every run.

**Architecture:** A dependency-free Node 22 ESM engine lives in `scripts/trending/`. It fetches RSS headlines across a balanced political spectrum, scores phrases, tracks them in a ledger, and publishes a keyword list. Exclusions come from the local `keywords/categories/*.json` catalog. The published payload is the union of the curated `new-developments.json` entries and the engine's trending output, written to an existing gist only when its content actually changes. The ledger lives in a second gist so the published gist's history records only real changes.

**Tech Stack:** Node 22 (built-in `fetch`, no runtime dependencies), vitest for the engine's unit tests, `node --test` for the existing catalog tests, GitHub Actions, GitHub Gists API via `gh`/`fetch` with `GIST_PAT`.

**Source of truth:** `docs/superpowers/specs/2026-07-29-trending-engine-consolidation-design.md`

## Global Constraints

- Node 22. The engine has **zero runtime dependencies** — built-in `fetch` only.
- Engine files use `.mjs`. `package.json` has no `"type": "module"` and must not gain one — `webpack.config.js` is CJS and would break.
- `lib.mjs` stays **pure**: no I/O, no `fetch`, no filesystem. All I/O lives in `update.mjs`. This is what makes it unit-testable.
- Never modify `keywords/categories/*.json` content or `catalogVersion` from the engine. The engine reads the catalog; it never writes it.
- The published category name is exactly `New Developments`.
- The published category description is exactly `Today's controversies from across the news spectrum, updated automatically`.
- Published keyword weights are integers 1-3. Weight-0 catalog entries are never published.
- Existing catalog tests must keep passing: `node --test tests/*.test.cjs`.
- Secrets available in calm-the-chaos: `GIST_PAT`, `BRAVE_API_KEY`. `CODEX_AUTH_JSON` must be added before the curation step works; the workflow must degrade gracefully without it.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/trending/lib.mjs` | Pure logic: feed parsing, phrase extraction, scoring, retention state machine, variant collapsing, category building, validation. No I/O. |
| `scripts/trending/update.mjs` | Orchestration: fetch feeds, read local catalog, read/write gists, decide whether to publish. |
| `scripts/trending/validate.mjs` | CLI wrapper around `validateTrending` for the curation gate. |
| `tests/trending.test.mjs` | Engine unit tests (ported from mutesky, vitest). |
| `tests/trendingValidate.test.mjs` | Validator unit tests (ported from mutesky, vitest). |
| `vitest.config.mjs` | Restricts vitest to `tests/trending*.test.mjs` so it never tries to run the `node --test` CJS files. |
| `.github/workflows/trending.yml` | Scheduled run, codex curation, validation gate, gist publish. |

**Deleted:** `.github/workflows/update-news.yml`, `.github/workflows/update-news-gist.ps1`, `.github/workflows/keywords.json`.

## Phasing

Tasks 1-4 port the engine and make it safe and correct. **Stopping after Task 4 leaves a working pipeline** — it publishes correctly, just with the known churn. Tasks 5-8 fix the churn. Task 9 repoints mutesky and deletes its leftovers.

Task 9 is the only irreversible-feeling step (it deletes mutesky's engine copy), and it gates on the calm-the-chaos pipeline having published successfully at least once. Everything before it is revertible with `git revert`.

The codex curation pass is deliberately out of scope — read the section after Task 9 before shipping, because it has a quality consequence.

---

### Task 1: Vendor the engine into calm-the-chaos with its tests green

Move the code verbatim first, changing nothing but module wiring. This isolates "did the move work" from "did the fixes work."

**Files:**
- Create: `scripts/trending/lib.mjs` (copy of `c:/github/mutesky/scripts/trending/lib.js`)
- Create: `scripts/trending/update.mjs` (copy of `c:/github/mutesky/scripts/trending/update.js`)
- Create: `scripts/trending/validate.mjs` (copy of `c:/github/mutesky/scripts/trending/validate.js`)
- Create: `tests/trending.test.mjs` (copy of `c:/github/mutesky/tests/unit/trending.test.js`)
- Create: `tests/trendingValidate.test.mjs` (copy of `c:/github/mutesky/tests/unit/trendingValidate.test.js`)
- Create: `vitest.config.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `scripts/trending/lib.mjs` exporting `FEEDS`, `TUNING`, `parseFeedXml`, `filterFreshHeadlines`, `extractPhrasesFromTitle`, `extractCandidates`, `scoreCandidates`, `retentionDays`, `updateTrendingState`, `buildTrendingCategory`, `phraseOverlaps`, `excludePermanent`, `titleIsTitleCase`, `validateTrending`.

- [ ] **Step 1: Copy the three engine files, renaming to `.mjs`**

```bash
mkdir -p scripts/trending
cp c:/github/mutesky/scripts/trending/lib.js      scripts/trending/lib.mjs
cp c:/github/mutesky/scripts/trending/update.js   scripts/trending/update.mjs
cp c:/github/mutesky/scripts/trending/validate.js scripts/trending/validate.mjs
```

- [ ] **Step 2: Fix the intra-module imports**

In both `scripts/trending/update.mjs` and `scripts/trending/validate.mjs`, change the import specifier:

```js
// from
} from './lib.js';
// to
} from './lib.mjs';
```

- [ ] **Step 3: Copy the two test files**

```bash
cp c:/github/mutesky/tests/unit/trending.test.js         tests/trending.test.mjs
cp c:/github/mutesky/tests/unit/trendingValidate.test.js tests/trendingValidate.test.mjs
```

- [ ] **Step 4: Fix the import paths in both test files**

Both files import from `'../../scripts/trending/lib.js'`. They now sit one level shallower and the extension changed:

```js
// from
} from '../../scripts/trending/lib.js';
// to
} from '../scripts/trending/lib.mjs';
```

- [ ] **Step 5: Add vitest as a devDependency**

```bash
npm install --save-dev vitest
```

- [ ] **Step 6: Create `vitest.config.mjs`**

Without an explicit `include`, vitest's default glob would also match `tests/*.test.cjs`, which are `node:test` files and would fail under vitest. Restrict it:

```js
import { defineConfig } from 'vitest/config';

// The catalog tests in tests/*.test.cjs run under `node --test`, not vitest.
// Only the trending engine's tests belong to vitest.
export default defineConfig({
    test: {
        include: ['tests/trending*.test.mjs']
    }
});
```

- [ ] **Step 7: Wire both runners into `npm test`**

In `package.json`, replace the `test` script and add a focused one:

```json
"test": "node --test tests/*.test.cjs && vitest run",
"test:trending": "vitest run"
```

- [ ] **Step 8: Run the engine tests and verify they pass**

Run: `npm run test:trending`
Expected: PASS — 45 tests in `trending.test.mjs`, 24 in `trendingValidate.test.mjs`, 69 total.

If any fail, the copy or the import rewrite is wrong. Do not modify test expectations to make them pass — the code is being moved unchanged at this stage.

- [ ] **Step 9: Run the full suite and verify the catalog tests still pass**

Run: `npm test`
Expected: PASS — 35 catalog tests, then 69 trending tests.

- [ ] **Step 10: Commit**

```bash
git add scripts/trending tests/trending.test.mjs tests/trendingValidate.test.mjs vitest.config.mjs package.json package-lock.json
git commit -m "Vendor the trending engine from mutesky

Verbatim move of lib/update/validate and their 69 unit tests, changing only
module wiring: .mjs extensions because package.json is CJS, and a vitest
config scoped to the trending tests so it never picks up the node --test
catalog files."
```

---

### Task 2: Replace the networked exclusion fetch with a local catalog read

This is the critical fix. The current `fetchPermanentKeywords` calls the unauthenticated, rate-limited GitHub contents API and returns an **empty set** on failure, which publishes every permanent name to users.

**Files:**
- Create: `scripts/trending/catalog.mjs`
- Modify: `scripts/trending/update.mjs` (delete `fetchPermanentKeywords`, lines 71-104; rewire `main`)
- Modify: `tests/trending.test.mjs` (append)

**Interfaces:**
- Consumes: `TUNING` from `lib.mjs`.
- Produces: `scripts/trending/catalog.mjs` exporting:
  - `readCatalogKeywords(keywordsDir: string) => Promise<Set<string>>` — every keyword name in every category file, lowercased.
  - `readCuratedNewDevelopments(keywordsDir: string) => Promise<Record<string, {weight: number, description: string}>>` — the `New Developments` entries with `weight > 0`, keyed by keyword name.

- [ ] **Step 1: Write the failing tests**

Append to `tests/trending.test.mjs`:

```js
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readCatalogKeywords, readCuratedNewDevelopments } from '../scripts/trending/catalog.mjs';

async function fixtureCatalog(categories) {
    const dir = await mkdtemp(path.join(tmpdir(), 'ctc-catalog-'));
    await mkdir(path.join(dir, 'categories'), { recursive: true });
    await writeFile(
        path.join(dir, 'catalog-migrations.json'),
        JSON.stringify({ categoryFiles: Object.keys(categories) })
    );
    for (const [file, body] of Object.entries(categories)) {
        await writeFile(path.join(dir, 'categories', file), JSON.stringify(body));
    }
    return dir;
}

describe('readCatalogKeywords', () => {
    it('collects every keyword from every listed category, lowercased', async () => {
        const dir = await fixtureCatalog({
            'a.json': { 'Cat A': { description: 'x', keywords: { Trump: { weight: 3 }, Iran: { weight: 2 } } } },
            'b.json': { 'Cat B': { description: 'y', keywords: { 'Charlie Kirk': { weight: 1 } } } }
        });
        const keywords = await readCatalogKeywords(dir);
        expect(keywords).toEqual(new Set(['trump', 'iran', 'charlie kirk']));
    });

    it('includes weight-zero keywords, which must still be excluded from trending', async () => {
        const dir = await fixtureCatalog({
            'a.json': { 'Cat A': { description: 'x', keywords: { Senate: { weight: 0 } } } }
        });
        expect(await readCatalogKeywords(dir)).toEqual(new Set(['senate']));
    });

    it('throws when a listed category file is missing, rather than returning a partial set', async () => {
        const dir = await fixtureCatalog({
            'a.json': { 'Cat A': { description: 'x', keywords: { Trump: { weight: 3 } } } }
        });
        await writeFile(
            path.join(dir, 'catalog-migrations.json'),
            JSON.stringify({ categoryFiles: ['a.json', 'missing.json'] })
        );
        await expect(readCatalogKeywords(dir)).rejects.toThrow(/missing\.json/);
    });
});

describe('readCuratedNewDevelopments', () => {
    it('returns weight and description for entries above weight zero', async () => {
        const dir = await fixtureCatalog({
            'new-developments.json': {
                'New Developments': {
                    description: 'curated',
                    keywords: {
                        'Bryan Kohberger': { weight: 3, description: 'case', reviewAfter: '2026-08-29' },
                        Quiet: { weight: 0, description: 'reference only' }
                    }
                }
            }
        });
        expect(await readCuratedNewDevelopments(dir)).toEqual({
            'Bryan Kohberger': { weight: 3, description: 'case' }
        });
    });

    it('returns an empty object when the category file has no keywords', async () => {
        const dir = await fixtureCatalog({
            'new-developments.json': { 'New Developments': { description: 'curated', keywords: {} } }
        });
        expect(await readCuratedNewDevelopments(dir)).toEqual({});
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:trending`
Expected: FAIL — cannot resolve `../scripts/trending/catalog.mjs`.

- [ ] **Step 3: Implement `scripts/trending/catalog.mjs`**

```js
// Reads the permanent keyword catalog straight off disk. This module exists
// because the engine used to fetch these lists over the network and publish
// with NO exclusions when that fetch failed, flooding every user's mute list
// with permanently-muted names. A local read cannot fail that way.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const CATEGORY_NAME = 'New Developments';

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

// catalog-migrations.json is the authoritative list of category files and is
// already covered by the repo's own manifest-alignment test.
async function categoryFiles(keywordsDir) {
    const manifest = await readJson(path.join(keywordsDir, 'catalog-migrations.json'));
    if (!Array.isArray(manifest.categoryFiles) || manifest.categoryFiles.length === 0) {
        throw new Error('catalog-migrations.json has no categoryFiles list');
    }
    return manifest.categoryFiles;
}

export async function readCatalogKeywords(keywordsDir) {
    const keywords = new Set();
    for (const file of await categoryFiles(keywordsDir)) {
        // A missing or malformed file throws: a partial exclusion set is the
        // exact failure mode this module exists to prevent.
        const data = await readJson(path.join(keywordsDir, 'categories', file));
        const category = data[Object.keys(data)[0]];
        for (const keyword of Object.keys(category?.keywords || {})) {
            keywords.add(keyword.toLowerCase());
        }
    }
    return keywords;
}

export async function readCuratedNewDevelopments(keywordsDir) {
    const data = await readJson(path.join(keywordsDir, 'categories', 'new-developments.json'));
    const category = data[CATEGORY_NAME];
    const curated = {};
    for (const [keyword, meta] of Object.entries(category?.keywords || {})) {
        // Weight 0 means catalog-only reference metadata; consumers filter it
        // out anyway, so it must not occupy a published slot.
        if (Number(meta?.weight ?? 0) <= 0) continue;
        curated[keyword] = { weight: meta.weight, description: meta.description };
    }
    return curated;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:trending`
Expected: PASS — the five new tests plus the original 69.

- [ ] **Step 5: Delete `fetchPermanentKeywords` from `update.mjs`**

Remove the whole block from the `// The permanent calm-the-chaos lists...` comment through the closing brace of `fetchPermanentKeywords` (originally lines 71-104), including the `CALM_THE_CHAOS` constant.

- [ ] **Step 6: Wire the local read into `main` with a fail-closed guard**

In `update.mjs`, add to the imports at the top:

```js
import { readCatalogKeywords, readCuratedNewDevelopments } from './catalog.mjs';
```

Add the constant next to `STATE_PATH`/`OUTPUT_PATH`:

```js
const KEYWORDS_DIR = path.join(repoRoot, 'keywords');
// The catalog holds thousands of keywords. This is a corruption tripwire,
// not a tuning knob: anything near zero means we are about to publish
// without exclusions, which is the failure this whole module prevents.
const MIN_PERMANENT_KEYWORDS = 100;
```

Replace the line `const excludeKeywords = await fetchPermanentKeywords();` with:

```js
    const excludeKeywords = await readCatalogKeywords(KEYWORDS_DIR);
    if (excludeKeywords.size < MIN_PERMANENT_KEYWORDS) {
        console.error(
            `only ${excludeKeywords.size} permanent keywords loaded (expected >= ${MIN_PERMANENT_KEYWORDS}); refusing to publish without exclusions`
        );
        process.exit(1);
    }
    console.log(`permanent keywords for exclusion: ${excludeKeywords.size}`);
```

- [ ] **Step 7: Verify the engine runs against the real catalog**

Run: `node scripts/trending/update.mjs`
Expected: log line `permanent keywords for exclusion: <N>` where N is in the thousands, then normal output. No `refusing to publish` message.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add scripts/trending/catalog.mjs scripts/trending/update.mjs tests/trending.test.mjs
git commit -m "Read the exclusion catalog from disk and fail closed

The engine fetched the permanent keyword lists through an unauthenticated,
rate-limited GitHub contents API call and returned an empty set on failure,
which published every permanently-muted name to users. Reading the local
catalog removes the failure mode, and an undersized set now aborts the run
instead of publishing unfiltered."
```

---

### Task 3: Publish the union to the gist, only when the content changed

**Files:**
- Create: `scripts/trending/publish.mjs`
- Modify: `tests/trending.test.mjs` (append)

**Interfaces:**
- Consumes: `readCuratedNewDevelopments` from `catalog.mjs`.
- Produces: `scripts/trending/publish.mjs` exporting:
  - `mergeCuratedIntoCategory(category: object, curated: Record<string, {weight, description}>) => object` — pure; returns a new category object with curated entries folded in.
  - `publishedNamesEqual(a: object, b: object) => boolean` — pure; compares two payloads ignoring `updatedAt`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/trending.test.mjs`:

```js
import { mergeCuratedIntoCategory, publishedNamesEqual } from '../scripts/trending/publish.mjs';

const categoryWith = keywords => ({
    'New Developments': {
        description: "Today's controversies from across the news spectrum, updated automatically",
        updatedAt: '2026-07-29T00:00:00.000Z',
        keywords
    }
});

describe('mergeCuratedIntoCategory', () => {
    it('adds curated entries alongside trending ones', () => {
        const merged = mergeCuratedIntoCategory(
            categoryWith({ Fauci: { weight: 3, description: 'In 9 outlets across the spectrum (since 2026-07-27)' } }),
            { 'Bryan Kohberger': { weight: 3, description: 'case' } }
        );
        expect(Object.keys(merged['New Developments'].keywords).sort())
            .toEqual(['Bryan Kohberger', 'Fauci']);
    });

    it('lets the curated entry win when a name collides, since curation is authoritative', () => {
        const merged = mergeCuratedIntoCategory(
            categoryWith({ 'Bryan Kohberger': { weight: 1, description: 'In 3 outlets across the spectrum (since 2026-07-29)' } }),
            { 'Bryan Kohberger': { weight: 3, description: 'case' } }
        );
        expect(merged['New Developments'].keywords['Bryan Kohberger'])
            .toEqual({ weight: 3, description: 'case' });
    });

    it('publishes curated entries even when no trending phrase qualified', () => {
        const merged = mergeCuratedIntoCategory(categoryWith({}), {
            'Bryan Kohberger': { weight: 3, description: 'case' }
        });
        expect(Object.keys(merged['New Developments'].keywords)).toEqual(['Bryan Kohberger']);
    });

    it('does not mutate its input', () => {
        const original = categoryWith({});
        mergeCuratedIntoCategory(original, { X: { weight: 2, description: 'd' } });
        expect(Object.keys(original['New Developments'].keywords)).toEqual([]);
    });
});

describe('publishedNamesEqual', () => {
    it('ignores updatedAt', () => {
        const a = categoryWith({ Fauci: { weight: 3, description: 'd' } });
        const b = categoryWith({ Fauci: { weight: 3, description: 'd' } });
        b['New Developments'].updatedAt = '2999-01-01T00:00:00.000Z';
        expect(publishedNamesEqual(a, b)).toBe(true);
    });

    it('is insensitive to key order', () => {
        const a = categoryWith({ A: { weight: 1, description: 'd' }, B: { weight: 2, description: 'e' } });
        const b = categoryWith({ B: { weight: 2, description: 'e' }, A: { weight: 1, description: 'd' } });
        expect(publishedNamesEqual(a, b)).toBe(true);
    });

    it('detects a weight change', () => {
        const a = categoryWith({ Fauci: { weight: 3, description: 'd' } });
        const b = categoryWith({ Fauci: { weight: 2, description: 'd' } });
        expect(publishedNamesEqual(a, b)).toBe(false);
    });

    it('detects a description change', () => {
        const a = categoryWith({ Fauci: { weight: 3, description: 'd' } });
        const b = categoryWith({ Fauci: { weight: 3, description: 'e' } });
        expect(publishedNamesEqual(a, b)).toBe(false);
    });

    it('treats a missing or unparseable remote payload as different', () => {
        expect(publishedNamesEqual(categoryWith({}), null)).toBe(false);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:trending`
Expected: FAIL — cannot resolve `../scripts/trending/publish.mjs`.

- [ ] **Step 3: Implement `scripts/trending/publish.mjs`**

```js
// Publication shaping. Pure functions only -- update.mjs performs the HTTP.

const CATEGORY_NAME = 'New Developments';

// The extension REPLACES its whole New Developments group with this payload
// (scripts/background/background.js), so anything omitted here is destroyed
// for extension users. The curated catalog entries must ride along.
export function mergeCuratedIntoCategory(category, curated) {
    const entry = category[CATEGORY_NAME] || {};
    return {
        [CATEGORY_NAME]: {
            ...entry,
            // Curated last: curation is authoritative for the entries it owns.
            keywords: { ...(entry.keywords || {}), ...curated }
        }
    };
}

function comparable(payload) {
    const entry = payload?.[CATEGORY_NAME];
    if (!entry || typeof entry !== 'object') return null;
    const keywords = entry.keywords || {};
    return JSON.stringify(
        Object.keys(keywords).sort().map(name => [
            name,
            keywords[name]?.weight,
            keywords[name]?.description
        ])
    );
}

// updatedAt is deliberately excluded: it moves every run and the consumers
// never read it, so including it would make every run look like a change.
export function publishedNamesEqual(a, b) {
    const left = comparable(a);
    const right = comparable(b);
    return left !== null && right !== null && left === right;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:trending`
Expected: PASS.

- [ ] **Step 5: Add gist I/O to `update.mjs`**

Replace the `STATE_PATH` and `OUTPUT_PATH` constants and their `writeFile` calls. Add near the other constants:

```js
const PUBLISH_GIST_ID = '3488593dcc622acc736055fa00a9745e';
const PUBLISH_GIST_FILE = 'new-development.json';
const LEDGER_GIST_ID = process.env.LEDGER_GIST_ID;
const LEDGER_GIST_FILE = 'trending-state.json';
const GIST_API = 'https://api.github.com/gists';
```

Add these helpers above `main`:

```js
function gistHeaders() {
    if (!process.env.GIST_PAT) throw new Error('GIST_PAT is not set');
    return {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${process.env.GIST_PAT}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'calm-the-chaos-trending/1.0'
    };
}

async function readGistFile(gistId, fileName) {
    const response = await fetch(`${GIST_API}/${gistId}`, {
        headers: gistHeaders(),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`gist ${gistId}: HTTP ${response.status}`);
    const gist = await response.json();
    const content = gist.files?.[fileName]?.content;
    // A missing file is the first-run bootstrap case, not an error.
    return content === undefined ? null : JSON.parse(content);
}

async function writeGistFile(gistId, fileName, value) {
    const response = await fetch(`${GIST_API}/${gistId}`, {
        method: 'PATCH',
        headers: { ...gistHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: { [fileName]: { content: JSON.stringify(value, null, 2) + '\n' } } }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`gist ${gistId} PATCH: HTTP ${response.status}`);
}
```

- [ ] **Step 6: Rewrite the tail of `main` to publish conditionally**

Replace everything from `const nowIso = new Date().toISOString();` through the two `writeFile` calls with:

```js
    const nowIso = new Date().toISOString();

    if (!LEDGER_GIST_ID) {
        console.error('LEDGER_GIST_ID is not set; refusing to run without a ledger');
        process.exit(1);
    }
    // Bootstrap on a missing file; abort on an unreadable one, because
    // publishing against lost state would reset every heat score.
    const loadedState = (await readGistFile(LEDGER_GIST_ID, LEDGER_GIST_FILE)) || { phrases: {} };

    const excludeKeywords = await readCatalogKeywords(KEYWORDS_DIR);
    if (excludeKeywords.size < MIN_PERMANENT_KEYWORDS) {
        console.error(
            `only ${excludeKeywords.size} permanent keywords loaded (expected >= ${MIN_PERMANENT_KEYWORDS}); refusing to publish without exclusions`
        );
        process.exit(1);
    }
    console.log(`permanent keywords for exclusion: ${excludeKeywords.size}`);

    const candidates = extractCandidates(headlines);
    const { prevState, scored } = excludePermanent(
        loadedState, scoreCandidates(candidates), excludeKeywords
    );
    const state = updateTrendingState(prevState, scored, nowIso);
    const curated = await readCuratedNewDevelopments(KEYWORDS_DIR);
    const category = mergeCuratedIntoCategory(
        buildTrendingCategory(state, { excludeKeywords }),
        curated
    );

    const live = await readGistFile(PUBLISH_GIST_ID, PUBLISH_GIST_FILE);
    if (publishedNamesEqual(category, live)) {
        // Preserve the live updatedAt so the gist's history records only
        // real changes to the mute list.
        console.log('published set unchanged; skipping publish');
    } else {
        await writeGistFile(PUBLISH_GIST_ID, PUBLISH_GIST_FILE, category);
        console.log(`published ${Object.keys(category['New Developments'].keywords).length} keywords`);
    }

    // Ledger last: sightings must not be recorded for a publish that failed.
    await writeGistFile(LEDGER_GIST_ID, LEDGER_GIST_FILE, state);
```

Add to the import block from `./publish.mjs`:

```js
import { mergeCuratedIntoCategory, publishedNamesEqual } from './publish.mjs';
```

Delete the now-unused `mkdir` import and the `STATE_PATH`/`OUTPUT_PATH` constants.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/trending tests/trending.test.mjs
git commit -m "Publish the union to the gist only when it changes

The extension replaces its whole New Developments group with this payload,
so curated catalog entries must ride along or they are destroyed. The write
is now skipped when the keyword set, weights and descriptions all match what
is already live, and the ledger moves to its own gist so the published
gist's history records only real changes."
```

---

### Task 4: Add the workflow and retire the PowerShell pipeline

**Files:**
- Create: `.github/workflows/trending.yml`
- Delete: `.github/workflows/update-news.yml`, `.github/workflows/update-news-gist.ps1`, `.github/workflows/keywords.json`

- [ ] **Step 1: Create `.github/workflows/trending.yml`**

Adapted from mutesky's, with the commit step replaced by the engine's own gist publish. The codex curation step is **not** carried over here — see the note after the YAML.

```yaml
name: Update trending controversies

on:
  schedule:
    # Four times a day, offset from the top of the hour to be polite to feeds
    - cron: '23 */6 * * *'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: trending
  cancel-in-progress: false

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Scour headlines and publish
        env:
          BRAVE_API_KEY: ${{ secrets.BRAVE_API_KEY }}
          GIST_PAT: ${{ secrets.GIST_PAT }}
          LEDGER_GIST_ID: ${{ secrets.LEDGER_GIST_ID }}
        run: node scripts/trending/update.mjs
```

The codex curation pass is deliberately **not** carried over in this task. It edited two files in a git working tree and gated on `git reset --hard`, neither of which exists now that output goes to gists. Re-adding it is Task 10.

- [ ] **Step 2: Delete the superseded PowerShell pipeline**

```bash
git rm .github/workflows/update-news.yml .github/workflows/update-news-gist.ps1 .github/workflows/keywords.json
```

- [ ] **Step 3: Create the ledger gist and record its ID**

```bash
echo '{"phrases":{}}' > /tmp/trending-state.json
gh gist create /tmp/trending-state.json --desc "calm-the-chaos trending ledger" | tee /tmp/ledger-url.txt
```

Take the ID from the URL and add it as a repository secret:

```bash
gh secret set LEDGER_GIST_ID --body "<id-from-url>"
```

- [ ] **Step 4: Verify with a manual dispatch**

```bash
git push
gh workflow run "Update trending controversies"
sleep 60
gh run list --workflow="Update trending controversies" --limit 1
```

Expected: `completed  success`. Check the log for `permanent keywords for exclusion:` in the thousands and either `published N keywords` or `published set unchanged`.

- [ ] **Step 5: Verify the published gist**

```bash
gh api gists/3488593dcc622acc736055fa00a9745e --jq '.files."new-development.json".content' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const k=JSON.parse(s)['New Developments'].keywords;console.log(Object.keys(k).length, Object.keys(k).join(', '))})"
```

Expected: contains all four curated entries (Bryan Kohberger, Nolan Wells, Patrick Clancy, Salgado Araujo) plus any trending phrases, and **no** permanent names such as Trump, Iran or Israel.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows
git commit -m "Add the trending workflow and delete the PowerShell pipeline

The old update-news workflow has been disabled_manually since 2025-01-29 and
is superseded by the vendored engine."
```

---

### Task 5: Pin display casing

The published key is `entry.display`, re-elected every run by majority casing among that run's headlines, so one phrase publishes as `Border Czar` and then `border czar` — a delete plus an add downstream each time.

**Files:**
- Modify: `scripts/trending/lib.mjs:491`
- Modify: `tests/trending.test.mjs` (append)

- [ ] **Step 1: Write the failing test**

```js
describe('display pinning', () => {
    it('keeps the display a phrase was first admitted with, even when headline casing flips', () => {
        const prev = {
            updatedAt: '2026-07-29T00:00:00.000Z',
            phrases: {
                'border czar': {
                    display: 'Border Czar',
                    firstSeen: '2026-07-28T00:00:00.000Z',
                    lastSeen: '2026-07-29T00:00:00.000Z',
                    heat: 20, peakHeat: 20, daysActive: 2,
                    expiresAt: '2026-08-10T00:00:00.000Z',
                    bipartisan: true, outlets: 8
                }
            }
        };
        const scored = [{
            canon: 'border czar', display: 'border czar', score: 20,
            outlets: 8, leftOutlets: 3, rightOutlets: 3, mentions: 8,
            bipartisan: true, mainstream: true
        }];
        const next = updateTrendingState(prev, scored, '2026-07-29T06:00:00.000Z');
        expect(next.phrases['border czar'].display).toBe('Border Czar');
    });

    it('elects a display for a phrase entering state for the first time', () => {
        const scored = [{
            canon: 'jay clayton', display: 'Jay Clayton', score: 30,
            outlets: 10, leftOutlets: 4, rightOutlets: 4, mentions: 10,
            bipartisan: true, mainstream: true
        }];
        const next = updateTrendingState({ phrases: {} }, scored, '2026-07-29T06:00:00.000Z');
        expect(next.phrases['jay clayton'].display).toBe('Jay Clayton');
    });
});
```

- [ ] **Step 2: Run to verify the first test fails**

Run: `npm run test:trending`
Expected: FAIL — `expected 'border czar' to be 'Border Czar'`.

- [ ] **Step 3: Pin the display**

In `scripts/trending/lib.mjs`, in the carried-phrase loop of `updateTrendingState`:

```js
// from
            display: hit ? hit.display : prev.display,
// to
            // Pinned: re-electing casing every run republishes the same story
            // under a new key, which downstream reads as a delete plus an add.
            // Deliberate casing corrections belong to the curation pass.
            display: prev.display,
```

- [ ] **Step 4: Run to verify both pass**

Run: `npm run test:trending`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/trending/lib.mjs tests/trending.test.mjs
git commit -m "Pin display casing once a phrase is admitted"
```

---

### Task 6: Decode `&apos;` and reject phrases with stray entities

`Trump&apos` and `Correspondents&apos` reached publication as mute words.

**Files:**
- Modify: `scripts/trending/lib.mjs:148-158` (`decodeEntities`), `lib.mjs` (`buildTrendingCategory`)
- Modify: `tests/trending.test.mjs` (append)

- [ ] **Step 1: Write the failing tests**

```js
describe('entity handling', () => {
    it('decodes the named apostrophe entity', () => {
        const items = parseFeedXml(
            `<rss><channel><item><title>Trump&amp;apos;s new plan</title></item></channel></rss>`
        );
        expect(items[0].title).toContain("Trump's");
        expect(items[0].title).not.toContain('apos');
    });

    it('never publishes a phrase still carrying an ampersand', () => {
        const state = {
            updatedAt: '2026-07-29T00:00:00.000Z',
            phrases: {
                'trump&apos': {
                    display: 'Trump&apos',
                    firstSeen: '2026-07-29T00:00:00.000Z',
                    lastSeen: '2026-07-29T00:00:00.000Z',
                    heat: 30, peakHeat: 30, daysActive: 1,
                    expiresAt: '2026-08-05T00:00:00.000Z',
                    bipartisan: true, outlets: 5
                }
            }
        };
        const category = buildTrendingCategory(state, { excludeKeywords: [] });
        expect(Object.keys(category['New Developments'].keywords)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:trending`
Expected: FAIL on both.

- [ ] **Step 3: Add `&apos;` to `decodeEntities`**

In `scripts/trending/lib.mjs`, alongside the existing `&#0?39;` rule:

```js
        .replace(/&#0?39;|&apos;/g, "'")
```

(replacing the existing `.replace(/&#0?39;/g, "'")` line).

- [ ] **Step 4: Reject stray ampersands at publication**

In `buildTrendingCategory`, in the filter loop, immediately after the `GENERIC_PHRASES` check:

```js
        // A surviving ampersand means an entity slipped decoding; publishing it
        // would put a mangled token like "Trump&apos" in everyone's mute list.
        if (canon.includes('&')) continue;
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm run test:trending`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/trending/lib.mjs tests/trending.test.mjs
git commit -m "Decode &apos; and refuse to publish phrases containing &"
```

---

### Task 7: Collapse phrase variants deterministically

`scoreCandidates` already tries to collapse variants, but absorption is one-directional while iteration is by score, so when the shorter phrase outscores the longer one nothing absorbs and both publish. The pass also never runs against carried state, so a stale variant survives its 3-30 day retention alongside the phrase that should have absorbed it.

**Files:**
- Modify: `scripts/trending/lib.mjs:410-423` (absorption in `scoreCandidates`), `lib.mjs` (`updateTrendingState`)
- Modify: `tests/trending.test.mjs` (append)

**Interfaces:**
- Produces: `collapseVariants(entries: Array<[canon, entry]>) => Array<[canon, entry]>` exported from `lib.mjs`, where `entry` has the state-phrase shape.

- [ ] **Step 1: Write the failing tests**

```js
import { collapseVariants } from '../scripts/trending/lib.mjs';

const phrase = (over = {}) => ({
    display: 'X', firstSeen: '2026-07-28T00:00:00.000Z', lastSeen: '2026-07-29T00:00:00.000Z',
    heat: 10, peakHeat: 10, daysActive: 1, expiresAt: '2026-08-05T00:00:00.000Z',
    bipartisan: false, outlets: 4, ...over
});

describe('collapseVariants', () => {
    it('keeps the specific phrase regardless of which variant is hotter', () => {
        const hotShort = [
            ['secret', phrase({ display: 'Secret', heat: 90 })],
            ['secret service', phrase({ display: 'Secret Service', heat: 10 })]
        ];
        expect(collapseVariants(hotShort).map(([canon]) => canon)).toEqual(['secret service']);

        const hotLong = [
            ['secret', phrase({ display: 'Secret', heat: 10 })],
            ['secret service', phrase({ display: 'Secret Service', heat: 90 })]
        ];
        expect(collapseVariants(hotLong).map(([canon]) => canon)).toEqual(['secret service']);
    });

    it('takes the max of heat and outlets rather than the sum, so a split story cannot inflate itself', () => {
        const [[, merged]] = collapseVariants([
            ['el-sayed', phrase({ display: 'El-Sayed', heat: 30, peakHeat: 40, outlets: 7 })],
            ['abdul el-sayed', phrase({ display: 'Abdul El-Sayed', heat: 20, peakHeat: 25, outlets: 5 })]
        ]);
        expect(merged.heat).toBe(30);
        expect(merged.peakHeat).toBe(40);
        expect(merged.outlets).toBe(7);
    });

    it('keeps the earlier firstSeen, the later lastSeen and the later expiry', () => {
        const [[, merged]] = collapseVariants([
            ['dinner', phrase({
                firstSeen: '2026-07-20T00:00:00.000Z', lastSeen: '2026-07-28T00:00:00.000Z',
                expiresAt: '2026-08-01T00:00:00.000Z', daysActive: 2
            })],
            ['correspondents dinner', phrase({
                display: 'Correspondents Dinner',
                firstSeen: '2026-07-25T00:00:00.000Z', lastSeen: '2026-07-29T00:00:00.000Z',
                expiresAt: '2026-08-09T00:00:00.000Z', daysActive: 5
            })]
        ]);
        expect(merged.firstSeen).toBe('2026-07-20T00:00:00.000Z');
        expect(merged.lastSeen).toBe('2026-07-29T00:00:00.000Z');
        expect(merged.expiresAt).toBe('2026-08-09T00:00:00.000Z');
        expect(merged.daysActive).toBe(5);
    });

    it('ORs bipartisan across merged variants', () => {
        const [[, merged]] = collapseVariants([
            ['kirk', phrase({ bipartisan: true })],
            ['charlie kirk', phrase({ display: 'Charlie Kirk', bipartisan: false })]
        ]);
        expect(merged.bipartisan).toBe(true);
    });

    it('respects word boundaries and folds plurals', () => {
        expect(collapseVariants([
            ['art', phrase({ display: 'Art' })],
            ['martial law', phrase({ display: 'Martial Law' })]
        ]).map(([canon]) => canon).sort()).toEqual(['art', 'martial law']);

        expect(collapseVariants([
            ['data center', phrase({ display: 'Data Center' })],
            ['data centers', phrase({ display: 'Data Centers' })]
        ])).toHaveLength(1);
    });

    it('leaves unrelated phrases untouched', () => {
        expect(collapseVariants([
            ['fauci', phrase({ display: 'Fauci' })],
            ['jay clayton', phrase({ display: 'Jay Clayton' })]
        ])).toHaveLength(2);
    });
});

describe('updateTrendingState variant collapsing', () => {
    it('absorbs a carried state entry into a more specific fresh hit', () => {
        const prev = {
            updatedAt: '2026-07-29T00:00:00.000Z',
            phrases: { secret: phrase({ display: 'Secret', heat: 40, outlets: 6 }) }
        };
        const scored = [{
            canon: 'secret service', display: 'Secret Service', score: 30,
            outlets: 9, leftOutlets: 3, rightOutlets: 3, mentions: 9,
            bipartisan: true, mainstream: true
        }];
        const next = updateTrendingState(prev, scored, '2026-07-29T06:00:00.000Z');
        expect(Object.keys(next.phrases)).toEqual(['secret service']);
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:trending`
Expected: FAIL — `collapseVariants` is not exported.

- [ ] **Step 3: Replace the absorption block in `scoreCandidates`**

In `scripts/trending/lib.mjs`, replace lines 410-423 (from the `// Prefer the most specific phrasing` comment through `return kept;`) with:

```js
    // Prefer the most specific phrasing: "hunter biden laptop" beats "biden
    // laptop" and "laptop". Ordering is by specificity, NOT by score --
    // ordering by score meant that when the shorter phrase happened to be
    // hotter it entered `kept` first and the longer phrase could never absorb
    // it, so both published and which one won flapped with score jitter.
    const kept = [];
    for (const candidate of [...scored].sort(bySpecificity)) {
        const absorbed = kept.some(better => phraseContains(better.canon, candidate.canon));
        if (!absorbed) kept.push(candidate);
    }
    return kept;
}

// Most words first, then longest, then alphabetical: a total order, so the
// absorber is never decided by a value that moves between runs.
function bySpecificity(a, b) {
    const canonA = a.canon ?? a[0];
    const canonB = b.canon ?? b[0];
    return canonB.split(' ').length - canonA.split(' ').length
        || canonB.length - canonA.length
        || canonA.localeCompare(canonB);
}

// Merge two state entries for what is one story under two phrasings. max, not
// sum, on every coverage number: the variants are counted from overlapping
// headlines, so summing would double-count one story and could push it into a
// higher outlet bucket purely for having been split in two.
function mergePhrases(keep, absorbed) {
    const earlier = (a, b) => (Date.parse(a) <= Date.parse(b) ? a : b);
    const later = (a, b) => (Date.parse(a) >= Date.parse(b) ? a : b);
    return {
        ...keep,
        firstSeen: earlier(keep.firstSeen, absorbed.firstSeen),
        lastSeen: later(keep.lastSeen, absorbed.lastSeen),
        heat: Math.max(keep.heat, absorbed.heat),
        peakHeat: Math.max(keep.peakHeat, absorbed.peakHeat),
        daysActive: Math.max(keep.daysActive, absorbed.daysActive),
        expiresAt: later(keep.expiresAt, absorbed.expiresAt),
        bipartisan: Boolean(keep.bipartisan || absorbed.bipartisan),
        outlets: Math.max(keep.outlets, absorbed.outlets)
    };
}

// Collapse [canon, entry] pairs so one story cannot occupy two rows.
export function collapseVariants(entries) {
    const kept = [];
    for (const [canon, entry] of [...entries].sort((a, b) => bySpecificity(a, b))) {
        const index = kept.findIndex(([keptCanon]) => phraseContains(keptCanon, canon));
        if (index === -1) {
            kept.push([canon, entry]);
        } else {
            kept[index] = [kept[index][0], mergePhrases(kept[index][1], entry)];
        }
    }
    return kept;
}
```

- [ ] **Step 4: Export `phraseContains`**

`collapseVariants` and the absorption loop both need it. Change its declaration in `lib.mjs`:

```js
// from
function phraseContains(bigger, smaller) {
// to
export function phraseContains(bigger, smaller) {
```

- [ ] **Step 5: Apply collapsing to state in `updateTrendingState`**

In `lib.mjs`, replace the hard-cap block at the end of `updateTrendingState`:

```js
// from
    const entries = Object.entries(phrases)
        .sort(([, a], [, b]) => b.heat - a.heat)
        .slice(0, tuning.maxPhrases);
// to
    // Collapse before the cap, for the same reason excludePermanent runs
    // before it: a duplicate must not occupy a slot an eligible phrase
    // could use.
    const entries = collapseVariants(Object.entries(phrases))
        .sort(([, a], [, b]) => b.heat - a.heat)
        .slice(0, tuning.maxPhrases);
```

- [ ] **Step 6: Run to verify they pass**

Run: `npm run test:trending`
Expected: PASS.

Some pre-existing tests in `trending.test.mjs` may now fail if they asserted the old score-ordered absorption. Read each failure: if it asserts that a shorter, hotter phrase survives alongside its longer form, update the expectation and note it in the commit message. Do not weaken an assertion that is testing something else.

- [ ] **Step 7: Commit**

```bash
git add scripts/trending/lib.mjs tests/trending.test.mjs
git commit -m "Collapse phrase variants deterministically

Absorption was one-directional while iteration was by score, so a hotter
short phrase blocked its own absorption and both variants published. Order
by specificity instead, drop the 0.8 score gate, match on word boundaries,
and run the pass over carried state so a stale variant cannot outlive the
story alongside the phrase that should have absorbed it. Merge by max, never
sum, so a split story cannot inflate its own coverage."
```

---

### Task 8: Stabilise descriptions and the validator

Descriptions embed a live outlet count (`In 24 outlets` → `In 22 outlets`), so the payload differs every run even when the mute list is identical — which defeats the publish gate from Task 3. `validateTrending` enforces the exact old description format and an exact state key set, so both must move together.

**Files:**
- Modify: `scripts/trending/lib.mjs` (`buildTrendingCategory`, `updateTrendingState`, `mergePhrases`, `PHRASE_KEYS`, `validateTrending`)
- Modify: `tests/trending.test.mjs`, `tests/trendingValidate.test.mjs` (append)

**Interfaces:**
- Produces: `outletBucket(peakOutlets: number) => string` exported from `lib.mjs`, returning one of `3-5`, `6-10`, `11-20`, `20+`.
- State entries gain a `peakOutlets: number` field. `PHRASE_KEYS` must list it or every entry fails validation.

- [ ] **Step 1: Write the failing tests**

Append to `tests/trending.test.mjs`:

```js
import { outletBucket } from '../scripts/trending/lib.mjs';

describe('outletBucket', () => {
    it('buckets so ordinary jitter does not change the description', () => {
        expect(outletBucket(12)).toBe(outletBucket(18));
        expect(outletBucket(22)).toBe(outletBucket(24));
    });

    it('changes on a real shift in breadth', () => {
        expect(outletBucket(4)).toBe('3-5');
        expect(outletBucket(8)).toBe('6-10');
        expect(outletBucket(15)).toBe('11-20');
        expect(outletBucket(25)).toBe('20+');
    });
});

describe('peakOutlets', () => {
    it('never decreases, so a description can only ever move up a bucket', () => {
        const prev = {
            updatedAt: '2026-07-29T00:00:00.000Z',
            phrases: {
                fauci: {
                    display: 'Fauci', firstSeen: '2026-07-27T00:00:00.000Z',
                    lastSeen: '2026-07-29T00:00:00.000Z', heat: 40, peakHeat: 40,
                    daysActive: 2, expiresAt: '2026-08-12T00:00:00.000Z',
                    bipartisan: true, outlets: 24, peakOutlets: 24
                }
            }
        };
        const scored = [{
            canon: 'fauci', display: 'Fauci', score: 20, outlets: 22,
            leftOutlets: 8, rightOutlets: 8, mentions: 22, bipartisan: true, mainstream: true
        }];
        const next = updateTrendingState(prev, scored, '2026-07-29T06:00:00.000Z');
        expect(next.phrases.fauci.outlets).toBe(22);
        expect(next.phrases.fauci.peakOutlets).toBe(24);
    });
});

describe('description stability', () => {
    it('produces the same description for two runs whose outlet counts only jitter', () => {
        const make = peakOutlets => buildTrendingCategory({
            updatedAt: '2026-07-29T00:00:00.000Z',
            phrases: {
                fauci: {
                    display: 'Fauci', firstSeen: '2026-07-27T00:00:00.000Z',
                    lastSeen: '2026-07-29T00:00:00.000Z', heat: 40, peakHeat: 40,
                    daysActive: 2, expiresAt: '2026-08-12T00:00:00.000Z',
                    bipartisan: true, outlets: peakOutlets, peakOutlets
                }
            }
        }, { excludeKeywords: [] })['New Developments'].keywords.Fauci.description;
        expect(make(12)).toBe(make(18));
        expect(make(12)).toBe('In 11-20 outlets across the spectrum (since 2026-07-27)');
    });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:trending`
Expected: FAIL — `outletBucket` is not exported.

- [ ] **Step 3: Implement `outletBucket` and use it**

Add to `lib.mjs` above `buildTrendingCategory`:

```js
// Bucketed so a description changes only on a real shift in breadth. Raw
// counts jitter every run (24 -> 22 is the same story), and a description
// that rewrites itself every run defeats the publish gate.
export function outletBucket(peakOutlets) {
    if (peakOutlets >= 21) return '20+';
    if (peakOutlets >= 11) return '11-20';
    if (peakOutlets >= 6) return '6-10';
    return '3-5';
}
```

In `buildTrendingCategory`, change the description:

```js
// from
            description: `In ${entry.outlets} outlets across the spectrum (since ${entry.firstSeen.slice(0, 10)})`
// to
            description: `In ${outletBucket(entry.peakOutlets ?? entry.outlets)} outlets across the spectrum (since ${entry.firstSeen.slice(0, 10)})`
```

- [ ] **Step 4: Track `peakOutlets` through the state machine**

In `updateTrendingState`, carried-phrase branch, add to the emitted object:

```js
            outlets: hit ? hit.outlets : prev.outlets,
            peakOutlets: Math.max(prev.peakOutlets ?? prev.outlets ?? 0, hit ? hit.outlets : 0)
```

Newcomer branch:

```js
            outlets: hit.outlets,
            peakOutlets: hit.outlets
```

In `mergePhrases` (Task 7), add:

```js
        peakOutlets: Math.max(keep.peakOutlets ?? keep.outlets ?? 0, absorbed.peakOutlets ?? absorbed.outlets ?? 0),
```

- [ ] **Step 5: Update the validator to match**

In `lib.mjs`, add the new key to `PHRASE_KEYS` (it is compared with `sameKeys`, so the list must be sorted):

```js
const PHRASE_KEYS = ['bipartisan', 'daysActive', 'display', 'expiresAt',
    'firstSeen', 'heat', 'lastSeen', 'outlets', 'peakHeat', 'peakOutlets'];
```

Update the derived-description check inside `validateTrending`:

```js
// from
            const derived = `In ${stateEntry.outlets} outlets across the spectrum (since ${String(stateEntry.firstSeen).slice(0, 10)})`;
// to
            const derived = `In ${outletBucket(stateEntry.peakOutlets ?? stateEntry.outlets)} outlets across the spectrum (since ${String(stateEntry.firstSeen).slice(0, 10)})`;
```

- [ ] **Step 6: Exempt curated entries from the state-backing check**

`validateTrending` requires every published keyword to have a matching state entry. Curated catalog entries have none, so the union payload would fail. Add a parameter.

Change the signature:

```js
export function validateTrending(
    { category, state, headlines = null, baselinePhrases = null, baselineUpdatedAt = null, baselineCategory = null, curatedNames = [] },
    tuning = TUNING
) {
```

Add near the top of the body:

```js
    // Curated catalog entries are published from new-developments.json and
    // have no tracked state; they are authoritative and exempt from the
    // state-backing and derived-description checks.
    const curated = new Set(curatedNames);
```

Guard the two checks in the published-keyword loop:

```js
        if (curated.has(phrase)) continue;
        const stateEntry = (state?.phrases || {})[phrase.toLowerCase()];
```

(placing the `continue` after the weight and field-shape checks, so curated entries are still shape-checked.)

- [ ] **Step 7: Add a validator test**

Append to `tests/trendingValidate.test.mjs`:

```js
it('accepts a published curated entry that has no state entry', () => {
    const problems = validateTrending({
        category: {
            'New Developments': {
                description: "Today's controversies from across the news spectrum, updated automatically",
                updatedAt: '2026-07-29T00:00:00.000Z',
                keywords: { 'Bryan Kohberger': { weight: 3, description: 'case' } }
            }
        },
        state: { updatedAt: '2026-07-29T00:00:00.000Z', phrases: {} },
        curatedNames: ['Bryan Kohberger']
    });
    expect(problems).toEqual([]);
});

it('still rejects a non-curated published phrase with no state entry', () => {
    const problems = validateTrending({
        category: {
            'New Developments': {
                description: "Today's controversies from across the news spectrum, updated automatically",
                updatedAt: '2026-07-29T00:00:00.000Z',
                keywords: { Smuggled: { weight: 3, description: 'x' } }
            }
        },
        state: { updatedAt: '2026-07-29T00:00:00.000Z', phrases: {} },
        curatedNames: []
    });
    expect(problems.some(p => p.includes('must be tracked'))).toBe(true);
});
```

- [ ] **Step 8: Run to verify everything passes**

Run: `npm test`
Expected: PASS. Pre-existing validator tests that hard-code the old `In N outlets` description must be updated to the bucketed form — that is an expected consequence of this task, not a regression.

- [ ] **Step 9: Commit**

```bash
git add scripts/trending/lib.mjs tests/trending.test.mjs tests/trendingValidate.test.mjs
git commit -m "Bucket outlet counts and exempt curated entries from validation

Descriptions embedded a live outlet count, so the payload differed every run
even when the mute list was identical, defeating the publish gate. Bucket
from a monotonic peakOutlets so a description can only ever move up. The
validator moves with it, and curated catalog entries are exempted from the
state-backing check because they are published from the catalog, not tracked."
```

---

### Task 9: Repoint mutesky and delete its engine

mutesky's workflow is already deleted. Its engine, frozen artifacts and config still point at itself.

**Files (in `c:/github/mutesky`):**
- Modify: `js/config.js:8`
- Delete: `scripts/trending/`, `keywords/trending.json`, `keywords/trending-state.json`, `tests/unit/trending.test.js`, `tests/unit/trendingValidate.test.js`

**Do not delete `tests/unit/trendingMerge.test.js`** — it tests `mergeTrendingIntoState`, which is app code and stays.

- [ ] **Step 1: Confirm the calm-the-chaos pipeline has published successfully at least once**

```bash
gh api gists/3488593dcc622acc736055fa00a9745e --jq '.updated_at'
```

Expected: a timestamp from the Task 4 verification run or later. **Do not proceed otherwise** — repointing at a stale gist would freeze mutesky's trending.

- [ ] **Step 2: Repoint `TRENDING_URL`**

In `c:/github/mutesky/js/config.js`:

```js
// from
export const TRENDING_URL = 'https://raw.githubusercontent.com/potatoqualitee/mutesky/main/keywords/trending.json';
// to
export const TRENDING_URL = 'https://gist.githubusercontent.com/potatoqualitee/3488593dcc622acc736055fa00a9745e/raw/new-development.json';
```

- [ ] **Step 3: Delete the engine and its frozen artifacts**

```bash
cd c:/github/mutesky
git rm -r scripts/trending
git rm keywords/trending.json keywords/trending-state.json
git rm tests/unit/trending.test.js tests/unit/trendingValidate.test.js
```

- [ ] **Step 4: Run mutesky's tests**

Run: `npm test`
Expected: PASS. `trendingMerge.test.js` must still pass — it does not import the engine.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "Read trending from the calm-the-chaos gist

The engine now lives in calm-the-chaos, where its exclusion list is a local
read rather than a rate-limited network call. TRENDING_URL joins the other
four config URLs in pointing at the shared catalog."
git push
```

---

### Not in this plan: the codex curation pass

mutesky's workflow ran a `gpt-5.6-luna` editorial pass that removed trending-but-not-controversial entries (sports, entertainment, weather, human interest) before publishing. It is **not** carried over, and it needs its own spec and plan rather than a sketch here — its whole I/O model has to change. The original wrote two files in the repo, checkpointed them with `cp`, gated on `node validate.js`, and reverted with `git reset --hard`; none of that exists once output goes to gists. Rebuilding it means splitting `update.mjs` into compute and publish halves with a curation window between them, and re-deriving the validator's evidence rules against `$RUNNER_TEMP` paths.

**Know the consequence before shipping Tasks 1-9.** The heuristic alone admits anything with enough cross-spectrum breadth, controversial or not. In the observed run history that included `American original`, `food festival`, `Berlin Pride` and `Cracker Barrel`. Curation is what removed them.

This is a quality regression, not a safety one. The junk flood that motivated this work came from the fail-open exclusion guard, which Task 2 fixes structurally — curation was the cleanup crew, not the prevention. A pipeline without it publishes some dull keywords; a pipeline without Task 2 publishes everyone's permanent mute list.

Decide explicitly whether to ship Tasks 1-9 and accept softer curation for a while, or to spec the curation pass first and ship them together.

---

## Verification

After Task 9, confirm end to end:

```bash
# The published gist carries curated entries and no permanent names
gh api gists/3488593dcc622acc736055fa00a9745e --jq '.files."new-development.json".content' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
      const k=Object.keys(JSON.parse(s)['New Developments'].keywords);
      console.log('published:', k.length);
      console.log('curated present:', ['Bryan Kohberger','Nolan Wells','Patrick Clancy','Salgado Araujo'].every(n=>k.includes(n)));
      console.log('permanent leaked:', k.filter(n=>['Trump','Iran','Israel','Biden','Russia'].includes(n)));
    })"
```

Expected: `curated present: true`, `permanent leaked: []`.

Then confirm the publish gate holds by dispatching twice in quick succession and checking that the gist's `updated_at` does not move on the second run when no new stories broke.
