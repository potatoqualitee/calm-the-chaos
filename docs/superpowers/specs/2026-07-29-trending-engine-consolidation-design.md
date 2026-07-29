# Trending engine: consolidation into calm-the-chaos

**Date:** 2026-07-29
**Status:** Approved, pending implementation plan
**Supersedes:** `2026-07-29-trending-news-corroboration-design.md` (targeted
calm-the-chaos's disabled PowerShell workflow, which is not the live problem)

## Problem

The live trending pipeline is mutesky's (`scripts/trending/` +
`.github/workflows/trending.yml`), running four times a day. It publishes a
mute list that churns hard enough that users repeatedly re-download keywords
that were never worth publishing.

Measured across the last 14 automated runs, by comparing the published keyword
sets commit to commit:

```
2026-07-26 12:44  n=48  + 2 - 2  churn=8%
2026-07-27 07:37  n=46  + 0 - 0  churn=0%
2026-07-28 18:53  n=48  + 2 - 1  churn=6%
2026-07-29 00:55  n=46  +18 -20  churn=79%   <-- exclusion failure
2026-07-29 07:22  n=46  + 4 - 4  churn=17%
2026-07-29 13:06  n=27  + 0 -19  churn=41%   <-- curation cleanup
```

The 00:55 run added Trump, Biden, Iran, Israel, Russia, Ukraine, China,
Netanyahu, McConnell, Newsom, Mamdani, Graham, Paul, Covid and Dems — the
permanent calm-the-chaos names the pipeline is explicitly designed never to
re-list. They persisted through 07:22 and were stripped at 13:06. Users
downloaded roughly nineteen junk keywords and had them withdrawn a cycle later.

## Root causes

### 1. The permanent-exclusion guard fails open (critical)

`mutesky/scripts/trending/update.js:76-104` builds the exclusion list by first
calling `api.github.com/repos/potatoqualitee/calm-the-chaos/contents/keywords/categories`
to list category files. The workflow step passes only `BRAVE_API_KEY`, so the
call is **unauthenticated** and subject to the 60-request/hour per-IP limit that
GitHub Actions runners share. On any failure the `catch` logs a warning and
returns an **empty set**:

```js
} catch (error) {
    console.warn(`permanent keyword fetch failed (publishing without exclusions): ${error.message}`);
}
```

`excludePermanent` then short-circuits (`lib.js:561`):

```js
if (excludeList.length === 0) return { prevState, scored };
```

so every permanent name flows straight through to publication. The behavior is
deliberate — the comment at `update.js:71-73` says "on failure we publish
without exclusions and the app dedupes client-side" — but the cost of being
wrong is a mute-list flood for every user, which is far worse than skipping a
run.

Note that `update.js:130-135` already applies the opposite policy to headlines:

```js
if (headlines.length < 20) {
    console.error('too few headlines fetched; refusing to update state');
    process.exit(1);
}
```

Fail-closed is already the house idiom. The exclusion list simply does not
follow it.

### 2. The published key is recomputed casing

Canonical identity is correctly lowercased, but the **published keyword** is
`entry.display` (`lib.js:597`), and display is re-elected every run by majority
casing among that run's headlines (`lib.js:491`):

```js
display: hit ? hit.display : prev.display
```

Seen this run means take the new casing. So the same tracked phrase publishes as
`Border Czar` one run and `border czar` the next, and each flip is a delete plus
an add downstream. Observed repeatedly: `Border Czar`/`border czar`,
`Appeals court`/`appeals court`.

### 3. `&apos;` is not decoded

`decodeEntities` (`lib.js:148-158`) handles `&#39;`, `&#039;`, curly quotes,
dashes and `&amp;`, but not the named `&apos;`. The trailing semicolon is then
stripped as punctuation, leaving mute words like `Trump&apos` and
`Correspondents&apos`, both of which reached publication.

### 4. Both files change on every run regardless of content

