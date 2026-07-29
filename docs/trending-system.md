# Trending Controversy System

`scripts/trending/` detects the day's political controversies from news
headlines and publishes them as muted phrases. It runs on GitHub Actions every
6 hours (`.github/workflows/trending.yml`) and publishes to a gist, which both
the Calm the Chaos extension and MuteSky fetch at startup and merge into the
existing **New Developments** category so that card stays current
automatically.

Nothing is committed to this repo by the engine. The catalog under `keywords/`
is hand-curated and the engine only ever reads it.

## Layout

| File | Responsibility |
|---|---|
| `lib.mjs` | Pure logic: feed parsing, phrase extraction, scoring, the retention state machine, variant collapsing, category building, validation. No I/O — this is what makes it unit-testable. |
| `update.mjs` | All I/O: fetch feeds, read the local catalog, read/write gists, decide whether to publish. |
| `catalog.mjs` | Reads the permanent keyword catalog and the curated New Developments entries off disk. |
| `publish.mjs` | Publication shaping: folds curated entries in, compares against what is already live. |
| `validate.mjs` | CLI wrapper around `validateTrending`. **Currently stale** — it still reads the pre-consolidation file paths and needs rebuilding around gist I/O. |

Tests live in `tests/trending.test.mjs` and `tests/trendingValidate.test.mjs`
and run under vitest (`npm run test:trending`); the catalog tests in
`tests/*.test.cjs` run under `node --test`. `npm test` runs both.

Engine files use `.mjs` because `package.json` is CommonJS and must stay that
way — `webpack.config.js` would break otherwise.

## Pipeline (each run)

1. **Fetch** — 27 political RSS/Atom feeds, nine each tagged `left`, `center`,
   and `right` (`FEEDS` in `lib.mjs`). Each feed is capped at its 40 newest
   items so a prolific outlet can't out-shout the rest. Failures are tolerated;
   if fewer than 20 headlines arrive the run aborts without touching state, so
   a network outage can't wipe the list. With a `BRAVE_API_KEY` secret, Brave
   News search adds extra headlines.
2. **Extract** — headlines from the last 48h are tokenized into 1–3 word
   n-grams. Boundary words must be meaningful (no stopwords), and phrases
   matching the evergreen/generic blocklist are dropped. Single words need
   proper-noun evidence (capitalized mid-headline sightings from at least two
   distinct outlets) before they count. Cross-outlet frequency — not
   capitalization — decides what matters, which stays robust against Title
   Case headlines.
