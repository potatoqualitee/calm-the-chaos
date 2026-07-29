# Trending news: corroboration-gated keyword promotion

> **SUPERSEDED** by `2026-07-29-trending-engine-consolidation-design.md`.
>
> This document describes calm-the-chaos's own PowerShell trending workflow,
> which has been `disabled_manually` since 2025-01-29. The live trending
> problem was mutesky's engine, which already implements corroboration more
> thoroughly than this design proposed. Retained for the analysis of the
> gist consumer contract, which still holds. Do not implement.

**Date:** 2026-07-29
**Status:** Superseded — not for implementation

## Problem

The `Trending news` workflow (`.github/workflows/update-news.yml` +
`update-news-gist.ps1`) republishes the New Developments gist on every scheduled
run. It decides what to publish by asking an LLM for terms that are *new and
distressing*, which is a novelty test, not an importance test. Nothing in the
pipeline asks whether a story is actually significant enough to belong on the
radar.

The workflow is currently `disabled_manually` (since 2025-01-29) and the gist
has not changed since. Re-enabling it as-is would restore the churn described
below, so the algorithm is fixed first.

### What the consumer actually reads

`scripts/background/background.js:165-203` polls the gist every 360 minutes and
compares only the **sorted list of keyword names**:

```js
if (JSON.stringify(remoteKeywords) === JSON.stringify(currentKeywords)) return;
```

`weight` is read solely as a `> 0` on/off gate
(`scripts/core/config/keywordMetadata.js:12`). `description` and `timestamp` are
never read. There is no weight-threshold UI anywhere in the extension.

### Consequences

1. **48 runs/day feed a 6-hour poll.** At most 4 runs a day are observable by
   any client.
2. **Timestamp-only rewrites are unobservable.** When the name set is unchanged
   but timestamps move, every client takes the early return. It is gist-history
   churn and nothing else.
3. **Flat `weight 3` expresses nothing.** Everything published is fully enabled;
   there is no way to represent a borderline term.
4. **The source is chosen at random each run** (Brave ~50%, Bing news ~25%, Bing
   trending ~25%), so each run samples a different slice of the news and the
   published set flaps for reasons unrelated to events.
5. **The 72-hour TTL is a clock, not a signal.** A one-day story survives three
   days; a scandal still dominating coverage on day four drops off unless it
   happens to be re-extracted.

## Design

### Core principle

Once the gist write is gated on the published name set actually changing, run
frequency no longer causes churn. Sampling and publishing become independent
knobs, and each can be tuned for the job it actually does: sample often for fast
detection, publish rarely because publishing is expensive and user-visible.

A term earns the radar by **recurring across independent samples**, not by
appearing once and sounding alarming.

### The bar

A candidate is promoted after **two independent sightings**, where independent
means either:

- the same term seen in **two different runs**, or
- the same term seen in **two different sources within a single run**.

This self-adjusts to story size. A major story is carried by every source at
once, so it clears the bar on first contact and publishes immediately. A
marginal one-off headline appears in one source once and must survive to the
next hourly sample to prove it is real.

This is preferred over an LLM severity vote because it is evidence rather than
opinion: it cannot drift when the underlying model is updated, and it cannot
return two different answers to the same borderline question on consecutive
runs.

### Sampling

- Cron moves from `*/30 * * * *` to hourly.
- **All three sources are queried every run.** The random source selection is
  removed; it was a direct cause of run-to-run flapping.
- Candidate extraction keeps the existing LLM call and JSON schema
  (`.github/workflows/keywords.json`).

### The ledger

Corroboration needs memory, which the script currently has none of. State lives
in a `candidates.json` file in a **separate gist** from the published one, using
the existing `GIST_PAT` (no new secret; one new gist to create, its ID stored as
a constant alongside the existing one).

The ledger necessarily changes on **every** run — that is what a sighting
counter does. Keeping it out of the published gist means the published gist's
revision history stays a truthful record of when the radar actually changed,
which is the auditable version of "no meaningless updates." Co-locating the two
files in one gist also works and avoids creating a gist, but then the published
gist's `updated_at` moves hourly regardless, which reintroduces exactly the
misleading signal that prompted this redesign.