`trending.json` carries a category-level `updatedAt` set from run time, and every
description embeds a live outlet count (`"In 24 outlets across the spectrum"` →
`"In 22 outlets"`). `trending-state.json` rewrites ~600 lines per run as
`lastSeen` and `heat` advance. The workflow's `git diff --cached --quiet` gate
therefore never fires, and the app restamps "Keywords updated" from
`category.updatedAt` (`mutesky/js/api/trending.js:96-106`) on every cycle.

The counts are noise, not signal: 24 → 22 outlets is sampling jitter on the same
story.

### 5. Phrase-boundary instability (deferred)

`Correspondents Dinner` → `Correspondents` → `Dinner` → `WHCA dinner` are
distinct canonical phrases for one event, as are `Abdul El-Sayed`/`El-Sayed` and
`Secret`/`Secret Service`. Unlike (2) these are genuinely different keys, so
fixing it needs n-gram stability work rather than a pinning rule. Out of scope
here; see Deferred.

## Design

### Move the engine into calm-the-chaos

`mutesky/js/config.js` already sources four of its five catalog URLs from
calm-the-chaos; `TRENDING_URL` is the only one pointing at mutesky, and it is
the only one that is broken. The split is what forces root cause 1 to exist: the
engine must cross the network to learn what calm-the-chaos already knows.

After the move, the exclusion list is a local read of
`keywords/categories/*.json`. No HTTP, no rate limit, no empty-set fallback —
the defect stops being reachable rather than being patched. It also removes the
propagation delay: keywords added to the catalog are excluded on the very next
run.

The file list comes from `keywords/catalog-migrations.json`'s `categoryFiles`
array, which is already the authoritative manifest and is validated against the
loader by the existing test suite.

### Fail closed

Mirror the headline guard. If the permanent keyword set is empty or implausibly
small, `process.exit(1)` without writing. With a local read the only realistic
causes are a broken checkout or a corrupted catalog, both of which should stop
the run. Threshold: fewer than 100 permanent keywords aborts (the catalog
currently holds thousands; the check is a corruption tripwire, not a tuning
knob).

### Publish to the gist only

The engine writes to the existing gist `3488593dcc622acc736055fa00a9745e`, file
`new-development.json`, using the `GIST_PAT` secret calm-the-chaos already
holds.

- The extension needs **no change** — `scripts/background/background.js:165-203`
  already polls that gist every 360 minutes.
- mutesky changes one line: `TRENDING_URL` points at the gist raw URL, making it
  consistent with its other four config lines.
- calm-the-chaos receives **no automated commits**. Repo history stays entirely
  human, which is the auditable form of "no meaningless updates."

The two payload schemas already agree: mutesky's merge reads
`{ "New Developments": { description, updatedAt, keywords: { name: { weight, description } } } }`
and the extension reads the same shape, ignoring `updatedAt`. One artifact
serves both.

### The ledger moves to a second gist

Sighting state (`trending-state.json`, formerly committed) moves to a separate
gist, read at the start of each run and written back at the end. It necessarily
changes every run — that is what a heat counter does — so keeping it out of the
published gist means the published gist's revision history is a true record of
when the mute list actually changed.

### Stop publishing values that jitter

Two changes make the published payload a function of content rather than clock:

- **Descriptions bucket the outlet count, derived from `peakOutlets`.** Buckets:
  `3-5`, `6-10`, `11-20`, `20+`. Peak is monotonic, so a description can only
  ever move up a bucket and never flaps. The `(since <date>)` suffix already
  derives from `firstSeen` and is stable.
- **`updatedAt` reflects the last content change, not run time.** Build the
  payload without `updatedAt`, compare against the live gist payload with its
  `updatedAt` removed, and if they match, skip the write entirely — preserving
  the old timestamp. Only on a real difference is `updatedAt` set to now.

### Pin display