3. **Score** — for each candidate phrase:

   ```
   base            = distinctOutlets + 0.5 * extraMentions
   spectrumFactor  = bipartisan  ? 1 + min(leftOutlets, rightOutlets) * 0.25
                   : mainstream  ? 0.75
                   :               0.35
   score           = base * spectrumFactor
   ```

   *bipartisan* means at least one left-leaning AND one right-leaning outlet
   carried it — that's what makes something "the controversy of the day"
   rather than one side's talking point. *mainstream* is a softer path: two or
   more center outlets plus at least one wing, which catches stories the other
   wing frames under different words ("Maine Senate" on the left is "Platner"
   on the right).

   Candidates are then collapsed so one story can't occupy two rows — see
   [Variant collapsing](#variant-collapsing).

## Retention: how long a phrase stays muted

Every tracked phrase carries an exponentially decaying **heat**:

```
heat = heat * decay + score * gain
```

`decay` is `0.75 ^ elapsedIntervals` against a nominal 6-hour interval
(~14h half-life at 4 runs/day). Both factors scale to time actually elapsed,
so back-to-back reruns are near-idempotent rather than double-counting the
same coverage, and long gaps decay proportionally more.

Admission requires `score >= 5` **and** either bipartisan coverage or a
mainstream story broad enough to stand without it (6+ distinct outlets). Once
in, the phrase's expiry is:

```
retentionDays = clamp(3 + 2*log2(1 + peakHeat/5) + daysActive/2,  3, 30)
```

- a one-day flap gets the 3-day minimum,
- a story that burns hot (high `peakHeat`) or keeps making headlines on new
  calendar days (`daysActive`) stretches toward the 30-day cap,
- the expiry refreshes on every run where the phrase still scores ≥ 3, so a
  story that stays in the news stays muted indefinitely,
- once coverage stops, the phrase rides out its earned window and is dropped.
  An entry already past its expiry is not refreshable — a returning story has
  to re-qualify through the admission path.

The published list is capped at the 60 hottest phrases.

## Variant collapsing

`"hunter biden laptop"` should win over `"biden laptop"` and `"laptop"`.
Collapsing runs both over each run's fresh candidates and over carried state,
and orders by **specificity** — most words, then longest, then alphabetical.

That ordering is deliberate and load-bearing. Ordering by score meant a
shorter phrase that happened to be hotter entered the kept list first, so the
longer phrase could never absorb it: both published, and which one won flapped
with score jitter between runs. Specificity is a total order, so the absorber
is never decided by a value that moves.

Overlap is word-level with singular/plural folding, so `"art"` never matches
inside `"martial law"` but `"data center"` folds with `"data centers"`.

When two entries merge, every coverage number takes the **max**, never the
sum: the variants were counted from overlapping headlines, so summing would
double-count one story and could push it into a higher outlet bucket purely
for having been split in two. Timestamps keep the earlier `firstSeen` and the
later `lastSeen`/`expiresAt`; `bipartisan` is OR-ed.

Collapsing runs before the 60-phrase cap, for the same reason exclusion does:
a duplicate must not occupy a slot an eligible phrase could use.

## Exclusions

The permanent catalog already mutes the big recurring names (Trump, Iran,
Charlie Kirk…), so trending must not re-list them. `catalog.mjs` reads every
category file named in `keywords/catalog-migrations.json` and returns every
keyword name, lowercased — including weight-0 entries, which are catalog-only
reference metadata but must still be excluded from trending.

This read **fails closed**. A missing or malformed category file throws rather
than yielding a partial set, and `update.mjs` aborts the run if fewer than 100
keywords load. That tripwire exists because the engine previously fetched
these lists over an unauthenticated, rate-limited network call and returned an
*empty* set on failure — publishing every permanently-muted name straight into
users' mute lists.

Phrases word-overlapping the catalog are stripped from both carried state and
fresh scores before the cap, and `buildTrendingCategory` filters again at
publication as a net.

## Output

The published payload uses the same category format as the rest of the
catalog, named **New Developments** so consumers fold it into that existing
category. It goes to gist `3488593dcc622acc736055fa00a9745e`, file
`new-development.json`.

The payload is the **union** of two sources:

- the engine's trending phrases, and
- the curated `New Developments` entries from
  `keywords/categories/new-developments.json` with `weight > 0`.

The union matters because the extension *replaces* its whole New Developments
group with this payload — anything omitted is destroyed for extension users,
so the curated entries have to ride along. On a name collision the curated
entry wins; curation is authoritative for the entries it owns.

Weights map heat percentile to the app's filter levels: the top 20% get
weight 3 (visible even at the "Minimal" level), the next 30% weight 2, the
rest weight 1. Curated entries keep their catalog weight and description.

A phrase still carrying an `&` is never published — a surviving ampersand
means an entity slipped decoding, and publishing it would put a mangled token
like `Trump&apos` in everyone's mute list.

### Descriptions are bucketed

Trending descriptions read `In 6-10 outlets across the spectrum (since
2026-07-29)`. The count is a **bucket** (`3-5`, `6-10`, `11-20`, `20+`)
derived from a monotonic `peakOutlets`, not a live count.

Raw counts jitter every run — 24 outlets one run, 22 the next, same story —
and a description that rewrites itself every run would defeat the publish gate
below. Bucketing from a peak means a description can only ever move up.

### Display casing is pinned

A phrase's published key is its `display`, fixed when the phrase is first
admitted. It is never re-elected from later headline casing: re-electing it
republishes the same story under a new key, which every downstream consumer
reads as a delete plus an add. Deliberate casing corrections belong to a
curation pass.

### The publish gate

`update.mjs` compares the payload it just built against what is already live
and **skips the write entirely** when the keyword set, weights and
descriptions all match. `updatedAt` is deliberately excluded from that
comparison: it moves every run and no consumer reads it, so including it would
make every run look like a change.

The ledger lives in a **separate** gist (`LEDGER_GIST_ID` secret, file
`trending-state.json`) precisely so the published gist's revision history
records only real changes to the mute list. The ledger is written last, so
sightings are never recorded for a publish that failed.

## Tuning

All knobs live in `TUNING` in `lib.mjs`; false positives go in
`GENERIC_PHRASES`. The logic is pure and covered by
`tests/trending.test.mjs`.

## Validation

`validateTrending` in `lib.mjs` enforces the exact schema the heuristics emit
— category name, description format, weight range, no extra fields, ordered
timestamps, published-phrase↔state correspondence. It accepts a
`curatedNames` list whose entries are exempt from the state-backing and
derived-description checks, because curated entries are published from the
catalog rather than tracked in the ledger. It is covered by
`tests/trendingValidate.test.mjs`.

`validate.mjs`, the CLI wrapper, has not been rebuilt for gist I/O yet.

## Not yet ported: the codex curation pass

The pre-consolidation pipeline ran an editorial pass that removed
trending-but-not-controversial topics (sports, entertainment, weather, human
interest) before publishing. It is **not** in place.

It cannot be lifted over as-is: it edited two files in a git working tree,
checkpointed them with `cp`, gated on a validator run, and reverted with
`git reset --hard`. None of that exists now that output goes to gists.
Restoring it means splitting `update.mjs` into compute and publish halves with
a curation window between them, and re-deriving the validator's evidence rules
against runner-temp paths.

**The consequence is live.** The heuristic alone admits anything with enough
cross-spectrum breadth, controversial or not — observed examples include
`American original`, `food festival`, `Berlin Pride` and `Cracker Barrel`.
This is a quality gap, not a safety one: the junk flood that motivated the
consolidation came from the fail-open exclusion guard, which the fail-closed
local read now prevents structurally. Curation was the cleanup crew, not the
prevention.