Per candidate, the ledger records:

- `firstSeen` — ISO 8601 timestamp of first sighting
- `lastSeen` — ISO 8601 timestamp of most recent sighting
- `runsSeen` — count of distinct runs that sighted the term
- `sourcesSeen` — set of source names that have sighted the term
- `samplesSinceSeen` — consecutive samples with no sighting

Promotion and demotion read this file. The published file never carries timing.

### Demotion

Replace the 72-hour TTL with: **drop when unseen for 24 consecutive hourly
samples.**

A story still being covered keeps being sighted and keeps its slot for as long
as it runs, which fixes the day-four scandal silently vanishing. A term absent
from 24 straight samples is genuinely off the news — a determination the clock
cannot make.

### Publishing

- Build the published set from promoted, non-demoted candidates.
- Compare the **sorted keyword names** against what is currently live in the
  gist — the same comparison the client makes.
- PATCH **only** if they differ.
- `timestamp` is removed from the published payload entirely. Timing lives in
  the ledger. This is the structural guarantee that timestamp churn cannot
  return: the published file has no field that can change without a name or
  weight changing.

### Ranking and weights

- The 50-keyword cap stays.
- The LLM ranking call fires **only** when the set is over the cap *and* the set
  changed — rare, instead of on every run.
- Weight grades by corroboration strength: `3` when the term has been sighted by
  **≥2 distinct sources and in ≥3 distinct runs**; `2` otherwise.
- Weights have no client-visible effect today (the `> 0` gate above). They are
  recorded as honest metadata and to leave room for a future threshold UI. The
  design does not depend on them being consumed.

### Targeted fix

The special-character guard at `update-news-gist.ps1:160` and `:184` uses the
HTML-encoded keyword as a **regex pattern** matched against the original string:

```powershell
if ($keyword -notmatch [System.Web.HttpUtility]::HtmlEncode($keyword)) { continue }
```

This works by accident for plain words and for `&`, but a keyword containing an
unbalanced `[` is an invalid regex and throws at runtime. Replace with a plain
character allowlist check. In scope because it sits in the path being rewritten.

## Error handling

| Failure | Behavior |
|---|---|
| A news API fails | That source contributes no sightings this run. Corroboration degrades gracefully; the run continues. |
| All news APIs fail | Skip the run. No ledger write, no publish. |
| LLM returns junk | Keep the existing `resultCount > 20` sanity hedge before applying a reordering. |
| Ledger file does not exist yet | Bootstrap: treat as an empty ledger and proceed. This is the first-run case, not an error. |
| Ledger fetch fails (exists but unreadable) | Skip the run rather than publishing an unbacked set. A missed sample is now cheap because writes are change-gated. |
| Published-gist PATCH fails | Throw, and do **not** write the ledger. Writing sightings without the publish they justify would let a term be counted as published when it is not. |
| Ledger PATCH fails | Throw. The next run re-samples; a lost sighting delays promotion by one sample and corrupts nothing. |

**Write ordering.** The ledger is written on every completed run, including runs
that publish nothing — sighting counts must advance whether or not the published
set changed. The published file is written only when its name set differs. When
both are written, the published gist is PATCHed first so a ledger write never
outruns the publish it records.

## Testing

- Promotion: a term sighted once is not published; sighted in a second run, it
  is; sighted by two sources in one run, it is published immediately.
- Demotion: a term unseen for 23 samples is retained; at 24 it is dropped.
- Publish gate: an unchanged name set produces no PATCH of the published file; a
  changed name set produces exactly one.
- The ledger is written on a run that publishes nothing, and sighting counts
  advance.
- A missing ledger file bootstraps to empty rather than erroring.
- No `timestamp` field appears in the published payload.
- The special-character guard accepts ordinary keywords and rejects ones
  containing regex metacharacters without throwing.

## Out of scope

- Re-enabling the workflow (`gh workflow enable "Trending news"`) is a separate,
  explicit step once this lands.
- Any change to how the extension consumes the gist.
- Graded-weight UI in the extension options.
