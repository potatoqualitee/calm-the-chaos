#!/usr/bin/env node
// Fetch political headlines across the spectrum, score the day's
// controversies, and publish them to the New Developments gist. Run by
// .github/workflows/trending.yml every 6 hours. No dependencies -- plain
// Node 22 with built-in fetch.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    FEEDS,
    TUNING,
    parseFeedXml,
    filterFreshHeadlines,
    extractCandidates,
    scoreCandidates,
    updateTrendingState,
    buildTrendingCategory,
    excludePermanent,
    validateTrending
} from './lib.mjs';
import { readCatalogKeywords, readCuratedNewDevelopments } from './catalog.mjs';
import { mergeCuratedIntoCategory, publishedNamesEqual } from './publish.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KEYWORDS_DIR = path.join(repoRoot, 'keywords');
const PUBLISH_GIST_ID = '3488593dcc622acc736055fa00a9745e';
const PUBLISH_GIST_FILE = 'new-development.json';
const LEDGER_GIST_ID = process.env.LEDGER_GIST_ID;
const LEDGER_GIST_FILE = 'trending-state.json';
const GIST_API = 'https://api.github.com/gists';
// The catalog holds thousands of keywords. This is a corruption tripwire,
// not a tuning knob: anything near zero means we are about to publish
// without exclusions, which is the failure this whole module prevents.
const MIN_PERMANENT_KEYWORDS = 100;
const FETCH_TIMEOUT_MS = 15000;
// Prolific feeds (Daily Beast ships 100 items) must not out-shout everyone
// else: mentions feed the score, so cap each outlet at its newest items
const MAX_ITEMS_PER_FEED = 40;

async function fetchFeed({ source, lean, url }) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'MuteSky-Trending/1.0 (+https://mutesky.app)' }
    });
    if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
    const xml = await response.text();
    const now = Date.now();
    // Feeds aren't guaranteed newest-first: order by date (undated items
    // count as now, matching the freshness filter) before keeping the cap
    const items = filterFreshHeadlines(parseFeedXml(xml), now)
        .sort((a, b) => (b.pubDate ? Date.parse(b.pubDate) : now) - (a.pubDate ? Date.parse(a.pubDate) : now))
        .slice(0, MAX_ITEMS_PER_FEED);
    return items.map(item => ({ title: item.title, source, lean }));
}

// Optional enrichment: Brave News search when a key is configured. The
// pipeline works from RSS alone; this just widens coverage.
async function fetchBraveNews(apiKey) {
    const url = 'https://api.search.brave.com/res/v1/news/search?q=politics+controversy&freshness=pd&count=50';
    const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`brave: HTTP ${response.status}`);
    const data = await response.json();
    return (data.results || []).map(result => ({
        title: result.title || '',
        source: `brave:${result.meta_url?.hostname || 'unknown'}`,
        lean: 'center'
    })).filter(h => h.title);
}

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

async function main() {
    const results = await Promise.allSettled(FEEDS.map(fetchFeed));
    const headlines = [];
    let failed = 0;
    results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
            headlines.push(...result.value);
        } else {
            failed++;
            console.warn(`feed failed: ${FEEDS[i].source} -- ${result.reason?.message || result.reason}`);
        }
    });

    if (process.env.BRAVE_API_KEY) {
        try {
            headlines.push(...await fetchBraveNews(process.env.BRAVE_API_KEY));
            console.log('brave news enrichment: on');
        } catch (error) {
            console.warn(`brave enrichment failed: ${error.message}`);
        }
    }

    console.log(`headlines: ${headlines.length} from ${FEEDS.length - failed}/${FEEDS.length} feeds`);

    // A network-wide outage must not wipe the published list: bail without
    // writing rather than decay everything against an empty day
    if (headlines.length < 20) {
        console.error('too few headlines fetched; refusing to update state');
        process.exit(1);
    }

    // Raw headline dump, off by default. Debugging hook, and the input an
    // editorial curation pass would need to feed validateTrending's evidence
    // check -- see "Not yet ported" in docs/trending-system.md.
    if (process.env.HEADLINES_OUT) {
        await writeFile(process.env.HEADLINES_OUT, JSON.stringify(headlines, null, 2) + '\n');
    }

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

    // Schema-gate the payload before it can reach either gist. Both consumers
    // REPLACE their whole New Developments group with this file, so a
    // malformed payload doesn't degrade gracefully -- it destroys the group.
    // Curated names are exempt from the state-backing and derived-description
    // checks: they are published from the catalog, not tracked in the ledger.
    const problems = validateTrending({
        category, state, curatedNames: Object.keys(curated)
    });
    if (problems.length) {
        console.error(`refusing to publish an invalid payload:\n  ${problems.join('\n  ')}`);
        process.exit(1);
    }

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

    const phraseCount = Object.keys(state.phrases).length;
    const top = Object.values(state.phrases)
        .sort((a, b) => b.heat - a.heat)
        .slice(0, 10)
        .map(p => `${p.display} (heat ${p.heat.toFixed(1)}, until ${p.expiresAt.slice(0, 10)})`);
    console.log(`tracking ${phraseCount} phrases; hottest:\n  ${top.join('\n  ') || '(none)'}`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