Once a phrase has a `display` in the ledger, keep it. Re-election happens only
when the phrase leaves state and returns. This ends the casing churn while
leaving the codex curation pass free to correct casing deliberately, which is
where a casing change belongs.

### Decode `&apos;`

Add `&apos;` to `decodeEntities` alongside the existing `&#0?39;` rule. Add a
publication-time guard rejecting any phrase still containing `&`, so a future
missed entity cannot reach the mute list.

## Migration

| Item | Action |
|---|---|
| `mutesky/scripts/trending/{lib,update,validate}.js` | Move to `calm-the-chaos/scripts/trending/` |
| `mutesky/tests/unit/trending{,Merge,Validate}.test.js` | Move; `trendingMerge` stays in mutesky (it tests app-side merge, not the engine) |
| `mutesky/.github/workflows/trending.yml` | **Delete from mutesky.** Its replacement in calm-the-chaos drops the commit step and publishes to the gist instead. Only one trending workflow exists after this. |
| `mutesky/keywords/trending{,-state}.json` | Delete; artifacts live in gists |
| `mutesky/js/config.js:8` | Repoint `TRENDING_URL` at the gist raw URL |
| `calm-the-chaos/.github/workflows/update-news.yml` + `update-news-gist.ps1` | Delete — superseded by the moved engine |
| `calm-the-chaos` secrets | `CODEX_AUTH_JSON` must be added; `BRAVE_API_KEY` and `GIST_PAT` already exist |

**Module format.** The engine is ESM; calm-the-chaos's `package.json` has no
`"type": "module"` and its tests run as `node --test tests/*.test.cjs`. Adding
`"type": "module"` would reinterpret `webpack.config.js`. Use `.mjs` extensions
for the moved engine and widen the test script glob rather than changing the
package type.

**Cutover.** Publish from calm-the-chaos while mutesky still reads its own file,
confirm one clean run, then repoint `TRENDING_URL` and delete mutesky's copies.
The extension is unaffected throughout.

## Error handling

| Failure | Behavior |
|---|---|
| Permanent keyword set empty or < 100 entries | `exit 1`, no write. Never publish unfiltered. |
| Fewer than 20 headlines fetched | `exit 1`, no write (existing behavior, retained). |
| Ledger gist missing | Bootstrap to `{ phrases: {} }`. First-run case, not an error. |
| Ledger gist unreadable | `exit 1`. Publishing against lost state would reset every heat score. |
| Codex curation fails or times out | Existing fallback to heuristic output stands (`continue-on-error`), now safe because exclusions are local and cannot have failed. |
| Published payload unchanged | Skip the write. No gist revision, no `updatedAt` change. |
| Publish PATCH fails | `exit 1` without writing the ledger, so sightings are not recorded for a publish that did not happen. |

## Testing

- A permanent keyword present in the catalog never appears in published output.
- An empty or undersized permanent list aborts the run instead of publishing.
- A phrase whose headline casing flips between runs keeps its original display.
- `&apos;` decodes to an apostrophe; a phrase containing a bare `&` is rejected
  at publication.
- Outlet counts of 12 and 18 produce the same description; a rise to 25 changes
  it.
- An unchanged keyword set produces no gist write and leaves `updatedAt` intact.
- A changed keyword set produces exactly one write with a fresh `updatedAt`.
- The existing `validateTrending` suite passes unmodified against moved code.

## Deferred

- Phrase-boundary instability (root cause 5) — needs n-gram stability work.
- Graded weights in the extension UI; `weight` remains a `> 0` gate
  (`scripts/core/config/keywordMetadata.js:12`).
- Whether mutesky should eventually read the gist through the same catalog
  fetch path as its other four URLs.

## Open question

The evidence for root cause 1 is the code path plus the observed mass
publication of permanent names. Confirming the rate-limit hypothesis
specifically would require the 00:55 and 07:22 run logs, which have not been
read. The fail-open defect is certain from the code either way, and the fix does
not depend on which failure triggered it.
